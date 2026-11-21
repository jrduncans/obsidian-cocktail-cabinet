import { RECIPE_STATUSES } from './availability';
import type { LineAvailability, RecipeAvailability, RecipeStatus } from './availability';
import { relatedTargets } from './relationships';
import type { CabinetNote } from './schema';
import { ingredientParts, plainIngredient } from './unlinked-lines';

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
		case 'missing': {
			// A named bottle that ran out reads "Out: Campari"; other empty sources that would fit follow.
			const named = line.out.some((path) => line.targets.includes(path));
			const others = line.out.filter((path) => !line.targets.includes(path));
			const rest = others.length ? ` (${named ? 'also out' : 'out'}: ${names(others)})` : '';
			return `${named ? 'Out' : 'Missing'}: ${garnish}${wanted}${rest}`;
		}
		case 'unlinked':
			return `Not linked: ${garnish}${ingredientParts(line.text).wording}`;
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

/** The headline for one recipe's check. */
export function statusText(availability: RecipeAvailability): string {
	if (!availability.lines.some((line) => !line.garnish)) return 'No ingredients to check.';
	const texts: Record<RecipeStatus, string> = {
		'can-make': 'You can make it.',
		substitute: 'You can make it with a substitute.',
		'check-stock': 'Check stock first.',
		'missing-one': 'Missing one ingredient.',
		'missing-more': `Missing ${availability.missing} ingredients.`,
	};
	return texts[availability.status];
}

/** A line's wording for the check: its caveat, or the sources that have it. */
export function lineStatus(line: LineAvailability, name: (path: string) => string): string {
	return describeLine(line, name) ?? `Have: ${line.sources.map(name).join(', ')}`;
}

/** Stock worth editing from the check: Low or Short sources, Unknown ones, and what ran out. */
export function stockToFix(line: LineAvailability): string[] {
	switch (line.state) {
		case 'low':
		case 'short':
			return line.sources;
		case 'unknown':
			return line.unknown;
		case 'missing':
		case 'substitute':
			return line.out;
		default:
			return [];
	}
}
