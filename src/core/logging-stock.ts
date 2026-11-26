import { PROP } from './schema';
import type { CabinetNote } from './schema';

export interface StockSource {
	note: CabinetNote;
	fields: Record<string, unknown>;
}
export interface StockChange {
	source: StockSource;
	consumedMl: number;
	updates: Record<string, number>;
	opened: number;
}
export interface DrawdownPlan {
	changes: StockChange[];
	errors: string[];
	/** Sources whose stock can't cover their pours, with their error; editing their stock may fix it. */
	blocked: { path: string; error: string }[];
}
/** `rest` takes everything open in a bottle, or all of other stock's amount, whatever the servings: finishing it off. */
export interface SelectedPour {
	path: string;
	ml: number;
	rest?: boolean;
}
const EPSILON = 1e-8;

/** Capture active stock fields; an empty unopened count means zero. */
export function stockSnapshot(note: CabinetNote, properties: Record<string, unknown>): StockSource {
	const keys: string[] = [PROP.kind, PROP.stockTracking];
	if (note.kind === 'bottle') keys.push(PROP.volume);
	if (properties[PROP.stockTracking] === 'volume') {
		keys.push(...(note.kind === 'bottle' ? [PROP.open, PROP.unopened] : [PROP.remaining]));
	} else if (properties[PROP.stockTracking] === 'status') keys.push(PROP.availability);
	const fields = Object.fromEntries(keys.map((key) => [key, properties[key]]));
	if (note.kind === 'bottle' && properties[PROP.stockTracking] === 'volume') {
		const unopened = fields[PROP.unopened];
		if (unopened === undefined || unopened === null || (typeof unopened === 'string' && !unopened.trim()))
			fields[PROP.unopened] = 0;
	}
	return { note, fields };
}

export function sameStock(expected: StockSource, current: StockSource): boolean {
	const keys = new Set([...Object.keys(expected.fields), ...Object.keys(current.fields)]);
	return (
		expected.note.path === current.note.path &&
		[...keys].every((key) => Object.is(expected.fields[key], current.fields[key]))
	);
}

export function isStocked(source: StockSource): boolean {
	const fields = source.fields;
	if (fields[PROP.stockTracking] !== 'volume') return false;
	const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
	return source.note.kind === 'bottle'
		? positive(fields[PROP.open]) || positive(fields[PROP.unopened])
		: positive(fields[PROP.remaining]);
}

/** An empty amount is null; callers read an empty open, unopened, or remaining amount as 0. */
function quantity(fields: Record<string, unknown>, key: string, integer = false): number | null {
	const value = fields[key];
	if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
		const labels: Record<string, string> = {
			[PROP.open]: 'Open amount',
			[PROP.unopened]: 'Unopened count',
			[PROP.volume]: 'Bottle size',
			[PROP.remaining]: 'Amount left',
		};
		throw new Error(`${labels[key] ?? 'Amount'} must be ${integer ? 'a whole number' : 'a number'}, 0 or more.`);
	}
	return value;
}

/**
 * mL for display: whole mL, as the Bases show stock, with one decimal below 10 mL so a dash still reads.
 * Stock is saved exactly; only what's shown is rounded.
 */
export function formatMl(value: number): string {
	return String(Math.abs(value) < 10 ? Number(value.toFixed(1)) : Math.round(value));
}

/**
 * A bottle's stock in words: "88% (660 mL), 2 unopened". Percent of the bottle size when known,
 * otherwise mL alone. A missing open amount reads as none open; zero parts are left out.
 */
export function bottleStockText(open: number | null, unopened: number | null, volume: number | null): string {
	const parts: string[] = [];
	if (open !== null && open > 0) {
		const percent = volume !== null && volume > 0 ? (open / volume) * 100 : null;
		parts.push(
			percent === null
				? `${formatMl(open)} mL`
				: `${percent < 1 ? '<1' : Math.round(percent)}% (${formatMl(open)} mL)`,
		);
	}
	if (unopened !== null && unopened > 0) parts.push(`${unopened} unopened`);
	return parts.join(', ') || 'None';
}

