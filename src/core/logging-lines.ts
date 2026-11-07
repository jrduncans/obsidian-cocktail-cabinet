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
export interface SkippedLine {
	text: string;
	reason: string;
	/** The one source the line clearly uses though nothing is subtracted (status-tracked, or no mL amount), for last used. */
	used?: string;
}
/** Selection value for a line the user chose not to subtract. */
export const SKIP_LINE = '__skip__';
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
		if (!links.length) { skipped.push({ text, reason: 'Not linked' }); continue; }
		if (!targets.length) { skipped.push({ text, reason: 'Link not found' }); continue; }
		const linked = targets.map(path => notes.find(note => note.path === path)!);
		const matching = sources.filter(source => linked.some(target => fitsLine(notes, source.note, target)));
		// A named bottle or other stock, else the only source that fits.
		const namedSource = linked.filter(target => target.kind === 'bottle' || target.kind === 'ingredient');
		const used = namedSource.length === 1 ? namedSource[0]!.path : !namedSource.length && matching.length === 1 ? matching[0]!.note.path : undefined;
		const withUse = (line: SkippedLine): SkippedLine => used ? { ...line, used } : line;
		if (ml === null) { skipped.push(withUse({ text, reason: 'No mL or oz amount' })); continue; }
		if (matching.length && matching.every(source => source.fields[PROP.stockTracking] === 'status')) {
			skipped.push(withUse({ text, reason: 'Not tracked in mL' }));
			continue;
		}
		const candidates = matching.filter(isStocked).map(source => source.note.path);
		const named = linked.filter(target => (target.kind === 'bottle' || target.kind === 'ingredient') && candidates.includes(target.path));
		counted.push({ id, text, ml, targets, candidates,
			// Nothing in the cabinet stocks this (e.g. fresh juice): default to not subtracting, still adjustable.
			initialSelection: !matching.length ? SKIP_LINE : named.length === 1 ? named[0]!.path : candidates.length === 1 ? candidates[0]! : null,
		});
	}
	return { counted, skipped };
}
