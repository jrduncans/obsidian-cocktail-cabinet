import { ingredientSection } from './notes';
import { recipeVolumeMl, splitIngredient } from './recipe-amount';
import { isWithin } from './relationships';
import { PROP } from './schema';
import type { CabinetNote } from './schema';
import { isStocked } from './logging-stock';
import type { StockSource } from './logging-stock';

export interface CountedLine {
	id: number;
	text: string;
	ml: number;
	targets: string[];
	candidates: string[];
	initialSelection: string | null;
}
export interface SkippedLine { text: string; reason: string; }
export interface LoggingLines { counted: CountedLine[]; skipped: SkippedLine[]; }

/** A named bottle widens only to bottles with its explicitly assigned type. */
export function fitsLine(notes: readonly CabinetNote[], source: CabinetNote, target: CabinetNote): boolean {
	if (source.path === target.path) return true;
	if (target.kind === 'bottle') return source.kind === 'bottle' && target.parents.some(path => source.parents.includes(path));
	if (target.kind === 'ingredient') return false;
	return isWithin(notes, source.path, target.path);
}

export function classifyLoggingLines(
	content: string, notes: readonly CabinetNote[], sources: readonly StockSource[],
	resolve: (link: string) => string | null,
): LoggingLines {
	const counted: CountedLine[] = [], skipped: SkippedLine[] = [];
	for (const [id, raw] of ingredientSection(content).split(/\r?\n/).entries()) {
		const text = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
		if (!text) continue;
		const links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)];
		const targets = [...new Set(links.flatMap(match => {
			const path = resolve(match[1]!);
			const note = notes.find(item => item.path === path && item.kind !== 'recipe');
			return note ? [note.path] : [];
		}))];
		const ml = recipeVolumeMl(splitIngredient(text).amount);
		let reason: string | undefined;
		if (!links.length) reason = 'Not linked to an ingredient in your cabinet.';
		else if (!targets.length) reason = 'The linked ingredient could not be found in your cabinet.';
		else if (ml === null) reason = 'No measured amount, such as mL or oz.';
		if (reason) { skipped.push({ text, reason }); continue; }
		const linked = targets.map(path => notes.find(note => note.path === path)!);
		const matching = sources.filter(source => linked.some(target => fitsLine(notes, source.note, target)));
		if (matching.length && matching.every(source => source.fields[PROP.stockTracking] === 'status')) {
			skipped.push({ text, reason: 'Tracks availability only, without an amount in mL.' });
			continue;
		}
		const candidates = matching.filter(isStocked).map(source => source.note.path);
		const named = linked.filter(target => (target.kind === 'bottle' || target.kind === 'ingredient') && candidates.includes(target.path));
		counted.push({ id, text, ml: ml!, targets, candidates,
			initialSelection: named.length === 1 ? named[0]!.path : candidates.length === 1 ? candidates[0]! : null,
		});
	}
	return { counted, skipped };
}
