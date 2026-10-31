import { optionalNumber, PROP } from './schema';
import type { Properties } from './schema';

export const STOCK_TRACKING = { volume: 'Volume', status: 'Status' } as const;
export type StockTracking = keyof typeof STOCK_TRACKING;

export const AVAILABILITY = {
	Unknown: 'Unknown',
	Have: 'Have',
	Low: 'Low',
	Out: 'Out',
} as const;

export const STOCK_FORMS = {
	'Fresh ingredient': 'Fresh ingredient',
	'Prepared juice': 'Prepared juice',
	'Bottled juice': 'Bottled juice',
	'Homemade syrup': 'Homemade syrup',
	'Purchased syrup': 'Purchased syrup',
	Other: 'Other',
} as const;

export interface StockInput {
	kind: 'bottle' | 'ingredient';
	tracking: string;
	volume: string;
	abv: string;
	open: string;
	openUnit?: string;
	unopened: string;
	remaining: string;
	availability: string;
	form: string;
	lastPurchasePrice: string;
	shoppingList: boolean;
}

/** Accept an estimate or measured mL without storing the input unit. */
export function openBottleMl(value: string, unit: string, volume: number | null): number | null {
	if (unit !== 'ml' && unit !== 'percent') throw new Error('Select percent full or mL.');
	if (unit === 'ml') return optionalNumber(value, 'Remaining in open bottle', 0, volume ?? Infinity);
	const percent = optionalNumber(value, 'Percent full', 0, 100);
	if (percent === null || percent === 0) return percent;
	if (volume === null) throw new Error('Enter the bottle volume to use a percentage estimate.');
	return volume * (percent / 100);
}

/** Validate creation inputs and write only the selected mode's stock fields. */
export function stockProperties(input: StockInput): Properties {
	if (input.tracking !== 'volume' && input.tracking !== 'status') {
		throw new Error('Select volume or status stock tracking.');
	}
	const properties: Properties = {
		[PROP.stockTracking]: input.tracking,
		[PROP.lastPurchasePrice]: optionalNumber(input.lastPurchasePrice, 'Last purchase price', 0),
		[PROP.shoppingList]: input.shoppingList,
	};
	if (input.kind === 'bottle') {
		const volume = optionalNumber(input.volume, 'Bottle volume', 0);
		if (volume === 0) throw new Error('Bottle volume must be greater than zero.');
		const abv = optionalNumber(input.abv, 'Alcohol by volume', 0, 100);
		properties[PROP.volume] = volume;
		properties[PROP.abv] = abv === null ? null : abv / 100;
	} else {
		if (!Object.keys(STOCK_FORMS).includes(input.form)) throw new Error('Select an ingredient form.');
		properties[PROP.form] = input.form;
	}

	if (input.tracking === 'status') {
		if (!Object.keys(AVAILABILITY).includes(input.availability)) throw new Error('Select an availability status.');
		properties[PROP.availability] = input.availability;
	} else if (input.kind === 'bottle') {
		const volume = properties[PROP.volume];
		properties[PROP.open] = openBottleMl(input.open, input.openUnit ?? 'ml', typeof volume === 'number' ? volume : null);
		properties[PROP.unopened] = optionalNumber(input.unopened, 'Unopened bottles', 0, Infinity, true);
	} else {
		properties[PROP.remaining] = optionalNumber(input.remaining, 'Remaining volume', 0);
	}
	return properties;
}
