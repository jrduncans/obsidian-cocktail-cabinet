import { Modal, Notice, Setting } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
import { dailyLogLine } from '../core/logging-daily';
import { planLogging } from '../core/logging-plan';
import { formatMl } from '../core/logging-stock';
import { PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import { LoggingStore, LoggingWriteError } from '../vault/logging-store';
import type { LoggingReview } from '../vault/logging-store';
import type CocktailCabinetPlugin from '../main';
import { NotePicker } from './picker';

function ingredientLabel(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_link, target: string) => target.includes('|') ? target.split('|').at(-1)! : target.split('/').at(-1)!);
}

export class LoggingModal extends Modal {
	private review?: LoggingReview;
	private servings = 1;
	private selections = new Map<number, string>();
	private addDaily = true;
	private busy = false;
	private terminal = false;
	private closed = false;
	private notice = '';
	private previewEl!: HTMLElement;
	private messageEl!: HTMLElement;
	private applyButton!: ButtonComponent;

	constructor(plugin: CocktailCabinetPlugin, private logger: LoggingStore, private recipe: CabinetNote) { super(plugin.app); }

	onOpen() {
		this.titleEl.setText('Log this cocktail');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Loading stock and today’s daily note…' });
		void this.load();
	}

	private async load() {
		try {
			const review = await this.logger.review(this.recipe);
			if (this.closed) return;
			this.acceptReview(review, true);
			this.render();
		} catch (error) {
			if (!this.closed) this.contentEl.setText(error instanceof Error ? error.message : 'Could not open the logging review.');
		}
	}

	private acceptReview(review: LoggingReview, initial: boolean) {
		const old = this.review;
		this.review = review;
		const keepSelections = !initial && old?.content === review.content;
		this.selections = new Map(review.lines.counted.flatMap(line => {
			const previous = keepSelections ? this.selections.get(line.id) : undefined;
			const path = previous && review.sources.some(source => source.note.path === previous) ? previous : line.initialSelection;
			return path ? [[line.id, path] as const] : [];
		}));
		if (initial || review.daily.duplicate !== old?.daily.duplicate) this.addDaily = !review.daily.duplicate;
	}

	private render() {
		const review = this.review!;
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: review.recipe.name });
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
		this.contentEl.createEl('h3', { text: 'Counted lines' });
		if (!review.lines.counted.length) this.contentEl.createEl('p', { text: 'No measured ingredients will be drawn down.' });
		for (const line of review.lines.counted) {
			const row = new Setting(this.contentEl).setName(ingredientLabel(line.text));
			row.setDesc(`${formatMl(line.ml)} mL per serving${line.targets.length > 1 ? ' · Select one alternative for this pour.' : ''}`);
			row.addDropdown(dropdown => {
				dropdown.addOption('', 'Select a bottle or source');
				const selected = this.selections.get(line.id);
				const paths = [...line.candidates];
				if (selected && !paths.includes(selected)) paths.push(selected);
				for (const path of paths) {
					const source = review.sources.find(source => source.note.path === path)!;
					dropdown.addOption(path, `${source.note.name}${source.note.kind === 'ingredient' ? ' · Other stock' : ''}`);
				}
				dropdown.addOption('__another__', 'Choose another bottle…');
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
		new Setting(this.contentEl).setName('Add daily note line')
			.setDesc(review.daily.duplicate ? 'Today’s daily note already has a Made entry for this recipe. Select to record another round.' : 'Append after all stock updates succeed.')
			.addToggle(toggle => toggle.setValue(this.addDaily).onChange(value => {
				if (this.busy || this.terminal) { toggle.setValue(this.addDaily); return; }
				this.addDaily = value; this.refreshPreview();
			}));
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Close').onClick(() => this.close()))
			.addButton(button => {
				this.applyButton = button.setButtonText('Apply').setCta().onClick(() => { void this.apply(); });
			});
		this.refreshPreview();
	}

	private refreshPreview() {
		if (!this.previewEl || !this.review) return;
		const review = this.review;
		const plan = planLogging(review.lines, review.sources, this.selections, this.servings);
		this.previewEl.empty();
		this.previewEl.createEl('h3', { text: 'Stock preview' });
		if (plan.changes.length) {
			const table = this.previewEl.createEl('table', { cls: 'cocktail-cabinet-log-preview' });
			const head = table.createEl('thead').createEl('tr');
			for (const text of ['Source', 'Draw down', 'After apply']) head.createEl('th', { text });
			const body = table.createEl('tbody');
			for (const change of plan.changes) {
				const row = body.createEl('tr');
				row.createEl('td', { text: change.source.note.name });
				row.createEl('td', { text: `${formatMl(change.consumedMl)} mL` });
				const unopened = change.updates[PROP.unopened] ?? change.source.fields[PROP.unopened];
				const unopenedLabel = typeof unopened === 'number' ? String(unopened) : 'unknown';
				const after = change.source.note.kind === 'bottle'
					? `${formatMl(change.updates[PROP.open]!)} mL open; ${unopenedLabel} unopened${change.opened ? ` (opens ${change.opened})` : ''}`
					: `${formatMl(change.updates[PROP.remaining]!)} mL remaining`;
				row.createEl('td', { text: after });
			}
		} else this.previewEl.createEl('p', { text: 'No stock changes.' });
		if (plan.errors.length) {
			const errors = this.previewEl.createDiv({ cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
			for (const error of plan.errors) errors.createEl('p', { text: ingredientLabel(error) });
		}
		this.previewEl.createEl('h3', { text: 'Not drawn down' });
		if (!plan.skipped.length) this.previewEl.createEl('p', { text: 'None.' });
		else {
			const list = this.previewEl.createEl('ul');
			for (const line of plan.skipped) list.createEl('li', { text: `${ingredientLabel(line.text)} — ${line.reason}` });
		}
		this.previewEl.createEl('h3', { text: 'Daily note' });
		if (review.daily.path) this.previewEl.createEl('p', { text: review.daily.path });
		if (Number.isFinite(this.servings) && this.servings > 0) {
			this.previewEl.createEl('p', { text: dailyLogLine(review.recipe, this.servings), cls: 'cocktail-cabinet-log-line' });
		}
		if (review.daily.error) this.previewEl.createEl('p', { text: review.daily.error, cls: this.addDaily ? 'cocktail-cabinet-error' : '' });
		this.applyButton?.setDisabled(this.busy || this.terminal || plan.errors.length > 0
			|| (this.addDaily && !!review.daily.error) || (!this.addDaily && !plan.changes.length));
	}

	private async apply() {
		if (this.busy || this.terminal || !this.review) return;
		const review = this.review;
		const plan = planLogging(review.lines, review.sources, this.selections, this.servings);
		if (plan.errors.length || (this.addDaily && review.daily.error)) return;
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
			this.notice = error instanceof Error ? error.message : 'Could not log the cocktail.';
			if (!this.closed) this.messageEl.setText(this.notice);
			else new Notice(this.notice, 0);
		} finally {
			this.busy = false;
			if (!this.closed) this.refreshPreview();
		}
	}

	onClose() { this.closed = true; this.contentEl.empty(); }
}
