import { wikiLink } from './schema';
import type { CabinetNote } from './schema';

/** Common silent initials, consonant-sounding vowels, and spoken initialisms. */
export function indefiniteArticle(name: string): 'a' | 'an' {
	const text = name.trim().replace(/^[^\p{L}\p{N}]+/u, '');
	if (/^(honest|honou?r|hour|heir)/i.test(text)) return 'an';
	if (/^(oaxac|one(?:\b|-)|once\b|uni(?:t|v|form|on|que|cycle|corn)|use\b|user|usual|util|euro|ewe|eul)/i.test(text)) return 'a';
	const initialism = text.match(/^([A-Z]+)(?=\b|[.])/u)?.[1];
	if (initialism && (initialism.length <= 3 || !/[AEIOU]/.test(initialism))) return /^[AEFHILMNORSX]/.test(initialism) ? 'an' : 'a';
	if (/^(8|11(?:\D|$)|18(?:\D|$))/.test(text)) return 'an';
	const plain = text.normalize('NFD').replace(/\p{M}/gu, '');
	return /^[aeiou]/i.test(plain) ? 'an' : 'a';
}

function dailySentence(recipe: CabinetNote, servings: number, display: string): string {
	if (!Number.isFinite(servings) || servings <= 0) throw new Error('Enter more than 0 servings.');
	return servings === 1 ? `Made ${indefiniteArticle(recipe.name)} ${display}.` : `Made ${servings} servings of ${display}.`;
}

export function dailyLogLine(recipe: CabinetNote, servings: number): string {
	return dailySentence(recipe, servings, wikiLink(recipe.path, recipe.name));
}

/** Readable preview and failure guidance; stored daily entries retain their links. */
export function dailyLogText(recipe: CabinetNote, servings: number): string {
	return dailySentence(recipe, servings, recipe.name);
}

/** A one-off's daily header: servings, name, and the riffed recipe's link target. */
export const ONE_OFF_HEADER = /^Made (?:a|(\d+(?:\.\d+)?) servings of a) one-off(?: \((.+?)\))?(?:, a riff on \[\[([^\]]+)\]\])?:\s*$/;

/** Restrict duplicate matching to made-cocktail sentences, on the same line as the recipe link; a riff isn't the recipe. */
export function hasDailyLog(content: string, recipe: CabinetNote, resolve?: (link: string) => string | null): boolean {
	const full = recipe.path.replace(/\.md$/, '');
	const bare = full.split('/').at(-1)!;
	return content.split(/\r?\n/).some(line => /\bmade\b/i.test(line) && !ONE_OFF_HEADER.test(line) && [...line.matchAll(/\[\[([^\]]+)\]\]/g)].some(match => {
		const target = match[1]!.split('|')[0]!.split('#')[0]!.replace(/\.md$/, '');
		const resolved = resolve?.(target);
		return resolved ? resolved === recipe.path : target === full || target === bare;
	}));
}
