import { ButtonComponent, ExtraButtonComponent, Menu, Notice, Setting, TextComponent, setIcon } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { wikiLink } from '../core/schema';
import { fractionAmount, lineVolumeMl, splitEcho, splitSavedLine } from '../core/recipe-amount';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { defaultLinkSource, savedWordingLink, wordingLink } from '../core/link-text';
import { canRemember, rememberedNote } from '../core/written-as';
import { addCreateItems, pickIngredient } from './link-choice';
import { IngredientSuggest } from './ingredient-suggest';

export interface IngredientRow {
	amount: string;
	/** The link's text on a linked row, else the whole wording. */
	text: string;
	note?: CabinetNote;
	/** Words kept beside the link, as written: "fresh " in "fresh [[…|Lime Juice]]". */
	before?: string;
	after?: string;
	/** The wording as it read when linked here, offered for remembering. */
	said?: string;
	/** The line as saved, written back unchanged unless the row is edited. */
	original?: string;
	/** Linked from a remembered wording when the form opened. */
	remembered?: boolean;
	/** Remember the row's wording for its note once the form saves. */
	remember?: boolean;
}

export interface IngredientOptions {
	/** Link rows whose wording one note remembers (`cc-written-as`); for new recipes, not saved ones. */
	linkRemembered?: boolean;
}

/** Shared review controls for pasted and manually entered ingredients. */
export class RecipeIngredients {
	private rows: IngredientRow[] = [];
	/** Each saved row's values when the form opened. */
	private loaded = new Map<IngredientRow, { amount: string; shown: string; note?: string }>();
	private rowsEl: HTMLElement;
	private rowData = new Map<HTMLElement, IngredientRow>();
	private notes: CabinetNote[];

