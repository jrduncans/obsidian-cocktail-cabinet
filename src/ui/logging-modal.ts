import { Modal, Notice, Setting, setIcon } from 'obsidian';
import type { ButtonComponent, DropdownComponent, ToggleComponent } from 'obsidian';
import { dailyLogText } from '../core/logging-daily';
import { oneOffDailyText } from '../core/one-off';
import type { OneOff } from '../core/one-off';
import { SKIP_LINE } from '../core/logging-lines';
import type { SkippedLine } from '../core/logging-lines';
import { ingredientParts, linkedLinePreview } from '../core/unlinked-lines';
import { localDate } from '../core/notes';
import { planLogging } from '../core/logging-plan';
import type { LinePart, LineSelection } from '../core/logging-plan';
import { bottleStockText, formatMl } from '../core/logging-stock';
import { PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import type { CountedLine } from '../core/logging-lines';
import { LoggingStore, LoggingWriteError } from '../vault/logging-store';
import type { LoggingReview } from '../vault/logging-store';
import type CocktailCabinetPlugin from '../main';
import { NotePicker } from './picker';
import { EditStockModal } from './edit-stock-modal';
import type { StockStore } from '../vault/stock-store';
import type { RecipeLinkStore } from '../vault/recipe-links';
import { showLinkMenu } from './link-choice';
import { LinkTextModal } from './link-text';
import { undoNotice } from './undo-log-modal';

/** Dropdown value for splitting a line between sources. */
const SPLIT = '__split__';
/** Dropdown value that opens a search of every source. */
const OTHER = '__another__';

function ingredientLabel(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_link, target: string) =>
		target.includes('|') ? target.split('|').at(-1)! : target.split('/').at(-1)!,
	);
}

export class LoggingModal extends Modal {
	private review?: LoggingReview;
	private servings = 1;
	private selections = new Map<number, LineSelection>();
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

	private recipe?: CabinetNote;
	private oneOff?: OneOff;

	/** A one-off can go `back` to its ingredients, keeping what was entered. */
	constructor(
		private plugin: CocktailCabinetPlugin,
		private logger: LoggingStore,
		private stocks: StockStore,
		private links: RecipeLinkStore,
		subject: CabinetNote | OneOff,
		private back?: (oneOff: OneOff) => void,
	) {
		super(plugin.app);
		if ('lines' in subject) this.oneOff = subject;
		else this.recipe = subject;
	}

	private read(): Promise<LoggingReview> {
		return this.oneOff
			? this.logger.reviewOneOff(this.oneOff, this.date)
			: this.logger.review(this.recipe!, this.date);
	}

