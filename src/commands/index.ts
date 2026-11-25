import { openAvailability } from '../ui/availability-view';
import { openBuy } from '../ui/buy-view';
import { CanMakeModal } from '../ui/can-make-modal';
import type CocktailCabinetPlugin from '../main';
import { MarkdownView, Notice, TFile } from 'obsidian';
import { IngredientModal } from '../ui/ingredient-modal';
import { PurchaseModal } from '../ui/purchase-modal';
import { StockModal } from '../ui/stock-modal';
import { RecipeModal } from '../ui/recipe-modal';
import { SetupModal } from '../ui/setup-modal';
import { LoggingModal } from '../ui/logging-modal';
import { LoggingStore } from '../vault/logging-store';
import { UndoLogModal } from '../ui/undo-log-modal';
import { StockStore } from '../vault/stock-store';
import { EditStockModal } from '../ui/edit-stock-modal';
import { RenameStore } from '../vault/rename-store';
import { RenameModal } from '../ui/rename-modal';
import { EditStore } from '../vault/edit-store';
import { EditNoteModal } from '../ui/edit-note-modal';
import { isEditable } from '../core/note-edit';
import { registerNoteActions } from './note-actions';
import { RecipeLinkStore } from '../vault/recipe-links';
import { openUnlinked } from '../ui/unlinked-view';
import { isLinkedView, VIEW_LINK_ACTION } from '../core/view-links';
import { registerEditorLinks } from './editor-links';
import { OneOffModal } from '../ui/one-off-modal';
import { saveOneOff } from '../ui/save-one-off';
import { isOneOffHeader } from '../core/one-off';
import type { OneOff } from '../core/one-off';
import { ingredientLines } from '../core/unlinked-lines';
import { ReviewUpdatesModal } from '../ui/review-updates-modal';
import { openTidy } from '../ui/tidy-recipe-modal';
import { PROP } from '../core/schema';
import { cabinetNotePath } from '../core/setup';
import { registerRenameFollowing } from './rename-following';

