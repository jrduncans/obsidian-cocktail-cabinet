import { recipeVolumeMl, splitEcho, splitIngredient } from './recipe-amount';
import { wikiLink } from './schema';
import type { CabinetNote } from './schema';
import type { WordingLink } from './link-text';

/** A line of a recipe's Ingredients section: its line number in the note, as written, and without the list marker. */
export interface IngredientLine {
	line: number;
	raw: string;
	text: string;
}

const MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
const GARNISH_PREFIX = /^garnish\s*:\s*/i;
const GARNISH_SUFFIX = /[,;]?\s*(?:\(\s*)?\bto garnish\s*\)?[.!]?\s*$/i;

export function ingredientLines(content: string): IngredientLine[] {
	const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
	const start = lines.findIndex((line) => /^#{1,6}\s+Ingredients\s*$/i.test(line));
	if (start < 0) return [];
	const result: IngredientLine[] = [];
	for (let line = start + 1; line < lines.length && !/^#{1,6}\s/.test(lines[line]!); line++) {
		const raw = lines[line]!;
		const text = raw.replace(MARKER, '').trim();
		if (text) result.push({ line, raw, text });
	}
	return result;
}

/** A line marked as garnish ("Garnish: …", "… to garnish"). */
export const isGarnish = (text: string) => GARNISH_PREFIX.test(text) || GARNISH_SUFFIX.test(text);

/** Links shown as their display text, as a reader sees them. */
export const plainIngredient = (text: string) =>
	text.replace(/\[\[([^\]]+)\]\]/g, (_link, target: string) =>
		target.includes('|') ? target.split('|').at(-1)! : target.split('/').at(-1)!,
	);

/**
 * The parts of an ingredient line: amount ("1½ oz (45 ml)"), an echoed volume some sources add after it
 * ("/ 45 ml."), an optional garnish prefix, the wording, which becomes a link's display text, and, on an
 * unmeasured line, a trailing garnish marker that stays outside the link.
 */
export function ingredientParts(text: string): {
	amount: string;
	lead: string;
	wording: string;
	prefix?: string;
	suffix?: string;
} {
	const plain = plainIngredient(text).trim();
	const prefix = plain.match(GARNISH_PREFIX)?.[0];
	const { amount, text: rest } = splitIngredient(prefix ? plain.slice(prefix.length) : plain);
	const parts = amount ? { amount, ...splitEcho(rest) } : { amount, lead: '', wording: rest.trim() };
	const suffix = recipeVolumeMl(amount) === null ? parts.wording.match(GARNISH_SUFFIX)?.[0] : undefined;
	if (suffix) parts.wording = parts.wording.slice(0, -suffix.length).trim();
	return { ...(prefix ? { prefix: prefix.trimEnd() } : {}), ...parts, ...(suffix ? { suffix } : {}) };
}

