import type { CabinetNote, NoteDraft } from './schema';
import { parseRating, wikiLink } from './schema';
import { parseRecipeText, recipeIngredientNotes, suggestIngredient } from './recipe-import';
import type { RecipeImport } from './recipe-import';
import { splitEcho } from './recipe-amount';
import { splitTags, uniqueTags } from './recipe-tags';
import { rememberedNote } from './written-as';

/** A recipe line as created: linked from a remembered wording, or plain with suggestions to review. */
export interface DraftLine {
	/** The line as written in the note, without the list marker. */
	text: string;
	/** The ingredient's wording, what a link's display text would be. */
	wording: string;
	link?: CabinetNote;
	suggestions: CabinetNote[];
}

export interface RecipeDraft {
	draft: NoteDraft;
	lines: DraftLine[];
	warnings: string[];
}

/**
 * A recipe note from recipe text, as Create a cocktail recipe would save it without changes: the text read as
 * pasted text is, an echoed volume kept with the amount, and only remembered wordings linked (docs/import.md#agents).
 */
export function draftFromText(
	text: string,
	notes: readonly CabinetNote[],
	options: { name?: string; source?: string; rating?: string } = {},
): RecipeDraft {
	const recipe = parseRecipeText(text);
	return draftFromImport(recipe, notes, options);
}

export function draftFromImport(
	recipe: RecipeImport,
	notes: readonly CabinetNote[],
	options: { name?: string; source?: string; rating?: string } = {},
): RecipeDraft {
	const name = (options.name ?? recipe.name).trim();
	if (!name) throw new Error('The recipe has no name. Give one with name=, or start the text with it.');
	if (!recipe.ingredients.length)
		throw new Error('No ingredient lines found. Use one ingredient per line, or add an Ingredients heading.');
	let rating: number | null = null;
	if (options.rating !== undefined) {
		const parsed = parseRating(options.rating);
		if (parsed === undefined) throw new Error('Give rating= as a whole number from 1 to 5.');
		rating = parsed;
	}
	const ingredientNotes = recipeIngredientNotes(notes);
	const lines = recipe.ingredients.map(({ amount, text: rest }): DraftLine => {
		const { lead, wording } = amount ? splitEcho(rest) : { lead: '', wording: rest.trim() };
		const prefix = [amount, lead].filter(Boolean).join(' ');
		const link = /\[\[/.test(wording) ? undefined : rememberedNote(wording, ingredientNotes);
		const written = link ? wikiLink(link.path, wording) : wording;
		return {
			text: [prefix, written].filter(Boolean).join(' '),
			wording,
			...(link ? { link } : {}),
			suggestions: link || /\[\[/.test(wording) ? [] : suggestIngredient(wording, ingredientNotes),
		};
	});
	// As in the recipe form, tags ending Tasting Notes move into the tags property.
	const tasting = splitTags(recipe.tastingNotes);
	const tags = uniqueTags(tasting.tags);
	return {
		draft: {
			kind: 'recipe',
			name,
			ingredients: lines.map((line) => line.text),
			method: recipe.method,
			description: recipe.description,
			tastingNotes: tasting.text,
			properties: {
				source: (options.source ?? recipe.source).trim() || null,
				rating,
				tags: tags.length ? tags : null,
			},
		},
		lines,
		warnings: recipe.warnings,
	};
}
