import { Modal, Notice, Setting, setIcon } from 'obsidian';
import type { ButtonComponent, ToggleComponent } from 'obsidian';
import { dailyLogText } from '../core/logging-daily';
import { SKIP_LINE } from '../core/logging-lines';
import type { SkippedLine } from '../core/logging-lines';
import { ingredientParts, linkedLinePreview } from '../core/unlinked-lines';
import { localDate } from '../core/notes';
import { planLogging } from '../core/logging-plan';
import { bottleStockText, formatMl } from '../core/logging-stock';
import { PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import { LoggingStore, LoggingWriteError } from '../vault/logging-store';
import type { LoggingReview } from '../vault/logging-store';
import type CocktailCabinetPlugin from '../main';
import { NotePicker } from './picker';
import { EditStockModal } from './edit-stock-modal';
import type { StockStore } from '../vault/stock-store';
import type { RecipeLinkStore } from '../vault/recipe-links';
import { showLinkMenu } from './link-choice';
import { LinkTextModal } from './link-text';

function ingredientLabel(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_link, target: string) => target.includes('|') ? target.split('|').at(-1)! : target.split('/').at(-1)!);
}

export class LoggingModal extends Modal {
	private review?: LoggingReview;
	private servings = 1;
	private selections = new Map<number, string>();
	private addDaily = true;
	private date = localDate();
	private dateRequest = 0;
	private busy = false;
	private terminal = false;
	private closed = false;
	private notice = '';
	private previewEl!: HTMLElement;
	private messageEl!: HTMLElement;
	private applyButton!: ButtonComponent;
	private dailySetting?: Setting;
	private dailyToggle?: ToggleComponent;

	constructor(private plugin: CocktailCabinetPlugin, private logger: LoggingStore, private stocks: StockStore,
		private links: RecipeLinkStore, private recipe: CabinetNote) { super(plugin.app); }

	/** Link an ingredient line in the recipe, then re-read it so the line can be subtracted, keeping the other choices. */
	private linkLine(line: SkippedLine, event: MouseEvent) {
		const link = line.link;
		if (!link || this.busy || this.terminal) return;
		const wording = ingredientParts(line.text).wording;
		showLinkMenu(this.plugin, event, wording, note => {
			if (this.closed || this.busy || this.terminal) return;
			new LinkTextModal(this.plugin, {
				note, original: wording, originalLabel: 'Recipe wording',
				preview: text => linkedLinePreview(line.text, text),
				submit: async text => {
					if (this.closed || this.busy || this.terminal) return;
					try {
						await this.links.linkLine({ path: this.recipe.path, line: link.line, raw: link.raw, text }, note.path);
						await this.reload(`Linked ${wording} to ${note.name} in the recipe${text === wording ? '' : `, shown as ${text}`}.`);
					} catch (error) {
						await this.reload(error instanceof Error ? error.message : 'Couldn’t link the line.');
					}
				},
			}).open();
		});
	}

