import { recipeVolumeMl, splitIngredient } from './recipe-amount';
import { wikiLink } from './schema';
import type { CabinetNote } from './schema';

/** A line of a recipe's Ingredients section: its line number in the note, as written, and without the list marker. */
export interface IngredientLine { line: number; raw: string; text: string; }

const MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)/;

export function ingredientLines(content: string): IngredientLine[] {
	const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
	const start = lines.findIndex(line => /^#{1,6}\s+Ingredients\s*$/i.test(line));
	if (start < 0) return [];
	const result: IngredientLine[] = [];
	for (let line = start + 1; line < lines.length && !/^#{1,6}\s/.test(lines[line]!); line++) {
		const raw = lines[line]!;
		const text = raw.replace(MARKER, '').trim();
		if (text) result.push({ line, raw, text });
	}
	return result;
}

/** Links shown as their display text, as a reader sees them. */
export const plainIngredient = (text: string) =>
	text.replace(/\[\[([^\]]+)\]\]/g, (_link, target: string) => target.includes('|') ? target.split('|').at(-1)! : target.split('/').at(-1)!);

/**
 * The parts of an ingredient line: amount ("1½ oz (45 ml)"), an echoed volume some sources add after it
 * ("/ 45 ml."), and the wording, which becomes a link's display text.
 */
export function ingredientParts(text: string): { amount: string; lead: string; wording: string } {
	const { amount, text: rest } = splitIngredient(plainIngredient(text));
	const echoed = amount ? rest.match(/^(\/\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|oz)\.?)\s+(.+)$/i) : null;
	return echoed ? { amount, lead: echoed[1]!, wording: echoed[2]!.trim() } : { amount, lead: '', wording: rest.trim() };
}

/** Wording compared without case, accents, or spacing differences, so "Gin" and "gin" are one group. */
export function ingredientKey(wording: string): string {
	return wording.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

export const isMeasured = (text: string) => recipeVolumeMl(splitIngredient(plainIngredient(text)).amount) !== null;

/** Measured lines without a link: logging can't subtract them. */
export function unlinkedLines(content: string): IngredientLine[] {
	return ingredientLines(content).filter(line => !/\[\[/.test(line.text) && isMeasured(line.text));
}

/** Why `text` can't be a link's display text, or '' when it can. */
export function linkTextError(text: string): string {
	if (!text.trim()) return 'Enter the link text.';
	if (/[|[\]\r\n]/.test(text)) return 'Link text can’t contain brackets or a vertical bar.';
	return '';
}

/** The line with its wording linked to `path`, shown as `text` (the wording by default); the amount and list marker stay as written. */
export function linkedLine(raw: string, path: string, text?: string): string {
	const marker = raw.match(MARKER)?.[1] ?? '';
	const { amount, lead, wording } = ingredientParts(raw.slice(marker.length).trim());
	if (!wording) throw new Error('This line has no ingredient to link.');
	const shown = text ?? wording;
	if (text === undefined && /[|[\]]/.test(wording)) throw new Error(`“${wording}” has brackets or a vertical bar; link it in the recipe instead.`);
	const error = linkTextError(shown);
	if (error) throw new Error(error);
	return marker + [amount, lead, wikiLink(path, shown)].filter(Boolean).join(' ');
}

/** A line as a reader will see it once linked: the text around the link, and the link's text. */
export interface LinkPreview { before: string; link: string; after: string; }

/** How an ingredient line (without its marker) reads with its wording linked as `text`. */
export function linkedLinePreview(text: string, link: string): LinkPreview {
	const { amount, lead } = ingredientParts(text);
	return { before: [amount, lead].filter(Boolean).join(' '), link: link.trim(), after: '' };
}

/** How `line` reads with the characters from `start` to `end` replaced by a link shown as `text`. */
export function replacedPreview(line: string, start: number, end: number, text: string): LinkPreview {
	return { before: plainIngredient(line.slice(0, start).replace(MARKER, '')).trimStart(), link: text.trim(), after: plainIngredient(line.slice(end)) };
}

/** A wiki link in a line: where it starts and ends, and the text a reader sees. Embeds aren't included. */
export interface LinkSpan { start: number; end: number; text: string; }

export function linkSpans(line: string): LinkSpan[] {
	return [...line.matchAll(/!?\[\[([^\]]+)\]\]/g)].filter(match => !match[0].startsWith('!')).map(match => ({
		start: match.index, end: match.index + match[0].length, text: plainIngredient(match[0]),
	}));
}

/** The link the cursor is in or touching, if any. */
export const linkAt = (line: string, ch: number) => linkSpans(line).find(span => ch >= span.start && ch <= span.end);

/** The line with the link at `span` pointed at `path`, shown as `text`; the rest of the line stays as written. */
export function replaceLink(line: string, span: LinkSpan, path: string, text: string): string {
	const error = linkTextError(text);
	if (error) throw new Error(error);
	return line.slice(0, span.start) + wikiLink(path, text) + line.slice(span.end);
}

export class StaleLineError extends Error {
	constructor(message = 'The recipe changed. Nothing saved; check the line and try again.') { super(message); this.name = 'StaleLineError'; }
}

/** A line to link, as it read when reviewed; `text` is the link's text, the line's own wording by default. */
export interface LineEdit { line: number; raw: string; text?: string; }

/** Link each line, checking it still reads as reviewed; any change aborts the whole note. */
export function linkLines(content: string, edits: readonly LineEdit[], path: string): string {
	const lines = content.split('\n');
	for (const edit of edits) {
		const current = lines[edit.line];
		const cr = current?.endsWith('\r') ? '\r' : '';
		if (current === undefined || current.slice(0, current.length - cr.length) !== edit.raw) throw new StaleLineError();
		lines[edit.line] = linkedLine(edit.raw, path, edit.text) + cr;
	}
	return lines.join('\n');
}

export interface UnlinkedUse { recipe: CabinetNote; line: number; raw: string; text: string; }
export interface UnlinkedGroup {
	key: string;
	/** The wording as most recipes write it. */
	wording: string;
	uses: UnlinkedUse[];
}

/** Unlinked measured lines grouped by wording, most used first; `kept` wordings are left out. */
export function groupUnlinked(recipes: readonly { note: CabinetNote; content: string }[], kept: ReadonlySet<string>): UnlinkedGroup[] {
	const groups = new Map<string, UnlinkedUse[]>();
	for (const { note, content } of recipes) {
		for (const line of unlinkedLines(content)) {
			const key = ingredientKey(ingredientParts(line.text).wording);
			if (!key || kept.has(key)) continue;
			groups.set(key, [...groups.get(key) ?? [], { recipe: note, ...line }]);
		}
	}
	return [...groups].map(([key, uses]) => {
		const counts = new Map<string, number>();
		for (const use of uses) {
			const wording = ingredientParts(use.text).wording;
			counts.set(wording, (counts.get(wording) ?? 0) + 1);
		}
		const wording = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
		return { key, wording, uses: uses.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)) };
	}).sort((a, b) => new Set(b.uses.map(use => use.recipe.path)).size - new Set(a.uses.map(use => use.recipe.path)).size || a.key.localeCompare(b.key));
}
