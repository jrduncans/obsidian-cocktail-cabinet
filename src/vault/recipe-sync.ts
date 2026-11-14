import { debounce, TFile } from 'obsidian';
import type { App, CachedMetadata, Debouncer } from 'obsidian';
import { estimateAlcohol, factsOf, noteAbv } from '../core/alcohol-estimate';
import type { AbvNote, Estimate, EstimateSettings, Fact, LinkInfo } from '../core/alcohol-estimate';
import { ingredientLinkTargets, linkTarget, sameKeys } from '../core/ingredient-links';
import { readRecipeSections } from '../core/recipe-sections';
import { PROP, wikiLink } from '../core/schema';
import { KITCHEN_STAPLE_FORM } from '../core/stock';
import { hasStock } from '../core/stock-formulas';

/** How long a recipe has to sit unchanged before its properties are updated, so typing isn't interrupted. */
const QUIET_MS = 2000;
/** After an ABV or hierarchy change elsewhere, recipes are recalculated once things settle. */
const RECALC_MS = 5000;

/** The derived recipe properties: `cc-ingredients`, the alcohol estimate, and ingredient facts. */
export const ESTIMATE_PROPS = {
	alcohol: 'cc-est-alcohol-ml',
	abv: 'cc-est-abv',
	volume: 'cc-est-volume-ml',
	basis: 'cc-est-basis',
	contains: 'cc-contains',
} as const;
/** A note whose ABV would complete partial estimates, and the recipes it would help. */
export interface MissingAbv {
	path: string;
	name: string;
	kind: 'bottle' | 'type' | 'family';
	/** `cc-abv` for a bottle, `cc-abv-typical` for a type; null for a family, which has no ABV of its own. */
	property: string | null;
	recipes: string[];
}
export interface MissingAbvs {
	notes: MissingAbv[];
	/** Recipes partial because a line with an amount links nothing. */
	unlinked: string[];
}

/** A recipe's own dilution, replacing the assumed percentage. */
export const DILUTION_PROP = 'cc-dilution';

/** Properties of other notes that change a recipe's estimate. */
const INPUTS = [
	PROP.kind,
	PROP.abv,
	PROP.abvTypical,
	PROP.type,
	PROP.family,
	PROP.category,
	PROP.provides,
	PROP.form,
	PROP.catalogId,
	PROP.name,
];