	/** Fix a bottle's stock without leaving the log, then re-read everything and keep the choices. */
	private editStock(path: string) {
		if (this.busy || this.terminal) return;
		const source = this.review?.sources.find(item => item.note.path === path);
		if (!source) return;
		void (async () => {
			try {
				new EditStockModal(this.app, this.stocks, source.note, await this.stocks.read(source.note), () => { void this.reload(); }).open();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : 'Couldn’t open the stock.');
			}
		})();
	}

	private async reload(notice = '') {
		try {
			const review = await this.logger.review(this.recipe, this.date);
			if (this.closed || this.busy || this.terminal) return;
			this.acceptReview(review, false);
			this.notice = notice;
			this.render();
		} catch (error) {
			if (!this.closed) this.messageEl.setText(error instanceof Error ? error.message : 'Couldn’t reload the stock.');
		}
	}

	onOpen() {
		this.titleEl.setText('Log this cocktail');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Loading…' });
		void this.load();
	}

	private async load() {
		try {
			const review = await this.logger.review(this.recipe, this.date);
			if (this.closed) return;
			this.acceptReview(review, true);
			this.render();
		} catch (error) {
			if (!this.closed) this.contentEl.setText(error instanceof Error ? error.message : 'Couldn’t open this recipe for logging.');
		}
	}

	private acceptReview(review: LoggingReview, initial: boolean) {
		const old = this.review;
		this.review = review;
		// A choice carries over while its line reads the same, so linking another line keeps it.
		const oldText = new Map(initial ? [] : old?.lines.counted.map(line => [line.id, line.text] as const) ?? []);
		this.selections = new Map(review.lines.counted.flatMap(line => {
			const previous = oldText.get(line.id) === line.text ? this.selections.get(line.id) : undefined;
			const path = previous && (previous === SKIP_LINE || review.sources.some(source => source.note.path === previous)) ? previous : line.initialSelection;
			return path ? [[line.id, path] as const] : [];
		}));
		if (initial || review.daily.duplicate !== old?.daily.duplicate) this.addDaily = !review.daily.duplicate;
	}

	private render() {
		const review = this.review!;
		this.contentEl.empty();
		this.titleEl.setText(`Log ${review.recipe.name}`);
		this.messageEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-log-notice', attr: { role: 'status' }, text: this.notice });
		new Setting(this.contentEl).setName('Servings').addText(input => {
			input.inputEl.type = 'number';
			input.inputEl.min = '0';
			input.inputEl.step = 'any';
			input.inputEl.setAttribute('aria-label', 'Servings');
			input.setValue(String(this.servings)).onChange(value => {
				if (this.busy || this.terminal) { input.setValue(String(this.servings)); return; }
				this.servings = value.trim() ? Number(value) : NaN;
				this.refreshPreview();
			});
		});
		if (review.lines.counted.length) new Setting(this.contentEl).setName('Used').setHeading();
		for (const line of review.lines.counted) {
			const row = new Setting(this.contentEl).setName(ingredientLabel(line.text));
			row.addDropdown(dropdown => {
				dropdown.addOption('', 'Select…');
				const selected = this.selections.get(line.id);
				const paths = [...line.candidates];
				if (selected && selected !== SKIP_LINE && !paths.includes(selected) && !line.alternatives.includes(selected)) paths.push(selected);
				const nameOf = (path: string) => review.sources.find(source => source.note.path === path)!.note.name;
				for (const path of paths) dropdown.addOption(path, nameOf(path));
				if (line.alternatives.length) {
					// Likely substitutes from a catch-all type, kept apart from what the recipe calls for.
					const group = dropdown.selectEl.createEl('optgroup', { attr: { label: line.alternativesLabel ?? 'Other bottles' } });
					for (const path of line.alternatives) group.createEl('option', { value: path, text: nameOf(path) });
				}
				dropdown.addOption('__another__', 'Other bottle…');
				dropdown.addOption(SKIP_LINE, 'Don’t subtract');
				dropdown.setValue(selected ?? '');
				dropdown.selectEl.setAttribute('aria-label', ingredientLabel(line.text));
				dropdown.onChange(path => {
					if (this.busy || this.terminal) { dropdown.setValue(this.selections.get(line.id) ?? ''); return; }
					if (path === '__another__') {
						dropdown.setValue(this.selections.get(line.id) ?? '');
						new NotePicker(this.app, review.sources.filter(source => source.note.kind === 'bottle'
							|| source.fields[PROP.stockTracking] === 'volume').map(source => source.note), note => {
							if (this.closed || this.busy || this.terminal) return;
							this.selections.set(line.id, note.path);
							this.render();
						}).open();
					} else {
						if (path) this.selections.set(line.id, path); else this.selections.delete(line.id);
						this.refreshPreview();
					}
				});
			});
		}
		this.previewEl = this.contentEl.createDiv();
		new Setting(this.contentEl).setName('Date').setDesc('Made earlier? Pick the day; last made and last used never move backward.').addText(input => {
			input.inputEl.type = 'date';
			input.inputEl.max = localDate();
			input.inputEl.setAttribute('aria-label', 'Date');
			input.setValue(this.date).onChange(value => {
				if (this.busy || this.terminal) { input.setValue(this.date); return; }
				void this.changeDate(value);
			});
		});
		this.dailySetting = new Setting(this.contentEl).setName('Add to daily note')
			.addToggle(toggle => (this.dailyToggle = toggle).setValue(this.addDaily).onChange(value => {
				if (this.busy || this.terminal) { toggle.setValue(this.addDaily); return; }
				this.addDaily = value; this.refreshPreview();
			}));
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(button => {
				this.applyButton = button.setButtonText('Log').setCta().onClick(() => { void this.apply(); });
			});
		this.refreshPreview();
	}

	/** Re-read the daily note for another day; an empty or future date is kept as typed and blocks logging. */
	private async changeDate(value: string) {
		this.date = value;
		const request = ++this.dateRequest;
		const review = this.review;
		if (!review) return;
		const daily = await this.logger.daily.preview(review.recipe, value);
		if (this.closed || this.busy || this.terminal || request !== this.dateRequest || !this.review) return;
		const duplicateChanged = daily.duplicate !== this.review.daily.duplicate;
		this.review = { ...this.review, daily };
		if (duplicateChanged) { this.addDaily = !daily.duplicate; this.dailyToggle?.setValue(this.addDaily); }
		this.refreshPreview();
	}

	private dateInvalid(): boolean { return !/^\d{4}-\d{2}-\d{2}$/.test(this.date) || this.date > localDate(); }

	private refreshPreview() {
		if (!this.previewEl || !this.review) return;
		const review = this.review;
		const plan = planLogging(review.lines, review.sources, this.selections, this.servings);
		this.previewEl.empty();
		if (plan.changes.length) {
			new Setting(this.previewEl).setName('Stock').setHeading();
			const table = this.previewEl.createEl('table', { cls: 'cocktail-cabinet-log-preview' });
			const head = table.createEl('thead').createEl('tr');
			for (const text of ['', 'Used', 'Left', '']) head.createEl('th', { text });
			const body = table.createEl('tbody');
			for (const change of plan.changes) {
				const row = body.createEl('tr');
				row.createEl('td', { text: change.source.note.name });
				row.createEl('td', { text: `${formatMl(change.consumedMl)} mL` });
				const unopened = change.updates[PROP.unopened] ?? change.source.fields[PROP.unopened];
				const volume = change.source.fields[PROP.volume];
				const after = change.source.note.kind === 'bottle'
					? `${bottleStockText(change.updates[PROP.open]!, typeof unopened === 'number' ? unopened : 0, typeof volume === 'number' ? volume : null)}${change.opened ? ` · opens ${change.opened}` : ''}`
					: `${formatMl(change.updates[PROP.remaining]!)} mL`;
				row.createEl('td', { text: after });
				this.editButton(row.createEl('td'), change.source.note);
			}
		}
		const blocked = new Set(plan.blocked.map(item => item.error));
		const other = plan.errors.filter(error => !blocked.has(error));
		if (other.length) {
			const errors = this.previewEl.createDiv({ cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
			for (const error of other) errors.createEl('p', { text: ingredientLabel(error) });
		}
		// Stock that can't cover the drink is often just out of date: offer the fix in place.
		for (const item of plan.blocked) {
			const source = review.sources.find(candidate => candidate.note.path === item.path)!;
			const row = new Setting(this.previewEl).setName(source.note.name).setDesc(item.error.slice(source.note.name.length + 2))
				.addButton(button => button.setButtonText('Edit stock').onClick(() => this.editStock(item.path)));
			row.descEl.addClass('cocktail-cabinet-error');
			row.descEl.setAttribute('role', 'alert');
		}
		if (plan.skipped.length) {
			new Setting(this.previewEl).setName('Not subtracted').setHeading();
			const list = this.previewEl.createEl('ul', { cls: 'cocktail-cabinet-log-skipped' });
			for (const line of plan.skipped) {
				const item = list.createEl('li', { text: `${ingredientLabel(line.text)}: ${line.reason}` });
				if (!line.link) continue;
				const button = item.createEl('button', { cls: 'cocktail-cabinet-log-link', text: 'Link…', attr: { 'aria-label': `Link ${ingredientLabel(line.text)}` } });
				button.addEventListener('click', event => this.linkLine(line, event));
			}
		}
		if (this.dailySetting) {
			const valid = Number.isFinite(this.servings) && this.servings > 0;
			const desc = review.daily.error ?? [valid ? dailyLogText(review.recipe, this.servings) : '', review.daily.duplicate ? `Already in the note for ${review.daily.date}.` : ''].filter(Boolean).join(' ');
			this.dailySetting.setDesc(desc);
			this.dailySetting.descEl.toggleClass('cocktail-cabinet-error', !!review.daily.error && this.addDaily);
		}
		this.applyButton?.setDisabled(this.busy || this.terminal || this.dateInvalid() || plan.errors.length > 0 || plan.unselected > 0
			|| (this.addDaily && !!review.daily.error) || (!this.addDaily && !plan.changes.length));
	}

	private async apply() {
		if (this.busy || this.terminal || !this.review) return;
		const review = this.review;
		const plan = planLogging(review.lines, review.sources, this.selections, this.servings);
		if (plan.errors.length || plan.unselected || this.dateInvalid() || (this.addDaily && review.daily.error)) return;
		this.busy = true;
		this.refreshPreview();
		try {
			const result = await this.logger.apply(review, plan, this.addDaily);
			if (result.status === 'applied') {
				this.terminal = true;
				new Notice(result.notice);
				this.close();
			} else {
				this.acceptReview(result.review, false);
				this.notice = result.notice;
				if (!this.closed) this.render();
			}
		} catch (error) {
			if (error instanceof LoggingWriteError) this.terminal = true;
			this.notice = error instanceof Error ? error.message : 'Couldn’t log the cocktail.';
			if (!this.closed) this.messageEl.setText(this.notice);
			else new Notice(this.notice, 0);
		} finally {
			this.busy = false;
			if (!this.closed) this.refreshPreview();
		}
	}

	private editButton(cell: HTMLElement, note: CabinetNote) {
		const button = cell.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `Edit stock: ${note.name}` } });
		setIcon(button, 'gauge');
		button.addEventListener('click', () => this.editStock(note.path));
	}

	onClose() { this.closed = true; this.contentEl.empty(); }
}