/** What's left to pour without opening another bottle; 0 when it can't be read. */
function openMl(source: StockSource): number {
	if (source.fields[PROP.stockTracking] !== 'volume') return 0;
	const value = source.fields[source.note.kind === 'bottle' ? PROP.open : PROP.remaining];
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function drawdown(source: StockSource, consumedMl: number): StockChange {
	const fields = source.fields;
	if (fields[PROP.kind] !== source.note.kind) throw new Error('No longer a bottle or other stock.');
	if (fields[PROP.stockTracking] !== 'volume') throw new Error('Not tracked in mL.');
	if (source.note.kind === 'ingredient') {
		const remaining = quantity(fields, PROP.remaining) ?? 0;
		if (consumedMl > remaining + EPSILON) throw new Error(`${formatMl(consumedMl - remaining)} mL short.`);
		return { source, consumedMl, updates: { [PROP.remaining]: Math.max(0, remaining - consumedMl) }, opened: 0 };
	}
	if (source.note.kind !== 'bottle') throw new Error('Select a bottle or other stock.');
	const open = quantity(fields, PROP.open) ?? 0;
	const unopened = quantity(fields, PROP.unopened, true) ?? 0;
	const volume = quantity(fields, PROP.volume);
	if (volume === 0) throw new Error('Bottle size is 0 mL.');
	if (volume !== null && open > volume + EPSILON) throw new Error('Open amount is more than the bottle size.');
	if (consumedMl <= open + EPSILON) {
		return { source, consumedMl, updates: { [PROP.open]: Math.max(0, open - consumedMl) }, opened: 0 };
	}
	if (unopened === 0) throw new Error(`${formatMl(consumedMl - open)} mL short.`);
	if (volume === null) throw new Error('Bottle size is unknown, so another can’t be opened.');
	const needed = consumedMl - open;
	if (needed > unopened * volume + EPSILON) throw new Error(`${formatMl(needed - unopened * volume)} mL short.`);
	const opened = Math.max(1, Math.ceil((needed - EPSILON) / volume));
	return {
		source,
		consumedMl,
		opened,
		updates: {
			[PROP.open]: Math.max(0, opened * volume - needed),
			[PROP.unopened]: unopened - opened,
		},
	};
}

/** Aggregate each source before arithmetic. Any error invalidates the entire plan. */
export function planDrawdown(
	sources: readonly StockSource[],
	pours: readonly SelectedPour[],
	servings: number,
): DrawdownPlan {
	if (!Number.isFinite(servings) || servings <= 0)
		return { changes: [], errors: ['Enter more than 0 servings.'], blocked: [] };
	const totals = new Map<string, number>();
	const errors: string[] = [];
	for (const pour of pours) {
		const source = pour.rest ? sources.find((item) => item.note.path === pour.path) : undefined;
		if (pour.rest && !source) {
			errors.push(`${pour.path}: Moved or deleted. Select another.`);
			continue;
		}
		const ml = source ? openMl(source) : pour.ml * servings;
		if (source && !(ml > 0)) {
			errors.push(`${source.note.name}: Nothing open to finish.`);
			continue;
		}
		if (!Number.isFinite(ml) || ml <= 0) {
			errors.push('Invalid amount.');
			continue;
		}
		totals.set(pour.path, (totals.get(pour.path) ?? 0) + ml);
	}
	const changes: StockChange[] = [];
	const blocked: DrawdownPlan['blocked'] = [];
	for (const [path, ml] of totals) {
		const source = sources.find((item) => item.note.path === path);
		try {
			if (!source) throw new Error('Moved or deleted. Select another.');
			if (!Number.isFinite(ml)) throw new Error('Too many servings.');
			changes.push(drawdown(source, ml));
		} catch (error) {
			const message = `${source?.note.name ?? path}: ${error instanceof Error ? error.message : 'Couldn’t calculate.'}`;
			errors.push(message);
			if (source) blocked.push({ path, error: message });
		}
	}
	return { changes, errors, blocked };
}
