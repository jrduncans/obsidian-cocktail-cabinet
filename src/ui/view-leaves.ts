import { Keymap, Platform, TFile } from 'obsidian';
import type { ItemView, Plugin, WorkspaceLeaf } from 'obsidian';

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

/** A link to `path` in `view` that opens as `openFromView` does and previews on Ctrl or Cmd hover. */
export function viewLink(view: ItemView, el: HTMLElement, path: string, text: string, cls = ''): HTMLAnchorElement {
	const link = el.createEl('a', { cls: `internal-link ${cls}`.trim(), text, href: path });
	link.addEventListener('click', (event) => {
		event.preventDefault();
		void openFromView(view, path, event);
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