export function registerCommands(plugin: CocktailCabinetPlugin) {
	const logger = new LoggingStore(
		plugin.app,
		plugin.store,
		{
			load: () => plugin.settings.recentLogs,
			save: async (records) => {
				plugin.settings.recentLogs = records;
				await plugin.saveSettings();
			},
		},
		() => plugin.settings.volumeUnit,
	);
	plugin.addCommand({
		id: 'undo-last-log',
		name: 'Undo last log',
		icon: 'undo-2',
		checkCallback: (checking) => {
			if (!plugin.settings.recentLogs.length) return false;
			if (!checking) void handle(() => UndoLogModal.openLast(plugin.app, logger.undo));
			return true;
		},
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
	// One-offs are logged to daily notes, so only a daily note can hold one.
	const saveHere = (file: TFile | null, line?: number) => {
		if (!file || file.extension !== 'md' || !logger.daily.dateOf(file)) return false;
		return () => void handle(() => ready(() => saveOneOff(plugin, logger.daily, file, line)));
	};
	plugin.addCommand({
		id: 'save-one-off-as-recipe',
		name: 'Save one-off as recipe',
		icon: 'file-plus',
		checkCallback: (checking) => {
			const run = saveHere(plugin.app.workspace.getActiveFile());
			if (!run) return false;
			if (!checking) run();
			return true;
		},
	});
	// On the one-off's own line in a daily note, the right-click menu saves that one.
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor, ctx) => {
			const line = editor.getCursor().line;
			if (!isOneOffHeader(editor.getLine(line))) return;
			const run = saveHere(ctx.file, line);
			if (run)
				menu.addItem((item) =>
					item
						.setSection('cocktail-cabinet')
						.setTitle('Save one-off as recipe')
						.setIcon('file-plus')
						.onClick(run),
				);
		}),
	);
	const recordPurchases = () => handle(() => ready(() => new PurchaseModal(plugin, stocks).open()));
	plugin.addCommand({
		id: 'what-can-i-make',
		name: 'What can I make?',
		icon: 'list-checks',
		callback: () => handle(() => ready(() => openAvailability(plugin))),
	});
	plugin.addCommand({
		id: 'what-should-i-buy',
		name: 'What should I buy?',
		icon: 'shopping-cart',
		callback: () => handle(() => ready(() => openBuy(plugin))),
	});
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
			id: 'can-i-make-this',
			name: 'Can I make this?',
			icon: 'list-checks',
			kinds: ['recipe'],
			run: (file) =>
				void handle(async () =>
					new CanMakeModal(plugin, plugin.availability, stocks, links, noteFor(file), (recipe) =>
						new LoggingModal(plugin, logger, stocks, links, recipe).open(),
					).open(),
				),
		},
		{
			id: 'tidy-ingredient-lines',
			name: 'Tidy ingredient lines',
			icon: 'sparkles',
			kinds: ['recipe'],
			run: (file) => void handle(() => openTidy(plugin, noteFor(file))),
		},
		{
			id: 'what-can-i-make-with-this',
			name: 'What can I make with this?',
			icon: 'list-checks',
			kinds: ['category', 'family', 'type', 'bottle', 'ingredient'],
			run: (file) => void handle(() => openAvailability(plugin, noteFor(file))),
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
					new EditNoteModal(
						plugin,
						edits,
						note,
						await edits.read(note),
						() => void handle(() => openTidy(plugin, note)),
					).open();
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
	// Once set up, the settings tab keeps a Set up cabinet button for moving or repairing the cabinet.
	const isSetUp = () => {
		const note = plugin.app.vault.getAbstractFileByPath(cabinetNotePath(plugin.store.root));
		return (
			note instanceof TFile && plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[PROP.kind] === 'cabinet'
		);
	};
	plugin.addCommand({
		id: 'setup-cabinet',
		name: 'Set up cabinet',
		checkCallback: (checking) => {
			if (isSetUp()) return false;
			if (!checking) new SetupModal(plugin).open();
			return true;
		},
	});
	plugin.addCommand({
		id: 'refresh-cabinet-notes',
		name: 'Refresh cabinet notes',
		icon: 'refresh-cw',
		callback: () => handle(() => ready(() => plugin.syncCabinet(true))),
	});
	plugin.addCommand({
		id: 'review-cabinet-updates',
		name: 'Review cabinet updates',
		icon: 'git-compare',
		callback: () => handle(() => ready(() => new ReviewUpdatesModal(plugin).open())),
	});
	plugin.addCommand({
		id: 'review-unlinked-ingredients',
		name: 'Review unlinked ingredients',
		icon: 'unlink',
		callback: () => handle(() => ready(() => openUnlinked(plugin))),
	});
	registerEditorLinks(plugin);
	registerRenameFollowing(plugin, renamer);
	// Links on the Cocktail Cabinet note and the guide open these views (see core/view-links.ts).
	const views = { 'can-make': openAvailability, buy: openBuy, unlinked: openUnlinked } as const;
	plugin.registerObsidianProtocolHandler(VIEW_LINK_ACTION, ({ open }) => {
		if (isLinkedView(open)) void handle(() => ready(() => views[open](plugin)));
	});
	// Families and categories are a Level choice in this form, and kitchen staples a Form in Add other stock.
	plugin.addCommand({
		id: 'add-ingredient-type',
		name: 'Add ingredient type',
		callback: () => handle(() => ready(() => new IngredientModal(plugin, 'type', undefined, '', true).open())),
	});
	plugin.addCommand({
		id: 'add-bottle',
		name: 'Add a bottle',
		callback: () => handle(() => ready(() => new StockModal(plugin, true).open())),
	});
	plugin.addCommand({
		id: 'add-other-stock',
		name: 'Add other stock',
		callback: () => handle(() => ready(() => new StockModal(plugin, false).open())),
	});
	plugin.addCommand({
		id: 'add-recipe',
		name: 'Add recipe',
		callback: () => handle(() => ready(() => new RecipeModal(plugin).open())),
	});
	// Only a note that isn't already part of the cabinet: recipes have Edit cabinet note and Tidy ingredient lines.
	plugin.addCommand({
		id: 'convert-note-to-recipe',
		name: 'Convert note to recipe',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') return false;
			if (plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.kind] !== undefined) return false;
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
