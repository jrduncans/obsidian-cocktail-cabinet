import { App, TFile, getAllTags } from 'obsidian';
import { resolveRecipe } from '../core/availability';
import type { AvailabilityContext } from '../core/availability';
import type { RecipeEntry } from '../core/availability-lists';
import { stockSnapshot } from '../core/logging-stock';
import type { RestockThresholds } from '../core/restock';
import { parseRating, PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import type { CabinetStore } from './cabinet-store';

export interface CabinetAvailability {
	notes: CabinetNote[];
	recipes: RecipeEntry[];
}

/**
 * Reads what availability needs from the metadata cache and cached recipe text. Read-only: availability is
 * computed when asked, never stored (docs/availability.md).
 */
export class AvailabilityStore {
	constructor(
		private app: App,
		private cabinet: CabinetStore,
		private thresholds: () => RestockThresholds,
	) {}

	private frontmatter(path: string): Record<string, unknown> {
		const file = this.app.vault.getAbstractFileByPath(path);
		return (file instanceof TFile && this.app.metadataCache.getFileCache(file)?.frontmatter) || {};
	}

	private context(notes: CabinetNote[]): Omit<AvailabilityContext, 'resolve'> {
		return {
			notes,
			sources: notes
				.filter((note) => note.kind === 'bottle' || note.kind === 'ingredient')
				.map((note) => stockSnapshot(note, this.frontmatter(note.path))),
			thresholds: this.thresholds(),
		};
	}

	private async entry(note: CabinetNote, context: Omit<AvailabilityContext, 'resolve'>): Promise<RecipeEntry> {
		const file = this.app.vault.getAbstractFileByPath(note.path);
		if (!(file instanceof TFile)) throw new Error(`Couldn’t find ${note.name}.`);
		const properties = this.frontmatter(note.path);
		const lastMade = properties[PROP.lastMade];
		const cache = this.app.metadataCache.getFileCache(file);
		return {
			path: note.path,
			name: note.name,
			rating: parseRating(properties.rating) ?? null,
			lastMade: typeof lastMade === 'string' && lastMade ? lastMade : null,
			tags: [
				...new Set((cache ? (getAllTags(cache) ?? []) : []).map((tag) => tag.replace(/^#/, '').toLowerCase())),
			],
			availability: resolveRecipe(await this.app.vault.cachedRead(file), {
				...context,
				resolve: (link) => this.cabinet.resolve(link, note.path)?.path ?? null,
			}),
		};
	}

	async recipe(path: string): Promise<{ notes: CabinetNote[]; recipe: RecipeEntry }> {
		const notes = this.cabinet.notes();
		const note = notes.find((item) => item.path === path && item.kind === 'recipe');
		if (!note) throw new Error(`${path} isn’t a cabinet recipe.`);
		return { notes, recipe: await this.entry(note, this.context(notes)) };
	}

	async all(): Promise<CabinetAvailability> {
		const notes = this.cabinet.notes();
		const context = this.context(notes);
		const recipes = await Promise.all(
			notes.filter((note) => note.kind === 'recipe').map((note) => this.entry(note, context)),
		);
		return { notes, recipes };
	}
}
