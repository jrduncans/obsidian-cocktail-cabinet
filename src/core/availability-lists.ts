import { RECIPE_STATUSES } from './availability';
import type { LineAvailability, RecipeAvailability, RecipeStatus } from './availability';
import { relatedTargets } from './relationships';
import type { CabinetNote } from './schema';
import { plainIngredient } from './unlinked-lines';

/** A recipe with what lists need to filter and sort it. */
export interface RecipeEntry {
	path: string;
	name: string;
	rating: number | null;
	lastMade: string | null;
	/** Lowercase, without `#`. */
	tags: string[];
	availability: RecipeAvailability;
}

/** Status, then rating (unrated last), then least recently made (never made first), then name. */
export function compareRecipes(left: RecipeEntry, right: RecipeEntry): number {
	const status = (entry: RecipeEntry) => RECIPE_STATUSES.indexOf(entry.availability.status);
	return (
		status(left) - status(right) ||
		(right.rating ?? 0) - (left.rating ?? 0) ||
		(left.lastMade ?? '').localeCompare(right.lastMade ?? '') ||
		left.name.localeCompare(right.name)
	);
}

export interface RecipeFilter {
	/** A note path: recipes with a line that names it, something under it, something above it, or a same-type bottle. */
	uses?: string;
	statuses?: readonly RecipeStatus[];
	minRating?: number;
	tag?: string;
}

export function filterRecipes(
	entries: readonly RecipeEntry[],
	notes: readonly CabinetNote[],
	filter: RecipeFilter,
): RecipeEntry[] {
	const usesNote = filter.uses ? notes.find((note) => note.path === filter.uses) : undefined;
	const related = usesNote ? relatedTargets(notes, usesNote) : undefined;
	const tag = filter.tag?.replace(/^#/, '').toLowerCase();
	return entries.filter(
		(entry) =>
			(!filter.uses ||
				(related && entry.availability.lines.some((line) => line.targets.some((path) => related.has(path))))) &&
			(!filter.statuses?.length || filter.statuses.includes(entry.availability.status)) &&
			(!filter.minRating || (entry.rating ?? 0) >= filter.minRating) &&
			(!tag || entry.tags.includes(tag)),
	);
}

/**
 * One line said briefly, for caveats and missing lists: "Low: Campari", "Short: Campari (10 of 30 mL)",
 * "Substitute: Averna for Meletti". Undefined for a line that is simply Have.
 */
export function describeLine(line: LineAvailability, name: (path: string) => string): string | undefined {
	const names = (paths: readonly string[]) => paths.map(name).join(', ');
	const wanted = line.targets.length ? names(line.targets) : plainIngredient(line.text);
	const garnish = line.garnish ? 'garnish ' : '';
	switch (line.state) {
		case 'have':
			return undefined;
		case 'low':
			return `Low: ${names(line.sources)}`;
		case 'substitute':
			return `Substitute: ${names(line.substitutes)} for ${wanted}`;
		case 'unknown':
			return `Unknown: ${names(line.unknown)}`;
		case 'short':
			return `Short: ${names(line.sources)} (${round(line.heldMl ?? 0)} of ${round(line.ml ?? 0)} mL)`;
		case 'missing':
			return `Missing: ${garnish}${wanted}${line.out.length ? ` (out: ${names(line.out)})` : ''}`;
		case 'unlinked':
			return `Not linked: ${garnish}${plainIngredient(line.text)}`;
	}
}
const round = (ml: number) => Math.round(ml * 10) / 10;

/** A requirement to buy: the notes one line links, any one of which would fill it. */
export interface BuyItem {
	targets: string[];
	/** Recipes this is the only thing missing from. */
	unlocks: string[];
	/** Recipes missing this and something else. */
	closer: string[];
}

/** Linked Short and Missing lines, grouped by what they link, most recipes unlocked first. Garnishes and unlinked lines are left out. */
export function toBuy(entries: readonly RecipeEntry[]): BuyItem[] {
	const items = new Map<string, BuyItem>();
	for (const entry of entries) {
		const { status, lines } = entry.availability;
		const wanted = lines.filter(
			(line) => !line.garnish && line.targets.length && (line.state === 'missing' || line.state === 'short'),
		);
		for (const line of wanted) {
			const targets = [...line.targets].sort();
			const key = targets.join('\n');
			const item = items.get(key) ?? { targets, unlocks: [], closer: [] };
			const list = status === 'missing-one' ? item.unlocks : item.closer;
			if (!list.includes(entry.path)) list.push(entry.path);
			items.set(key, item);
		}
	}
	return [...items.values()].sort(
		(left, right) =>
			right.unlocks.length - left.unlocks.length ||
			right.closer.length - left.closer.length ||
			left.targets[0]!.localeCompare(right.targets[0]!),
	);
}
