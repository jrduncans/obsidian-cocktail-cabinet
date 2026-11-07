import { PROP } from './schema';
import { SKIP_LINE } from './logging-lines';
import type { LoggingLines, SkippedLine } from './logging-lines';
import { planDrawdown } from './logging-stock';
import type { DrawdownPlan, SelectedPour, StockSource } from './logging-stock';

export interface LoggingPlan extends DrawdownPlan {
	selected: StockSource[];
	/** Sources used without subtracting (see `SkippedLine.used`); logging records their last used too. */
	alsoUsed: string[];
	skipped: SkippedLine[];
	servings: number;
	/** Lines still waiting for a selection. */
	unselected: number;
}

export function planLogging(lines: LoggingLines, sources: readonly StockSource[], selections: ReadonlyMap<number, string>, servings: number): LoggingPlan {
	const pours: SelectedPour[] = [];
	let unselected = 0;
	const selected = new Map<string, StockSource>();
	const skipped = [...lines.skipped];
	for (const line of lines.counted) {
		const path = selections.get(line.id);
		if (path === SKIP_LINE) { skipped.push({ text: line.text, reason: 'Not subtracted' }); continue; }
		const source = sources.find(item => item.note.path === path);
		if (!source) { unselected++; continue; }
		selected.set(source.note.path, source);
		if (source.fields[PROP.stockTracking] === 'status') {
			skipped.push({ text: line.text, reason: `${source.note.name} isn’t tracked in mL` });
		} else pours.push({ path: source.note.path, ml: line.ml });
	}
	const plan = planDrawdown(sources, pours, servings);
	const alsoUsed = [...new Set(lines.skipped.flatMap(line => line.used && !selected.has(line.used) ? [line.used] : []))];
	return { ...plan, selected: [...selected.values()], alsoUsed, skipped, servings, unselected };
}
