import assert from 'node:assert/strict';
import test from 'node:test';
import { PROP } from '../src/core/schema';
import { renderNote } from '../src/core/notes';
import { stockProperties } from '../src/core/stock';
import type { StockInput } from '../src/core/stock';

function input(overrides: Partial<StockInput> = {}): StockInput {
	return {
		kind: 'bottle', tracking: 'volume', volume: '750', abv: '40',
		open: '375', unopened: '2', remaining: '', availability: 'Unknown',
		form: 'Fresh ingredient', lastPurchasePrice: '', shoppingList: false,
		...overrides,
	};
}

void test('bottle notes store open mL directly, retain fractional ABV, and serialize purchasing fields', () => {
	const properties = stockProperties(input({ lastPurchasePrice: '29.95', shoppingList: true }));
	assert.deepEqual(properties, {
		'cc-stock-tracking': 'volume',
		'cc-volume-ml': 750,
		'cc-abv': 0.4,
		'cc-open-ml': 375,
		'cc-unopened': 2,
		'cc-last-purchase-price': 29.95,
		'cc-shopping-list': true,
	});
	const note = renderNote('Cocktails', { kind: 'bottle', name: 'Test bottle', description: '', properties }, '2026-10-31');
	assert.ok(note.content.includes('cc-open-ml: 375\n'));
	assert.ok(!note.content.includes('cc-open-fraction'));
	assert.ok(!note.content.includes('cc-availability'));
});

void test('unknown amounts and prices remain distinct from known zero in both resource kinds', () => {
	for (const value of ['', '0']) {
		const expected = value === '' ? null : 0;
		const bottle = stockProperties(input({ open: value, unopened: value, volume: '', abv: value, lastPurchasePrice: value }));
		assert.equal(bottle[PROP.open], expected);
		assert.equal(bottle[PROP.unopened], expected);
		assert.equal(bottle[PROP.volume], null);
		assert.equal(bottle[PROP.abv], expected);
		assert.equal(bottle[PROP.lastPurchasePrice], expected);
		assert.equal(bottle[PROP.shoppingList], false);
		const source = stockProperties(input({ kind: 'ingredient', remaining: value }));
		assert.equal(source[PROP.remaining], expected);
	}
});

void test('open stock is bounded by known bottle volume, with positive volumes and whole unopened counts', () => {
	assert.equal(stockProperties(input({ open: '750' }))[PROP.open], 750);
	assert.equal(stockProperties(input({ volume: '', open: '900' }))[PROP.open], 900);
	for (const overrides of [
		{ open: '751' }, { open: '-1' }, { volume: '0' }, { volume: '-750' },
		{ unopened: '1.5' }, { unopened: '-1' }, { abv: '101' }, { abv: '-1' },
		{ open: 'Infinity' }, { unopened: 'NaN' }, { volume: 'unknown' },
	]) {
		assert.throws(() => stockProperties(input(overrides)), JSON.stringify(overrides));
	}
});

void test('either stock kind supports every manual status and ignores inactive volume inputs', () => {
	for (const kind of ['bottle', 'ingredient'] as const) {
		for (const availability of ['Unknown', 'Have', 'Low', 'Out']) {
			const properties = stockProperties(input({
				kind, tracking: 'status', availability, open: 'invalid',
				unopened: '-1', remaining: 'invalid', shoppingList: true,
			}));
			assert.equal(properties[PROP.stockTracking], 'status');
			assert.equal(properties[PROP.availability], availability);
			assert.equal(properties[PROP.shoppingList], true);
			for (const key of [PROP.open, PROP.unopened, PROP.remaining]) assert.ok(!(key in properties));
		}
	}
});

void test('source form is independent of tracking mode and volume mode ignores inactive status', () => {
	for (const form of ['Fresh ingredient', 'Prepared juice', 'Bottled juice', 'Homemade syrup', 'Purchased syrup', 'Other']) {
		const properties = stockProperties(input({
			kind: 'ingredient', form, remaining: '500', availability: 'invalid',
		}));
		assert.equal(properties[PROP.remaining], 500);
		assert.equal(properties[PROP.form], form);
		for (const key of [PROP.volume, PROP.abv, PROP.open, PROP.unopened, PROP.availability]) {
			assert.ok(!(key in properties));
		}
	}
});

void test('invalid stock modes, statuses, source quantities, forms, and prices are rejected', () => {
	for (const overrides of [
		{ tracking: '' }, { tracking: 'count' },
		{ tracking: 'status', availability: 'Plenty' },
		{ kind: 'ingredient' as const, form: 'Unknown' },
		{ kind: 'ingredient' as const, remaining: '-1' },
		{ kind: 'ingredient' as const, remaining: 'Infinity' },
		{ lastPurchasePrice: '-1' }, { lastPurchasePrice: '$25' },
		{ lastPurchasePrice: 'NaN' }, { lastPurchasePrice: 'Infinity' },
	]) {
		assert.throws(() => stockProperties(input(overrides)), JSON.stringify(overrides));
	}
});
