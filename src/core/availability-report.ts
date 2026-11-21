import { RECIPE_STATUSES } from './availability';
import type { RecipeStatus } from './availability';
import { compareRecipes, describeLine, filterRecipes, toBuy } from './availability-lists';
import type { RecipeEntry, RecipeFilter } from './availability-lists';
import type { CabinetNote } from './schema';

/**
 * The CLI handlers' JSON, kept free of Obsidian so it can be tested. Paths are vault-relative, as the
 * Bases return them; names are the cabinet's proper names.
 */

const namer = (notes: readonly CabinetNote[]) => {
	const names = new Map(notes.map((note) => [note.path, note.name]));
	return (path: string) => names.get(path) ?? path;
};

const caveats = (entry: RecipeEntry, name: (path: string) => string) =>
	entry.availability.lines.flatMap((line) => describeLine(line, name) ?? []);

export function canMakeReport(entry: RecipeEntry, notes: readonly CabinetNote[]) {
	const name = namer(notes);
	return {
		path: entry.path,
		name: entry.name,
		status: entry.availability.status,
		lines: entry.availability.lines.map((line) => ({
			text: line.text,
			state: line.state,
			...(line.garnish ? { garnish: true } : {}),
			...(describeLine(line, name) ? { detail: describeLine(line, name) } : {}),
			sources: line.sources,
			...(line.substitutes.length ? { substitutes: line.substitutes } : {}),
			...(line.unknown.length ? { unknown: line.unknown } : {}),
			...(line.out.length ? { out: line.out } : {}),
		})),
	};
}

export function makeableReport(
	entries: readonly RecipeEntry[],
	notes: readonly CabinetNote[],
	filter: RecipeFilter,
	limit?: number,
) {
	const name = namer(notes);
	const matching = filterRecipes(entries, notes, filter).sort(compareRecipes);
	const counts = Object.fromEntries(
		RECIPE_STATUSES.map((status) => [
			status,
			matching.filter((entry) => entry.availability.status === status).length,
		]),
	);
	return {
		counts,
		recipes: matching.slice(0, limit).map((entry) => ({
			path: entry.path,
			name: entry.name,
			status: entry.availability.status,
			rating: entry.rating,
			lastMade: entry.lastMade,
			caveats: caveats(entry, name),
		})),
	};
}

export function toBuyReport(entries: readonly RecipeEntry[], notes: readonly CabinetNote[], limit?: number) {
	const name = namer(notes);
	const recipeNames = new Map(entries.map((entry) => [entry.path, entry.name]));
	return {
		items: toBuy(entries)
			.slice(0, limit)
			.map((item) => ({
				need: item.targets.map(name).join(' or '),
				targets: item.targets,
				unlocks: item.unlocks.map((path) => recipeNames.get(path) ?? path),
				closer: item.closer.length,
			})),
	};
}

/** Reads `status=can-make,substitute`, `min-rating=4`, `tag=…`, `limit=…`; `uses` is resolved by the caller. */
export function parseListFlags(params: Record<string, string>): { filter: RecipeFilter; limit?: number } {
	const statuses = (params.status ?? '')
		.split(',')
		.map((status) => status.trim())
		.filter(Boolean);
	const unknown = statuses.filter((status) => !RECIPE_STATUSES.some((value) => value === status));
	if (unknown.length) throw new Error(`Unknown status: ${unknown.join(', ')}. Use ${RECIPE_STATUSES.join(', ')}.`);
	const number = (key: string) => {
		if (params[key] === undefined) return undefined;
		const value = Number(params[key]);
		if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a whole number above 0.`);
		return value;
	};
	return {
		filter: {
			...(statuses.length ? { statuses: statuses as RecipeStatus[] } : {}),
			...(number('min-rating') ? { minRating: number('min-rating') } : {}),
			...(params.tag ? { tag: params.tag } : {}),
		},
		...(number('limit') ? { limit: number('limit') } : {}),
	};
}
