import { Keymap, Menu, Platform, TFile } from 'obsidian';
import type { ItemView, PaneType, Plugin, WorkspaceLeaf } from 'obsidian';

/**
 * Where the cabinet's list views open, and where their links open notes. A view opens as a tab in
 * the main area, not the sidebar, so it's put away like any tab in a vault used for more than
 * cocktails. A note it opens goes into a split beside it, reused for later clicks, so the list stays
 * in view; on a phone, a reused tab instead. See docs/cabinet-design.md#upkeep-views.
 */

/** Registered with Page Preview, so Ctrl or Cmd hover previews the views' links as in a note. */
export const HOVER_SOURCE = 'cocktail-cabinet';

export function registerHoverSource(plugin: Plugin): void {
	plugin.registerHoverLinkSource(HOVER_SOURCE, { display: 'Cocktail Cabinet', defaultMod: true });
}

/** Reveal the view of `type`, wherever it is (users can drag it), or open it as a new main-area tab. */
export async function openView(plugin: Plugin, type: string): Promise<WorkspaceLeaf> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(type)[0];
	if (!leaf) {
		leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type, active: true });
	}
	await workspace.revealLeaf(leaf);
	return leaf;
}

/** Each view's split beside it, while it's still open. */
const besides = new WeakMap<ItemView, WorkspaceLeaf>();

function inMainArea(view: ItemView): boolean {
	return view.leaf.getRoot() === view.app.workspace.rootSplit;
}

/** A closed leaf loses its parent; one dragged to a sidebar or popout has another root. */
function stillOpen(view: ItemView, leaf: WorkspaceLeaf): boolean {
	return leaf !== view.leaf && leaf.getRoot() === view.app.workspace.rootSplit;
}

/**
 * Open `path` for a click in `view`: a new tab with Ctrl or Cmd; beside the view when it's in the
 * main area, reusing that split; otherwise, from a sidebar, the main area as any link would.
 */
export async function openFromView(view: ItemView, path: string, event: MouseEvent): Promise<void> {
	const { workspace, vault } = view.app;
	const file = vault.getAbstractFileByPath(path);
	if (Keymap.isModEvent(event) || !(file instanceof TFile) || !inMainArea(view)) {
		await workspace.openLinkText(path, '', Keymap.isModEvent(event));
		return;
	}
	let beside = besides.get(view);
	if (!beside || !stillOpen(view, beside)) {
		// A phone is too narrow for two columns: a tab, reused the same way, is the next best thing.
		beside = Platform.isPhone ? workspace.getLeaf('tab') : workspace.createLeafBySplit(view.leaf, 'vertical');
		besides.set(view, beside);
	}
	await beside.openFile(file);
}

/**
 * The menu a note link's right-click (or long press) gets: where to open it, then what Obsidian and
 * other plugins add for a file, as for a link in a note.
 */
function linkMenu(view: ItemView, file: TFile, event: MouseEvent): void {
	const { workspace } = view.app;
	const menu = new Menu();
	const open = (title: string, icon: string, type: Exclude<PaneType, 'window'>) =>
		menu.addItem((item) =>
			item
				.setSection('open')
				.setTitle(title)
				.setIcon(icon)
				.onClick(() => void workspace.getLeaf(type).openFile(file)),
		);
	open('Open in new tab', 'file-plus', 'tab');
	// A phone has no room for a split, as the views' own links know. Obsidian adds Open in new window itself.
	if (!Platform.isPhone) open('Open to the right', 'separator-vertical', 'split');
	workspace.trigger('file-menu', menu, file, 'link-context-menu', view.leaf);
	menu.showAtMouseEvent(event);
}

/**
 * A link to `path` in `view` that opens as `openFromView` does, previews on Ctrl or Cmd hover, opens a
 * new tab on middle click, and has a note link's menu.
 */
export function viewLink(view: ItemView, el: HTMLElement, path: string, text: string, cls = ''): HTMLAnchorElement {
	const link = el.createEl('a', { cls: `internal-link ${cls}`.trim(), text, href: path });
	link.addEventListener('click', (event) => {
		event.preventDefault();
		void openFromView(view, path, event);
	});
	link.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		void view.app.workspace.openLinkText(path, '', 'tab');
	});
	link.addEventListener('contextmenu', (event) => {
		const file = view.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		event.preventDefault();
		linkMenu(view, file, event);
	});
	link.addEventListener('mouseover', (event) => {
		view.app.workspace.trigger('hover-link', {
			event,
			source: HOVER_SOURCE,
			hoverParent: view.leaf,
			targetEl: link,
			linktext: path,
			sourcePath: '',
		});
	});
	return link;
}

/** A labelled spot in a view's toolbar (`cocktail-cabinet-pane-toolbar`); add the control to what it returns. */
export function toolbarItem(bar: HTMLElement, label: string): HTMLElement {
	const item = bar.createDiv({ cls: 'cocktail-cabinet-pane-toolbar-item' });
	item.createSpan({ cls: 'cocktail-cabinet-pane-toolbar-label', text: label });
	return item;
}
