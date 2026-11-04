import { PROP } from './schema';
import type { LoggingLines, SkippedLine } from './logging-lines';
import { planDrawdown } from './logging-stock';
import type { DrawdownPlan, SelectedPour, StockSource } from './logging-stock';

export interface LoggingPlan extends DrawdownPlan {
	selected: StockSource[];
	skipped: SkippedLine[];
	servings: number;
}

export function planLogging(lines: LoggingLines, sources: readonly StockSource[], selections: ReadonlyMap<number, string>, servings: number): LoggingPlan {
	const errors: string[] = [], pours: SelectedPour[] = [];
	const selected = new Map<string, StockSource>();
	const skipped = [...lines.skipped];
	for (const line of lines.counted) {
		const path = selections.get(line.id);
		const source = sources.find(item => item.note.path === path);
		if (!source) { errors.push(`Select what you used for: ${line.text}`); continue; }
		selected.set(source.note.path, source);
		if (source.fields[PROP.stockTracking] === 'status') {
			skipped.push({ text: line.text, reason: `${source.note.name} tracks availability only, without an amount in mL.` });
		} else pours.push({ path: source.note.path, ml: line.ml });
	}
	const plan = planDrawdown(sources, pours, servings);
	return { ...plan, errors: [...errors, ...plan.errors], selected: [...selected.values()], skipped, servings };
}
