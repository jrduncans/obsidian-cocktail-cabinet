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
	// Cabinet notes renamed lately, to tell a bulk move (many notes at once) from a single rename.
	let recent: number[] = [];
	app.workspace.onLayoutReady(() => {
		plugin.registerEvent(
			app.vault.on('rename', (file, oldPath) => {
				const root = plugin.store.root;
				const inCabinet = (path: string) => path === root || path.startsWith(`${root}/`);
				if (file instanceof TFolder) {
					// The cabinet folder, a folder holding it, or a folder inside it.
					if (inCabinet(oldPath) || root.startsWith(`${oldPath}/`) || inCabinet(file.path))
						void pauseForMove(plugin, file.path, oldPath);
					return;
				}
				if (!(file instanceof TFile) || !(inCabinet(oldPath) || inCabinet(file.path))) return;
				const now = Date.now();
				recent = [...recent.filter((time) => now - time < BULK_WINDOW_MS), now];
				if (recent.length >= BULK_RENAMES) void pauseForMove(plugin);
				if (plugin.paused || !isCabinetNote(file)) return;
				const timer = window.setTimeout(() => {
					timers.delete(timer);
					if (plugin.paused) return;
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

/** This many cabinet notes renamed within the window is a bulk move. */
const BULK_RENAMES = 5;
const BULK_WINDOW_MS = 3000;

/**
 * A folder holding cabinet notes, or many notes at once, moved. Obsidian now rewrites links in every note
 * that points at them, a note at a time and for as long as that takes, from link positions it read before
 * starting; any other write to one of those notes in the meantime makes its later edits land in the wrong
 * place. So the plugin writes no notes on its own until Obsidian restarts, and then restores what the move
 * changed (`CocktailCabinetPlugin.finishMove`). When the cabinet folder itself moved, the setting follows now.
 */
async function pauseForMove(plugin: CocktailCabinetPlugin, path?: string, oldPath?: string): Promise<void> {
	const root = plugin.settings.cabinetFolder;
	const first = !plugin.paused;
	plugin.paused = true;
	plugin.recipes.cancel();
	plugin.settings.afterMove ??= { from: root };
	let moved = '';
	if (path !== undefined && oldPath !== undefined && (root === oldPath || root.startsWith(`${oldPath}/`))) {
		const next = path + root.slice(oldPath.length);
		try {
			plugin.settings.cabinetFolder = cabinetFolder(next);
			moved = ` It now uses ${plugin.settings.cabinetFolder}.`;
		} catch {
			new Notice(
				`The cabinet folder moved to ${next}, which can’t hold a cabinet. Move it back, or choose a folder in Cocktail Cabinet’s settings.`,
				0,
			);
		}
	}
	try {
		await plugin.saveSettings();
	} catch {
		/* The pause still holds until restart; the move's links are then left as Obsidian wrote them. */
	}
	if (first || moved)
		new Notice(
			`Cocktail Cabinet moved with your notes.${moved} While Obsidian updates links, the cabinet won’t change notes on its own. Restart Obsidian in a minute or two to bring it up to date.`,
			0,
		);
}
