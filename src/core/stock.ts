import { optionalNumber, PROP } from './schema';
import type { Properties } from './schema';

export const STOCK_TRACKING = { volume: 'Amount (mL)', status: 'Availability' } as const;
export type StockTracking = keyof typeof STOCK_TRACKING;

export const AVAILABILITY = {
	Unknown: 'Unknown',
	Have: 'Have',
	Low: 'Low',
	Out: 'Out',
} as const;

/** Other stock that is its own ingredient: it provides no type, and recipes link it directly. */
export const KITCHEN_STAPLE_FORM = 'Kitchen staple';

export const STOCK_FORMS = {
	'Fresh ingredient': 'Fresh ingredient',
	'Prepared juice': 'Prepared juice',
	'Bottled juice': 'Bottled juice',
	'Homemade syrup': 'Homemade syrup',
	'Purchased syrup': 'Purchased syrup',
	[KITCHEN_STAPLE_FORM]: KITCHEN_STAPLE_FORM,
	Other: 'Other',
} as const;

/** The answer to **Add stock**'s What is it? that makes a bottle; every other answer is an other-stock Form. */
export const BOTTLE_ANSWER = 'Bottle';

/** **Add stock**'s first question, in order: nothing chosen yet, a bottle, then each other-stock Form. */
export const STOCK_ANSWERS: readonly (readonly [string, string])[] = [
	['', 'Choose…'],
	[BOTTLE_ANSWER, 'Bottle'],
	...Object.entries(STOCK_FORMS),
];

/** The note kind an answer to What is it? creates, or null before one is chosen. */
export function stockKind(answer: string): 'bottle' | 'ingredient' | null {
	if (answer === BOTTLE_ANSWER) return 'bottle';
	return Object.keys(STOCK_FORMS).includes(answer) ? 'ingredient' : null;
}

/** How new stock is tracked unless changed: bottles in mL, everything else by availability. */
export function defaultTracking(answer: string): 'volume' | 'status' {
	return answer === BOTTLE_ANSWER ? 'volume' : 'status';
}

/** Forms whose sources are made at home and would otherwise be named after their type. */
const HOUSE_FORMS: readonly string[] = ['Homemade syrup', 'Prepared juice'];

/** The suggested name for other stock: "House <type>" for homemade forms, otherwise none. */
export function houseName(form: string, typeName: string | undefined): string {
	return typeName && HOUSE_FORMS.includes(form) ? `House ${typeName}` : '';
}

/**
 * The name field after the suggestion changes: follow the suggestion while the field is
 * blank or still shows the previous one, and keep anything the user typed.
 */
export function suggestedName(current: string, previous: string, next: string): string {
	return !current.trim() || current === previous ? next : current;
}

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
		throw new Error('Select how to track stock.');
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
		properties[PROP.abv] = abv === null ? null : Number((abv / 100).toFixed(6));
	} else {
		if (!Object.keys(STOCK_FORMS).includes(input.form)) throw new Error('Select an ingredient form.');
		properties[PROP.form] = input.form;
	}

	if (input.tracking === 'status') {
		if (!Object.keys(AVAILABILITY).includes(input.availability)) throw new Error('Select an availability status.');
		properties[PROP.availability] = input.availability;
	} else if (input.kind === 'bottle') {
		const volume = properties[PROP.volume];
		properties[PROP.open] = openBottleMl(
			input.open,
			input.openUnit ?? 'ml',
			typeof volume === 'number' ? volume : null,
		);
		properties[PROP.unopened] = optionalNumber(input.unopened, 'Unopened bottles', 0, Infinity, true) ?? 0;
	} else {
		properties[PROP.remaining] = optionalNumber(input.remaining, 'Remaining volume', 0);
	}
	return properties;
}

/** A kitchen staple's properties: tracked by availability, with no Provides. */
export function stapleProperties(availability: string): Properties {
	return stockProperties({
		kind: 'ingredient',
		tracking: 'status',
		volume: '',
		abv: '',
		open: '',
		unopened: '',
		remaining: '',
		availability,
		form: KITCHEN_STAPLE_FORM,
		lastPurchasePrice: '',
		shoppingList: false,
	});
}