const round = (value: number, step: number) => Math.round(value / step) * step;
const asLinks = (value: unknown): string[] =>
	(Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string');

/** The estimate as stored: rounded so recalculation doesn't rewrite notes over noise. */
export function storedEstimate(estimate: Estimate): Record<string, unknown> {
	const none = estimate.basis === 'none';
	return {
		[ESTIMATE_PROPS.alcohol]: none ? null : Number(round(estimate.alcoholMl, 0.1).toFixed(1)),
		[ESTIMATE_PROPS.abv]: none || estimate.abv === null ? null : Number(round(estimate.abv, 0.001).toFixed(3)),
		[ESTIMATE_PROPS.volume]: none ? null : Math.round(estimate.volumeMl),
		[ESTIMATE_PROPS.basis]: estimate.basis,
		[ESTIMATE_PROPS.contains]: [...estimate.facts].sort(),
	};
}

/**
 * Keeps each cabinet recipe's derived properties in step with its text and the notes it links:
 * `cc-ingredients` (the notes its Ingredients section links, read by the Recipes sections) and the
 * alcohol estimate with its ingredient facts. The recipe text stays the source; the properties follow
 * after hand edits, plugin writes, renames, and changes to linked bottles, types, and families.
 */
export class RecipeSync {
	private pending = new Map<string, Debouncer<[], void>>();
	/** Each non-recipe cabinet note's estimate inputs, to notice when one changes. */
	private inputs = new Map<string, string>();
	private recalc: Debouncer<[], void>;

	constructor(
		private app: App,
		private root: () => string,
		private settings: () => EstimateSettings,
	) {
		this.recalc = debounce(() => void this.syncAll(), RECALC_MS, true);
	}

	private inCabinet(file: TFile): boolean {
		return file.extension === 'md' && file.path.startsWith(`${this.root()}/`);
	}

	private isRecipe(file: TFile, cache: CachedMetadata | null | undefined): boolean {
		return this.inCabinet(file) && cache?.frontmatter?.[PROP.kind] === 'recipe';
	}

	private frontmatter(file: TFile | null): Record<string, unknown> {
		return (file && this.app.metadataCache.getFileCache(file)?.frontmatter) || {};
	}

	private resolve(link: string, source: string): TFile | null {
		return this.app.metadataCache.getFirstLinkpathDest(linkTarget(link), source);
	}

	/** A comparable key for a link: the resolved path, or the target as written when nothing matches yet. */
	private key(target: string, source: string): string {
		return this.app.metadataCache.getFirstLinkpathDest(target, source)?.path ?? `?${target.toLowerCase()}`;
	}

	/** Links for `cc-ingredients`: the path with the note's name, or the target as written when it doesn't resolve. */
	private links(targets: readonly string[], source: string): string[] {
		return targets.map((target) => {
			const file = this.app.metadataCache.getFirstLinkpathDest(target, source);
			if (!file) return `[[${target}]]`;
			const name: unknown = this.frontmatter(file)[PROP.name];
			try {
				return wikiLink(file.path, typeof name === 'string' && name.trim() ? name : file.basename);
			} catch {
				return wikiLink(file.path);
			}
		});
	}

	/** The new `cc-ingredients` when it's out of step with the Ingredients section; null when it matches. */
	plannedLinks(file: TFile, cache: CachedMetadata): string[] | null {
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

	/**
	 * ABVs to fall back on, by path: each type's and each family's bottles (`cc-abv`), a type's
	 * including its subtypes'; under `stocked:<path>`, only those in stock, a type's own; under
	 * `substocked:<type path>`, its subtypes' in stock; and under `types:<family path>`, each family's
	 * types' typical ABVs (NaN when a type has none).
	 */
	private bottleAbvs(): Map<string, number[]> {
		const index = new Map<string, number[]>();
		const add = (key: string, value: number) => index.set(key, [...(index.get(key) ?? []), value]);
		const linked = (file: TFile, key: string) => {
			const link = asLinks(this.frontmatter(file)[key])[0];
			return link ? this.resolve(link, file.path) : null;
		};
		// A subtype's parent is a type in `cc-type`; other types have a family.
		const parentTypeOf = (type: TFile) => {
			const parent = linked(type, PROP.type);
			return parent && this.frontmatter(parent)[PROP.kind] === 'type' ? parent : null;
		};
		const familyOf = (type: TFile) => linked(parentTypeOf(type) ?? type, PROP.family);
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.inCabinet(file)) continue;
			const properties = this.frontmatter(file);
			if (properties[PROP.kind] === 'type') {
				if (parentTypeOf(file)) continue;
				const family = familyOf(file);
				const typical = properties[PROP.abvTypical];
				if (family) add(`types:${family.path}`, typeof typical === 'number' ? typical : NaN);
				continue;
			}
			const abv = properties[PROP.abv];
			if (properties[PROP.kind] !== 'bottle' || typeof abv !== 'number') continue;
			const link = asLinks(properties[PROP.type])[0];
			const type = link ? this.resolve(link, file.path) : null;
			if (!type) continue;
			const stocked = hasStock(properties);
			const parent = parentTypeOf(type);
			const family = familyOf(type);
			for (const path of [type.path, parent?.path, family?.path]) {
				if (!path) continue;
				add(path, abv);
				if (stocked) add(`${path === parent?.path ? 'substocked' : 'stocked'}:${path}`, abv);
			}
		}
		return index;
	}

	/** A linked note as the calculator sees it, with the facts of everything in its chain. */
	private abvNote(file: TFile | null, bottles: Map<string, number[]>, facts: Set<Fact>, depth = 0): AbvNote | null {
		if (!file || depth > 4) return null;
		const properties = this.frontmatter(file);
		const kind = properties[PROP.kind];
		if (typeof kind !== 'string') return null;
		const name = typeof properties[PROP.name] === 'string' ? (properties[PROP.name] as string) : file.basename;
		factsOf(kind, properties[PROP.catalogId], name).forEach((fact) => facts.add(fact));
		const subtype = kind === 'type' && asLinks(properties[PROP.type]).length > 0;
		const parentKey =
			kind === 'bottle' || subtype
				? PROP.type
				: kind === 'type'
					? PROP.family
					: kind === 'family'
						? PROP.category
						: null;
		const parentLink = parentKey ? asLinks(properties[parentKey])[0] : undefined;
		const parent = parentLink ? this.abvNote(this.resolve(parentLink, file.path), bottles, facts, depth + 1) : null;
		if (kind === 'ingredient') {
			return {
				kind,
				staple: properties[PROP.form] === KITCHEN_STAPLE_FORM,
				provides: asLinks(properties[PROP.provides]).flatMap((link) => {
					const note = this.abvNote(this.resolve(link, file.path), bottles, facts, depth + 1);
					return note ? [note] : [];
				}),
			};
		}
		return {
			kind,
			abv: properties[PROP.abv],
			abvTypical: properties[PROP.abvTypical],
			bottleAbvs: kind === 'type' || kind === 'family' ? bottles.get(file.path) : undefined,
			stockedAbvs: kind === 'type' || kind === 'family' ? bottles.get(`stocked:${file.path}`) : undefined,
			subtypeStockedAbvs: kind === 'type' ? bottles.get(`substocked:${file.path}`) : undefined,
			typeAbvs: kind === 'family' ? bottles.get(`types:${file.path}`) : undefined,
			parent,
		};
	}

	/** The recipe's estimate from its text and the notes it links. */
	async estimate(file: TFile, bottles = this.bottleAbvs()): Promise<Estimate> {
		const sections = readRecipeSections(await this.app.vault.cachedRead(file));
		return this.estimateLines(
			file.path,
			sections.ingredients,
			sections.method,
			this.frontmatter(file)[DILUTION_PROP],
			bottles,
		);
	}

	/** An estimate for ingredient lines as given, such as with the bottles chosen when logging; links resolve from `source`. */
	estimateLines(
		source: string,
		lines: readonly string[],
		method: string,
		dilution?: unknown,
		bottles = this.bottleAbvs(),
	): Estimate {
		const link = (target: string): LinkInfo | null => {
			const facts = new Set<Fact>();
			const note = this.abvNote(this.app.metadataCache.getFirstLinkpathDest(target, source), bottles, facts);
			if (!note) return null;
			return { ...noteAbv(note), facts: [...facts] };
		};
		return estimateAlcohol({ lines, method, dilution, link, settings: this.settings() });
	}

	async sync(file: TFile, bottles?: Map<string, number[]>): Promise<boolean> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !this.isRecipe(file, cache)) return false;
		const updates: Record<string, unknown> = {};
		const links = this.plannedLinks(file, cache);
		if (links) updates[PROP.ingredients] = links;
		const stored = storedEstimate(await this.estimate(file, bottles));
		for (const [key, value] of Object.entries(stored))
			if (JSON.stringify(cache.frontmatter?.[key] ?? null) !== JSON.stringify(value)) updates[key] = value;
		if (!Object.keys(updates).length) return false;
		await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
			if (properties[PROP.kind] === 'recipe') Object.assign(properties, updates);
		});
		return true;
	}

	/** A note's estimate inputs; for stock, whether it's in stock rather than how much, so pours don't recalculate. */
	private inputsOf(cache: CachedMetadata | null | undefined): string {
		const properties: Record<string, unknown> = cache?.frontmatter ?? {};
		return JSON.stringify([...INPUTS.map((key) => properties[key] ?? null), hasStock(properties)]);
	}

	/** A note changed: a recipe updates once quiet; a change to another note's ABV or hierarchy recalculates recipes. */
	changed(file: TFile, cache: CachedMetadata): void {
		if (!this.inCabinet(file)) return;
		if (!this.isRecipe(file, cache)) {
			const inputs = this.inputsOf(cache);
			const before = this.inputs.get(file.path);
			this.inputs.set(file.path, inputs);
			if (before !== undefined && before !== inputs) this.recalc();
			return;
		}
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

	/** Bring every recipe in step; returns how many were updated. Records other notes' inputs to watch. */
	async syncAll(): Promise<number> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => this.inCabinet(file));
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!this.isRecipe(file, cache)) this.inputs.set(file.path, this.inputsOf(cache));
		}
		const bottles = this.bottleAbvs();
		let updated = 0;
		for (const file of files) {
			try {
				if (await this.sync(file, bottles)) updated++;
			} catch {
				/* Left for the next change or start. */
			}
		}
		return updated;
	}

	/**
	 * What leaves estimates partial: notes whose ABV would complete them (a bottle's `cc-abv`, or a
	 * type's or family's typical ABV), with the recipes each would help, most first; and recipes
	 * partial because a line with an amount isn't linked to anything.
	 */
	async missingAbvs(): Promise<MissingAbvs> {
		const bottles = this.bottleAbvs();
		const notes = new Map<string, MissingAbv>();
		const unlinked = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isRecipe(file, this.app.metadataCache.getFileCache(file))) continue;
			const estimate = await this.estimate(file, bottles);
			if (estimate.basis !== 'partial') continue;
			for (const line of estimate.lines) {
				if (line.abv !== null || line.shape === 'ignored' || line.shape === 'dash') continue;
				const link = line.line.match(/\[\[([^\]]+)\]\]/)?.[1];
				const target = link ? this.resolve(link, file.path) : null;
				const fill = target ? this.toFill(target) : null;
				if (!fill) {
					if (line.shape !== 'unmeasured') unlinked.add(file.path);
					continue;
				}
				const entry = notes.get(fill.path) ?? { ...fill, recipes: [] };
				if (!entry.recipes.includes(file.path)) entry.recipes.push(file.path);
				notes.set(fill.path, entry);
			}
		}
		return {
			notes: [...notes.values()].sort(
				(a, b) => b.recipes.length - a.recipes.length || a.name.localeCompare(b.name),
			),
			unlinked: [...unlinked],
		};
	}

	/** The note whose ABV would settle a line linking `file`: the bottle, type, or family; other stock's first type. */
	private toFill(file: TFile, depth = 0): Omit<MissingAbv, 'recipes'> | null {
		const properties = this.frontmatter(file);
		const kind = properties[PROP.kind];
		const name = typeof properties[PROP.name] === 'string' ? (properties[PROP.name] as string) : file.basename;
		if (kind === 'bottle' || kind === 'type' || kind === 'family')
			return {
				path: file.path,
				name,
				kind,
				property: kind === 'bottle' ? PROP.abv : kind === 'type' ? PROP.abvTypical : null,
			};
		if (kind === 'ingredient' && depth === 0) {
			const first = asLinks(properties[PROP.provides])[0];
			const type = first ? this.resolve(first, file.path) : null;
			return type ? this.toFill(type, depth + 1) : null;
		}
		return null;
	}

	/** Recalculate every recipe soon, such as after an estimate setting changes. */
	refresh(): void {
		this.recalc();
	}

	cancel(): void {
		for (const update of this.pending.values()) update.cancel();
		this.pending.clear();
		this.recalc.cancel();
	}
}
