import { App, TFile, getAllTags } from 'obsidian';
import { resolveRecipe } from '../core/availability';
import type { AvailabilityContext } from '../core/availability';
import type { RecipeEntry } from '../core/availability-lists';
import { stockSnapshot } from '../core/logging-stock';
import type { RestockThresholds } from '../core/restock';
import { DEFAULT_VOLUME_UNIT } from '../core/recipe-amount';
import type { VolumeUnit } from '../core/recipe-amount';
import { parseRating, PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import type { CabinetStore } from './cabinet-store';

export interface CabinetAvailability {
	notes: CabinetNote[];
	recipes: RecipeEntry[];
}

type Properties = Record<string, unknown>;

/**
 * Reads what availability needs: from the metadata cache for whole-cabinet lists, or, for one recipe
 * just after an edit, from the files themselves. Read-only: availability is computed when asked, never
 * stored (docs/availability.md).
 */
export class AvailabilityStore {
	constructor(
		private app: App,
		private cabinet: CabinetStore,
		private thresholds: () => RestockThresholds,
		private volumeUnit: () => VolumeUnit = () => DEFAULT_VOLUME_UNIT,
	) {}

	private file(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Couldn’t find ${path}.`);
		return file;
	}

	private async read(fresh: boolean, paths: readonly string[]): Promise<Map<string, Properties>> {
		const entries = await Promise.all(
			paths.map(async (path): Promise<[string, Properties]> => {
				const file = this.file(path);
				return [
					path,
					fresh
						? await this.cabinet.frontmatter(file)
						: (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
				];
			}),
		);
		return new Map(entries);
	}

	private async context(notes: CabinetNote[], fresh: boolean): Promise<Omit<AvailabilityContext, 'resolve'>> {
		const stock = notes.filter((note) => note.kind === 'bottle' || note.kind === 'ingredient');
		const properties = await this.read(
			fresh,
			stock.map((note) => note.path),
		);
		return {
			notes,
			sources: stock.map((note) => stockSnapshot(note, properties.get(note.path)!)),
			thresholds: this.thresholds(),
			volumeUnit: this.volumeUnit(),
		};
	}

	private async entry(
		note: CabinetNote,
		context: Omit<AvailabilityContext, 'resolve'>,
		fresh: boolean,
	): Promise<RecipeEntry> {
		const file = this.file(note.path);
		const properties = (await this.read(fresh, [note.path])).get(note.path)!;
		const lastMade = properties[PROP.lastMade];
		const cache = this.app.metadataCache.getFileCache(file);
		const content = fresh ? await this.app.vault.read(file) : await this.app.vault.cachedRead(file);
		return {
			path: note.path,
			name: note.name,
			rating: parseRating(properties.rating) ?? null,
			lastMade: typeof lastMade === 'string' && lastMade ? lastMade : null,
			tags: [
				...new Set((cache ? (getAllTags(cache) ?? []) : []).map((tag) => tag.replace(/^#/, '').toLowerCase())),
			],
			availability: resolveRecipe(content, {
				...context,
				resolve: (link) => this.cabinet.resolve(link, note.path)?.path ?? null,
			}),
		};
	}

	/** `fresh` reads files rather than the metadata cache, for a recipe re-checked right after an edit. */
	async recipe(path: string, fresh = false): Promise<{ notes: CabinetNote[]; recipe: RecipeEntry }> {
		const notes = fresh ? await this.cabinet.readNotes() : this.cabinet.notes();
		const note = notes.find((item) => item.path === path && item.kind === 'recipe');
		if (!note) throw new Error(`${path} isn’t a cabinet recipe.`);
		return { notes, recipe: await this.entry(note, await this.context(notes, fresh), fresh) };
	}

	async all(): Promise<CabinetAvailability> {
		const notes = this.cabinet.notes();
		const context = await this.context(notes, false);
		const recipes = await Promise.all(
			notes.filter((note) => note.kind === 'recipe').map((note) => this.entry(note, context, false)),
		);
		return { notes, recipes };
	}
}
