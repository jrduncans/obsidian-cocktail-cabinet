import { ButtonComponent, Menu, Setting } from 'obsidian';
import type { TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { wikiLink } from '../core/schema';
import { recipeVolumeMl } from '../core/recipe-amount';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { IngredientModal } from './ingredient-modal';
import { NotePicker } from './picker';
import { StockModal } from './stock-modal';

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

	constructor(private plugin: CocktailCabinetPlugin, container: HTMLElement, initial: IngredientRow[]) {
		this.notes = recipeIngredientNotes(plugin.store.notes());
		new Setting(container).setName('Ingredients').setHeading();
		container.createEl('p', { text: 'Link to the specificity the recipe calls for. Plain text is fine for garnishes or ingredients you do not want to catalog. Links help you find related recipes and log the ingredients you use.' });
		this.rowsEl = container.createDiv({ cls: 'cocktail-cabinet-ingredients' });
		for (const data of initial.length ? initial : [{ amount: '', text: '' }]) this.add(data);
		new Setting(container).addButton(button => button.setButtonText('Add ingredient').onClick(() => this.add({ amount: '', text: '' })));
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
		const choose = (note: CabinetNote) => {
			if (!this.notes.some(item => item.path === note.path)) this.notes.push(note);
			data.note = note;
			data.text = plainIngredient(data.text) || note.name;
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
			new ButtonComponent(suggestions).setButtonText('Keep as text').onClick(() => {
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
		});
		actions.addButton(button => button.setButtonText('Select link').onClick(() => {
			new NotePicker(this.plugin.app, recipeIngredientNotes(this.plugin.store.notes()), choose).open();
		}));
		actions.addButton(button => button.setButtonText('Create ingredient').onClick(event => {
			const menu = new Menu();
			for (const kind of ['type', 'bottle', 'ingredient', 'family', 'category'] as const) {
				const title = { type: 'Ingredient type', bottle: 'Bottle', ingredient: 'Other stock', family: 'Ingredient family', category: 'Ingredient category' }[kind];
				menu.addItem(item => item.setTitle(title).onClick(() => {
					if (kind === 'bottle' || kind === 'ingredient') new StockModal(this.plugin, kind === 'bottle', { created: choose, name: plainIngredient(data.text) }).open();
					else new IngredientModal(this.plugin, kind, choose, plainIngredient(data.text)).open();
				}));
			}
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

function plainIngredient(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split('|').at(-1)!.split('/').at(-1)!);
}
