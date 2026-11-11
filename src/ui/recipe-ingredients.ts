import { ButtonComponent, Menu, Setting, setIcon } from 'obsidian';
import type { TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { wikiLink } from '../core/schema';
import { recipeVolumeMl, splitIngredient } from '../core/recipe-amount';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { addCreateItems, pickIngredient } from './link-choice';
import { IngredientSuggest } from './ingredient-suggest';

export interface IngredientRow {
	amount: string;
	text: string;
	note?: CabinetNote;
	/** The line as saved, written back unchanged unless the row is edited. */
	original?: string;
}

/** Shared review controls for pasted and manually entered ingredients. */
export class RecipeIngredients {
	private rows: IngredientRow[] = [];
	/** Each saved row's values when the form opened. */
	private loaded = new Map<IngredientRow, { amount: string; text: string; note?: string }>();
	private rowsEl: HTMLElement;
	private notes: CabinetNote[];

	constructor(private plugin: CocktailCabinetPlugin, container: HTMLElement, initial: IngredientRow[],
		description = 'Link to the specificity the recipe calls for; start typing an ingredient to find one. Plain text is fine for garnishes or ingredients you do not want to catalog. Links help you find related recipes and log the ingredients you use.') {
		this.notes = recipeIngredientNotes(plugin.store.notes());
		new Setting(container).setName('Ingredients').setHeading();
		container.createEl('p', { text: description });
		this.rowsEl = container.createDiv({ cls: 'cocktail-cabinet-ingredients' });
		for (const data of initial.length ? initial : [{ amount: '', text: '' }]) this.add(data);
		// Left-aligned and joined to the list, so it reads as part of the list rather than a form action.
		new Setting(container).setClass('cocktail-cabinet-add-ingredient')
			.addButton(button => {
				button.setButtonText('Add ingredient').onClick(() => this.add({ amount: '', text: '' }));
				// setButtonText replaces the content, so the icon goes in afterward.
				setIcon(button.buttonEl.createSpan({ cls: 'cocktail-cabinet-button-icon', prepend: true }), 'plus');
			});
	}

	lines(): string[] {
		if (this.rows.some(row => row.amount.trim() && !row.text.trim())) throw new Error('Enter an ingredient for each amount.');
		const lines = this.rows.filter(row => row.text.trim()).map(row => {
			const loaded = this.loaded.get(row);
			if (row.original !== undefined && loaded && loaded.amount === row.amount && loaded.text === row.text && loaded.note === row.note?.path) return row.original;
			return [row.amount.trim(), row.note ? wikiLink(row.note.path, row.text.trim()) : row.text.trim()].filter(Boolean).join(' ');
		});
		if (!lines.length) throw new Error('Add at least one ingredient.');
		return lines;
	}

	private add(data: IngredientRow) {
		this.rows.push(data);
		if (data.original !== undefined) this.loaded.set(data, { amount: data.amount, text: data.text, note: data.note?.path });
		const wrapper = this.rowsEl.createDiv({ cls: 'cocktail-cabinet-ingredient' });
		const fields = new Setting(wrapper).setName('Ingredient');
		const status = wrapper.createEl('p', { cls: 'cocktail-cabinet-ingredient-status', attr: { 'aria-live': 'polite' } });
		const suggestions = wrapper.createDiv({ cls: 'cocktail-cabinet-suggestions' });
		const actions = new Setting(wrapper).setClass('cocktail-cabinet-ingredient-actions');
		let keepText = false;
		let nameInput!: TextComponent;
		const describe = () => {
			const ml = recipeVolumeMl(data.amount);
			const amount = ml === null ? 'Amount kept as written; review it when logging.' : `Volume recognized: ${Number(ml.toFixed(2))} mL${/oz|ounce/i.test(data.amount) && !/ml|millilit(?:er|re)s?/i.test(data.amount) ? ' (US fl oz)' : ''}.`;
			status.setText(`${data.note ? `Linked to ${data.note.kind}: ${data.note.name}.` : /\[\[/.test(data.text) ? 'Existing Markdown links kept as written.' : 'Plain text; no cabinet link.'} ${amount}`);
		};
		/** Link the row; suggestions and pickers keep the wording as display text, the type-ahead uses the note's name. */
		const choose = (note: CabinetNote, label = plainIngredient(data.text) || note.name) => {
			if (!this.notes.some(item => item.path === note.path)) this.notes.push(note);
			data.note = note;
			data.text = label;
			nameInput.setValue(data.text);
			keepText = false;
			refresh();
		};
		const refresh = () => {
			describe();
			suggestions.empty();
			if (data.note || keepText) return;
			const candidates = suggestIngredient(data.text, this.notes);
			if (!candidates.length) return;
			suggestions.createSpan({ text: 'Suggested links:' });
			for (const note of candidates) {
				new ButtonComponent(suggestions).setButtonText(`${note.name} · ${note.kind}`)
					.setTooltip(`Link to ${note.path}`).onClick(() => choose(note));
			}
			new ButtonComponent(suggestions).setButtonText('Leave unlinked').onClick(() => {
				keepText = true;
				refresh();
			});
		};
		fields.addText(text => {
			text.setValue(data.amount).setPlaceholder('Amount, such as 1½ oz').onChange(value => { data.amount = value; describe(); });
			text.inputEl.setAttribute('aria-label', 'Ingredient amount');
			text.inputEl.addClass('cocktail-cabinet-amount-input');
		});
		fields.addText(text => {
			nameInput = text.setValue(data.text).setPlaceholder('Ingredient or garnish').onChange(value => {
				data.text = value;
				data.note = undefined;
				keepText = false;
				refresh();
			});
			text.inputEl.setAttribute('aria-label', 'Ingredient name');
			text.inputEl.addClass('cocktail-cabinet-ingredient-input');
			// What was typed is only a search, so the link shows the note's name.
			new IngredientSuggest(this.plugin.app, text.inputEl, () => this.notes, note => choose(note, note.name));
		});
		actions.addButton(button => button.setButtonText('Select link').onClick(() => pickIngredient(this.plugin, choose)));
		actions.addButton(button => button.setButtonText('Create ingredient').onClick(event => {
			const menu = new Menu();
			addCreateItems(menu, this.plugin, plainIngredient(data.text), choose);
			menu.showAtMouseEvent(event);
		}));
		actions.addButton(button => button.setButtonText('Unlink').onClick(() => {
			data.note = undefined;
			data.text = plainIngredient(data.text);
			nameInput.setValue(data.text);
			keepText = true;
			refresh();
		}));
		actions.addExtraButton(button => button.setIcon('trash').setTooltip('Remove ingredient').onClick(() => {
			this.rows.splice(this.rows.indexOf(data), 1);
			wrapper.remove();
		}));
		refresh();
	}
}

/**
 * Rows for saved ingredient lines, kept as written unless edited. A line whose ingredient is one cabinet
 * link shows as that note with its display text, as if just linked.
 */
export function ingredientRows(plugin: CocktailCabinetPlugin, lines: readonly string[], sourcePath = ''): IngredientRow[] {
	return lines.map(original => {
		const { amount, text } = splitIngredient(original);
		const link = text.match(/^\[\[([^\]]+)\]\]$/)?.[1];
		const file = link ? plugin.store.resolve(link, sourcePath) : null;
		const note = file ? plugin.store.notes().find(item => item.path === file.path) : undefined;
		return note ? { amount, text: plainIngredient(text), note, original } : { amount, text, original };
	});
}

function plainIngredient(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split('|').at(-1)!.split('/').at(-1)!);
}
