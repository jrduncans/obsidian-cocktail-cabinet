import { MarkdownView, TFile } from 'obsidian';
import { KINDS, PROP } from '../core/schema';
import type { NoteKind } from '../core/schema';
import type CocktailCabinetPlugin from '../main';

/** A command about one cabinet note, also offered in the note's menus. */
export interface NoteAction {
	id: string;
	name: string;
	icon: string;
	kinds: readonly NoteKind[] | 'any';
	/** Also show a button in the note's header, the main action for that kind of note. */
	header?: boolean;
	/** Further checks beyond the note's kind, such as Edit cabinet note's editable kinds. */
	when?: (kind: NoteKind) => boolean;
	run: (file: TFile) => void;
}

/**
 * Registers each action as a command for the active note, as an item in the file menu
 * (file explorer, tab, and the note's More options menu on desktop and mobile), and, for
 * header actions, as a button in each open note of a matching kind.
 */
export function registerNoteActions(plugin: CocktailCabinetPlugin, actions: readonly NoteAction[]) {
	const { app } = plugin;
	const kindOf = (file: TFile | null | undefined): NoteKind | undefined => {
		if (!file || file.extension !== 'md' || !file.path.startsWith(`${plugin.store.root}/`)) return undefined;
		const kind: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.kind];
		return KINDS.find(value => value === kind);
	};
	const applies = (action: NoteAction, kind: NoteKind | undefined): kind is NoteKind =>
		!!kind && (action.kinds === 'any' || action.kinds.includes(kind)) && (action.when?.(kind) ?? true);

	for (const action of actions) {
		plugin.addCommand({
			id: action.id,
			name: action.name,
			icon: action.icon,
			checkCallback: checking => {
				const file = app.workspace.getActiveFile();
				if (!file || !applies(action, kindOf(file))) return false;
				if (!checking) action.run(file);
				return true;
			},
		});
	}

	// The untitled section is the menus' own group just above Delete. Obsidian appends any
	// section name it doesn't list after everything, below Delete (checked in 1.15).
	plugin.registerEvent(app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		const kind = kindOf(file);
		for (const action of actions.filter(action => applies(action, kind))) {
			menu.addItem(item => item.setTitle(action.name).setIcon(action.icon).setSection('').onClick(() => action.run(file)));
		}
	}));

	// Header buttons follow the note shown in each view, which changes as the user navigates.
	const shown = new Map<MarkdownView, { key: string; buttons: HTMLElement[] }>();
	const sync = (view: MarkdownView) => {
		const kind = kindOf(view.file);
		const key = `${view.file?.path ?? ''}\n${kind ?? ''}`;
		const current = shown.get(view);
		if (current?.key === key) return;
		current?.buttons.forEach(button => button.remove());
		const buttons = actions.filter(action => action.header && applies(action, kind)).map(action =>
			view.addAction(action.icon, action.name, () => { if (view.file) action.run(view.file); }));
		shown.set(view, { key, buttons });
	};
	const refresh = () => {
		const open = new Set<MarkdownView>();
		app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) { open.add(leaf.view); sync(leaf.view); }
		});
		for (const view of shown.keys()) if (!open.has(view)) shown.delete(view);
	};
	app.workspace.onLayoutReady(refresh);
	plugin.registerEvent(app.workspace.on('layout-change', refresh));
	plugin.registerEvent(app.workspace.on('file-open', refresh));
	// A note can gain or lose its cc-kind while open.
	plugin.registerEvent(app.metadataCache.on('changed', refresh));
	plugin.register(() => {
		for (const { buttons } of shown.values()) buttons.forEach(button => button.remove());
		shown.clear();
	});
}
