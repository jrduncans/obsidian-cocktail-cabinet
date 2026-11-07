import type CocktailCabinetPlugin from '../main';
import { MarkdownView, Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import { IngredientModal } from '../ui/ingredient-modal';
import { StockModal } from '../ui/stock-modal';
import { RecipeModal } from '../ui/recipe-modal';
import { SetupModal } from '../ui/setup-modal';
import { LoggingModal } from '../ui/logging-modal';
import { LoggingStore } from '../vault/logging-store';
import { StockStore } from '../vault/stock-store';
import { EditStockModal } from '../ui/edit-stock-modal';
import { RenameStore } from '../vault/rename-store';
import { RenameModal } from '../ui/rename-modal';
import { EditStore } from '../vault/edit-store';
import { EditNoteModal } from '../ui/edit-note-modal';
import { isEditable } from '../core/note-edit';
import { registerNoteActions } from './note-actions';

export function registerCommands(plugin: CocktailCabinetPlugin) {
	const logger = new LoggingStore(plugin.app, plugin.store);
	const stocks = new StockStore(plugin.app);
	const renamer = new RenameStore(plugin.app);
	const edits = new EditStore(plugin.app);
	const ready = async (action: () => void | Promise<void>) => {
		if (!await plugin.store.isSetUp()) {
			new SetupModal(plugin).open();
		} else {
			await action();
		}
	};
	const noteFor = (file: TFile) => {
		const note = plugin.store.notes().find(note => note.path === file.path);
		if (!note) throw new Error('This note isn’t in the cabinet.');
		return note;
	};
	// On a type note, open a stock form with the type already filled in.
	const forType = (bottle: boolean) => (file: TFile) => void handle(() => ready(() => new StockModal(plugin, bottle, { types: [noteFor(file)] }).open()));
	registerNoteActions(plugin, [
		{
			id: 'log-this-cocktail', name: 'Log this cocktail', icon: 'martini', kinds: ['recipe'], header: true,
			run: file => void handle(async () => new LoggingModal(plugin, logger, stocks, noteFor(file)).open()),
		},
		{
			id: 'edit-stock', name: 'Edit stock', icon: 'gauge', kinds: ['bottle', 'ingredient'], header: true,
			run: file => void handle(async () => {
				const note = noteFor(file);
				new EditStockModal(plugin.app, stocks, note, await stocks.read(note)).open();
			}),
		},
		{
			id: 'edit-cabinet-note', name: 'Edit cabinet note', icon: 'pencil', kinds: 'any', when: isEditable,
			run: file => void handle(async () => {
				const note = noteFor(file);
				new EditNoteModal(plugin, edits, note, await edits.read(note)).open();
			}),
		},
		{
			id: 'rename-cabinet-note', name: 'Rename cabinet note', icon: 'text-cursor-input', kinds: 'any',
			run: file => void handle(async () => new RenameModal(plugin.app, renamer, noteFor(file)).open()),
		},
		{ id: 'add-bottle-of-type', name: 'Add a bottle of this type', icon: 'wine', kinds: ['type'], run: forType(true) },
		{ id: 'add-other-stock-for-type', name: 'Add other stock for this type', icon: 'package-plus', kinds: ['type'], run: forType(false) },
	]);
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
		id: 'refresh-cabinet-views',
		name: 'Refresh cabinet views',
		icon: 'refresh-cw',
		callback: () => handle(() => ready(() => plugin.syncViews(true))),
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
}

async function handle(action: () => Promise<void>): Promise<void> {
	try {
		await action();
	} catch (error) {
		new Notice(error instanceof Error ? error.message : 'The cabinet action could not be completed.');
	}
}
