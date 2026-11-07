import assert from 'node:assert/strict';
import test from 'node:test';
import { planPurchase, purchaseDefaults, purchaseFields } from '../src/core/purchase';
import { readStockState } from '../src/core/stock-edit';
import { PROP } from '../src/core/schema';
import { StockStore } from '../src/vault/stock-store';
import { TFile } from './obsidian-stub';
import type { App } from 'obsidian';

const bottle = readStockState('bottle', {
	[PROP.stockTracking]: 'volume', [PROP.volume]: 750, [PROP.open]: 300, [PROP.unopened]: 1, [PROP.lastPurchasePrice]: 29.95, [PROP.shoppingList]: true,
});
const syrup = readStockState('ingredient', { [PROP.stockTracking]: 'volume', [PROP.remaining]: 100 });
const limes = readStockState('ingredient', { [PROP.stockTracking]: 'status', [PROP.availability]: 'Out', [PROP.shoppingList]: true });

void test('defaults: one bottle at the saved price and size', () => {
	assert.deepEqual(purchaseDefaults(bottle), { quantity: '1', amount: '', price: '29.95', volume: '750' });
	assert.deepEqual(purchaseDefaults(syrup), { quantity: '1', amount: '', price: '', volume: '' });
	assert.equal(purchaseFields(bottle), 'bottle');
	assert.equal(purchaseFields(syrup), 'amount');
	assert.equal(purchaseFields(limes), 'status');
	assert.throws(() => purchaseFields(readStockState('bottle', {})), /Edit stock/);
});

void test('a bottle purchase adds sealed bottles, updates a changed price, and leaves the shopping list', () => {
	assert.deepEqual(planPurchase(bottle, purchaseDefaults(bottle)), { [PROP.unopened]: 2, [PROP.shoppingList]: false });
	assert.deepEqual(planPurchase(bottle, { ...purchaseDefaults(bottle), quantity: '2', price: '32' }),
		{ [PROP.unopened]: 3, [PROP.lastPurchasePrice]: 32, [PROP.shoppingList]: false });
	assert.deepEqual(planPurchase(bottle, { ...purchaseDefaults(bottle), price: '' }), { [PROP.unopened]: 2, [PROP.shoppingList]: false }, 'blank price keeps it');
	for (const quantity of ['', '0', '1.5', 'two']) assert.throws(() => planPurchase(bottle, { ...purchaseDefaults(bottle), quantity }), quantity);
});

void test('shrinkflation changes the size, unless the open bottle holds more than the new size', () => {
	assert.deepEqual(planPurchase(bottle, { ...purchaseDefaults(bottle), volume: '700' }),
		{ [PROP.unopened]: 2, [PROP.volume]: 700, [PROP.shoppingList]: false });
	const full = readStockState('bottle', { [PROP.stockTracking]: 'volume', [PROP.volume]: 750, [PROP.open]: 720 });
	assert.throws(() => planPurchase(full, { ...purchaseDefaults(full), volume: '700' }), /separate bottle/);
	assert.throws(() => planPurchase(bottle, { ...purchaseDefaults(bottle), volume: '0' }));
});

void test('other stock in mL adds the amount; availability becomes Have', () => {
	assert.deepEqual(planPurchase(syrup, { ...purchaseDefaults(syrup), amount: '500' }), { [PROP.remaining]: 600 });
	const blank = readStockState('ingredient', { [PROP.stockTracking]: 'volume' });
	assert.deepEqual(planPurchase(blank, { ...purchaseDefaults(blank), amount: '250' }), { [PROP.remaining]: 250 });
	assert.throws(() => planPurchase(syrup, purchaseDefaults(syrup)), /how many mL/);
	assert.deepEqual(planPurchase(limes, { ...purchaseDefaults(limes), price: '3' }),
		{ [PROP.availability]: 'Have', [PROP.lastPurchasePrice]: 3, [PROP.shoppingList]: false });
});

void test('recording a purchase re-checks stock and never moves the purchase date backward', async () => {
	const note = { path: 'Cocktails/Bottles/Example.md', name: 'Example', kind: 'bottle' as const, parents: [] };
	const properties: Record<string, unknown> = { [PROP.stockTracking]: 'volume', [PROP.volume]: 750, [PROP.open]: 300, [PROP.unopened]: 1, [PROP.lastPurchased]: '2027-01-01' };
	const app = {
		vault: { getAbstractFileByPath: (path: string) => new TFile(path) },
		fileManager: { processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => { update(properties); } },
	} as unknown as App;
	const store = new StockStore(app);
	const before = readStockState('bottle', properties);
	await store.recordPurchase(note, before, planPurchase(before, purchaseDefaults(before)), '2026-11-06');
	assert.equal(properties[PROP.unopened], 2);
	assert.equal(properties[PROP.lastPurchased], '2027-01-01');
	// Stock that changed since the form read it stops the write.
	await assert.rejects(store.recordPurchase(note, before, { [PROP.unopened]: 9 }, '2026-11-06'), /changed/);
	assert.equal(properties[PROP.unopened], 2);
	// A type bought for only leaves the shopping list.
	const typeProperties: Record<string, unknown> = { [PROP.shoppingList]: true };
	const typeApp = { ...app, fileManager: { processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => { update(typeProperties); } } } as unknown as App;
	await new StockStore(typeApp).recordPurchase({ path: 'Cocktails/Types/Gin.md', name: 'Gin', kind: 'type', parents: [] }, null, { [PROP.shoppingList]: false }, '2026-11-06');
	assert.deepEqual(typeProperties, { [PROP.shoppingList]: false });
});
