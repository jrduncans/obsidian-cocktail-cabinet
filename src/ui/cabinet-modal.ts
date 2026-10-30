import { Modal, Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { NotePicker } from './picker';
import { IngredientModal } from './ingredient-modal';
import { StockModal } from './stock-modal';
import { RecipeModal } from './recipe-modal';
import { SetupModal } from './setup-modal';

export async function handle(action: () => Promise<void>): Promise<void> {
	try { await action(); }
	catch (error) { new Notice(error instanceof Error ? error.message : 'The cabinet action could not be completed.'); }
}

export class CabinetModal extends Modal {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	async onOpen() {
		this.titleEl.setText('Cocktail cabinet');
		try {
			if (!await this.plugin.store.isSetUp()) {
				this.contentEl.createEl('p', { text: 'Set up your ingredient catalog, then add bottles, other stock, and your own recipes.' });
				new Setting(this.contentEl).addButton(button => button.setButtonText('Set up cabinet').setCta().onClick(() => {
					this.close(); new SetupModal(this.plugin).open();
				}));
				return;
			}
			const notes = this.plugin.store.notes();
			this.contentEl.createEl('p', { text: `Folder: ${this.plugin.store.root}` });
			this.contentEl.createEl('p', { text: 'Every ingredient type is listed below. Families and categories are optional ways to browse.' });
			for (const [label, kind] of [['All ingredient types', 'type'], ['Ingredient families', 'family'], ['Ingredient categories', 'category'], ['Bottles', 'bottle'], ['Other stock', 'ingredient'], ['Recipes', 'recipe']] as const) {
				const items = notes.filter(note => note.kind === kind);
				new Setting(this.contentEl).setName(label).setDesc(`${items.length} notes`)
					.addButton(button => button.setButtonText('Browse').onClick(() => {
						new NotePicker(this.app, items, note => new NoteDetailsModal(this.plugin, note).open()).open();
					}));
			}
			new Setting(this.contentEl).setName('Add to your cabinet').setHeading();
			new Setting(this.contentEl)
				.addButton(button => button.setButtonText('Bottle').onClick(() => new StockModal(this.plugin, true).open()))
				.addButton(button => button.setButtonText('Other stock').onClick(() => new StockModal(this.plugin, false).open()))
				.addButton(button => button.setButtonText('Recipe').setCta().onClick(() => new RecipeModal(this.plugin).open()));
			new Setting(this.contentEl).setName('Extend ingredient catalog')
				.addButton(button => button.setButtonText('Type').onClick(() => new IngredientModal(this.plugin).open()))
				.addButton(button => button.setButtonText('Family').onClick(() => new IngredientModal(this.plugin, 'family').open()))
				.addButton(button => button.setButtonText('Category').onClick(() => new IngredientModal(this.plugin, 'category').open()));
			new Setting(this.contentEl).addButton(button => button.setButtonText('Refresh').onClick(() => {
				this.contentEl.empty(); void this.onOpen();
			}));
		} catch (error) {
			this.contentEl.createEl('p', { text: error instanceof Error ? error.message : 'Could not open the cabinet.' });
		}
	}

	onClose() { this.contentEl.empty(); }
}

export class NoteDetailsModal extends Modal {
	constructor(private plugin: CocktailCabinetPlugin, private note: CabinetNote) { super(plugin.app); }

	onOpen() {
		this.titleEl.setText(this.note.name);
		this.contentEl.createEl('p', { text: `${this.note.kind} · ${this.note.path}` });
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Open note').setCta().onClick(() => handle(async () => {
				await this.plugin.store.open(this.note.path); this.close();
			})))
			.addButton(button => button.setButtonText('Related recipes').onClick(() => handle(async () => {
				const recipes = await this.plugin.store.relatedRecipes(this.note);
				new NotePicker(this.app, recipes, note => { void handle(() => this.plugin.store.open(note.path)); }).open();
			})));
		const notes = this.plugin.store.notes();
		const relatives = notes.filter(note => this.note.parents.includes(note.path) || note.parents.includes(this.note.path));
		if (relatives.length) new Setting(this.contentEl).setName('Linked ingredients and stock')
			.addButton(button => button.setButtonText('Browse').onClick(() => {
				new NotePicker(this.app, relatives, note => new NoteDetailsModal(this.plugin, note).open()).open();
			}));
	}
	onClose() { this.contentEl.empty(); }
}
