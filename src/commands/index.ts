import type CocktailCabinetPlugin from '../main';
import { MarkdownView, Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import { IngredientModal } from '../ui/ingredient-modal';
import { PurchaseModal } from '../ui/purchase-modal';
import { StockModal } from '../ui/stock-modal';
import { StapleModal } from '../ui/staple-modal';
import { RecipeModal } from '../ui/recipe-modal';
import { SetupModal } from '../ui/setup-modal';
import { LoggingModal } from '../ui/logging-modal';
import { LoggingStore } from '../vault/logging-store';
import { UndoLogModal } from '../ui/undo-log-modal';
import { TastingNoteModal } from '../ui/tasting-note-modal';
import { StockStore } from '../vault/stock-store';
import { EditStockModal } from '../ui/edit-stock-modal';
import { RenameStore } from '../vault/rename-store';
import { RenameModal } from '../ui/rename-modal';
import { EditStore } from '../vault/edit-store';
import { EditNoteModal } from '../ui/edit-note-modal';
import { isEditable } from '../core/note-edit';
import { registerNoteActions } from './note-actions';
import { RecipeLinkStore } from '../vault/recipe-links';
import { UnlinkedModal } from '../ui/unlinked-modal';
import { MissingAbvModal } from '../ui/missing-abv-modal';
import { registerEditorLinks } from './editor-links';
import { OneOffModal } from '../ui/one-off-modal';
import { saveOneOff } from '../ui/save-one-off';
import type { OneOff } from '../core/one-off';
import { ingredientLines } from '../core/unlinked-lines';

export function registerCommands(plugin: CocktailCabinetPlugin) {
	const logger = new LoggingStore(plugin.app, plugin.store, {
		load: () => plugin.settings.recentLogs,
		save: async (records) => {
			plugin.settings.recentLogs = records;
			await plugin.saveSettings();
		},
	});
	plugin.addCommand({
		id: 'undo-last-log',
		name: 'Undo last log',
		icon: 'undo-2',
		callback: () => handle(() => UndoLogModal.openLast(plugin.app, logger.undo)),
	});
	const stocks = new StockStore(plugin.app);
	const renamer = new RenameStore(plugin.app);
	const edits = new EditStore(plugin.app);
	const links = new RecipeLinkStore(plugin.app, plugin.store);
	const ready = async (action: () => void | Promise<void>) => {
		if (!(await plugin.store.isSetUp())) {
			new SetupModal(plugin).open();
		} else {
			await action();
		}
	};
	const noteFor = (file: TFile) => {
		const note = plugin.store.notes().find((note) => note.path === file.path);
		if (!note) throw new Error('This note isn’t in the cabinet.');
		return note;
	};
	// On a type note, open a stock form with the type already filled in.
	const forType = (bottle: boolean) => (file: TFile) =>
		void handle(() => ready(() => new StockModal(plugin, bottle, { types: [noteFor(file)] }).open()));
	// A one-off goes from its ingredients to the logging review, and back to them to edit.
	const logOneOff = (initial?: OneOff) => {
		const step = (oneOff?: OneOff) =>
			new OneOffModal(
				plugin,
				(reviewed) => new LoggingModal(plugin, logger, stocks, links, reviewed, step).open(),
				oneOff,
			).open();
		step(initial);
	};
	plugin.addCommand({
		id: 'log-one-off',
		name: 'Log a one-off',
		icon: 'flask-conical',
		callback: () => handle(() => ready(() => logOneOff())),
	});
	plugin.addCommand({
		id: 'save-one-off-as-recipe',
		name: 'Save one-off as recipe',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (!checking) void handle(() => ready(() => saveOneOff(plugin, logger.daily, file)));
			return true;
		},
	});
	const recordPurchases = () => handle(() => ready(() => new PurchaseModal(plugin, stocks).open()));
	plugin.addCommand({
		id: 'record-purchases',
		name: 'Record purchases',
		icon: 'shopping-cart',
		callback: recordPurchases,
	});
	registerNoteActions(plugin, [
		{
			id: 'record-purchases-here',
			name: 'Record purchases',
			icon: 'shopping-cart',
			kinds: ['shopping'],
			header: true,
			command: false,
			run: () => void recordPurchases(),
		},
		{
			id: 'log-this-cocktail',
			name: 'Log this cocktail',
			icon: 'martini',
			kinds: ['recipe'],
			header: true,
			run: (file) =>
				void handle(async () => new LoggingModal(plugin, logger, stocks, links, noteFor(file)).open()),
		},
		{
			id: 'add-tasting-note',
			name: 'Add tasting note',
			icon: 'notebook-pen',
			kinds: ['recipe'],
			run: (file) =>
				void handle(async () => new TastingNoteModal(plugin.app, logger.daily, noteFor(file)).open()),
		},
		{
			id: 'riff-on-this-cocktail',
			name: 'Riff on this cocktail',
			icon: 'flask-conical',
			kinds: ['recipe'],
			run: (file) =>
				void handle(async () => {
					const recipe = noteFor(file);
					logOneOff({
						name: '',
						lines: ingredientLines(await plugin.app.vault.read(file)).map((line) => line.text),
						riffOn: recipe,
					});
				}),
		},
		{
			id: 'edit-stock',
			name: 'Edit stock',
			icon: 'gauge',
			kinds: ['bottle', 'ingredient'],
			header: true,
			run: (file) =>
				void handle(async () => {
					const note = noteFor(file);
					new EditStockModal(plugin.app, stocks, note, await stocks.read(note)).open();
				}),
		},
		{
			id: 'edit-cabinet-note',
			name: 'Edit cabinet note',
			icon: 'file-sliders',
			kinds: 'any',
			when: isEditable,
			header: true,
			run: (file) =>
				void handle(async () => {
					const note = noteFor(file);
					new EditNoteModal(plugin, edits, note, await edits.read(note)).open();
				}),
		},
		{
			id: 'rename-cabinet-note',
			name: 'Rename cabinet note',
			icon: 'text-cursor-input',
			kinds: 'any',
			run: (file) => void handle(async () => new RenameModal(plugin.app, renamer, noteFor(file)).open()),
		},
		{
			id: 'add-bottle-of-type',
			name: 'Add a bottle of this type',
			icon: 'wine',
			kinds: ['type'],
			run: forType(true),
		},
		{
			id: 'add-other-stock-for-type',
			name: 'Add other stock for this type',
			icon: 'package-plus',
			kinds: ['type'],
			run: forType(false),
		},
	]);
	const open = () => handle(() => ready(() => plugin.store.open(`${plugin.store.root}/Cocktail Cabinet.md`)));
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
		id: 'refresh-cabinet-views',
		name: 'Refresh cabinet views',
		icon: 'refresh-cw',
		callback: () => handle(() => ready(() => plugin.syncViews(true))),
	});
	plugin.addCommand({
		id: 'review-unlinked-ingredients',
		name: 'Review unlinked ingredients',
		icon: 'unlink',
		callback: () => handle(() => ready(() => new UnlinkedModal(plugin, links).open())),
	});
	plugin.addCommand({
		id: 'review-missing-abvs',
		name: 'Review missing ABV values',
		icon: 'percent',
		callback: () =>
			handle(() =>
				ready(() => new MissingAbvModal(plugin, () => new UnlinkedModal(plugin, links).open()).open()),
			),
	});
	registerEditorLinks(plugin);
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
	plugin.addCommand({
		id: 'create-kitchen-staple',
		name: 'Add kitchen staple',
		callback: () => handle(() => ready(() => new StapleModal(plugin).open())),
	});
	plugin.addCommand({
		id: 'create-recipe',
		name: 'Create a cocktail recipe',
		callback: () => handle(() => ready(() => new RecipeModal(plugin).open())),
	});
	plugin.addCommand({
		id: 'enhance-recipe',
		name: 'Enhance as cocktail recipe',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (!checking)
				void handle(() =>
					ready(async () => {
						const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
						const content =
							view?.file === file ? view.editor.getValue() : await plugin.app.vault.read(file);
						new RecipeModal(plugin, { path: file.path, content }).open();
					}),
				);
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
