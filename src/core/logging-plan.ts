import { DEFAULT_VOLUME_UNIT, recipeVolumeMl } from './recipe-amount';
import type { VolumeUnit } from './recipe-amount';
import { PROP } from './schema';
import { SKIP_LINE } from './logging-lines';
import type { LoggingLines, SkippedLine } from './logging-lines';
import { planDrawdown } from './logging-stock';
import type { DrawdownPlan, SelectedPour, StockSource } from './logging-stock';

/** One part of a line split between sources: a source (or none yet) and the amount as typed. */
export interface LinePart {
	path: string | null;
	amount: string;
}
/** A line's choice: one source for the whole pour, `SKIP_LINE`, or parts from several sources. */
export type LineSelection = string | LinePart[];

export interface LoggingPlan extends DrawdownPlan {
	selected: StockSource[];
	/** Sources used without subtracting (see `SkippedLine.used`); logging records their last used too. */
	alsoUsed: string[];
	skipped: SkippedLine[];
	servings: number;
	/** Lines still waiting for a selection. */
	unselected: number;
}

/** A part's amount per serving: mL or oz like a recipe, a bare number as mL, or “rest” to finish what's open. */
export function partAmount(
	amount: string,
	volumeUnit: VolumeUnit = DEFAULT_VOLUME_UNIT,
): { ml: number; rest?: boolean } | null {
	const text = amount.trim();
	if (/^rest$/i.test(text)) return { ml: 0, rest: true };
	const bare = /^\d+(?:[.,]\d+)?$|^[.,]\d+$/.test(text) ? Number(text.replace(',', '.')) : null;
	const ml = bare ?? recipeVolumeMl(text, volumeUnit);
	return ml !== null && Number.isFinite(ml) && ml > 0 ? { ml } : null;
}

export function planLogging(
	lines: LoggingLines,
	sources: readonly StockSource[],
	selections: ReadonlyMap<number, LineSelection>,
	servings: number,
	volumeUnit: VolumeUnit = DEFAULT_VOLUME_UNIT,
	/** Sources to finish off when they can't cover their pours: **Use what's left**. */
	finish: ReadonlySet<string> = new Set(),
): LoggingPlan {
	const pours: SelectedPour[] = [];
	const errors: string[] = [];
	let unselected = 0;
	const selected = new Map<string, StockSource>();
	const skipped = [...lines.skipped];
	for (const line of lines.counted) {
		const choice = selections.get(line.id);
		if (choice === SKIP_LINE) {
			skipped.push({ text: line.text, reason: 'Not subtracted' });
			continue;
		}
		const parts = Array.isArray(choice) ? choice : [{ path: choice ?? null, amount: '' }];
		let missing = false;
		for (const part of parts) {
			const source = sources.find((item) => item.note.path === part.path);
			if (!source) {
				missing = true;
				continue;
			}
			selected.set(source.note.path, source);
			if (source.fields[PROP.stockTracking] === 'status') {
				skipped.push({ text: line.text, reason: `${source.note.name} isn’t tracked in mL` });
				continue;
			}
			if (!Array.isArray(choice)) {
				pours.push({ path: source.note.path, ml: line.ml });
				continue;
			}
			const amount = partAmount(part.amount, volumeUnit);
			if (amount) pours.push({ path: source.note.path, ...amount });
			else errors.push(`${source.note.name}: Enter mL, oz, or “rest”.`);
		}
		if (missing) unselected++;
	}
	const plan = planDrawdown(sources, pours, servings, finish);
	const alsoUsed = [
		...new Set(lines.skipped.flatMap((line) => (line.used && !selected.has(line.used) ? [line.used] : []))),
	];
	return {
		...plan,
		errors: [...errors, ...plan.errors],
		selected: [...selected.values()],
		alsoUsed,
		skipped,
		servings,
		unselected,
	};
}
