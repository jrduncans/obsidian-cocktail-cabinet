import { bottleStockText, formatMl } from './logging-stock';
import { optionalNumber, PROP } from './schema';
import type { Properties } from './schema';
import { AVAILABILITY } from './stock';
import type { StockTracking } from './stock';

export type StockKind = 'bottle' | 'ingredient';

/** A bottle's or other stock's current stock and purchasing fields, as the edit form sees them. */
export interface StockState {
	kind: StockKind;
	tracking: StockTracking | null;
	volume: number | null;
	open: number | null;
	unopened: number;
	remaining: number | null;
	availability: string;
	price: number | null;
	shoppingList: boolean;
	/** Values that couldn't be read and are shown as unknown. Left as they are unless edited. */
	problems: string[];
}

/** Form values. The open amount is already mL; the form converts percent itself. */
export interface StockEdit {
	tracking: string;
	open: number | null;
	unopened: string;
	remaining: string;
	availability: string;
	price: string;
	shoppingList: boolean;
}

export interface StockEditPlan {
	after: StockState;
	/** Properties to set. Only changed values, unless the tracking mode changes. */
	updates: Properties;
	/** The previous mode's stock fields, removed when the mode changes. */
	remove: string[];
	changed: boolean;
}

const MODE_FIELDS: Record<StockKind, Record<StockTracking, string[]>> = {
	bottle: { volume: [PROP.open, PROP.unopened], status: [PROP.availability] },
	ingredient: { volume: [PROP.remaining], status: [PROP.availability] },
};

export function readStockState(kind: StockKind, properties: Record<string, unknown>): StockState {
	const problems: string[] = [];
	// `empty` is what a blank value reads as: 0 for stock amounts, unknown (null) for size and price.
	// A value that isn't a number reads as null, and is left as it is unless edited.
	const amount = (key: string, label: string, integer = false, empty: number | null = null): number | null => {
		const value = properties[key];
		if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return empty;
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value)))
			return value;
		problems.push(`${label} isn’t ${integer ? 'a whole number' : 'a number'}: ${JSON.stringify(value)}.`);
		return null;
	};
	const tracking = properties[PROP.stockTracking];
	const availability = properties[PROP.availability];
	return {
		kind,
		tracking: tracking === 'volume' || tracking === 'status' ? tracking : null,
		volume: kind === 'bottle' ? amount(PROP.volume, 'Bottle size') : null,
		open: kind === 'bottle' ? amount(PROP.open, 'Open amount', false, 0) : null,
		unopened: kind === 'bottle' ? (amount(PROP.unopened, 'Unopened count', true, 0) ?? 0) : 0,
		remaining: kind === 'ingredient' ? amount(PROP.remaining, 'Amount left', false, 0) : null,
		availability: typeof availability === 'string' && availability in AVAILABILITY ? availability : 'Unknown',
		price: amount(PROP.lastPurchasePrice, 'Last purchase price'),
		shoppingList: properties[PROP.shoppingList] === true,
		problems,
	};
}

export function editFromState(state: StockState): StockEdit {
	return {
		tracking: state.tracking ?? (state.kind === 'bottle' ? 'volume' : 'status'),
		open: state.open,
		unopened: state.unopened ? String(state.unopened) : '',
		remaining: state.remaining === null ? '' : String(state.remaining),
		availability: state.availability,
		price: state.price === null ? '' : String(state.price),
		shoppingList: state.shoppingList,
	};
}

export function describeStock(state: StockState): string {
	if (state.tracking === 'status') return state.availability;
	if (state.tracking !== 'volume') return 'Tracking not set';
	if (state.kind === 'bottle') return bottleStockText(state.open, state.unopened, state.volume);
	return state.remaining === null ? 'Amount unknown' : `${formatMl(state.remaining)} mL`;
}

/** A purchase: one more sealed bottle, or Have; either way, off the shopping list. */
export function boughtMore(edit: StockEdit, kind: StockKind): StockEdit {
	const next = { ...edit, shoppingList: false };
	if (edit.tracking === 'status') next.availability = 'Have';
	else if (kind === 'bottle') next.unopened = String((Number(edit.unopened) || 0) + 1);
	return next;
}

/** The open bottle or source is empty. Sealed bottles stay; logging opens one when needed. */
export function finished(edit: StockEdit, kind: StockKind): StockEdit {
	if (edit.tracking === 'status') return { ...edit, availability: 'Out' };
	return kind === 'bottle' ? { ...edit, open: 0 } : { ...edit, remaining: '0' };
}

export function planStockEdit(before: StockState, edit: StockEdit): StockEditPlan {
	if (edit.tracking !== 'volume' && edit.tracking !== 'status') throw new Error('Select how to track stock.');
	const tracking: StockTracking = edit.tracking;
	const after: StockState = {
		...before,
		tracking,
		price: optionalNumber(edit.price, 'Last purchase price', 0),
		shoppingList: edit.shoppingList,
		problems: [],
	};
	if (tracking === 'status') {
		if (!(edit.availability in AVAILABILITY)) throw new Error('Select an availability status.');
		after.availability = edit.availability;
	} else if (before.kind === 'bottle') {
		const open = edit.open;
		if (open !== null && open !== before.open) {
			if (!Number.isFinite(open) || open < 0) throw new Error('Open amount must be 0 or more.');
			if (before.volume !== null && open > before.volume)
				throw new Error(`Open amount can’t be more than the ${formatMl(before.volume)} mL bottle.`);
		}
		// A cleared field is 0; an unreadable saved value stays unless a new one is entered.
		after.open = open ?? (before.open === null ? null : 0);
		after.unopened = optionalNumber(edit.unopened, 'Unopened bottles', 0, Infinity, true) ?? 0;
	} else {
		after.remaining = optionalNumber(edit.remaining, 'Amount left', 0) ?? (before.remaining === null ? null : 0);
	}

	const switched = tracking !== before.tracking;
	const values: Record<string, string | number | null> = {
		[PROP.open]: after.open,
		[PROP.unopened]: after.unopened,
		[PROP.remaining]: after.remaining,
		[PROP.availability]: after.availability,
	};
	const previous: Record<string, string | number | null> = {
		[PROP.open]: before.open,
		[PROP.unopened]: before.unopened,
		[PROP.remaining]: before.remaining,
		[PROP.availability]: before.availability,
	};
	const updates: Properties = {};
	if (switched) updates[PROP.stockTracking] = tracking;
	for (const key of MODE_FIELDS[before.kind][tracking]) {
		if (switched || !Object.is(values[key], previous[key])) updates[key] = values[key] ?? null;
	}
	if (!Object.is(after.price, before.price)) updates[PROP.lastPurchasePrice] = after.price;
	if (after.shoppingList !== before.shoppingList) updates[PROP.shoppingList] = after.shoppingList;
	const remove = switched && before.tracking ? MODE_FIELDS[before.kind][before.tracking] : [];
	return { after, updates, remove, changed: Object.keys(updates).length > 0 };
}

/** Whether a fresh read still matches what the form was opened with. */
export function sameStockState(expected: StockState, current: StockState): boolean {
	const keys: (keyof StockState)[] = [
		'kind',
		'tracking',
		'volume',
		'open',
		'unopened',
		'remaining',
		'availability',
		'price',
		'shoppingList',
	];
	return keys.every((key) => Object.is(expected[key], current[key]));
}
