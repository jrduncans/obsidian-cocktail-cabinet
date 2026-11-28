import { splitIngredient } from './recipe-amount';
import type { RecipeImport } from './recipe-import';

/**
 * Difford's Guide's recipe page, read from its own sections (docs/import.md#site-adapters). The generic reading
 * took the whole page, comments and shop included, into Description, and its recipe data, when served at all,
 * abbreviates ingredients ("Vermouth amaro (Pun.)") and describes nothing.
 */

/** The page is Difford's and has its recipe sections. */
export function isDiffordsRecipe(doc: Document, url: string): boolean {
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return false;
	}
	return /(?:^|\.)diffordsguide\.com$/i.test(host) && !!doc.querySelector('.cocktail-ingredients__table');
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * A step in sentence case: Difford's capitalizes techniques and glasses as links ("STIR all ingredients",
 * "a NICK & NORA GLASS"), which read as shouting in a note.
 */
export function unshout(step: string): string {
	const lowered = step.replace(/\b[A-Z][A-Z'’-]+(?:(?:\s+|\s*&\s*)[A-Z][A-Z'’-]*)*\b/g, (run) =>
		run.length > 1 ? run.toLowerCase() : run,
	);
	return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** The section's paragraphs, without its heading or its "More cocktails by …" link. */
function paragraphs(section: Element | null): string {
	if (!section) return '';
	return Array.from(section.querySelectorAll('p'))
		.filter((p) => !p.closest('[class*="__more"]'))
		.map(text)
		.filter(Boolean)
		.join('\n\n');
}

export interface DiffordsRecipe {
	recipe: Omit<RecipeImport, 'source'>;
	/** What was read, for the review's Original text. */
	original: string;
}

/**
 * Name from the title, one ingredient per table row, the How to make steps numbered as the page numbers them
 * (Prepare, Method, then Garnish), and the Review then History as Description. Tasting notes stay the reader's own.
 */
export function readDiffords(doc: Document): DiffordsRecipe {
	const name = text(doc.querySelector('h1'));
	const rows = Array.from(doc.querySelectorAll('.cocktail-ingredients__table tr'))
		.map((row) => {
			const cells = Array.from(row.querySelectorAll('td')).map(text).filter(Boolean);
			return cells.join(' ');
		})
		.filter(Boolean);
	const method = doc.querySelector('.cocktail-method');
	const steps = method ? Array.from(method.querySelectorAll('ol > li')).map(text).filter(Boolean).map(unshout) : [];
	const history = paragraphs(doc.querySelector('.cocktail-history'));
	const review = paragraphs(doc.querySelector('.cocktail-review'));
	const warnings: string[] = [];
	if (!steps.length) warnings.push('The page has no method that could be read. Add it from the page if it has one.');
	const original = [
		"Recipe on the page (Difford's Guide):",
		name && `Name: ${name}`,
		...rows.map((line) => `- ${line}`),
		...steps.map((line, index) => `${index + 1}. ${line}`),
		history && `History: ${history}`,
		review && `Review: ${review}`,
	]
		.filter(Boolean)
		.join('\n');
	return {
		recipe: {
			name,
			ingredients: rows.map((line) => splitIngredient(line)),
			method: steps.length === 1 ? steps[0]! : steps.map((line, index) => `${index + 1}. ${line}`).join('\n'),
			description: [review, history].filter(Boolean).join('\n\n'),
			tastingNotes: '',
			warnings,
		},
		original,
	};
}
