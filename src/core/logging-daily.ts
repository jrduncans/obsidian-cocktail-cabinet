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

export function dailyLogLine(recipe: CabinetNote, servings: number): string {
	if (!Number.isFinite(servings) || servings <= 0) throw new Error('Servings must be greater than zero.');
	const link = wikiLink(recipe.path, recipe.name);
	return servings === 1 ? `Made ${indefiniteArticle(recipe.name)} ${link}.` : `Made ${servings} servings of ${link}.`;
}

/** Restrict duplicate matching to made-cocktail sentences, on the same line as the recipe link. */
export function hasDailyLog(content: string, recipe: CabinetNote, resolve?: (link: string) => string | null): boolean {
	const full = recipe.path.replace(/\.md$/, '');
	const bare = full.split('/').at(-1)!;
	return content.split(/\r?\n/).some(line => /\bmade\b/i.test(line) && [...line.matchAll(/\[\[([^\]]+)\]\]/g)].some(match => {
		const target = match[1]!.split('|')[0]!.split('#')[0]!.replace(/\.md$/, '');
		const resolved = resolve?.(target);
		return resolved ? resolved === recipe.path : target === full || target === bare;
	}));
}
