import type { CabinetNote } from './schema';
import { splitIngredient } from './recipe-amount';
import { rememberingNotes } from './written-as';

export interface RecipeImport {
	name: string;
	source: string;
	ingredients: { amount: string; text: string }[];
	method: string;
	description: string;
	tastingNotes: string;
	warnings: string[];
}

export const FIRST_LINE_WARNING = 'The first line was taken as the recipe name. Check it.';

type Section = 'ingredients' | 'method' | 'description' | 'tastingNotes' | 'extra';
const SECTIONS: Record<string, Section> = {
	ingredients: 'ingredients',
	method: 'method',
	directions: 'method',
	instructions: 'method',
	description: 'description',
	notes: 'description',
	'tasting notes': 'tastingNotes',
};

/**
 * A short first line that reads like a title: no amount, list marker, source, link, or sentence
 * punctuation, and not a method step.
 */
function isNameLine(line: string): boolean {
	const text = line.trim().replace(/^\*\*(.+)\*\*$/, '$1');
	return (
		text.length <= 60 &&
		!/^\s{0,3}(?:[-*+]|\d+[.)])\s/.test(line) &&
		!splitIngredient(text).amount &&
		!/^\d/.test(text) &&
		!/[.!?:;]$/.test(text) &&
		!/^source:/i.test(text) &&
		!/https?:\/\/|\[\[/.test(text) &&
		!/^(?:stir|shake|add|combine|pour|strain|muddle|build|blend|fill|garnish|serve|top|rim|chill|whisk|mix)\b/i.test(
			text,
		)
	);
}

/** An unmeasured line naming only glassware: "Pearl Diver Glass", "Cocktail Coupe". */
const GLASS = /^[\p{L}&'’ -]*\b(?:glass|coupe|flute|mug|snifter|tumbler)$/iu;
/** A line giving the drink's strength, not an ingredient: "1.6 standard drinks", "22.96% alc./vol.". */
const STRENGTH = /\bstandard drinks?\b|\balc\.?\s*\/\s*vol\b|\bgrams? of (?:pure )?alcohol\b/i;

/** An ingredient line without its list marker, a web link kept as its text ("[#2](https://…)" is "#2"). */
const ingredientText = (line: string) =>
	line
		.replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/, '')
		// A Markdown link to the web keeps its text; one right after a "[" isn't a link but bracketed text.
		.replace(/\[([^[\]]+)\]\(https?:\/\/[^)\s]*\)/g, (link, text: string, at: number, whole: string) =>
			whole[at - 1] === '[' ? link : text,
		)
		.trim();