/** Wording compared without case, accents, or spacing differences, so "Gin" and "gin" are one group. */
export function ingredientKey(wording: string): string {
	return wording
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

export const isMeasured = (text: string) => recipeVolumeMl(splitIngredient(plainIngredient(text)).amount) !== null;

/** Measured lines without a link: logging can't subtract them. */
export function unlinkedLines(content: string): IngredientLine[] {
	return ingredientLines(content).filter((line) => !/\[\[/.test(line.text) && isMeasured(line.text));
}

export interface UnlinkedReviewOptions {
	includeGarnishes?: boolean;
}

/** Measured lines, plus matching unmeasured lines; marked garnishes are opt-in. */
export function reviewUnlinkedLines(
	content: string,
	notes: readonly CabinetNote[],
	options: UnlinkedReviewOptions = {},
): IngredientLine[] {
	const names = new Set(
		notes
			.filter((note) => note.kind !== 'recipe')
			.flatMap((note) => [note.name, ...(note.aliases ?? [])])
			.map(ingredientKey),
	);
	return ingredientLines(content).filter((line) => {
		if (/\[\[/.test(line.text)) return false;
		if (isMeasured(line.text)) return true;
		if (isGarnish(line.text) && !options.includeGarnishes) return false;
		const key = ingredientKey(ingredientParts(line.text).wording);
		return !!key && names.has(key);
	});
}

/** Why `text` can't be a link's display text, or '' when it can. */
export function linkTextError(text: string): string {
	if (!text.trim()) return 'Enter the link text.';
	if (/[|[\]\r\n]/.test(text)) return 'Link text can’t contain brackets or a vertical bar.';
	return '';
}

/**
 * The line with its wording linked to `path`; the amount and list marker stay as written. `link` is the
 * link's text (the whole wording by default), or a wording link keeping words beside it (`link-text.ts`).
 */
export function linkedLine(raw: string, path: string, link?: string | WordingLink): string {
	const marker = raw.match(MARKER)?.[1] ?? '';
	const { prefix, amount, lead, wording, suffix } = ingredientParts(raw.slice(marker.length).trim());
	if (!wording) throw new Error('This line has no ingredient to link.');
	const parts = typeof link === 'object' ? link : { before: '', text: link ?? wording, after: '' };
	if ((link === undefined || typeof link === 'object') && /[|[\]]/.test(wording))
		throw new Error(`“${wording}” has brackets or a vertical bar; link it in the recipe instead.`);
	const error = linkTextError(parts.text);
	if (error) throw new Error(error);
	const linked = `${parts.before}${wikiLink(path, parts.text)}${parts.after}`.trim();
	return marker + [prefix, amount, lead, linked].filter(Boolean).join(' ') + (suffix ?? '');
}

/** A line as a reader will see it once linked: the text around the link, and the link's text. */
export interface LinkPreview {
	before: string;
	link: string;
	after: string;
}

/** How an ingredient line (without its marker) reads with its wording linked as `link`. */
export function linkedLinePreview(text: string, link: string | WordingLink): LinkPreview {
	const { prefix, amount, lead, suffix } = ingredientParts(text);
	const parts = typeof link === 'object' ? link : { before: '', text: link, after: '' };
	return {
		before: [prefix, amount, lead, parts.before.trim()].filter(Boolean).join(' '),
		link: parts.text.trim(),
		after: parts.after + (suffix ?? ''),
	};
}

/** How `line` reads with the characters from `start` to `end` replaced by a link shown as `text`. */
export function replacedPreview(line: string, start: number, end: number, text: string): LinkPreview {
	return {
		before: plainIngredient(line.slice(0, start).replace(MARKER, '')).trimStart(),
		link: text.trim(),
		after: plainIngredient(line.slice(end)),
	};
}

/** A wiki link in a line: where it starts and ends, and the text a reader sees. Embeds aren't included. */
export interface LinkSpan {
	start: number;
	end: number;
	text: string;
}

export function linkSpans(line: string): LinkSpan[] {
	return [...line.matchAll(/!?\[\[([^\]]+)\]\]/g)]
		.filter((match) => !match[0].startsWith('!'))
		.map((match) => ({
			start: match.index,
			end: match.index + match[0].length,
			text: plainIngredient(match[0]),
		}));
}

/** The link the cursor is in or touching, if any. */
export const linkAt = (line: string, ch: number) => linkSpans(line).find((span) => ch >= span.start && ch <= span.end);

/** The line with the link at `span` pointed at `path`, shown as `text`; the rest of the line stays as written. */
export function replaceLink(line: string, span: LinkSpan, path: string, text: string): string {
	const error = linkTextError(text);
	if (error) throw new Error(error);
	return line.slice(0, span.start) + wikiLink(path, text) + line.slice(span.end);
}

export class StaleLineError extends Error {
	constructor(message = 'The recipe changed. Nothing saved; check the line and try again.') {
		super(message);
		this.name = 'StaleLineError';
	}
}

/** A line to link, as it read when reviewed; `text` is the link's text or a wording link, the line's own wording by default. */
export interface LineEdit {
	line: number;
	raw: string;
	text?: string | WordingLink;
}

/** Link each line, checking it still reads as reviewed; any change aborts the whole note. */
export function linkLines(content: string, edits: readonly LineEdit[], path: string): string {
	const lines = content.split('\n');
	for (const edit of edits) {
		const current = lines[edit.line];
		const cr = current?.endsWith('\r') ? '\r' : '';
		if (current === undefined || current.slice(0, current.length - cr.length) !== edit.raw)
			throw new StaleLineError();
		lines[edit.line] = linkedLine(edit.raw, path, edit.text) + cr;
	}
	return lines.join('\n');
}

export interface UnlinkedUse {
	recipe: CabinetNote;
	line: number;
	raw: string;
	text: string;
}
export interface UnlinkedGroup {
	key: string;
	/** The wording as most recipes write it. */
	wording: string;
	uses: UnlinkedUse[];
}

/** Reviewable unlinked lines grouped by wording, most used first. */
export function groupUnlinked(
	recipes: readonly { note: CabinetNote; content: string }[],
	notes: readonly CabinetNote[] = [],
	options: UnlinkedReviewOptions = {},
): UnlinkedGroup[] {
	const groups = new Map<string, UnlinkedUse[]>();
	for (const { note, content } of recipes) {
		for (const line of reviewUnlinkedLines(content, notes, options)) {
			const key = ingredientKey(ingredientParts(line.text).wording);
			if (!key) continue;
			groups.set(key, [...(groups.get(key) ?? []), { recipe: note, ...line }]);
		}
	}
	return [...groups]
		.map(([key, uses]) => {
			const counts = new Map<string, number>();
			for (const use of uses) {
				const wording = ingredientParts(use.text).wording;
				counts.set(wording, (counts.get(wording) ?? 0) + 1);
			}
			const wording = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
			return { key, wording, uses: uses.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)) };
		})
		.sort(
			(a, b) =>
				new Set(b.uses.map((use) => use.recipe.path)).size -
					new Set(a.uses.map((use) => use.recipe.path)).size || a.key.localeCompare(b.key),
		);
}
