import { debounce, TFile } from 'obsidian';
import type { App, CachedMetadata, Debouncer } from 'obsidian';
import { ingredientLinkTargets, linkTarget, sameKeys } from '../core/ingredient-links';
import { PROP, wikiLink } from '../core/schema';

/** How long a recipe has to sit unchanged before its property is updated, so typing isn't interrupted. */
const QUIET_MS = 2000;

/**
 * Keeps each cabinet recipe's `cc-ingredients` property naming the notes its Ingredients section links,
 * so the Recipes sections in ingredient notes ignore links elsewhere in a recipe. The section stays the
 * source; the property follows it after hand edits, plugin writes, and renames.
 */
export class IngredientLinkSync {
	private pending = new Map<string, Debouncer<[], void>>();

	constructor(
		private app: App,
		private root: () => string,
	) {}

	private isRecipe(file: TFile, cache: CachedMetadata | null): boolean {
		return (
			file.extension === 'md' &&
			file.path.startsWith(`${this.root()}/`) &&
			cache?.frontmatter?.[PROP.kind] === 'recipe'
		);
	}

	/** A comparable key for a link: the resolved path, or the target as written when nothing matches yet. */
	private key(target: string, source: string): string {
		return this.app.metadataCache.getFirstLinkpathDest(target, source)?.path ?? `?${target.toLowerCase()}`;
	}

	/** Links for the property: the path with the note's name, or the target as written when it doesn't resolve. */
	private links(targets: readonly string[], source: string): string[] {
		return targets.map((target) => {
			const file = this.app.metadataCache.getFirstLinkpathDest(target, source);
			if (!file) return `[[${target}]]`;
			const name: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.name];
			try {
				return wikiLink(file.path, typeof name === 'string' && name.trim() ? name : file.basename);
			} catch {
				return wikiLink(file.path);
			}
		});
	}

	/** The property's links when it's out of step with the Ingredients section; null when it already matches. */
	planned(file: TFile, cache: CachedMetadata): string[] | null {
		const targets = ingredientLinkTargets(cache);
		const saved: unknown = cache.frontmatter?.[PROP.ingredients];
		const current = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : null;
		if (
			current &&
			current.length === (Array.isArray(saved) ? saved.length : 0) &&
			sameKeys(
				current.map((link) => this.key(linkTarget(link), file.path)),
				targets.map((target) => this.key(target, file.path)),
			)
		)
			return null;
		return this.links(targets, file.path);
	}

	async sync(file: TFile): Promise<boolean> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !this.isRecipe(file, cache)) return false;
		const links = this.planned(file, cache);
		if (!links) return false;
		await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
			if (properties[PROP.kind] === 'recipe') properties[PROP.ingredients] = links;
		});
		return true;
	}

	/** A recipe changed: update its property once it has been quiet for a moment. */
	changed(file: TFile, cache: CachedMetadata): void {
		if (!this.isRecipe(file, cache)) return;
		let update = this.pending.get(file.path);
		if (!update) {
			update = debounce(
				() => {
					this.pending.delete(file.path);
					void this.sync(file).catch(() => {
						/* The next change, or the next start, tries again. */
					});
				},
				QUIET_MS,
				true,
			);
			this.pending.set(file.path, update);
		}
		update();
	}

	/** Bring every recipe in step; returns how many were updated. Reads only the metadata cache. */
	async syncAll(): Promise<number> {
		let updated = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			try {
				if (await this.sync(file)) updated++;
			} catch {
				/* Left for the next change or start. */
			}
		}
		return updated;
	}

	cancel(): void {
		for (const update of this.pending.values()) update.cancel();
		this.pending.clear();
	}
}
