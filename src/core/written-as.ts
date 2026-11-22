import type { CabinetNote, NoteKind } from './schema';
import { nameKey } from './recipe-tags';

/**
 * Remembered wordings (`cc-written-as`): recipe wordings once linked to an ingredient note, linked again
 * when the same wording reappears. Compared as recipe names are, so case, accents, and punctuation
 * don't matter. See docs/import.md.
 */

/** The property's strings, for an ingredient note; recipes don't remember wordings. */
export function writtenAsProperty(kind: NoteKind, value: unknown): { writtenAs?: string[] } {
	if (kind === 'recipe') return {};
	const values = (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && !!item.trim(),
	);
	return values.length ? { writtenAs: values.map((item) => item.trim()) } : {};
}

/** Every note that remembers this wording. */
export function rememberingNotes(wording: string, notes: readonly CabinetNote[]): CabinetNote[] {
	const key = nameKey(wording);
	if (!key) return [];
	return notes.filter((note) => note.kind !== 'recipe' && note.writtenAs?.some((item) => nameKey(item) === key));
}

/** The one note to link a wording to, or none when no note or more than one remembers it. */
export function rememberedNote(wording: string, notes: readonly CabinetNote[]): CabinetNote | undefined {
	const found = rememberingNotes(wording, notes);
	return found.length === 1 ? found[0] : undefined;
}

/**
 * Whether linking `wording` to `note` is worth offering to remember: plain text, not already the note's
 * name, filename, alias, or a remembered wording, since those are recognized anyway.
 */
export function canRemember(wording: string, note: CabinetNote): boolean {
	const text = wording.trim();
	const key = nameKey(text);
	if (!key || note.kind === 'recipe' || /\[\[|\]\]|[\r\n]/.test(text) || text.length > 120) return false;
	const filename = note.path.split('/').at(-1)!.replace(/\.md$/, '');
	return ![note.name, filename, ...(note.aliases ?? []), ...(note.writtenAs ?? [])].some(
		(label) => nameKey(label) === key,
	);
}

/** The property's new value with `wording` added, or null when it's already there. */
export function withWording(current: unknown, wording: string): string[] | null {
	const values = (Array.isArray(current) ? current : typeof current === 'string' ? [current] : []).filter(
		(item): item is string => typeof item === 'string',
	);
	const key = nameKey(wording);
	if (!key || values.some((item) => nameKey(item) === key)) return null;
	return [...values, wording.trim()];
}
