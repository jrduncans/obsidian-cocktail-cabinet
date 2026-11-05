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
export interface DrawdownPlan { changes: StockChange[]; errors: string[]; }
export interface SelectedPour { path: string; ml: number; }
const EPSILON = 1e-8;

/** Capture active stock fields; an empty unopened count means zero. */
export function stockSnapshot(note: CabinetNote, properties: Record<string, unknown>): StockSource {
	const keys: string[] = [PROP.kind, PROP.stockTracking];
	if (note.kind === 'bottle') keys.push(PROP.volume);
	if (properties[PROP.stockTracking] === 'volume') {
		keys.push(...(note.kind === 'bottle' ? [PROP.open, PROP.unopened] : [PROP.remaining]));
	} else if (properties[PROP.stockTracking] === 'status') keys.push(PROP.availability);
	const fields = Object.fromEntries(keys.map(key => [key, properties[key]]));
	if (note.kind === 'bottle' && properties[PROP.stockTracking] === 'volume') {
		const unopened = fields[PROP.unopened];
		if (unopened === undefined || unopened === null || (typeof unopened === 'string' && !unopened.trim())) fields[PROP.unopened] = 0;
	}
	return { note, fields };
}

export function sameStock(expected: StockSource, current: StockSource): boolean {
	const keys = new Set([...Object.keys(expected.fields), ...Object.keys(current.fields)]);
	return expected.note.path === current.note.path && [...keys].every(key => Object.is(expected.fields[key], current.fields[key]));
}

export function isStocked(source: StockSource): boolean {
	const fields = source.fields;
	if (fields[PROP.stockTracking] !== 'volume') return false;
	const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
	return source.note.kind === 'bottle'
		? positive(fields[PROP.open]) || positive(fields[PROP.unopened])
		: positive(fields[PROP.remaining]);
}

function quantity(fields: Record<string, unknown>, key: string, integer = false): number | null {
	const value = fields[key];
	if (value === undefined || value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
		const labels: Record<string, string> = { [PROP.open]: 'Open amount', [PROP.unopened]: 'Unopened count', [PROP.volume]: 'Bottle size', [PROP.remaining]: 'Amount left' };
		throw new Error(`${labels[key] ?? 'Amount'} must be ${integer ? 'a whole number' : 'a number'}, 0 or more.`);
	}
	return value;
}

export function formatMl(value: number): string { return String(Number(value.toFixed(3))); }

/**
 * A bottle's stock in words: "88% (660 mL), 2 unopened". Percent of the bottle size when known,
 * otherwise mL alone. A missing open amount reads as none open; zero parts are left out.
 */
export function bottleStockText(open: number | null, unopened: number | null, volume: number | null): string {
	const parts: string[] = [];
	if (open !== null && open > 0) {
		const percent = volume !== null && volume > 0 ? open / volume * 100 : null;
		parts.push(percent === null ? `${formatMl(open)} mL` : `${percent < 1 ? '<1' : Math.round(percent)}% (${formatMl(open)} mL)`);
	}
	if (unopened !== null && unopened > 0) parts.push(`${unopened} unopened`);
	return parts.join(', ') || 'None';
}

function drawdown(source: StockSource, consumedMl: number): StockChange {
	const fields = source.fields;
	if (fields[PROP.kind] !== source.note.kind) throw new Error('No longer a bottle or other stock.');
	if (fields[PROP.stockTracking] !== 'volume') throw new Error('Not tracked in mL.');
	if (source.note.kind === 'ingredient') {
		const remaining = quantity(fields, PROP.remaining);
		if (remaining === null) throw new Error('Amount left is unknown.');
		if (consumedMl > remaining + EPSILON) throw new Error(`${formatMl(consumedMl - remaining)} mL short.`);
		return { source, consumedMl, updates: { [PROP.remaining]: Math.max(0, remaining - consumedMl) }, opened: 0 };
	}
	if (source.note.kind !== 'bottle') throw new Error('Select a bottle or other stock.');
	const open = quantity(fields, PROP.open);
	const unopened = quantity(fields, PROP.unopened, true) ?? 0;
	const volume = quantity(fields, PROP.volume);
	if (volume === 0) throw new Error('Bottle size is 0 mL.');
	if (open !== null && volume !== null && open > volume + EPSILON) throw new Error('Open amount is more than the bottle size.');
	if (open !== null && consumedMl <= open + EPSILON) {
		return { source, consumedMl, updates: { [PROP.open]: Math.max(0, open - consumedMl) }, opened: 0 };
	}
	if (unopened === 0) {
		if (open === null) throw new Error('Open amount is unknown and none are unopened.');
		throw new Error(`${formatMl(consumedMl - open)} mL short.`);
	}
	if (volume === null) throw new Error('Bottle size is unknown, so another can’t be opened.');
	const needed = consumedMl - (open ?? 0);
	if (needed > unopened * volume + EPSILON) throw new Error(`${formatMl(needed - unopened * volume)} mL short${open === null ? ' (open amount unknown)' : ''}.`);
	const opened = Math.max(1, Math.ceil((needed - EPSILON) / volume));
	return { source, consumedMl, opened, updates: {
		[PROP.open]: Math.max(0, opened * volume - needed), [PROP.unopened]: unopened - opened,
	} };
}

/** Aggregate each source before arithmetic. Any error invalidates the entire plan. */
export function planDrawdown(sources: readonly StockSource[], pours: readonly SelectedPour[], servings: number): DrawdownPlan {
	if (!Number.isFinite(servings) || servings <= 0) return { changes: [], errors: ['Enter more than 0 servings.'] };
	const totals = new Map<string, number>();
	const errors: string[] = [];
	for (const pour of pours) {
		const ml = pour.ml * servings;
		if (!Number.isFinite(ml) || ml <= 0) { errors.push('Invalid amount.'); continue; }
		totals.set(pour.path, (totals.get(pour.path) ?? 0) + ml);
	}
	const changes: StockChange[] = [];
	for (const [path, ml] of totals) {
		const source = sources.find(item => item.note.path === path);
		try {
			if (!source) throw new Error('Moved or deleted. Select another.');
			if (!Number.isFinite(ml)) throw new Error('Too many servings.');
			changes.push(drawdown(source, ml));
		} catch (error) { errors.push(`${source?.note.name ?? path}: ${error instanceof Error ? error.message : 'Couldn’t calculate.'}`); }
	}
	return { changes, errors };
}