/** Read copied text or Markdown; uncertain content stays in the description for review. */
export function parseRecipeText(body: string, metadata: Record<string, unknown> = {}): RecipeImport {
	const textProperty = (...keys: string[]) =>
		keys.map((key) => metadata[key]).find((value): value is string => typeof value === 'string') || '';
	const result: RecipeImport = {
		name: textProperty('cc-name', 'name', 'title'),
		source: textProperty('source'),
		ingredients: [],
		method: '',
		description: '',
		tastingNotes: '',
		warnings: [],
	};
	const sections: Record<Section, string[]> = {
		ingredients: [],
		method: [],
		description: [],
		tastingNotes: [],
		extra: [],
	};
	let section: Section = 'extra';
	let ingredientDepth = 0;
	let sawTitle = false;
	let sawIngredients = false;
	let fence = '';
	let fenceSection: Section = 'extra';
	for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
		const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence) {
			sections[fenceSection].push(line);
			if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = '';
			continue;
		}
		if (marker) {
			fence = marker[1]!;
			fenceSection = section === 'ingredients' ? 'extra' : section;
			sections[fenceSection].push(line);
			continue;
		}
		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
		const label = (heading?.[2] || line.trim())
			.replace(/^\*\*(.+)\*\*$/, '$1')
			.replace(/:$/, '')
			.toLowerCase();
		const recognized = SECTIONS[label];
		if (recognized) {
			section = recognized;
			if (recognized === 'ingredients') sawIngredients = true;
			ingredientDepth = heading?.[1]?.length || 6;
			continue;
		}
		if (heading?.[1] === '#' && !sawTitle && section === 'extra' && !sections.ingredients.length) {
			result.name ||= heading[2]!;
			sawTitle = true;
			continue;
		}
		// Copied text often starts with the drink's name on its own line, without a heading.
		if (!result.name && !sawTitle && section === 'extra' && !heading && line.trim()) {
			sawTitle = true;
			if (isNameLine(line)) {
				result.name = line.trim().replace(/^\*\*(.+)\*\*$/, '$1');
				result.warnings.push(FIRST_LINE_WARNING);
				continue;
			}
		}
		if (heading && !(section === 'ingredients' && heading[1]!.length > ingredientDepth)) section = 'extra';
		const source = section === 'extra' && line.match(/^Source:\s*(.+)$/i);
		if (source && !result.source) {
			result.source = source[1]!;
			continue;
		}
		sections[section].push(line);
	}
	// Without headings, recognize ingredient lines and a following method paragraph.
	if (!sawIngredients) {
		let foundIngredient = false,
			methodStarted = false,
			unknownSection = false,
			inCode = false;
		sections.extra = sections.extra.filter((line) => {
			if (/^\s{0,3}(?:`{3,}|~{3,})/.test(line)) {
				inCode = !inCode;
				return true;
			}
			if (inCode) return true;
			if (/^\s*#/.test(line)) unknownSection = true;
			if (unknownSection) return true;
			const text = line
				.trim()
				.replace(/\\$/, '')
				.trimEnd()
				.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '');
			const method =
				/^(?:stir|shake|add|combine|pour|strain|muddle|build|blend|fill|garnish|serve|top|rim|chill|dry[- ]shake|whisk|mix)\b/i.test(
					text,
				);
			if (methodStarted || (foundIngredient && method)) {
				methodStarted = true;
				sections.method.push(line.replace(/\\\s*$/, ''));
				return false;
			}
			const ingredient =
				splitIngredient(text).amount ||
				/^\s{0,3}[-*+]\s+\S/.test(line) ||
				/^(?:a\s+)?(?:splash|pinch|dash)\b/i.test(text);
			if (!ingredient) return true;
			foundIngredient = true;
			sections.ingredients.push(text);
			return false;
		});
		if (sections.ingredients.length)
			result.warnings.push('No Ingredients heading: review the detected ingredients and method.');
	}
	let implicitMethod = false;
	const implicitMethodLines: string[] = [];
	/** Glass and tools lines found among the ingredients, for the top of Method. */
	const serving: string[] = [];
	/** Alcohol-content lines found among the ingredients, for Description. */
	const strength: string[] = [];
	/** The label of a bare `Garnish:`, `Glass:`, or `Alcohol content:` line, which applies to the lines below it. */
	let label: 'garnish' | 'glass' | 'strength' | '' = '';
	for (const line of sections.ingredients) {
		if (!line.trim()) continue;
		if (
			implicitMethod ||
			(result.ingredients.length > 0 &&
				/^(?:stir|shake|combine|strain|garnish|serve)\b/i.test(line.trim()) &&
				!/^garnish(?:es)?\s*:\s*$/i.test(line.trim()))
		) {
			implicitMethod = true;
			implicitMethodLines.push(line);
			continue;
		}
		const text = ingredientText(line);
		// A Wix hashtag link ("Don's Spices #2") can land on its own line: it belongs to the line above.
		const previous = result.ingredients.at(-1);
		if (/^#\d+$/.test(text) && previous) {
			previous.text = `${previous.text} ${text}`;
			continue;
		}
		if ((/^\s/.test(line) && !/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) || /^\s*#/.test(line)) {
			sections.extra.push(line);
			continue;
		}
		const labeled = text.replace(/\*\*/g, '').match(/^(garnish(?:es)?|glass|tools?|alcohol content)\s*:\s*(.*)$/i);
		if (labeled) {
			const kind = labeled[1]!.toLowerCase();
			const value = labeled[2]!.trim();
			if (kind.startsWith('tool')) serving.push(text.replace(/\*\*/g, ''));
			else if (kind === 'glass') value ? serving.push(`Glass: ${value}`) : (label = 'glass');
			else if (kind === 'alcohol content') value ? strength.push(value) : (label = 'strength');
			else if (!value) label = 'garnish';
			// An inline garnish line stays as the source wrote it.
			else result.ingredients.push(splitIngredient(text));
			continue;
		}
		const measured = !!splitIngredient(text).amount;
		if (label === 'strength' || STRENGTH.test(text)) {
			strength.push(text);
			continue;
		}
		if (label === 'glass' || (!measured && GLASS.test(text))) {
			serving.push(label === 'glass' ? `Glass: ${text}` : text);
			label = '';
			continue;
		}
		if (label === 'garnish' && !measured) {
			result.ingredients.push({ amount: '', text: `Garnish: ${text}` });
			continue;
		}
		label = '';
		result.ingredients.push(splitIngredient(text));
	}
	result.method = [serving.join('\n'), [...implicitMethodLines, ...sections.method].join('\n').trim()]
		.filter(Boolean)
		.join('\n\n');
	result.tastingNotes = sections.tastingNotes.join('\n').trim();
	result.description = [
		sections.description.join('\n').trim(),
		strength.length ? `Alcohol content: ${strength.map((part) => part.replace(/\.$/, '')).join(', ')}.` : '',
	]
		.filter(Boolean)
		.join('\n\n');
	const extra = sections.extra.join('\n').trim();
	if (extra) {
		result.description = [result.description, extra].filter(Boolean).join('\n\n');
		result.warnings.push('Unrecognized content was kept in Description. Review it before saving.');
	}
	return result;
}

export function recipeIngredientNotes(notes: readonly CabinetNote[]): CabinetNote[] {
	return notes.filter((note) => note.kind !== 'recipe');
}

const normalize = (value: string) =>
	value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
/** Words that don't tell ingredients apart: "crème de cacao" is "creme cacao", "Smith and Cross" is "Smith & Cross". */
const MINOR = new Set(['a', 'an', 'and', 'the', 'of', 'de', 'di', 'da', 'del', 'du', 'des', 'la', 'le']);
// Single characters ("Q", the "s" of "Peychaud's") name nothing on their own.
const tokens = (value: string) =>
	new Set(value.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1 && !MINOR.has(word)));
/** Every word of `part` is in `whole`, and one of them is a word, not a number such as the 2 and 1 of "(2:1)". */
const within = (part: Set<string>, whole: Set<string>) =>
	[...part].some((word) => /\p{L}/u.test(word)) && [...part].every((word) => whole.has(word));
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && within(a, b);
/** Shared words over all words: how closely two wordings name the same thing. */
const overlap = (a: Set<string>, b: Set<string>) => {
	const shared = [...a].filter((word) => b.has(word)).length;
	return shared / (a.size + b.size - shared);
};
/** A brand the recipe prefers: "preferably Plymouth", "such as Beefeater", "pref. Havana Club 3". */
const PREFERENCE = /^(?:preferably|pref\.?|such as|ideally|e\.?g\.?|like)\s+/;
/** Notes on serving rather than identity: ", to top", ", for garnish", "(optional)", "(see Editor's Note)". */
const SERVING = /^(?:to|for|optional|see|or|if|as|about|plus)\b/;

/**
 * A wording's parts: the words naming the ingredient (with any bare parenthetical, as in "Tequila (Blanco)"),
 * and hints that may name a brand: a parenthetical, or text after a comma, such as "preferably Plymouth".
 */
function wordingParts(query: string): {
	base: string;
	identity: Set<string>;
	hints: Set<string>[];
	qualifiers: Set<string>[];
} {
	const hints: Set<string>[] = [];
	const qualifiers: Set<string>[] = [];
	const identity = new Set<string>();
	const hint = (text: string, bare: boolean) => {
		const trimmed = text.trim();
		if (!trimmed || SERVING.test(trimmed)) return;
		const preference = PREFERENCE.test(trimmed);
		const words = tokens(trimmed.replace(PREFERENCE, ''));
		if (!words.size) return;
		hints.push(words);
		if (!bare || preference) return;
		qualifiers.push(words);
		for (const word of words) identity.add(word);
	};
	const parentheticals = [...query.matchAll(/\(([^)]*)\)?/g)].map((match) => match[1]!);
	const [base = '', ...tail] = query.replace(/\([^)]*\)?/g, ' ').split(',');
	for (const text of parentheticals) hint(text, true);
	for (const text of tail) hint(text, false);
	for (const word of tokens(base)) identity.add(word);
	return { base: base.replace(/\s+/g, ' ').trim(), identity, hints, qualifiers };
}

/** Suggest identities by names/aliases, never by owned stock or inferred substitutions. */
export function suggestIngredient(text: string, notes: readonly CabinetNote[]): CabinetNote[] {
	if (/\[\[/.test(text)) return [];
	// Notes remembering this exact wording come first; a wording remembered for several offers each.
	const remembered = rememberingNotes(text, notes);
	const query = normalize(text);
	if (!query) return remembered.slice(0, 3);
	const { base, identity, hints, qualifiers } = wordingParts(query);
	// Alternatives ("lemon or lime juice", "gin / vodka") name no single note; a brand hint may hold "and".
	if (/\b(?:or|and)\b|\//.test(base) || !identity.size) return remembered.slice(0, 3);
	const baseWords = tokens(base);
	const everything = new Set([...identity, ...hints.flatMap((words) => [...words])]);
	const ranked = recipeIngredientNotes(notes)
		.map((note) => {
			const filename = note.path.split('/').at(-1)!.replace(/\.md$/, '');
			const labels = [note.name, filename, ...(note.aliases || [])].map(normalize);
			const score = (label: string): number => {
				if (label === query) return 5;
				const words = tokens(label);
				// The preferred one, named exactly ("Plymouth Gin" for "gin, preferably Plymouth").
				if (hints.length && same(words, everything)) return 4.8;
				const hinted = hints.some((hint) => within(hint, words));
				// A bottle the recipe names in full, beside the ingredient: "rum, preferably Smith and Cross".
				if (note.kind === 'bottle' && hinted && within(words, everything)) return 4.7;
				if (same(words, identity)) return 4.5;
				// A category is too broad to suggest from one shared word: "Marion Blackberry Syrup" isn't Syrup.
				if (note.kind === 'category') return 0;
				// Words naming part of this note: more than one, or one beside a word of the ingredient.
				const partly = (part: Set<string>) =>
					within(part, words) && (part.size > 1 || [...baseWords].some((word) => words.has(word)));
				// A bottle a hint partly names: "Appleton Signature" for Appleton Estate Signature.
				if (note.kind === 'bottle' && hints.some(partly)) return 4 + overlap(words, everything) / 10;
				if (within(words, identity) || within(identity, words)) return overlap(words, identity);
				// A parenthetical naming the style: "Rum (Rhum Agricole)" is Aged or Unaged Rhum Agricole.
				return qualifiers.some(partly) ? overlap(words, identity) : 0;
			};
			// The best-matching label, the shorter on a tie.
			const best = labels
				.map((label) => ({ score: score(label), size: tokens(label).size }))
				.sort((x, y) => y.score - x.score || x.size - y.size)[0]!;
			return { note, ...best };
		})
		.filter((item) => item.score > 0)
		// Equal matches: the broader note first, as "Rum" before "Aged Overproof Jamaican Rum".
		.sort((a, b) => b.score - a.score || a.size - b.size || a.note.name.localeCompare(b.note.name));
	return [...remembered, ...ranked.map((item) => item.note).filter((note) => !remembered.includes(note))].slice(0, 3);
}
