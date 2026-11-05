import type CocktailCabinetPlugin from '../main';
import { PROP } from '../core/schema';
import { MarkdownView, Notice, Platform } from 'obsidian';
import { IngredientModal } from '../ui/ingredient-modal';
import { StockModal } from '../ui/stock-modal';
import { RecipeModal } from '../ui/recipe-modal';
import { SetupModal } from '../ui/setup-modal';
import { NotePicker } from '../ui/picker';
import { LoggingModal } from '../ui/logging-modal';
import { LoggingStore } from '../vault/logging-store';

export function registerCommands(plugin: CocktailCabinetPlugin) {
	const logger = new LoggingStore(plugin.app, plugin.store);
	plugin.addCommand({
		id: 'log-this-cocktail',
		name: 'Log this cocktail',
		checkCallback: checking => {
			if (Platform.isMobile) return false;
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md' || !file.path.startsWith(`${plugin.store.root}/`)) return false;
			const kind: unknown = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.kind];
			if (kind !== 'recipe') return false;
			if (!checking) {
				const recipe = plugin.store.notes().find(note => note.path === file.path && note.kind === 'recipe');
				if (recipe) new LoggingModal(plugin, logger, recipe).open();
			}
			return true;
		},
	});
	const ready = async (action: () => void | Promise<void>) => {
		if (!await plugin.store.isSetUp()) {
			new SetupModal(plugin).open();
		} else {
			await action();
		}
	};
	const open = () => handle(() => ready(() =>
		plugin.store.open(`${plugin.store.root}/Cocktail Cabinet.md`),
	));
	plugin.addRibbonIcon('martini', 'Open cocktail cabinet', open);
	plugin.addCommand({
		id: 'open-cabinet',
		name: 'Open cabinet',
		callback: open,
	});
	plugin.addCommand({
		id: 'setup-cabinet',
		name: 'Set up cabinet',
		callback: () => new SetupModal(plugin).open(),
	});
	plugin.addCommand({
		id: 'create-ingredient-type',
		name: 'Add ingredient type',
		callback: () => handle(() => ready(() => new IngredientModal(plugin).open())),
	});
	plugin.addCommand({
		id: 'create-ingredient-family',
		name: 'Add ingredient family',
		callback: () => handle(() => ready(() => new IngredientModal(plugin, 'family').open())),
	});
	plugin.addCommand({
		id: 'create-ingredient-category',
		name: 'Add ingredient category',
		callback: () => handle(() => ready(() => new IngredientModal(plugin, 'category').open())),
	});
	plugin.addCommand({
		id: 'create-bottle',
		name: 'Add a bottle',
		callback: () => handle(() => ready(() => new StockModal(plugin, true).open())),
	});
	plugin.addCommand({
		id: 'create-ingredient-stock',
		name: 'Add other stock',
		callback: () => handle(() => ready(() => new StockModal(plugin, false).open())),
	});
	// On a type note, open a stock form with the type already filled in.
	const forType = (id: string, name: string, bottle: boolean) => plugin.addCommand({
		id,
		name,
		checkCallback: checking => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file?.path.startsWith(`${plugin.store.root}/`)) return false;
			const type = plugin.store.notes().find(note => note.path === file.path && note.kind === 'type');
			if (!type) return false;
			if (!checking) void handle(() => ready(() => new StockModal(plugin, bottle, { types: [type] }).open()));
			return true;
		},
	});
	forType('add-bottle-of-type', 'Add a bottle of this type', true);
	forType('add-other-stock-for-type', 'Add other stock for this type', false);
	plugin.addCommand({
		id: 'create-recipe',
		name: 'Create a cocktail recipe',
		callback: () => handle(() => ready(() => new RecipeModal(plugin).open())),
	});
	plugin.addCommand({
		id: 'enhance-recipe',
		name: 'Enhance as cocktail recipe',
		checkCallback: checking => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (!checking) void handle(() => ready(async () => {
				const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
				const content = view?.file === file ? view.editor.getValue() : await plugin.app.vault.read(file);
				new RecipeModal(plugin, { path: file.path, content }).open();
			}));
			return true;
		},
	});
	plugin.addCommand({
		id: 'browse-related-recipes',
		name: 'Browse related recipes',
		checkCallback: checking => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file?.path.startsWith(`${plugin.store.root}/`)) return false;
			const note = plugin.store.notes().find(note => note.path === file.path && note.kind !== 'recipe');
			if (!note) return false;
			if (!checking) {
				void handle(async () => {
					const recipes = await plugin.store.relatedRecipes(note);
					new NotePicker(plugin.app, recipes, recipe => {
						void handle(() => plugin.store.open(recipe.path));
					}).open();
				});
			}
			return true;
		},
	});
}

async function handle(action: () => Promise<void>): Promise<void> {
	try {
		await action();
	} catch (error) {
		new Notice(error instanceof Error ? error.message : 'The cabinet action could not be completed.');
	}
}
