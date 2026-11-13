import { FuzzySuggestModal, Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { findOneOffs, oneOffLabel, replaceOneOffHeader, savedOneOffHeader } from '../core/one-off';
import type { LoggedOneOff } from '../core/one-off';
import { wikiLink } from '../core/schema';
import { madeUpdates } from '../core/usage';
import type { LoggingDaily } from '../vault/logging-daily';
import { RecipeModal } from './recipe-modal';
import { ingredientRows } from './recipe-ingredients';

class OneOffPicker extends FuzzySuggestModal<LoggedOneOff> {
	constructor(
		plugin: CocktailCabinetPlugin,
		private found: LoggedOneOff[],
		private choose: (oneOff: LoggedOneOff) => void,
	) {
		super(plugin.app);
		this.setPlaceholder('Which one-off?');
	}
	getItems(): LoggedOneOff[] {
		return this.found;
	}
	getItemText(oneOff: LoggedOneOff): string {
		return oneOffLabel(oneOff);
	}
	onChooseItem(oneOff: LoggedOneOff) {
		this.choose(oneOff);
	}
}

/**
 * Turn a one-off on this note into a recipe: the recipe review opens with its name and ingredients, and once
 * created the daily line links the recipe, which counts as made on that day.
 */
export async function saveOneOff(plugin: CocktailCabinetPlugin, daily: LoggingDaily, file: TFile): Promise<void> {
	const found = findOneOffs(await plugin.app.vault.read(file));
	if (!found.length) throw new Error('No one-offs in this note.');
	const open = (oneOff: LoggedOneOff) => {
		const riff = oneOff.riffOn ? plugin.store.resolve(oneOff.riffOn, file.path) : null;
		const riffOn = riff && plugin.store.notes().find((note) => note.path === riff.path);
		new RecipeModal(plugin, undefined, {
			recipe: {
				name: oneOff.name,
				source: '',
				ingredients: ingredientRows(plugin, oneOff.ingredients, file.path),
				method: '',
				description: riffOn ? `A riff on ${wikiLink(riffOn.path, riffOn.name)}.` : '',
				tastingNotes: '',
				warnings: [],
			},
			created: async (recipe, name) => {
				let linked = false;
				await plugin.app.vault.process(file, (content) => {
					const updated = replaceOneOffHeader(
						content,
						oneOff,
						savedOneOffHeader(oneOff, { path: recipe.path, name, kind: 'recipe', parents: [] }),
					);
					linked = updated !== null;
					return updated ?? content;
				});
				const date = daily.dateOf(file);
				let counted = false;
				if (linked && date) {
					try {
						await plugin.app.fileManager.processFrontMatter(
							recipe,
							(properties: Record<string, unknown>) => {
								Object.assign(properties, madeUpdates(properties, date));
							},
						);
						counted = true;
					} catch {
						/* bookkeeping: reported below */
					}
				}
				new Notice(
					!linked
						? `Saved ${name}. The daily note changed, so its line wasn’t linked; link it yourself.`
						: date && !counted
							? `Saved ${name} and linked it in the daily note. Couldn’t record times made.`
							: `Saved ${name} and linked it in the daily note.`,
				);
			},
		}).open();
	};
	if (found.length === 1) open(found[0]!);
	else new OneOffPicker(plugin, found, open).open();
}
