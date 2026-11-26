import { Notice, TFile, TFolder } from 'obsidian';
import { cabinetFolder, KINDS, PROP } from '../core/schema';
import type CocktailCabinetPlugin from '../main';
import type { RenameStore } from '../vault/rename-store';

/**
 * Obsidian updates links to a renamed file on its own schedule after the rename; link text is checked once
 * that has had time to finish, so this never rewrites a note Obsidian is still writing.
 */
const SETTLE_MS = 1500;

/**
 * When a cabinet note is renamed outside the plugin (title bar or file explorer), bring its proper name,
 * heading, aliases, and link text along, as **Rename cabinet note** does. Only notes of a cabinet kind
 * follow: the plugin's own pages keep their names.
 */
export function registerRenameFollowing(plugin: CocktailCabinetPlugin, renamer: RenameStore) {
	const { app } = plugin;
	const isCabinetNote = (file: TFile) =>
		file.extension === 'md' &&
		file.path.startsWith(`${plugin.store.root}/`) &&
		KINDS.some((kind) => kind === app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.kind]);
	// One unload hook for every pending follow, rather than one per rename.
	const timers = new Set<number>();
	plugin.register(() => {
		for (const timer of timers) window.clearTimeout(timer);
		timers.clear();
	});
	app.workspace.onLayoutReady(() => {
		plugin.registerEvent(
			app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFolder) {
					void followCabinetFolder(plugin, file.path, oldPath);
					return;
				}
				if (!(file instanceof TFile) || !isCabinetNote(file)) return;
				const timer = window.setTimeout(() => {
					timers.delete(timer);
					void renamer
						.follow(file, oldPath, plugin.store.root)
						.then((result) => {
							if (!result) return;
							const failed = result.failed.length
								? ` Couldn’t update links in ${result.failed.join(', ')}.`
								: '';
							new Notice(
								`Renamed to ${result.name}: its name, heading, and link text followed.${failed}`,
							);
						})
						.catch(
							(error: unknown) =>
								new Notice(
									`Couldn’t bring the cabinet name along: ${error instanceof Error ? error.message : String(error)}. Run Rename cabinet note.`,
								),
						);
				}, SETTLE_MS);
				timers.add(timer);
			}),
		);
	});
}

/**
 * The cabinet folder, or a folder holding it, was renamed or moved: the setting follows, and the views,
 * whose filters name the folder, are rewritten for the new one.
 */
async function followCabinetFolder(plugin: CocktailCabinetPlugin, path: string, oldPath: string): Promise<void> {
	const root = plugin.settings.cabinetFolder;
	if (root !== oldPath && !root.startsWith(`${oldPath}/`)) return;
	const moved = path + root.slice(oldPath.length);
	let next: string;
	try {
		next = cabinetFolder(moved);
	} catch {
		new Notice(
			`The cabinet folder moved to ${moved}, which can’t hold a cabinet. Move it back, or choose a folder in Cocktail Cabinet’s settings.`,
			0,
		);
		return;
	}
	plugin.settings.cabinetFolder = next;
	// Before anything waits, so the managed notes are read before Obsidian updates their links.
	const untouched = plugin.store.untouchedManaged(root).catch(() => [] as string[]);
	try {
		await plugin.saveSettings();
	} catch (error) {
		plugin.settings.cabinetFolder = root;
		new Notice(`Couldn’t follow the cabinet to ${next}: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
	new Notice(`Cocktail Cabinet now uses ${next}.`);
	await linksSettled(plugin, next);
	// Obsidian rewrote their links for the move; notes nobody edited get the plugin's version back.
	try {
		await plugin.store.rewriteManaged(await untouched);
	} catch {
		/* Left for Review cabinet updates. */
	}
	await plugin.syncCabinet();
}

/** How long the moved cabinet must go without changes before Obsidian is taken to be done updating links. */
const QUIET_MS = 2000;
/** The longest to wait for that, in a large vault. */
const MOVE_LIMIT_MS = 120_000;

/**
 * Resolves once Obsidian has finished updating links after the cabinet moved: no note under `root` has
 * changed for a while. Writing a note sooner could race Obsidian's own edit of it.
 */
function linksSettled(plugin: CocktailCabinetPlugin, root: string): Promise<void> {
	return new Promise((resolve) => {
		let quiet = 0;
		const done = () => {
			window.clearTimeout(quiet);
			window.clearTimeout(limit);
			plugin.app.vault.offref(ref);
			resolve();
		};
		const wait = () => {
			window.clearTimeout(quiet);
			quiet = window.setTimeout(done, QUIET_MS);
		};
		const ref = plugin.app.vault.on('modify', (file) => {
			if (file.path.startsWith(`${root}/`)) wait();
		});
		const limit = window.setTimeout(done, MOVE_LIMIT_MS);
		quiet = window.setTimeout(done, SETTLE_MS + QUIET_MS);
	});
}
