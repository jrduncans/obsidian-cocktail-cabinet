import type { CabinetNote } from './schema';

/** How a drink is mixed: always offered, and suggested from the method. */
export const PREP_TAGS = ['shaken', 'stirred', 'built', 'blended'] as const;

/** Tags on other recipes are offered once they're on at least this many. */
const COMMON = 2;

const key = (tag: string) => tag.toLowerCase();

/**
 * A tag as typed, without `#`; null when Obsidian wouldn't read it as a tag
 * (letters, digits, `_`, `-`, and `/`, not all digits).
 */
export function normalizeTag(input: string): string | null {
	const tag = input.trim().replace(/^#/, '');
	return /^[\p{L}\p{N}_/-]+$/u.test(tag) && !/^\d+$/.test(tag) ? tag : null;
}

/**
 * Split recipe tags off the end of Tasting Notes, where recipes keep them: trailing lines made only
 * of `#tags`. Tags elsewhere in the text are part of it.
 */
export function splitTags(tastingNotes: string): { text: string; tags: string[] } {
	const lines = tastingNotes.replace(/\r/g, '').trimEnd().split('\n');
	const tags: string[] = [];
	while (lines.length) {
		const words = lines.at(-1)!.trim().split(/\s+/).filter(Boolean);
		if (!words.length && tags.length) {
			lines.pop();
			continue;
		}
		if (!words.length || !words.every((word) => word.startsWith('#') && normalizeTag(word))) break;
		tags.unshift(...words.map((word) => word.slice(1)));
		lines.pop();
	}
	const unique = tags.filter((tag, index) => tags.findIndex((other) => key(other) === key(tag)) === index);
	return { text: lines.join('\n').trim(), tags: unique };
}

/** Tasting Notes with tags on their own last line. */
export function joinTags(text: string, tags: readonly string[]): string {
	const line = tags.map((tag) => `#${tag}`).join(' ');
	return [text.trim(), line].filter(Boolean).join('\n\n');
}

/**
 * The prep tag a method describes: the first of shake, stir, or blend it mentions,
 * or built when it only says build. Null when it names none.
 */
export function suggestPrep(method: string): (typeof PREP_TAGS)[number] | null {
	const found = (
		[
			['shaken', /\b(?:shak(?:e|en|ing)|whip)\b/i],
			['stirred', /\bstir(?:s|red|ring)?\b/i],
			['blended', /\bblend(?:s|ed|ing)?\b/i],
		] as const
	)
		.map(([tag, pattern]) => ({ tag, at: method.search(pattern) }))
		.filter((item) => item.at >= 0)
		.sort((a, b) => a.at - b.at);
	if (found.length) return found[0]!.tag;
	return /\b(?:build|built)\b/i.test(method) ? 'built' : null;
}

/** Tags to offer: prep tags, then tags common on other recipes (most used first), then this recipe's own. */
export function tagChoices(current: readonly string[], counts: ReadonlyMap<string, number>): string[] {
	const choices: string[] = [];
	const add = (tag: string) => {
		if (!choices.some((other) => key(other) === key(tag))) choices.push(tag);
	};
	PREP_TAGS.forEach(add);
	[...counts]
		.filter(([, count]) => count >= COMMON)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.forEach(([tag]) => add(tag));
	current.forEach(add);
	return choices;
}

/** A name compared loosely: accents, case, punctuation, “&”/“and”, and a leading “The” don't matter. */
function nameKey(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/^\s*the\s+/, '')
		.replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Recipes whose name, filename, or alias matches `name` loosely, apart from the note at `except`. */
export function duplicateRecipes(name: string, notes: readonly CabinetNote[], except?: string): CabinetNote[] {
	const wanted = nameKey(name);
	if (!wanted) return [];
	return notes.filter(
		(note) =>
			note.kind === 'recipe' &&
			note.path !== except &&
			[note.name, note.path.split('/').at(-1)!.replace(/\.md$/, ''), ...(note.aliases ?? [])].some(
				(label) => nameKey(label) === wanted,
			),
	);
}
