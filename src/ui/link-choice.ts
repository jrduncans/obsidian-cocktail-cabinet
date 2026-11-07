import { Menu } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { IngredientModal } from './ingredient-modal';
import { NotePicker } from './picker';
import { StockModal } from './stock-modal';

const CREATE = [
	['type', 'Ingredient type'], ['bottle', 'Bottle'], ['ingredient', 'Other stock'],
	['family', 'Ingredient family'], ['category', 'Ingredient category'],
] as const;

/** Open the form that creates a cabinet note of `kind`, named `name`, passing the new note to `choose`. */
export function createIngredient(plugin: CocktailCabinetPlugin, kind: typeof CREATE[number][0], name: string, choose: (note: CabinetNote) => void) {
	if (kind === 'bottle' || kind === 'ingredient') new StockModal(plugin, kind === 'bottle', { created: choose, name }).open();
	else new IngredientModal(plugin, kind, choose, name).open();
}

/** Menu items for each kind of cabinet note that can be created for an ingredient. */
export function addCreateItems(menu: Menu, plugin: CocktailCabinetPlugin, name: string, choose: (note: CabinetNote) => void, prefix = '') {
	for (const [kind, title] of CREATE) menu.addItem(item => item.setTitle(prefix ? `${prefix}${title.toLowerCase()}` : title).onClick(() => createIngredient(plugin, kind, name, choose)));
}

export function pickIngredient(plugin: CocktailCabinetPlugin, choose: (note: CabinetNote) => void) {
	new NotePicker(plugin.app, recipeIngredientNotes(plugin.store.notes()), choose).open();
}

/** Choose what an ingredient's wording links to: name suggestions, any cabinet note, or a new one. */
export function showLinkMenu(plugin: CocktailCabinetPlugin, event: MouseEvent, wording: string, choose: (note: CabinetNote) => void) {
	const menu = new Menu();
	for (const note of suggestIngredient(wording, plugin.store.notes())) {
		menu.addItem(item => item.setTitle(`${note.name} · ${note.kind}`).setIcon('link').onClick(() => choose(note)));
	}
	menu.addItem(item => item.setTitle('Find a cabinet note…').setIcon('search').onClick(() => pickIngredient(plugin, choose)));
	menu.addSeparator();
	addCreateItems(menu, plugin, wording, choose, 'New ');
	menu.showAtMouseEvent(event);
}
