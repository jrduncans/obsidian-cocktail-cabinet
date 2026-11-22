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
				result.warnings.push('The first line was taken as the recipe name. Check it.');
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
	for (const line of sections.ingredients) {
		if (!line.trim()) continue;
		if (
			implicitMethod ||
			(result.ingredients.length > 0 && /^(?:stir|shake|combine|strain|garnish|serve)\b/i.test(line.trim()))
		) {
			implicitMethod = true;
			implicitMethodLines.push(line);
			continue;
		}
		if ((/^\s/.test(line) && !/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) || /^\s*#/.test(line)) {
			sections.extra.push(line);
			continue;
		}
		result.ingredients.push(splitIngredient(line.replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/, '')));
	}
	result.method = [...implicitMethodLines, ...sections.method].join('\n').trim();
	result.tastingNotes = sections.tastingNotes.join('\n').trim();
	result.description = sections.description.join('\n').trim();
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
const words = (value: string) => ` ${value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** Suggest identities by names/aliases, never by owned stock or inferred substitutions. */
export function suggestIngredient(text: string, notes: readonly CabinetNote[]): CabinetNote[] {
	if (/\[\[/.test(text)) return [];
	// Notes remembering this exact wording come first; a wording remembered for several offers each.
	const remembered = rememberingNotes(text, notes);
	if (/\b(?:or|and)\b|\//i.test(text)) return remembered.slice(0, 3);
	const query = normalize(text);
	if (!query) return [];
	const parenthetical = [...query.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]!);
	const base = query.replace(/\([^)]*\)/g, '').trim();
	const ranked = recipeIngredientNotes(notes)
		.map((note) => {
			const filename = note.path.split('/').at(-1)!.replace(/\.md$/, '');
			const labels = [note.name, filename, ...(note.aliases || [])].map(normalize);
			const score = Math.max(
				...labels.map((label) => {
					if (label === query) return 5;
					if (
						note.kind === 'bottle' &&
						parenthetical.some(
							(brand) =>
								label === brand ||
								(words(label).includes(words(brand)) && words(label).includes(words(base))),
						)
					)
						return 4;
					if (label === base || parenthetical.includes(label)) return 3;
					return words(label).includes(words(query)) || words(query).includes(words(label)) ? 1 : 0;
				}),
			);
			return { note, score };
		})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || a.note.name.localeCompare(b.note.name));
	return [...remembered, ...ranked.map((item) => item.note).filter((note) => !remembered.includes(note))].slice(0, 3);
}
