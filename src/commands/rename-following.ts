import { Notice, TFile } from 'obsidian';
import { KINDS, PROP } from '../core/schema';
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
	app.workspace.onLayoutReady(() => {
		plugin.registerEvent(
			app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile) || !isCabinetNote(file)) return;
				const timer = window.setTimeout(() => {
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
				plugin.register(() => window.clearTimeout(timer));
			}),
		);
	});
}
