import { ingredientKey } from './unlinked-lines';
import { wikiLink } from './schema';
import type { CabinetNote } from './schema';

/**
 * When linking uses the cabinet name without asking (docs/link-text.md): never, for the same name written
 * differently, or also for one of the note's aliases.
 */
export type LinkTextLevel = 'keep' | 'name' | 'alias';
export const DEFAULT_LINK_TEXT_LEVEL: LinkTextLevel = 'name';

/** Where a link's text comes from: the cabinet name, the wording already there, or typed. */
export type LinkTextSource = 'name' | 'original' | 'typed';

/** A wording with its link: the words before it, the link's text, and the words after it, as written. */
export interface WordingLink {
	before: string;
	text: string;
	after: string;
}

/** A word compared without case, accents, or the punctuation around it, so "St." matches "St". */
const wordKey = (word: string) => ingredientKey(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

interface Word {
	key: string;
	/** Where the word starts and ends in the wording, without the punctuation around it. */
	start: number;
	end: number;
}

function words(text: string): Word[] {
	return [...text.matchAll(/\S+/g)].flatMap((match) => {
		const lead = match[0].match(/^[^\p{L}\p{N}]*/u)![0].length;
		const trail = match[0].match(/[^\p{L}\p{N}]*$/u)![0].length;
		const key = wordKey(match[0]);
		return key ? [{ key, start: match.index + lead, end: match.index + match[0].length - trail }] : [];
	});
}

/** Where one of `names` appears in `wording` as whole words, preferring the longest; null when none does. */
function nameSpan(wording: string, names: readonly string[]): { start: number; end: number } | null {
	const said = words(wording);
	const candidates = names
		.map((name) => {
			const nameWords = words(name);
			// Punctuation the name opens or closes with, such as the ")" of "Simple Syrup (2:1)".
			const lead = nameWords.length ? name.slice(0, nameWords[0]!.start).trimStart() : '';
			const trail = nameWords.length ? name.slice(nameWords.at(-1)!.end).trimEnd() : '';
			return { keys: nameWords.map((word) => word.key), lead, trail };
		})
		.filter(({ keys }) => keys.length)
		.sort((a, b) => b.keys.length - a.keys.length);
	for (const { keys, lead, trail } of candidates) {
		for (let index = 0; index + keys.length <= said.length; index++) {
			if (!keys.every((key, offset) => said[index + offset]!.key === key)) continue;
			let start = said[index]!.start;
			let end = said[index + keys.length - 1]!.end;
			// Take the name's own punctuation into the span when the wording repeats it there.
			if (lead && wording.slice(0, start).endsWith(lead)) start -= lead.length;
			if (trail && wording.slice(end).startsWith(trail)) end += trail.length;
			return { start, end };
		}
	}
	return null;
}

/** The names that count as the note's own at a level: its name, then its aliases at the alias level. */
const namesAt = (note: CabinetNote, level: LinkTextLevel) =>
	level === 'keep' ? [] : level === 'alias' ? [note.name, ...(note.aliases ?? [])] : [note.name];

/**
 * The cabinet name as the link's text. Where the wording contains the name or an alias as whole words,
 * only that part is linked and the other words stay beside it, since they may describe a different
 * ingredient ("strawberry-infused Campari"); otherwise the name replaces the wording.
 */
export function cabinetNameLink(wording: string, note: CabinetNote): WordingLink {
	return nameInWording(wording, note) ?? { before: '', text: note.name, after: '' };
}

/**
 * The wording with the note's name, or else one of its aliases, found in it as whole words and linked as
 * the cabinet name, the other words beside it; null when the wording contains neither.
 */
export function nameInWording(wording: string, note: CabinetNote): WordingLink | null {
	const span = nameSpan(wording, [note.name]) ?? nameSpan(wording, note.aliases ?? []);
	return span ? { before: wording.slice(0, span.start), text: note.name, after: wording.slice(span.end) } : null;
}

/** Which link text a new link starts on: the cabinet name when the wording contains a name the level counts. */
export function defaultLinkSource(wording: string, note: CabinetNote, level: LinkTextLevel): LinkTextSource {
	return nameSpan(wording, namesAt(note, level)) ? 'name' : 'original';
}

/**
 * Which link text to start on for text that's linked whole, such as a selection or an existing link's
 * text: the cabinet name only when the whole text is a name the level counts.
 */
export function wholeLinkSource(text: string, note: CabinetNote, level: LinkTextLevel): LinkTextSource {
	const span = nameSpan(text, namesAt(note, level));
	return span && !text.slice(0, span.start).trim() && !text.slice(span.end).replace(/[^\p{L}\p{N}]/gu, '')
		? 'name'
		: 'original';
}

/** The wording linked by `source`: the cabinet name (see `cabinetNameLink`), the wording itself, or `typed`. */
export function wordingLink(wording: string, note: CabinetNote, source: LinkTextSource, typed = ''): WordingLink {
	if (source === 'name') return cabinetNameLink(wording, note);
	return { before: '', text: source === 'typed' ? typed.trim() : wording.trim(), after: '' };
}

/** The wording as written in the note, with its link to `path`. */
export const joinWordingLink = (link: WordingLink, path: string) =>
	`${link.before}${wikiLink(path, link.text)}${link.after}`.trim();

/** A saved wording holding exactly one link: the words around it, the link's target, and its text. */
export function savedWordingLink(text: string): (WordingLink & { target: string }) | null {
	const links = [...text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)];
	if (links.length !== 1 || /!\[\[/.test(text)) return null;
	const match = links[0]!;
	const target = match[1]!.trim();
	return {
		before: text.slice(0, match.index),
		target,
		text: match[2]?.trim() || target.split('/').at(-1)!,
		after: text.slice(match.index + match[0].length),
	};
}
