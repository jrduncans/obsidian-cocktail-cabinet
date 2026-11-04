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
		const labels: Record<string, string> = { [PROP.open]: 'Amount in the open bottle', [PROP.unopened]: 'Unopened bottles', [PROP.volume]: 'Bottle size', [PROP.remaining]: 'Amount remaining' };
		throw new Error(`${labels[key] ?? 'Amount'} must be ${integer ? 'a whole number' : 'a number'} of 0 or more.`);
	}
	return value;
}

export function formatMl(value: number): string { return String(Number(value.toFixed(3))); }

function drawdown(source: StockSource, consumedMl: number): StockChange {
	const fields = source.fields;
	if (fields[PROP.kind] !== source.note.kind) throw new Error('This note is no longer a bottle or ingredient. Open the recipe and try again.');
	if (fields[PROP.stockTracking] !== 'volume') throw new Error('No amount is recorded in mL. Check how this ingredient’s stock is tracked.');
	if (source.note.kind === 'ingredient') {
		const remaining = quantity(fields, PROP.remaining);
		if (remaining === null) throw new Error('Add the amount you have in mL before logging this ingredient.');
		if (consumedMl > remaining + EPSILON) throw new Error(`Not enough left: ${formatMl(consumedMl - remaining)} mL more needed.`);
		return { source, consumedMl, updates: { [PROP.remaining]: Math.max(0, remaining - consumedMl) }, opened: 0 };
	}
	if (source.note.kind !== 'bottle') throw new Error('Select the bottle or ingredient you used.');
	const open = quantity(fields, PROP.open);
	const unopened = quantity(fields, PROP.unopened, true) ?? 0;
	const volume = quantity(fields, PROP.volume);
	if (volume === 0) throw new Error('Enter a bottle size greater than 0 mL.');
	if (open !== null && volume !== null && open > volume + EPSILON) throw new Error('The amount left is greater than the bottle size. Check both amounts.');
	if (open !== null && consumedMl <= open + EPSILON) {
		return { source, consumedMl, updates: { [PROP.open]: Math.max(0, open - consumedMl) }, opened: 0 };
	}
	if (unopened === 0) {
		if (open === null) throw new Error('Add the amount left in the open bottle before logging this drink.');
		throw new Error(`Not enough left: ${formatMl(consumedMl - open)} mL more needed.`);
	}
	if (volume === null) throw new Error('Add the bottle size in mL before opening another bottle.');
	const needed = consumedMl - (open ?? 0);
	if (needed > unopened * volume + EPSILON) throw new Error(`Not enough left: ${formatMl(needed - unopened * volume)} mL more needed${open === null ? '. The amount in the open bottle hasn’t been recorded' : ''}.`);
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
		if (!Number.isFinite(ml) || ml <= 0) { errors.push('Enter a valid amount for each ingredient.'); continue; }
		totals.set(pour.path, (totals.get(pour.path) ?? 0) + ml);
	}
	const changes: StockChange[] = [];
	for (const [path, ml] of totals) {
		const source = sources.find(item => item.note.path === path);
		try {
			if (!source) throw new Error('This bottle or ingredient was moved or deleted. Select another.');
			if (!Number.isFinite(ml)) throw new Error('This amount is too large. Use fewer servings.');
			changes.push(drawdown(source, ml));
		} catch (error) { errors.push(`${source?.note.name ?? path}: ${error instanceof Error ? error.message : 'Could not work out how much is left.'}`); }
	}
	return { changes, errors };
}
