import { indefiniteArticle, ONE_OFF_HEADER } from './logging-daily';
import { wikiLink } from './schema';
import type { CabinetNote } from './schema';
import { plainIngredient } from './unlinked-lines';

/** A drink logged without a recipe note: its ingredient lines, written as a recipe's, and an optional name. */
export interface OneOff {
	name: string;
	lines: string[];
	/** The recipe it started from, named in the daily entry; it isn't counted as made. */
	riffOn?: CabinetNote;
}

/** A one-off found in a daily note: its header's line number, and the parts the header and list hold. */
export interface LoggedOneOff {
	line: number;
	header: string;
	name: string;
	servings: number;
	/** The riffed recipe's link target, as written. */
	riffOn?: string;
	ingredients: string[];
}

export function checkOneOffName(name: string): string {
	const trimmed = name.trim();
	if (/[\r\n[\]]/.test(trimmed)) throw new Error('Keep the name on one line, without square brackets.');
	return trimmed;
}

/** The ingredient lines as a recipe body, so logging reads them exactly as it reads a recipe. */
export function oneOffContent(oneOff: OneOff): string {
	return `### Ingredients\n${oneOff.lines.map(line => `- ${line}`).join('\n')}\n`;
}

function header(oneOff: OneOff, servings: number, riff: string | undefined): string {
	if (!Number.isFinite(servings) || servings <= 0) throw new Error('Enter more than 0 servings.');
	const name = checkOneOffName(oneOff.name);
	const made = servings === 1 ? 'Made a one-off' : `Made ${servings} servings of a one-off`;
	return `${made}${name ? ` (${name})` : ''}${riff ? `, a riff on ${riff}` : ''}`;
}

/** The daily entry: a header sentence and the ingredients per serving, as written in the log dialog. */
export function oneOffDailyEntry(oneOff: OneOff, servings: number): string {
	const riff = oneOff.riffOn && wikiLink(oneOff.riffOn.path, oneOff.riffOn.name);
	return `${header(oneOff, servings, riff)}:\n${oneOff.lines.map(line => `- ${line}`).join('\n')}`;
}

/** The header as a reader sees it, for previews and failure guidance. */
export function oneOffDailyText(oneOff: OneOff, servings: number): string {
	return `${header(oneOff, servings, oneOff.riffOn?.name)}.`;
}

/** Every one-off entry in a note, with the list lines directly under each header. */
export function findOneOffs(content: string): LoggedOneOff[] {
	const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
	const found: LoggedOneOff[] = [];
	lines.forEach((text, line) => {
		const match = text.match(ONE_OFF_HEADER);
		if (!match) return;
		const ingredients: string[] = [];
		for (let next = line + 1; next < lines.length; next++) {
			const item = lines[next]!.match(/^\s*[-*+]\s+(.+?)\s*$/);
			if (!item) break;
			ingredients.push(item[1]!);
		}
		found.push({ line, header: text, name: match[2]?.trim() ?? '', servings: match[1] ? Number(match[1]) : 1, riffOn: match[3]?.split('|')[0], ingredients });
	});
	return found;
}

/** A short label for picking one of several one-offs. */
export function oneOffLabel(oneOff: LoggedOneOff): string {
	const ingredients = oneOff.ingredients.map(plainIngredient).join(', ');
	return oneOff.name ? `${oneOff.name}: ${ingredients}` : ingredients || 'One-off';
}

/** The header once the one-off is a recipe: an ordinary made line, still followed by what was poured. */
export function savedOneOffHeader(oneOff: LoggedOneOff, recipe: CabinetNote): string {
	const link = wikiLink(recipe.path, recipe.name);
	return oneOff.servings === 1 ? `Made ${indefiniteArticle(recipe.name)} ${link}:` : `Made ${oneOff.servings} servings of ${link}:`;
}

/** Replace the header, only if that line still reads as it did when found. */
export function replaceOneOffHeader(content: string, oneOff: LoggedOneOff, replacement: string): string | null {
	const lines = content.split('\n');
	const current = lines[oneOff.line];
	if (current === undefined || current.replace(/\r$/, '') !== oneOff.header) return null;
	lines[oneOff.line] = replacement + (current.endsWith('\r') ? '\r' : '');
	return lines.join('\n');
}
