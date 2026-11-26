import { recipeIngredientNotes, suggestIngredient } from './recipe-import';
import { stockProperties } from './stock';
import { groupUnlinked, ingredientLines } from './unlinked-lines';
import type { UnlinkedReviewOptions } from './unlinked-lines';
import type { CabinetNote, Properties } from './schema';

/** What the agent CLI reports for a note: enough to name it and pass it back as a target. */
export const briefNote = (note: CabinetNote) => ({ path: note.path, name: note.name, kind: note.kind });

export interface UnlinkedReportOptions extends UnlinkedReviewOptions {
	/** Only this recipe's lines. */
	recipe?: string;
	/** At most this many wordings; `lines` still counts them all. */
	limit?: number;
}

/**
 * The lines **Review unlinked ingredients** shows, grouped by wording, most widely used first. Each line
 * is numbered by its place in the Ingredients list, from 1, as `link-line` takes it, and each wording has
 * up to three suggestions, as the review offers.
 */
export function unlinkedReport(
	recipes: readonly { note: CabinetNote; content: string }[],
	notes: readonly CabinetNote[],
	options: UnlinkedReportOptions = {},
) {
	const chosen = options.recipe ? recipes.filter(({ note }) => note.path === options.recipe) : recipes;
	const contents = new Map(chosen.map(({ note, content }) => [note.path, content]));
	const groups = groupUnlinked(chosen, notes, options);
	const ingredients = recipeIngredientNotes(notes);
	const report = groups.map((group) => ({
		wording: group.wording,
		recipes: new Set(group.uses.map((use) => use.recipe.path)).size,
		lines: group.uses.map((use) => ({
			path: use.recipe.path,
			line: ingredientLines(contents.get(use.recipe.path)!).findIndex((entry) => entry.line === use.line) + 1,
			text: use.text,
		})),
		suggestions: suggestIngredient(group.wording, ingredients).slice(0, 3).map(briefNote),
	}));
	return {
		lines: report.reduce((total, group) => total + group.lines.length, 0),
		groups: options.limit === undefined ? report : report.slice(0, options.limit),
	};
}

export interface BottleInput {
	/** Percent, as the bottle form takes it: `40` is 40%. */
	abv?: string;
	volume?: string;
	open?: string;
	unopened?: string;
	/** Comma-separated. */
	aliases?: string;
}

/** A new bottle's properties, as **Add a bottle** writes them in volume tracking: nothing open unless given. */
export function bottleProperties(input: BottleInput): Properties {
	const properties = stockProperties({
		kind: 'bottle',
		tracking: 'volume',
		volume: input.volume ?? '',
		abv: input.abv ?? '',
		open: input.open ?? '0',
		openUnit: 'ml',
		unopened: input.unopened ?? '',
		remaining: '',
		availability: '',
		form: '',
		lastPurchasePrice: '',
		shoppingList: false,
	});
	const aliases = (input.aliases ?? '')
		.split(',')
		.map((alias) => alias.trim())
		.filter(Boolean);
	if (aliases.length) properties.aliases = aliases;
	return properties;
}