	constructor(
		private plugin: CocktailCabinetPlugin,
		container: HTMLElement,
		initial: IngredientRow[],
		description = 'Type to find an ingredient note to link, at the specificity the recipe calls for. Plain text is fine for garnishes. The ⋯ menu searches, creates, unlinks, and moves an ingredient.',
		options: IngredientOptions = {},
	) {
		this.notes = recipeIngredientNotes(plugin.store.notes());
		// An echoed volume ("· 30 ml") belongs with the amount, so the wording is what gets linked.
		for (const row of initial) {
			if (row.original !== undefined || !row.amount) continue;
			const { lead, wording } = splitEcho(row.text);
			if (lead) Object.assign(row, { amount: `${row.amount} ${lead}`, text: wording });
			// Read recipes write fluid ounces with fraction characters; saved lines change only when edited.
			if (plugin.settings.fractionCharacters) row.amount = fractionAmount(row.amount);
		}
		if (options.linkRemembered) {
			for (const row of initial) {
				if (row.note || /\[\[/.test(row.text)) continue;
				const note = rememberedNote(row.text, this.notes);
				if (note) Object.assign(row, { note, remembered: true });
			}
		}
		new Setting(container).setName('Ingredients').setHeading();
		container.createEl('p', { text: description });
		this.rowsEl = container.createDiv({ cls: 'cocktail-cabinet-ingredients' });
		for (const data of initial.length ? initial : [{ amount: '', text: '' }]) this.add(data);
		// Left-aligned and joined to the list, so it reads as part of the list rather than a form action.
		new Setting(container).setClass('cocktail-cabinet-add-ingredient').addButton((button) => {
			button.setButtonText('Add ingredient').onClick(() => this.add({ amount: '', text: '' }).focus());
			// setButtonText replaces the content, so the icon goes in afterward.
			setIcon(button.buttonEl.createSpan({ cls: 'cocktail-cabinet-button-icon', prepend: true }), 'plus');
		});
	}

	lines(): string[] {
		if (this.rows.some((row) => row.amount.trim() && !row.text.trim()))
			throw new Error('Enter an ingredient for each amount.');
		const lines = this.rows
			.filter((row) => row.text.trim())
			.map((row) => {
				const loaded = this.loaded.get(row);
				if (
					row.original !== undefined &&
					loaded &&
					loaded.amount === row.amount &&
					loaded.shown === shown(row) &&
					loaded.note === row.note?.path
				)
					return row.original;
				const linked = row.note
					? `${row.before ?? ''}${wikiLink(row.note.path, row.text.trim())}${row.after ?? ''}`.trim()
					: row.text.trim();
				return [row.amount.trim(), linked].filter(Boolean).join(' ');
			});
		if (!lines.length) throw new Error('Add at least one ingredient.');
		return lines;
	}

	/** Remember the ticked rows' wordings for their notes; call once the form has saved. Failures are reported, not thrown. */
	async saveRemembered(): Promise<void> {
		const rows = this.rows.filter(
			(row) => row.remember && row.note && said(row) && canRemember(said(row), row.note),
		);
		const remembered: string[] = [];
		for (const row of rows) {
			try {
				if (await this.plugin.store.rememberWording(row.note!.path, said(row)))
					remembered.push(`“${said(row)}” for ${row.note!.name}`);
			} catch (error) {
				new Notice(error instanceof Error ? error.message : `Couldn’t remember “${said(row)}”.`);
			}
		}
		if (remembered.length) new Notice(`Remembered ${remembered.join(', ')}.`);
	}

	/** Add a row, after `after` or at the end; returns its amount field. */
	private add(data: IngredientRow, after?: HTMLElement): HTMLInputElement {
		const index = after ? this.rows.indexOf(this.rowData.get(after)!) + 1 : this.rows.length;
		this.rows.splice(index, 0, data);
		if (data.original !== undefined)
			this.loaded.set(data, { amount: data.amount, shown: shown(data), note: data.note?.path });
		const wrapper = createDiv({ cls: 'cocktail-cabinet-ingredient' });
		if (after) after.after(wrapper);
		else this.rowsEl.appendChild(wrapper);
		this.rowData.set(wrapper, data);
		const line = wrapper.createDiv({ cls: 'cocktail-cabinet-ingredient-line' });
		const status = wrapper.createEl('p', {
			cls: 'cocktail-cabinet-ingredient-status',
			attr: { 'aria-live': 'polite' },
		});
		const suggestions = wrapper.createDiv({ cls: 'cocktail-cabinet-suggestions' });
		const rememberEl = wrapper.createDiv({ cls: 'cocktail-cabinet-remember' });
		let keepText = false;
		const amountInput = new TextComponent(line);
		const nameInput = new TextComponent(line);
		const describe = () => {
			const unit = this.plugin.settings.volumeUnit;
			const ml = data.amount.trim() ? lineVolumeMl(`${data.amount} x`, unit) : null;
			// A recognized volume goes in the amount's tooltip; only an amount logging can't read needs a line.
			amountInput.inputEl.title =
				ml === null
					? ''
					: `${Number(ml.toFixed(2))} mL${/oz|ounce/i.test(data.amount) && (unit === 'oz' || !/ml|millilit(?:er|re)s?/i.test(data.amount)) ? ' (US fl oz)' : ''}`;
			const parts = [
				data.note
					? `Linked to ${data.note.kind}: ${data.note.name}${data.remembered ? ', from a remembered wording' : ''}.`
					: /\[\[/.test(data.text)
						? 'Existing Markdown links kept as written.'
						: '',
				// Dashes, drops, and pinches are meant to be unmeasured; only a volume logging can't read is worth a note.
				ml === null && /\b(?:oz|ounces?|ml|cl|millilit(?:er|re)s?)\b/i.test(data.amount)
					? 'Amount kept as written; review it when logging.'
					: '',
			];
			const beside = [data.before, data.after].map((part) => part?.trim()).filter(Boolean);
			if (data.note && beside.length)
				parts.splice(1, 0, `${beside.map((part) => `“${part}”`).join(' and ')} kept beside the link.`);
			status.setText(parts.filter(Boolean).join(' '));
		};
		/** Offer to remember the wording for a note linked in this form, unless it's already recognized. */
		const offerRemember = () => {
			rememberEl.empty();
			const loaded = this.loaded.get(data);
			const linkedHere = data.note && !data.remembered && (!loaded || loaded.note !== data.note.path);
			if (!linkedHere || !canRemember(said(data), data.note!)) {
				data.remember = false;
				return;
			}
			const label = rememberEl.createEl('label');
			const box = label.createEl('input', { type: 'checkbox' });
			box.checked = !!data.remember;
			box.addEventListener('change', () => {
				data.remember = box.checked;
			});
			label.appendText(` Remember “${said(data)}” for ${data.note!.name}`);
		};
		/**
		 * Link the row. Suggestions and pickers link the wording by the Link text setting (docs/link-text.md):
		 * the cabinet name for a name it counts, with other words kept beside the link, else the wording.
		 * The type-ahead's text was only a search, so it links the note's name.
		 */
		const choose = (note: CabinetNote, search = false) => {
			if (!this.notes.some((item) => item.path === note.path)) this.notes.push(note);
			const wording = plainIngredient(shown(data)).trim();
			const link = search
				? { before: '', text: note.name, after: '' }
				: wording
					? wordingLink(wording, note, defaultLinkSource(wording, note, this.plugin.settings.linkText))
					: { before: '', text: note.name, after: '' };
			Object.assign(data, { note, ...link, said: search ? undefined : wording, remembered: false });
			nameInput.setValue(shown(data));
			keepText = false;
			refresh();
		};
		const unlink = () => {
			data.text = plainIngredient(shown(data)).trim();
			Object.assign(data, { note: undefined, before: undefined, after: undefined, remembered: false });
			nameInput.setValue(data.text);
			keepText = true;
			refresh();
		};
		const refresh = () => {
			describe();
			offerRemember();
			suggestions.empty();
			wrapper.toggleClass('is-linked', !!data.note);
			if (data.note || keepText) return;
			const candidates = suggestIngredient(data.text, this.notes);
			if (!candidates.length) return;
			suggestions.createSpan({ text: 'Link to:' });
			for (const note of candidates) {
				new ButtonComponent(suggestions)
					.setButtonText(`${note.name} · ${note.kind}`)
					.setTooltip(`Link to ${note.path}`)
					.onClick(() => choose(note));
			}
			new ButtonComponent(suggestions).setButtonText('Leave unlinked').onClick(() => {
				keepText = true;
				refresh();
			});
		};
		amountInput
			.setValue(data.amount)
			.setPlaceholder('Amount, such as 1½ oz')
			.onChange((value) => {
				data.amount = value;
				describe();
			});
		// Typing `1 1/2 oz` gives `1½ oz` on leaving the field; an amount only tabbed through stays as it was.
		let typed = false;
		amountInput.inputEl.addEventListener('input', () => (typed = true));
		amountInput.inputEl.addEventListener('blur', () => {
			if (!typed || !this.plugin.settings.fractionCharacters) return;
			typed = false;
			const written = fractionAmount(data.amount);
			if (written === data.amount) return;
			data.amount = written;
			amountInput.setValue(written);
			describe();
		});
		amountInput.inputEl.setAttribute('aria-label', 'Ingredient amount');
		amountInput.inputEl.addClass('cocktail-cabinet-amount-input');
		nameInput
			.setValue(shown(data))
			.setPlaceholder('Ingredient or garnish')
			.onChange((value) => {
				data.text = value;
				Object.assign(data, { note: undefined, before: undefined, after: undefined, said: undefined });
				data.remembered = false;
				keepText = false;
				refresh();
			});
		nameInput.inputEl.setAttribute('aria-label', 'Ingredient name');
		nameInput.inputEl.addClass('cocktail-cabinet-ingredient-input');
		// What was typed is only a search, so the link shows the note's name.
		new IngredientSuggest(
			this.plugin.app,
			nameInput.inputEl,
			() => this.notes,
			(note) => choose(note, true),
		);
		const move = (step: -1 | 1) => {
			const index = this.rows.indexOf(data);
			const other = step < 0 ? wrapper.previousElementSibling : wrapper.nextElementSibling;
			if (!other) return;
			this.rows.splice(index, 1);
			this.rows.splice(index + step, 0, data);
			if (step < 0) other.before(wrapper);
			else other.after(wrapper);
		};
		const more = new ExtraButtonComponent(line).setIcon('more-horizontal').setTooltip('Link, create, or move');
		more.onClick(() => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle('Select link…')
					.setIcon('link')
					.onClick(() => pickIngredient(this.plugin, (note) => choose(note), plainIngredient(shown(data)))),
			);
			addCreateItems(menu, this.plugin, plainIngredient(shown(data)), (note) => choose(note), 'Create ');
			if (data.note || /\[\[/.test(data.text))
				menu.addItem((item) => item.setTitle('Unlink').setIcon('unlink').onClick(unlink));
			menu.addSeparator();
			const index = this.rows.indexOf(data);
			menu.addItem((item) =>
				item
					.setTitle('Move up')
					.setIcon('arrow-up')
					.setDisabled(index === 0)
					.onClick(() => move(-1)),
			);
			menu.addItem((item) =>
				item
					.setTitle('Move down')
					.setIcon('arrow-down')
					.setDisabled(index === this.rows.length - 1)
					.onClick(() => move(1)),
			);
			menu.addItem((item) =>
				item
					.setTitle('Add ingredient below')
					.setIcon('plus')
					.onClick(() => this.add({ amount: '', text: '' }, wrapper).focus()),
			);
			const rect = more.extraSettingsEl.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		});
		new ExtraButtonComponent(line)
			.setIcon('trash')
			.setTooltip('Remove ingredient')
			.onClick(() => {
				this.rows.splice(this.rows.indexOf(data), 1);
				this.rowData.delete(wrapper);
				wrapper.remove();
			});
		refresh();
		return amountInput.inputEl;
	}
}

/**
 * Rows for saved ingredient lines, kept as written unless edited. A line whose wording holds one link to
 * an ingredient note shows as that note with its display text, and any words beside it, as if just linked.
 */
export function ingredientRows(
	plugin: CocktailCabinetPlugin,
	lines: readonly string[],
	sourcePath = '',
): IngredientRow[] {
	return lines.map((original) => savedRow(plugin, original, sourcePath));
}

/** One saved line as a row; see `ingredientRows`. */
export function savedRow(plugin: CocktailCabinetPlugin, original: string, sourcePath = ''): IngredientRow {
	const { amount, text } = splitSavedLine(original);
	const link = savedWordingLink(text);
	const file = link ? plugin.store.resolve(link.target, sourcePath) : null;
	const note = file ? recipeIngredientNotes(plugin.store.notes()).find((item) => item.path === file.path) : undefined;
	if (!link || !note) return { amount, text, original };
	return {
		amount,
		text: link.text,
		note,
		original,
		...(link.before ? { before: link.before } : {}),
		...(link.after ? { after: link.after } : {}),
	};
}

/** The row as it reads: the words beside the link, and the link's text. */
const shown = (row: IngredientRow) => `${row.before ?? ''}${row.text}${row.after ?? ''}`;

/** The wording to offer for remembering: as it read when linked here, else as it reads now. */
const said = (row: IngredientRow) => (row.said ?? plainIngredient(shown(row))).trim();

function plainIngredient(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split('|').at(-1)!.split('/').at(-1)!);
}
