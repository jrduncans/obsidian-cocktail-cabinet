import type { CabinetNote } from './schema';

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
 * Split inline tags off the end of Tasting Notes, where recipes used to keep them: trailing lines
 * made only of `#tags`. The forms move them into the `tags` property. Tags elsewhere in the text are part of it.
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
	return { text: lines.join('\n').trim(), tags: uniqueTags(tags) };
}

/** A `tags` property as a list of tags without `#`: a list, or one string of tags separated by spaces or commas. */
export function parseTags(value: unknown): string[] {
	const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
	return uniqueTags(
		items.flatMap((item: unknown) => {
			const tag = typeof item === 'string' ? normalizeTag(item) : null;
			return tag ? [tag] : [];
		}),
	);
}

/** Tags with case-insensitive repeats removed, keeping the first spelling. */
export function uniqueTags(tags: readonly string[]): string[] {
	return tags.filter((tag, index) => tags.findIndex((other) => key(other) === key(tag)) === index);
}

/** Tags to offer: tags on other recipes, most used first, then this recipe's own. The plugin defines none. */
export function tagChoices(current: readonly string[], counts: ReadonlyMap<string, number>): string[] {
	return uniqueTags([
		...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag),
		...current,
	]);
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
