import type CocktailCabinetPlugin from '../main';
import { CabinetModal, handle } from '../ui/cabinet-modal';
import { IngredientModal } from '../ui/ingredient-modal';
import { StockModal } from '../ui/stock-modal';
import { RecipeModal } from '../ui/recipe-modal';
import { SetupModal } from '../ui/setup-modal';
import { NotePicker } from '../ui/picker';

export function registerCommands(plugin: CocktailCabinetPlugin) {
	const ready = async (action: () => void) => {
		if (!await plugin.store.isSetUp()) new SetupModal(plugin).open();
		else action();
	};
	const open = () => new CabinetModal(plugin).open();
	plugin.addRibbonIcon('martini', 'Open cocktail cabinet', open);
	plugin.addCommand({ id: 'open-cabinet', name: 'Open cabinet', callback: open });
	plugin.addCommand({ id: 'setup-cabinet', name: 'Set up cabinet', callback: () => new SetupModal(plugin).open() });
	plugin.addCommand({ id: 'create-ingredient-type', name: 'Add ingredient type', callback: () => handle(() => ready(() => new IngredientModal(plugin).open())) });
	plugin.addCommand({ id: 'create-bottle', name: 'Add a bottle', callback: () => handle(() => ready(() => new StockModal(plugin, true).open())) });
	plugin.addCommand({ id: 'create-ingredient-stock', name: 'Add other stock', callback: () => handle(() => ready(() => new StockModal(plugin, false).open())) });
	plugin.addCommand({ id: 'create-recipe', name: 'Create a cocktail recipe', callback: () => handle(() => ready(() => new RecipeModal(plugin).open())) });
	plugin.addCommand({
		id: 'browse-related-recipes', name: 'Browse related recipes',
		checkCallback: checking => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file?.path.startsWith(`${plugin.store.root}/`)) return false;
			const note = plugin.store.notes().find(note => note.path === file.path && note.kind !== 'recipe');
			if (!note) return false;
			if (!checking) void handle(async () => {
				const recipes = await plugin.store.relatedRecipes(note);
				new NotePicker(plugin.app, recipes, recipe => { void handle(() => plugin.store.open(recipe.path)); }).open();
			});
			return true;
		},
	});
}
