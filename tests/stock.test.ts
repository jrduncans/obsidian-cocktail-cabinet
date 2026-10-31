import assert from 'node:assert/strict';
import test from 'node:test';
import { PROP } from '../src/core/schema';
import { renderNote } from '../src/core/notes';
import { stockProperties } from '../src/core/stock';
import { BottleAmount } from '../src/core/bottle-amount';
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

void test('new bottle starts full once a valid volume is entered and follows volume changes', () => {
	const amount = new BottleAmount();
	assert.equal(amount.toMl(), null);
	for (const volume of ['', '0', '-750', 'unknown', 'Infinity']) {
		amount.setVolume(volume);
		assert.equal(amount.value, '');
	}
	amount.setVolume('750');
	assert.equal(amount.value, '100');
	assert.equal(amount.toMl(), 750);
	amount.setUnit('ml');
	assert.equal(amount.value, '750');
	amount.setVolume('1000');
	assert.equal(amount.value, '1000');
	amount.setUnit('percent');
	assert.equal(amount.value, '100');
	assert.equal(amount.toMl(), 1000);
});

void test('existing bottle percentage estimates save only the calculated mL', () => {
	const amount = new BottleAmount();
	amount.setVolume('750');
	amount.setValue('50');
	const properties = stockProperties(input({ open: amount.value, openUnit: amount.unit }));
	assert.equal(properties[PROP.open], 375);
	assert.ok(!('openUnit' in properties));
	const note = renderNote('Cocktails', { kind: 'bottle', name: 'Half full', description: '', properties }, '2026-10-31');
	assert.ok(note.content.includes('cc-open-ml: 375\n'));
	assert.ok(!note.content.includes('cc-open-fraction'));
	amount.setVolume('1000');
	assert.equal(amount.value, '50');
	assert.equal(amount.toMl(), 500);
	assert.equal(stockProperties(input({ open: '25', openUnit: 'percent' }))[PROP.open], 187.5);
});

void test('direct mL and percent entries preserve the quantity when switching units', () => {
	const amount = new BottleAmount();
	amount.setVolume('750');
	amount.setValue('50');
	amount.setUnit('ml');
	assert.equal(amount.value, '375');
	amount.setValue('150');
	amount.setUnit('percent');
	assert.equal(amount.value, '20');
	amount.setUnit('ml');
	amount.setVolume('1000');
	assert.equal(amount.value, '150');
	assert.equal(amount.toMl(), 150);
});

void test('cleared and zero amounts survive volume edits and unit changes without becoming full', () => {
	for (const value of ['', '0']) {
		const amount = new BottleAmount();
		amount.setVolume('750');
		amount.setValue(value);
		amount.setVolume('1000');
		amount.setUnit('ml');
		amount.setUnit('percent');
		assert.equal(amount.value, value);
		assert.equal(amount.toMl(), value === '' ? null : 0);
		assert.equal(stockProperties(input({ open: value, openUnit: 'percent', volume: '' }))[PROP.open], value === '' ? null : 0);
	}
});

void test('percentage validation requires volume and keeps invalid input when a unit change fails', () => {
	for (const open of ['-1', '101', 'Infinity', 'NaN']) {
		assert.throws(() => stockProperties(input({ open, openUnit: 'percent' })), /Percent full/);
	}
	assert.throws(() => stockProperties(input({ open: '50', openUnit: 'percent', volume: '' })), /bottle volume/);
	assert.throws(() => stockProperties(input({ openUnit: 'ounces' })), /Select percent full or mL/);
	const amount = new BottleAmount();
	amount.setUnit('ml');
	amount.setValue('150');
	assert.throws(() => amount.setUnit('percent'), /bottle volume/);
	assert.equal(amount.unit, 'ml');
	assert.equal(amount.value, '150');
	amount.setVolume('100');
	assert.throws(() => amount.setUnit('percent'), /Remaining in open bottle/);
	assert.equal(amount.value, '150');
	amount.setVolume('750');
	amount.setUnit('percent');
	amount.setValue('101');
	assert.throws(() => amount.setUnit('ml'), /Percent full/);
	assert.equal(amount.unit, 'percent');
	assert.equal(amount.value, '101');
});

void test('stock mode resets preserve unknown instead of restoring a full bottle', () => {
	const amount = new BottleAmount();
	amount.setVolume('750');
	amount.setValue('50');
	amount.reset();
	amount.setVolume('1000');
	amount.setUnit('ml');
	assert.equal(amount.value, '');
	assert.equal(amount.toMl(), null);
	const properties = stockProperties(input({ tracking: 'status', open: 'invalid', openUnit: 'percent' }));
	assert.ok(!(PROP.open in properties));
	assert.equal(properties[PROP.availability], 'Unknown');
});
