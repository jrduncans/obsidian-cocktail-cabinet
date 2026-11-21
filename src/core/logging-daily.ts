import { wikiLink } from './schema';
import type { CabinetNote } from './schema';

/** Common silent initials, consonant-sounding vowels, and spoken initialisms. */
export function indefiniteArticle(name: string): 'a' | 'an' {
	const text = name.trim().replace(/^[^\p{L}\p{N}]+/u, '');
	if (/^(honest|honou?r|hour|heir)/i.test(text)) return 'an';
	if (/^(oaxac|one(?:\b|-)|once\b|uni(?:t|v|form|on|que|cycle|corn)|use\b|user|usual|util|euro|ewe|eul)/i.test(text))
		return 'a';
	const initialism = text.match(/^([A-Z]+)(?=\b|[.])/u)?.[1];
	if (initialism && (initialism.length <= 3 || !/[AEIOU]/.test(initialism)))
		return /^[AEFHILMNORSX]/.test(initialism) ? 'an' : 'a';
	if (/^(8|11(?:\D|$)|18(?:\D|$))/.test(text)) return 'an';
	const plain = text.normalize('NFD').replace(/\p{M}/gu, '');
	return /^[aeiou]/i.test(plain) ? 'an' : 'a';
}

/**
 * What a log adds to the daily note's alcohol total: mL of ethanol for all servings (a lower bound when
 * some ABVs or amounts are unknown), and the drinks text shown on the “Made …” line.
 */
export interface DailyAlcohol {
	ml: number;
	text: string;
}

/** The daily note's running total of logged alcohol, in mL of ethanol. */
export const DAILY_ALCOHOL_PROP = 'cc-alcohol-ml';

/** The daily total after adding `ml`; a missing or unreadable total starts from 0. Rounded to 0.1 mL. */
export function dailyAlcoholUpdates(properties: Record<string, unknown>, ml: number): Record<string, unknown> {
	if (!Number.isFinite(ml) || ml <= 0) return {};
	const current = properties[DAILY_ALCOHOL_PROP];
	const total = (typeof current === 'number' && Number.isFinite(current) ? current : 0) + ml;
	return { [DAILY_ALCOHOL_PROP]: Math.round(total * 10) / 10 };
}

function dailySentence(recipe: CabinetNote, servings: number, display: string, alcohol?: string): string {
	if (!Number.isFinite(servings) || servings <= 0) throw new Error('Enter more than 0 servings.');
	const suffix = alcohol ? ` (${alcohol})` : '';
	return servings === 1
		? `Made ${indefiniteArticle(recipe.name)} ${display}${suffix}.`
		: `Made ${servings} servings of ${display}${suffix}.`;
}

/** The daily “Made …” line; `alcohol` (“≈ 1.6 drinks”) is added in parentheses when given. */
export function dailyLogLine(recipe: CabinetNote, servings: number, alcohol?: string): string {
	return dailySentence(recipe, servings, wikiLink(recipe.path, recipe.name), alcohol);
}

/** Readable preview and failure guidance; stored daily entries retain their links. */
export function dailyLogText(recipe: CabinetNote, servings: number, alcohol?: string): string {
	return dailySentence(recipe, servings, recipe.name, alcohol);
}

/** The drinks text a daily entry ends with, in parentheses: “≈ 1.6 drinks”, “≥ 1.0 unit”. */
const DRINKS = String.raw`[≈≥] \d+(?:\.\d+)? (?:drinks?|units?)`;

/**
 * A one-off's daily header: servings, name, the riffed recipe's link target, and the drinks text.
 * A name can't be drinks text, so “Made a one-off (≈ 1.6 drinks):” has no name.
 */
export const ONE_OFF_HEADER = new RegExp(
	String.raw`^Made (?:a|(\d+(?:\.\d+)?) servings of a) one-off(?: \((?!${DRINKS}\))(.+?)\))?(?:, a riff on \[\[([^\]]+)\]\])?(?: \((${DRINKS})\))?:\s*$`,
	'u',
);

/** A tasting note's line in the daily note; it names the recipe, so the recipe's backlinks show it. */
export const TASTING_NOTE = /^Tasting note on \[\[([^\]]+)\]\]:/;

export function tastingNoteLine(recipe: CabinetNote, text: string): string {
	const note = text.replace(/\s+/g, ' ').trim();
	if (!note) throw new Error('Write a tasting note first.');
	return `Tasting note on ${wikiLink(recipe.path, recipe.name)}: ${note}`;
}

/** Whether a line's links include the recipe: resolved when possible, else by path or bare name. */
function linksRecipe(line: string, recipe: CabinetNote, resolve?: (link: string) => string | null): boolean {
	const full = recipe.path.replace(/\.md$/, '');
	const bare = full.split('/').at(-1)!;
	return [...line.matchAll(/\[\[([^\]]+)\]\]/g)].some((match) => {
		const target = match[1]!.split('|')[0]!.split('#')[0]!.replace(/\.md$/, '');
		const resolved = resolve?.(target);
		return resolved ? resolved === recipe.path : target === full || target === bare;
	});
}

/** A made-cocktail sentence linking the recipe; a riff or a tasting note isn't one. */
function isLogLine(line: string, recipe: CabinetNote, resolve?: (link: string) => string | null): boolean {
	return (
		/\bmade\b/i.test(line) &&
		!ONE_OFF_HEADER.test(line) &&
		!TASTING_NOTE.test(line) &&
		linksRecipe(line, recipe, resolve)
	);
}

/** Restrict duplicate matching to made-cocktail sentences, on the same line as the recipe link; a riff isn't the recipe. */
export function hasDailyLog(content: string, recipe: CabinetNote, resolve?: (link: string) => string | null): boolean {
	return content.split(/\r?\n/).some((line) => isLogLine(line, recipe, resolve));
}

/**
 * Put a tasting note under the day's last “Made …” line for the recipe, after any notes already there,
 * or at the end of the note when the drink wasn't logged that day.
 */
export function insertTastingNote(
	content: string,
	recipe: CabinetNote,
	line: string,
	resolve?: (link: string) => string | null,
): string {
	const lines = content.split('\n');
	let made = -1;
	lines.forEach((text, index) => {
		if (isLogLine(text.replace(/\r$/, ''), recipe, resolve)) made = index;
	});
	if (made < 0) return `${content}${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
	let at = made + 1;
	while (at < lines.length && TASTING_NOTE.test(lines[at]!) && linksRecipe(lines[at]!, recipe, resolve)) at++;
	lines.splice(at, 0, line);
	return lines.join('\n');
}