	/** Link an ingredient line in the recipe, then re-read it so the line can be subtracted, keeping the other choices. */
	private linkLine(line: SkippedLine, event: MouseEvent) {
		const link = line.link;
		if (!link || !this.recipe || this.busy || this.terminal) return;
		const wording = ingredientParts(line.text).wording;
		showLinkMenu(this.plugin, event, wording, (note) => {
			if (this.closed || this.busy || this.terminal) return;
			new LinkTextModal(this.plugin, {
				note,
				original: wording,
				originalLabel: 'Recipe wording',
				preview: (text) => linkedLinePreview(line.text, text),
				submit: async (text) => {
					if (this.closed || this.busy || this.terminal || !this.recipe) return;
					try {
						await this.links.linkLine(
							{ path: this.recipe.path, line: link.line, raw: link.raw, text },
							note.path,
						);
						await this.reload(
							`Linked ${wording} to ${note.name} in the recipe${text === wording ? '' : `, shown as ${text}`}.`,
						);
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
		const source = this.review?.sources.find((item) => item.note.path === path);
		if (!source) return;
		void (async () => {
			try {
				new EditStockModal(this.app, this.stocks, source.note, await this.stocks.read(source.note), () => {
					void this.reload();
				}).open();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : 'Couldn’t open the stock.');
			}
		})();
	}

	private async reload(notice = '') {
		try {
			const review = await this.read();
			if (this.closed || this.busy || this.terminal) return;
			this.acceptReview(review, false);
			this.notice = notice;
			this.render();
		} catch (error) {
			if (!this.closed)
				this.messageEl.setText(error instanceof Error ? error.message : 'Couldn’t reload the stock.');
		}
	}

	onOpen() {
		this.titleEl.setText(this.oneOff ? 'Log a one-off' : 'Log this cocktail');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Loading…' });
		void this.load();
	}

	private async load() {
		try {
			const review = await this.read();
			if (this.closed) return;
			this.acceptReview(review, true);
			this.render();
		} catch (error) {
			if (!this.closed)
				this.contentEl.setText(
					error instanceof Error ? error.message : 'Couldn’t open this recipe for logging.',
				);
		}
	}

	private acceptReview(review: LoggingReview, initial: boolean) {
		const old = this.review;
		this.review = review;
		// A choice carries over while its line reads the same, so linking another line keeps it.
		const oldText = new Map(initial ? [] : (old?.lines.counted.map((line) => [line.id, line.text] as const) ?? []));
		this.selections = new Map(
			review.lines.counted.flatMap((line): [number, LineSelection][] => {
				const previous = oldText.get(line.id) === line.text ? this.selections.get(line.id) : undefined;
				const exists = (path: string | null) =>
					!path || review.sources.some((source) => source.note.path === path);
				if (Array.isArray(previous))
					return [[line.id, previous.map((part) => (exists(part.path) ? part : { ...part, path: null }))]];
				const path =
					previous && (previous === SKIP_LINE || exists(previous)) ? previous : line.initialSelection;
				return path ? [[line.id, path]] : [];
			}),
		);
		if (initial || review.daily.duplicate !== old?.daily.duplicate) this.addDaily = !review.daily.duplicate;
	}

	private render() {
		const review = this.review!;
		this.contentEl.empty();
		this.titleEl.setText(
			review.oneOff
				? review.oneOff.name
					? `Log ${review.oneOff.name}`
					: 'Log a one-off'
				: `Log ${review.recipe!.name}`,
		);
		this.messageEl = this.contentEl.createEl('p', {
			cls: 'cocktail-cabinet-log-notice',
			attr: { role: 'status' },
			text: this.notice,
		});
		new Setting(this.contentEl).setName('Servings').addText((input) => {
			input.inputEl.type = 'number';
			input.inputEl.min = '0';
			input.inputEl.step = 'any';
			input.inputEl.setAttribute('aria-label', 'Servings');
			input.setValue(String(this.servings)).onChange((value) => {
				if (this.busy || this.terminal) {
					input.setValue(String(this.servings));
					return;
				}
				this.servings = value.trim() ? Number(value) : NaN;
				this.refreshPreview();
			});
		});
		if (review.lines.counted.length) new Setting(this.contentEl).setName('Used').setHeading();
		for (const line of review.lines.counted) {
			const choice = this.selections.get(line.id);
			const row = new Setting(this.contentEl).setName(ingredientLabel(line.text));
			row.addDropdown((dropdown) => {
				const selected = Array.isArray(choice) ? undefined : choice;
				this.addSourceOptions(dropdown, line, selected === SKIP_LINE ? null : (selected ?? null));
				dropdown.addOption(SPLIT, 'Split between bottles…');
				dropdown.addOption(SKIP_LINE, 'Don’t subtract');
				const current = () => {
					const value = this.selections.get(line.id);
					return Array.isArray(value) ? SPLIT : (value ?? '');
				};
				dropdown.setValue(current());
				dropdown.selectEl.setAttribute('aria-label', ingredientLabel(line.text));
				dropdown.onChange((path) => {
					if (this.busy || this.terminal) {
						dropdown.setValue(current());
						return;
					}
					const wasSplit = Array.isArray(this.selections.get(line.id));
					if (path === SPLIT) {
						const first = selected && selected !== SKIP_LINE ? selected : null;
						this.selections.set(line.id, [
							{ path: first, amount: `${formatMl(line.ml)} ml` },
							{ path: null, amount: '' },
						]);
						this.render();
					} else if (path === OTHER) {
						dropdown.setValue(current());
						this.pickOther((note) => {
							this.selections.set(line.id, note.path);
							this.render();
						});
					} else {
						if (path) this.selections.set(line.id, path);
						else this.selections.delete(line.id);
						if (wasSplit) this.render();
						else this.refreshPreview();
					}
				});
			});
			if (Array.isArray(choice)) this.renderParts(line, choice);
		}
		this.previewEl = this.contentEl.createDiv();
		new Setting(this.contentEl).setName('Date').addText((input) => {
			input.inputEl.type = 'date';
			input.inputEl.max = localDate();
			input.inputEl.setAttribute('aria-label', 'Date');
			input.setValue(this.date).onChange((value) => {
				if (this.busy || this.terminal) {
					input.setValue(this.date);
					return;
				}
				void this.changeDate(value);
			});
		});
		this.dailySetting = new Setting(this.contentEl).setName('Add to daily note').addToggle((toggle) =>
			(this.dailyToggle = toggle).setValue(this.addDaily).onChange((value) => {
				if (this.busy || this.terminal) {
					toggle.setValue(this.addDaily);
					return;
				}
				this.addDaily = value;
				this.refreshPreview();
			}),
		);
		const actions = new Setting(this.contentEl).addButton((button) =>
			button.setButtonText('Cancel').onClick(() => this.close()),
		);
		const back = this.back,
			oneOff = this.oneOff;
		if (back && oneOff)
			actions.addButton((button) =>
				button.setButtonText('Edit ingredients').onClick(() => {
					if (this.busy || this.terminal) return;
					this.close();
					back(oneOff);
				}),
			);
		actions.addButton((button) => {
			this.applyButton = button
				.setButtonText('Log')
				.setCta()
				.onClick(() => {
					void this.apply();
				});
		});
		this.refreshPreview();
	}

	/** The sources offered for a line, the same for a whole line and each part of a split one. */
	private addSourceOptions(dropdown: DropdownComponent, line: CountedLine, selected: string | null) {
		const review = this.review!;
		dropdown.addOption('', 'Select…');
		const paths = [...line.candidates];
		if (selected && !paths.includes(selected) && !line.alternatives.includes(selected)) paths.push(selected);
		const nameOf = (path: string) => review.sources.find((source) => source.note.path === path)!.note.name;
		for (const path of paths) dropdown.addOption(path, nameOf(path));
		if (line.alternatives.length) {
			// Likely substitutes from a catch-all type, kept apart from what the recipe calls for.
			const group = dropdown.selectEl.createEl('optgroup', {
				attr: { label: line.alternativesLabel ?? 'Other bottles' },
			});
			for (const path of line.alternatives) group.createEl('option', { value: path, text: nameOf(path) });
		}
		dropdown.addOption(OTHER, 'Other bottle…');
	}

	/** Search every bottle and mL-tracked other stock for an exceptional substitute. */
	private pickOther(choose: (note: CabinetNote) => void) {
		const sources = this.review!.sources.filter(
			(source) => source.note.kind === 'bottle' || source.fields[PROP.stockTracking] === 'volume',
		);
		new NotePicker(
			this.app,
			sources.map((source) => source.note),
			(note) => {
				if (this.closed || this.busy || this.terminal) return;
				choose(note);
			},
		).open();
	}

	/** A line split between sources: a source and an amount per part, so substitutes and finished bottles can be logged. */
	private renderParts(line: CountedLine, parts: LinePart[]) {
		const label = ingredientLabel(line.text);
		parts.forEach((part, index) => {
			const row = new Setting(this.contentEl).setClass('cocktail-cabinet-log-part');
			row.addDropdown((dropdown) => {
				this.addSourceOptions(dropdown, line, part.path);
				dropdown.setValue(part.path ?? '');
				dropdown.selectEl.setAttribute('aria-label', `${label}, part ${index + 1}`);
				dropdown.onChange((path) => {
					if (this.busy || this.terminal) {
						dropdown.setValue(part.path ?? '');
						return;
					}
					if (path === OTHER) {
						dropdown.setValue(part.path ?? '');
						this.pickOther((note) => {
							part.path = note.path;
							this.render();
						});
						return;
					}
					part.path = path || null;
					this.refreshPreview();
				});
			});
			row.addText((input) => {
				input.setPlaceholder('Amount or rest').setValue(part.amount);
				input.inputEl.setAttribute('aria-label', `${label}, part ${index + 1} amount`);
				input.onChange((value) => {
					if (this.busy || this.terminal) {
						input.setValue(part.amount);
						return;
					}
					part.amount = value;
					this.refreshPreview();
				});
			});
			if (parts.length > 1)
				row.addExtraButton((button) =>
					button
						.setIcon('x')
						.setTooltip('Remove')
						.onClick(() => {
							if (this.busy || this.terminal) return;
							parts.splice(index, 1);
							this.render();
						}),
				);
		});
		new Setting(this.contentEl)
			.setClass('cocktail-cabinet-log-part')
			.setDesc('Per serving. Type “rest” to finish what’s open.')
			.addButton((button) =>
				button.setButtonText('Add bottle').onClick(() => {
					if (this.busy || this.terminal) return;
					parts.push({ path: null, amount: '' });
					this.render();
				}),
			);
	}

	/** Re-read the daily note for another day; an empty or future date is kept as typed and blocks logging. */
	private async changeDate(value: string) {
		this.date = value;
		const request = ++this.dateRequest;
		const review = this.review;
		if (!review) return;
		const daily = await this.logger.daily.preview(review.recipe ?? null, value);
		if (this.closed || this.busy || this.terminal || request !== this.dateRequest || !this.review) return;
		const duplicateChanged = daily.duplicate !== this.review.daily.duplicate;
		this.review = { ...this.review, daily };
		if (duplicateChanged) {
			this.addDaily = !daily.duplicate;
			this.dailyToggle?.setValue(this.addDaily);
		}
		this.refreshPreview();
	}

	private dateInvalid(): boolean {
		return !/^\d{4}-\d{2}-\d{2}$/.test(this.date) || this.date > localDate();
	}

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
				const after =
					change.source.note.kind === 'bottle'
						? `${bottleStockText(change.updates[PROP.open]!, typeof unopened === 'number' ? unopened : 0, typeof volume === 'number' ? volume : null)}${change.opened ? ` · opens ${change.opened}` : ''}`
						: `${formatMl(change.updates[PROP.remaining]!)} mL`;
				row.createEl('td', { text: after });
				this.editButton(row.createEl('td'), change.source.note);
			}
		}
		const blocked = new Set(plan.blocked.map((item) => item.error));
		const other = plan.errors.filter((error) => !blocked.has(error));
		if (other.length) {
			const errors = this.previewEl.createDiv({ cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
			for (const error of other) errors.createEl('p', { text: ingredientLabel(error) });
		}
		// Stock that can't cover the drink is often just out of date: offer the fix in place.
		for (const item of plan.blocked) {
			const source = review.sources.find((candidate) => candidate.note.path === item.path)!;
			const row = new Setting(this.previewEl)
				.setName(source.note.name)
				.setDesc(item.error.slice(source.note.name.length + 2))
				.addButton((button) => button.setButtonText('Edit stock').onClick(() => this.editStock(item.path)));
			row.descEl.addClass('cocktail-cabinet-error');
			row.descEl.setAttribute('role', 'alert');
		}
		if (plan.skipped.length) {
			new Setting(this.previewEl).setName('Not subtracted').setHeading();
			const list = this.previewEl.createEl('ul', { cls: 'cocktail-cabinet-log-skipped' });
			for (const line of plan.skipped) {
				const item = list.createEl('li', { text: `${ingredientLabel(line.text)}: ${line.reason}` });
				if (!line.link) continue;
				const button = item.createEl('button', {
					cls: 'cocktail-cabinet-log-link',
					text: 'Link…',
					attr: { 'aria-label': `Link ${ingredientLabel(line.text)}` },
				});
				button.addEventListener('click', (event) => this.linkLine(line, event));
			}
		}
		if (this.dailySetting) {
			const valid = Number.isFinite(this.servings) && this.servings > 0;
			const desc =
				review.daily.error ??
				[
					valid
						? review.oneOff
							? oneOffDailyText(review.oneOff, this.servings)
							: dailyLogText(review.recipe!, this.servings)
						: '',
					review.daily.duplicate ? `Already in the note for ${review.daily.date}.` : '',
				]
					.filter(Boolean)
					.join(' ');
			this.dailySetting.setDesc(desc);
			this.dailySetting.descEl.toggleClass('cocktail-cabinet-error', !!review.daily.error && this.addDaily);
		}
		this.applyButton?.setDisabled(
			this.busy ||
				this.terminal ||
				this.dateInvalid() ||
				plan.errors.length > 0 ||
				plan.unselected > 0 ||
				(this.addDaily && !!review.daily.error) ||
				(!this.addDaily && !plan.changes.length),
		);
	}

	private async apply() {
		if (this.busy || this.terminal || !this.review) return;
		const review = this.review;
		const plan = planLogging(review.lines, review.sources, this.selections, this.servings);
		if (plan.errors.length || plan.unselected || this.dateInvalid() || (this.addDaily && review.daily.error))
			return;
		this.busy = true;
		this.refreshPreview();
		try {
			const result = await this.logger.apply(review, plan, this.addDaily);
			if (result.status === 'applied') {
				this.terminal = true;
				if (result.undoable) undoNotice(this.app, this.logger.undo, result.notice);
				else new Notice(result.notice);
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
		const button = cell.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': `Edit stock: ${note.name}` },
		});
		setIcon(button, 'gauge');
		button.addEventListener('click', () => this.editStock(note.path));
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}
}
