import { fractionAmount, splitIngredient } from './recipe-amount';
import { nameInWording, wholeLinkSource } from './link-text';
import type { LinkTextLevel, WordingLink } from './link-text';
import { ingredientLines, linkSpans, StaleLineError } from './unlinked-lines';
import type { IngredientLine } from './unlinked-lines';
import { wikiLink } from './schema';
import type { CabinetNote } from './schema';

/**
 * One change Tidy ingredient lines offers for a line (docs/link-text.md#adopting-the-cabinet-name-as-you-go):
 * - `fraction`: the fluid-ounce amount written with fraction characters.
 * - `path`: a short link given its full path.
 * - `name`: the link's text becomes the cabinet name; any punctuation stays outside the link.
 * - `move`: the link keeps only the name it contains, and the other words move outside it.
 */
export type TidyKind = 'fraction' | 'path' | 'name' | 'move';

export interface TidyChange {
	kind: TidyKind;
	/** Whether the change starts ticked: the ones the settings would make on their own. */
	ticked: boolean;
	/** For a link's changes, which link in the line, counting from 0. */
	link?: number;
	/** For `fraction`, the amount as written and as it becomes. */
	amount?: { from: string; to: string };
	/** For `path`, the link's target as it becomes. */
	target?: string;
	/** For `name` and `move`, the link's text as written and what replaces it. */
	text?: { from: string; to: WordingLink };
	/** For a link's changes, the note it links to. */
	note?: CabinetNote;
}

export interface TidyLine extends IngredientLine {
	changes: TidyChange[];
}

export interface TidyOptions {
	/** The Link text setting: which differences in a link's text count as the same name. */
	level: LinkTextLevel;
	/** The Fraction characters setting. */
	fractions: boolean;
}

const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;
const LINK = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/;
const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** The changes Tidy ingredient lines offers for one Ingredients line; `resolve` finds the note a link target points to. */
export function tidyChanges(
	raw: string,
	resolve: (target: string) => CabinetNote | undefined,
	options: TidyOptions,
): TidyChange[] {
	const changes: TidyChange[] = [];
	const text = raw.replace(MARKER, '').trim();
	const { amount } = splitIngredient(text);
	if (options.fractions && amount) {
		const to = fractionAmount(amount);
		if (to !== amount) changes.push({ kind: 'fraction', ticked: true, amount: { from: amount, to } });
	}
	linkSpans(raw).forEach((span, link) => {
		const target = raw.slice(span.start, span.end).match(LINK)?.[1]?.trim();
		// A link to a heading or block is left as written.
		const note = target && !target.includes('#') ? resolve(target) : undefined;
		if (!note) return;
		const path = note.path.replace(/\.md$/, '');
		if (target !== path) changes.push({ kind: 'path', ticked: true, link, target: path, note });
		const shown = span.text.trim();
		if (shown === note.name) return;
		const found = nameInWording(shown, note);
		if (found && (hasWords(found.before) || hasWords(found.after))) {
			changes.push({ kind: 'move', ticked: false, link, text: { from: shown, to: found }, note });
			return;
		}
		changes.push({
			kind: 'name',
			ticked: wholeLinkSource(shown, note, options.level) === 'name',
			link,
			text: { from: shown, to: found ?? { before: '', text: note.name, after: '' } },
			note,
		});
	});
	return changes;
}

/**
 * What **Use cabinet name** does to the link at `link` in a line: its text becomes the cabinet name, dropping
 * any other words in it, and a short link gets its full path. Empty when the link already reads that way.
 */
export function cabinetNameChanges(
	raw: string,
	link: number,
	resolve: (target: string) => CabinetNote | undefined,
	options: TidyOptions,
): TidyChange[] {
	return tidyChanges(raw, resolve, options)
		.filter((change) => change.link === link)
		.map((change) =>
			change.kind === 'move'
				? {
						...change,
						kind: 'name' as const,
						text: { ...change.text!, to: { before: '', text: change.note!.name, after: '' } },
					}
				: change,
		);
}

/** Every Ingredients line Tidy ingredient lines would change, with its changes. */
export function tidyLines(
	content: string,
	resolve: (target: string) => CabinetNote | undefined,
	options: TidyOptions,
): TidyLine[] {
	return ingredientLines(content)
		.map((line) => ({ ...line, changes: tidyChanges(line.raw, resolve, options) }))
		.filter((line) => line.changes.length);
}

/** The line with `changes` made; the rest of it stays as written. */
export function tidiedLine(raw: string, changes: readonly TidyChange[]): string {
	let line = raw;
	const spans = linkSpans(raw);
	for (let index = spans.length - 1; index >= 0; index--) {
		const own = changes.filter((change) => change.link === index);
		if (!own.length) continue;
		const span = spans[index]!;
		const [, target, alias] = raw.slice(span.start, span.end).match(LINK) ?? [];
		if (target === undefined) continue;
		const path = own.find((change) => change.kind === 'path')?.target ?? target.trim();
		const text = own.find((change) => change.text)?.text?.to;
		const link = text
			? `${text.before}${wikiLink(path, text.text)}${text.after}`
			: wikiLink(path, alias === undefined ? span.text : alias);
		line = line.slice(0, span.start) + link + line.slice(span.end);
	}
	const fraction = changes.find((change) => change.kind === 'fraction')?.amount;
	if (fraction) {
		const start = line.match(MARKER)?.[0].length ?? line.length - line.trimStart().length;
		if (line.startsWith(fraction.from, start))
			line = line.slice(0, start) + fraction.to + line.slice(start + fraction.from.length);
	}
	return line;
}

/** A line to tidy, as it read when listed, and the ticked changes. */
export interface TidyEdit {
	line: number;
	raw: string;
	changes: readonly TidyChange[];
}

/** Tidy each line, checking it still reads as listed; any change aborts the whole note. */
export function tidyContent(content: string, edits: readonly TidyEdit[]): string {
	const lines = content.split('\n');
	for (const edit of edits) {
		const current = lines[edit.line];
		const cr = current?.endsWith('\r') ? '\r' : '';
		if (current === undefined || current.slice(0, current.length - cr.length) !== edit.raw)
			throw new StaleLineError();
		lines[edit.line] = tidiedLine(edit.raw, edit.changes) + cr;
	}
	return lines.join('\n');
}
