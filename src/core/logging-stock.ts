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

/** Capture only authoritative stock and identity fields, preserving absent/null/zero. */
export function stockSnapshot(note: CabinetNote, properties: Record<string, unknown>): StockSource {
	const keys: string[] = [PROP.kind, PROP.stockTracking];
	if (note.kind === 'bottle') keys.push(PROP.volume);
	if (properties[PROP.stockTracking] === 'volume') {
		keys.push(...(note.kind === 'bottle' ? [PROP.open, PROP.unopened] : [PROP.remaining]));
	} else if (properties[PROP.stockTracking] === 'status') keys.push(PROP.availability);
	return { note, fields: Object.fromEntries(keys.map(key => [key, properties[key]])) };
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
		throw new Error(`${key} must be a nonnegative ${integer ? 'whole number' : 'number'}, or unknown.`);
	}
	return value;
}

export function formatMl(value: number): string { return String(Number(value.toFixed(3))); }

function drawdown(source: StockSource, consumedMl: number): StockChange {
	const fields = source.fields;
	if (fields[PROP.kind] !== source.note.kind) throw new Error('The stock note kind changed. Reopen the review.');
	if (fields[PROP.stockTracking] !== 'volume') throw new Error('Select a volume-tracked source.');
	if (source.note.kind === 'ingredient') {
		const remaining = quantity(fields, PROP.remaining);
		if (remaining === null) throw new Error('Remaining volume is unknown.');
		if (consumedMl > remaining + EPSILON) throw new Error(`Shortfall: ${formatMl(consumedMl - remaining)} mL.`);
		return { source, consumedMl, updates: { [PROP.remaining]: Math.max(0, remaining - consumedMl) }, opened: 0 };
	}
	if (source.note.kind !== 'bottle') throw new Error('Select a bottle or other-stock source.');
	const open = quantity(fields, PROP.open);
	const unopened = quantity(fields, PROP.unopened, true);
	const volume = quantity(fields, PROP.volume);
	if (volume === 0) throw new Error('Bottle volume must be greater than zero.');
	if (open !== null && volume !== null && open > volume + EPSILON) throw new Error('Open amount exceeds bottle volume.');
	if (open !== null && consumedMl <= open + EPSILON) {
		return { source, consumedMl, updates: { [PROP.open]: Math.max(0, open - consumedMl) }, opened: 0 };
	}
	if (unopened === null) throw new Error('Unopened count is unknown; cannot open another bottle.');
	if (unopened === 0) {
		if (open === null) throw new Error('Open amount is unknown and no unopened bottles are available.');
		throw new Error(`Shortfall: ${formatMl(consumedMl - open)} mL.`);
	}
	if (volume === null) throw new Error('Bottle volume is unknown; cannot open another bottle.');
	const needed = consumedMl - (open ?? 0);
	if (needed > unopened * volume + EPSILON) throw new Error(`Shortfall: ${formatMl(needed - unopened * volume)} mL${open === null ? ' against known unopened stock (open amount unknown)' : ''}.`);
	const opened = Math.max(1, Math.ceil((needed - EPSILON) / volume));
	return { source, consumedMl, opened, updates: {
		[PROP.open]: Math.max(0, opened * volume - needed), [PROP.unopened]: unopened - opened,
	} };
}

/** Aggregate each source before arithmetic. Any error invalidates the entire plan. */
export function planDrawdown(sources: readonly StockSource[], pours: readonly SelectedPour[], servings: number): DrawdownPlan {
	if (!Number.isFinite(servings) || servings <= 0) return { changes: [], errors: ['Servings must be greater than zero.'] };
	const totals = new Map<string, number>();
	const errors: string[] = [];
	for (const pour of pours) {
		const ml = pour.ml * servings;
		if (!Number.isFinite(ml) || ml <= 0) { errors.push('Each pour must be a finite positive volume.'); continue; }
		totals.set(pour.path, (totals.get(pour.path) ?? 0) + ml);
	}
	const changes: StockChange[] = [];
	for (const [path, ml] of totals) {
		const source = sources.find(item => item.note.path === path);
		try {
			if (!source) throw new Error('Selected stock no longer exists.');
			if (!Number.isFinite(ml)) throw new Error('Total pour is too large.');
			changes.push(drawdown(source, ml));
		} catch (error) { errors.push(`${source?.note.name ?? path}: ${error instanceof Error ? error.message : 'Cannot calculate stock.'}`); }
	}
	return { changes, errors };
}
