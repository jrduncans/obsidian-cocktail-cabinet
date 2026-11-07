import { formatMl } from './logging-stock';
import { optionalNumber, PROP } from './schema';
import type { Properties } from './schema';
import type { StockState } from './stock-edit';

/** What the user entered for one purchase, as typed. */
export interface PurchaseEntry {
	/** Sealed bottles bought (bottles tracked in mL). */
	quantity: string;
	/** mL bought (other stock tracked in mL). */
	amount: string;
	/** Price of one; blank keeps the saved price. */
	price: string;
	/** Bottle size in mL; blank or unchanged keeps it. */
	volume: string;
}

export function purchaseDefaults(state: StockState): PurchaseEntry {
	return {
		quantity: '1',
		amount: '',
		price: state.price === null ? '' : String(state.price),
		volume: state.volume === null ? '' : String(state.volume),
	};
}

/** What the row needs from the user, by how the source is tracked. */
export type PurchaseFields = 'bottle' | 'amount' | 'status';

export function purchaseFields(state: StockState): PurchaseFields {
	if (!state.tracking) throw new Error('Set how its stock is tracked first, with Edit stock.');
	if (state.tracking === 'status') return 'status';
	return state.kind === 'bottle' ? 'bottle' : 'amount';
}

/**
 * Stock and purchasing changes for one purchase: sealed bottles added, mL added, or Have; the
 * price and bottle size when given and changed; off the shopping list. The purchase date is
 * added when saving, so it never moves backward.
 */
export function planPurchase(before: StockState, entry: PurchaseEntry): Properties {
	const updates: Properties = {};
	const fields = purchaseFields(before);
	if (fields === 'status') {
		if (before.availability !== 'Have') updates[PROP.availability] = 'Have';
	} else if (fields === 'bottle') {
		const quantity = optionalNumber(entry.quantity, 'Bottles bought', 1, Infinity, true);
		if (quantity === null) throw new Error('Enter how many bottles you bought.');
		updates[PROP.unopened] = before.unopened + quantity;
		const volume = optionalNumber(entry.volume, 'Bottle size', 0);
		if (volume !== null && volume !== before.volume) {
			if (volume === 0) throw new Error('Bottle size must be more than 0 mL.');
			// The open bottle can't hold more than the new size; logging would refuse it.
			if (before.open !== null && before.open > volume) {
				throw new Error(`The open bottle has ${formatMl(before.open)} mL, more than ${formatMl(volume)} mL. Finish it first, or add the new size as a separate bottle.`);
			}
			updates[PROP.volume] = volume;
		}
	} else {
		const amount = optionalNumber(entry.amount, 'Amount bought', 0);
		if (!amount) throw new Error('Enter how many mL you bought.');
		updates[PROP.remaining] = (before.remaining ?? 0) + amount;
	}
	const price = optionalNumber(entry.price, 'Price', 0);
	if (price !== null && price !== before.price) updates[PROP.lastPurchasePrice] = price;
	if (before.shoppingList) updates[PROP.shoppingList] = false;
	return updates;
}
