import { Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { CabinetForm } from './form';
import { NotePicker } from './picker';
import { IngredientModal } from './ingredient-modal';

interface IngredientRow { amount: string; text: string; note?: CabinetNote; }

export class RecipeModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	onOpen() {
		this.begin('Create a cocktail recipe', 'Choose ingredients at the specificity you want: a bottle, a type, a family, or a category. You can also leave an ingredient as plain text.');
		let name = '', source = '', method = '', description = '', tastingNotes = '';
		this.text('Recipe name', name, value => { name = value; });
		this.text('Source (optional)', source, value => { source = value; });
		new Setting(this.contentEl).setName('Ingredients').setHeading();
		const rowsEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-ingredients' });
		const rows: IngredientRow[] = [];
		const addRow = () => {
			const data: IngredientRow = { amount: '', text: '' };
			rows.push(data);
			const wrapper = rowsEl.createDiv({ cls: 'cocktail-cabinet-ingredient' });
			const row = new Setting(wrapper).setName(`Ingredient ${rows.length}`);
			row.addText(text => {
				text.setPlaceholder('Amount').onChange(value => { data.amount = value; });
				text.inputEl.setAttribute('aria-label', 'Ingredient amount');
			});
			row.addText(text => {
				text.setPlaceholder('Ingredient or garnish').onChange(value => { data.text = value; data.note = undefined; row.setDesc('Plain text ingredient'); });
				text.inputEl.setAttribute('aria-label', 'Ingredient name');
				const choose = (note: CabinetNote) => {
					data.note = note;
					data.text = note.name;
					text.setValue(note.name);
					row.setDesc(`Linked to ${note.kind}: ${note.name}`);
				};
				row.addButton(button => button.setButtonText('Select').onClick(() => {
					new NotePicker(this.app, this.plugin.store.notes().filter(note => ['category', 'family', 'type', 'bottle'].includes(note.kind)), choose).open();
				}));
				row.addButton(button => button.setButtonText('New type').onClick(() => {
					new IngredientModal(this.plugin, 'type', choose).open();
				}));
			});
			row.addExtraButton(button => button.setIcon('trash').setTooltip('Remove ingredient').onClick(() => {
				rows.splice(rows.indexOf(data), 1);
				wrapper.remove();
			}));
		};
		addRow();
		new Setting(this.contentEl).addButton(button => button.setButtonText('Add ingredient').onClick(addRow));
		this.area('Method', method, value => { method = value; });
		this.area('Description', description, value => { description = value; });
		this.area('Tasting notes', tastingNotes, value => { tastingNotes = value; });
		this.submit('Create recipe', async () => {
			const ingredients = rows.filter(row => row.text.trim()).map(row =>
				[row.amount.trim(), row.note ? this.plugin.store.link(row.note) : row.text.trim()].filter(Boolean).join(' '));
			if (!ingredients.length) throw new Error('Add at least one ingredient before creating the recipe.');
			if (rows.some(row => row.amount.trim() && !row.text.trim())) throw new Error('Choose an ingredient for each entered amount.');
			const file = await this.plugin.store.create({ kind: 'recipe', name, ingredients, method, description, tastingNotes, properties: { source: source.trim() || null, rating: null } });
			this.close();
			await this.plugin.store.open(file.path);
		});
	}
}
