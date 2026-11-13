import assert from 'node:assert/strict';
import test from 'node:test';
import { PROP } from '../src/core/schema';
import { BottleAmount } from '../src/core/bottle-amount';
import {
	boughtMore,
	describeStock,
	editFromState,
	finished,
	planStockEdit,
	readStockState,
	sameStockState,
} from '../src/core/stock-edit';
import type { StockEdit } from '../src/core/stock-edit';
import { StockStore } from '../src/vault/stock-store';
import { bottleStockText } from '../src/core/logging-stock';
import { COMMON_FORMULAS } from '../src/core/base-formulas';
import { laterDate, madeUpdates, usedUpdates } from '../src/core/usage';
import { TFile } from './obsidian-stub';
import type { App } from 'obsidian';

const bottle = {
	[PROP.kind]: 'bottle',
	[PROP.stockTracking]: 'volume',
	[PROP.volume]: 750,
	[PROP.abv]: 0.25,
	[PROP.open]: 300,
	[PROP.unopened]: 1,
	[PROP.lastPurchasePrice]: 29.95,
	[PROP.shoppingList]: true,
};
const syrup = {
	[PROP.kind]: 'ingredient',
	[PROP.stockTracking]: 'volume',
	[PROP.remaining]: 250,
	[PROP.form]: 'Homemade syrup',
};
const limes = { [PROP.kind]: 'ingredient', [PROP.stockTracking]: 'status', [PROP.availability]: 'Low' };

function edit(
	properties: Record<string, unknown>,
	kind: 'bottle' | 'ingredient',
	overrides: Partial<StockEdit> = {},
): StockEdit {
	return { ...editFromState(readStockState(kind, properties)), ...overrides };
}

void test('current stock is read per mode; blank amounts read as 0, unreadable ones as unknown', () => {
	assert.deepEqual(readStockState('bottle', bottle), {
		kind: 'bottle',
		tracking: 'volume',
		volume: 750,
		open: 300,
		unopened: 1,
		remaining: null,
		availability: 'Unknown',
		price: 29.95,
		shoppingList: true,
		problems: [],
	});
	assert.equal(readStockState('bottle', { ...bottle, [PROP.open]: null, [PROP.unopened]: null }).open, 0);
	assert.equal(readStockState('bottle', { ...bottle, [PROP.open]: ' ' }).open, 0);
	assert.equal(readStockState('ingredient', { ...syrup, [PROP.remaining]: null }).remaining, 0);
	assert.equal(
		readStockState('bottle', { ...bottle, [PROP.volume]: null }).volume,
		null,
		'bottle size stays unknown',
	);
	assert.equal(readStockState('bottle', { ...bottle, [PROP.unopened]: null }).unopened, 0);
	assert.equal(readStockState('ingredient', limes).availability, 'Low');
	assert.equal(readStockState('ingredient', { [PROP.kind]: 'ingredient' }).tracking, null);
	const broken = readStockState('bottle', { ...bottle, [PROP.open]: 'half', [PROP.unopened]: 1.5 });
	assert.equal(broken.open, null);
	assert.equal(broken.problems.length, 2);
});

void test('summaries match the Stock sections', () => {
	assert.equal(describeStock(readStockState('bottle', bottle)), '40% (300 mL), 1 unopened');
	assert.equal(describeStock(readStockState('bottle', { ...bottle, [PROP.open]: null })), '1 unopened');
	assert.equal(describeStock(readStockState('bottle', { ...bottle, [PROP.unopened]: 0 })), '40% (300 mL)');
	assert.equal(
		describeStock(readStockState('bottle', { ...bottle, [PROP.volume]: null, [PROP.unopened]: 0 })),
		'300 mL',
	);
	assert.equal(
		describeStock(readStockState('bottle', { ...bottle, [PROP.open]: null, [PROP.unopened]: null })),
		'None',
	);
	assert.equal(describeStock(readStockState('bottle', { ...bottle, [PROP.open]: 0, [PROP.unopened]: 0 })), 'None');
	assert.equal(describeStock(readStockState('ingredient', syrup)), '250 mL');
	assert.equal(describeStock(readStockState('ingredient', { ...syrup, [PROP.remaining]: null })), '0 mL');
	assert.equal(describeStock(readStockState('ingredient', limes)), 'Low');
	assert.equal(describeStock(readStockState('ingredient', {})), 'Tracking not set');
});

void test('bottle stock text drops zero parts and says None when there is nothing', () => {
	assert.equal(bottleStockText(660, 0, 750), '88% (660 mL)');
	assert.equal(bottleStockText(660.4, 2, 750), '88% (660.4 mL), 2 unopened');
	assert.equal(bottleStockText(660, 0, null), '660 mL');
	assert.equal(bottleStockText(5, 0, 750), '<1% (5 mL)');
	assert.equal(bottleStockText(7.5, 0, 750), '1% (7.5 mL)');
	assert.equal(bottleStockText(null, 1, 750), '1 unopened');
	assert.equal(bottleStockText(0, null, 750), 'None');
	assert.equal(bottleStockText(null, null, null), 'None');
});

void test('the Stock formula follows the same wording', () => {
	const stock = COMMON_FORMULAS.stock;
	assert.ok(stock.includes('"None"'));
	assert.ok(stock.includes('" unopened"') && stock.includes('"<1"') && !stock.includes('mL open'));
});

void test('an unchanged form writes nothing', () => {
	for (const [kind, properties] of [
		['bottle', bottle],
		['ingredient', syrup],
		['ingredient', limes],
	] as const) {
		const plan = planStockEdit(readStockState(kind, properties), edit(properties, kind));
		assert.equal(plan.changed, false, JSON.stringify(properties));
		assert.deepEqual(plan.updates, {});
		assert.deepEqual(plan.remove, []);
	}
});

void test('bought more adds a sealed bottle, clears the shopping flag, and keeps the price editable', () => {
	const before = readStockState('bottle', bottle);
	const bought = boughtMore(edit(bottle, 'bottle'), 'bottle');
	assert.equal(bought.unopened, '2');
	assert.equal(bought.shoppingList, false);
	assert.equal(boughtMore(bought, 'bottle').unopened, '3');
	const plan = planStockEdit(before, { ...bought, price: '31.5' });
	assert.deepEqual(plan.updates, { [PROP.unopened]: 2, [PROP.lastPurchasePrice]: 31.5, [PROP.shoppingList]: false });
	assert.equal(describeStock(plan.after), '40% (300 mL), 2 unopened');
});

void test('bought more marks status stock as Have', () => {
	const bought = boughtMore(edit(limes, 'ingredient'), 'ingredient');
	assert.equal(bought.availability, 'Have');
	assert.deepEqual(planStockEdit(readStockState('ingredient', limes), bought).updates, {
		[PROP.availability]: 'Have',
	});
});

void test('finished empties the open bottle and leaves sealed bottles for logging to open', () => {
	const done = finished(edit(bottle, 'bottle'), 'bottle');
	assert.deepEqual(planStockEdit(readStockState('bottle', bottle), done).updates, { [PROP.open]: 0 });
	assert.deepEqual(
		planStockEdit(readStockState('ingredient', syrup), finished(edit(syrup, 'ingredient'), 'ingredient')).updates,
		{ [PROP.remaining]: 0 },
	);
	assert.deepEqual(
		planStockEdit(readStockState('ingredient', limes), finished(edit(limes, 'ingredient'), 'ingredient')).updates,
		{ [PROP.availability]: 'Out' },
	);
});

void test('levels are validated: open within bottle size, whole sealed counts, nonnegative amounts and price', () => {
	const before = readStockState('bottle', bottle);
	assert.deepEqual(planStockEdit(before, edit(bottle, 'bottle', { open: 750 })).updates, { [PROP.open]: 750 });
	assert.deepEqual(planStockEdit(before, edit(bottle, 'bottle', { unopened: '' })).updates, { [PROP.unopened]: 0 });
	assert.deepEqual(
		planStockEdit(before, edit(bottle, 'bottle', { open: null })).updates,
		{ [PROP.open]: 0 },
		'a cleared amount is none',
	);
	assert.deepEqual(
		planStockEdit(readStockState('ingredient', syrup), edit(syrup, 'ingredient', { remaining: '' })).updates,
		{ [PROP.remaining]: 0 },
	);
	const blank = { ...bottle, [PROP.open]: null };
	assert.deepEqual(
		planStockEdit(readStockState('bottle', blank), edit(blank, 'bottle')).updates,
		{},
		'a blank amount is kept, not rewritten as 0',
	);
	const broken = { ...bottle, [PROP.open]: 'half' };
	assert.deepEqual(
		planStockEdit(readStockState('bottle', broken), edit(broken, 'bottle', { open: null })).updates,
		{},
		'an unreadable amount is kept unless replaced',
	);
	for (const overrides of [
		{ open: 751 },
		{ open: -1 },
		{ unopened: '1.5' },
		{ unopened: '-1' },
		{ price: '-2' },
		{ price: 'cheap' },
	]) {
		assert.throws(() => planStockEdit(before, edit(bottle, 'bottle', overrides)), JSON.stringify(overrides));
	}
	assert.throws(() =>
		planStockEdit(readStockState('ingredient', syrup), edit(syrup, 'ingredient', { remaining: '-5' })),
	);
	assert.throws(() =>
		planStockEdit(readStockState('ingredient', limes), edit(limes, 'ingredient', { availability: 'Plenty' })),
	);
});

void test('switching to availability keeps nothing numeric and removes mL fields', () => {
	const plan = planStockEdit(
		readStockState('bottle', bottle),
		edit(bottle, 'bottle', { tracking: 'status', availability: 'Have' }),
	);
	assert.deepEqual(plan.updates, { [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' });
	assert.deepEqual(plan.remove, [PROP.open, PROP.unopened]);
	const source = planStockEdit(
		readStockState('ingredient', syrup),
		edit(syrup, 'ingredient', { tracking: 'status', availability: 'Unknown' }),
	);
	assert.deepEqual(source.remove, [PROP.remaining]);
	assert.equal(source.updates[PROP.availability], 'Unknown');
});

void test('switching to mL takes the amounts entered, 0 when blank, and removes availability', () => {
	const plan = planStockEdit(
		readStockState('ingredient', limes),
		edit(limes, 'ingredient', { tracking: 'volume', remaining: '' }),
	);
	assert.deepEqual(plan.updates, { [PROP.stockTracking]: 'volume', [PROP.remaining]: 0 });
	assert.deepEqual(plan.remove, [PROP.availability]);
	const status = { ...bottle, [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' };
	const toVolume = planStockEdit(
		readStockState('bottle', status),
		edit(status, 'bottle', { tracking: 'volume', open: 500, unopened: '' }),
	);
	assert.deepEqual(toVolume.updates, { [PROP.stockTracking]: 'volume', [PROP.open]: 500, [PROP.unopened]: 0 });
	assert.deepEqual(toVolume.remove, [PROP.availability]);
});

void test('a missing tracking mode is set explicitly on save', () => {
	const untracked = { [PROP.kind]: 'ingredient' };
	const plan = planStockEdit(
		readStockState('ingredient', untracked),
		edit(untracked, 'ingredient', { tracking: 'status', availability: 'Have' }),
	);
	assert.deepEqual(plan.updates, { [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' });
	assert.throws(() =>
		planStockEdit(readStockState('ingredient', untracked), edit(untracked, 'ingredient', { tracking: '' })),
	);
});

void test('stale checks compare stock, price, and flag', () => {
	const before = readStockState('bottle', bottle);
	assert.ok(sameStockState(before, readStockState('bottle', { ...bottle, [PROP.abv]: 0.3 })));
	assert.ok(!sameStockState(before, readStockState('bottle', { ...bottle, [PROP.open]: 270 })));
	assert.ok(!sameStockState(before, readStockState('bottle', { ...bottle, [PROP.shoppingList]: false })));
});

void test('a loaded open amount keeps its exact mL until edited', () => {
	const amount = new BottleAmount();
	amount.load(250, 750);
	assert.equal(amount.unit, 'percent');
	assert.equal(amount.value, '33.3');
	assert.equal(amount.toMl(), 250);
	amount.setUnit('ml');
	assert.equal(amount.value, '250');
	assert.equal(amount.toMl(), 250);
	amount.setUnit('percent');
	amount.setValue('50');
	assert.equal(amount.toMl(), 375);
	const unknownSize = new BottleAmount();
	unknownSize.load(120, null);
	assert.equal(unknownSize.unit, 'ml');
	assert.equal(unknownSize.toMl(), 120);
	const blank = new BottleAmount();
	blank.load(null, 750);
	assert.equal(blank.value, '');
	assert.equal(blank.toMl(), null);
});

function vault(properties: Record<string, unknown>) {
	const note = {
		path: 'Cocktails/Bottles/Test bottle.md',
		name: 'Test bottle',
		kind: 'bottle' as const,
		parents: [],
	};
	const saved: Record<string, unknown> = { ...properties, custom: 'keep' };
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === note.path ? new TFile(path) : null),
			read: () => Promise.resolve(`---\n${JSON.stringify(saved)}\n---\nBody`),
		},
		fileManager: {
			processFrontMatter: (_file: TFile, transform: (properties: Record<string, unknown>) => void) => {
				transform(saved);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	return { note, saved, store: new StockStore(app) };
}

void test('saving sets changed fields, removes the old mode, and keeps everything else', async () => {
	const { note, saved, store } = vault(bottle);
	const before = await store.read(note);
	const plan = planStockEdit(before, edit(bottle, 'bottle', { tracking: 'status', availability: 'Low' }));
	await store.save(note, before, plan);
	assert.deepEqual(saved, {
		[PROP.kind]: 'bottle',
		[PROP.stockTracking]: 'status',
		[PROP.volume]: 750,
		[PROP.abv]: 0.25,
		[PROP.availability]: 'Low',
		[PROP.lastPurchasePrice]: 29.95,
		[PROP.shoppingList]: true,
		custom: 'keep',
	});
});

void test('saving refuses stock that changed after the form opened', async () => {
	const { note, saved, store } = vault(bottle);
	const before = await store.read(note);
	const plan = planStockEdit(before, finished(edit(bottle, 'bottle'), 'bottle'));
	saved[PROP.open] = 270;
	await assert.rejects(store.save(note, before, plan), /changed/);
	assert.equal(saved[PROP.open], 270);
});

void test('last used and last made never move backward; times made counts logs', () => {
	assert.equal(laterDate('2026-11-07', '2026-11-06'), '2026-11-07');
	assert.equal(laterDate('2026-11-05', '2026-11-06'), '2026-11-06');
	assert.equal(laterDate(new Date('2026-12-01T00:00:00Z'), '2026-11-06'), '2026-12-01');
	assert.equal(laterDate('soon', '2026-11-06'), '2026-11-06');
	assert.deepEqual(usedUpdates({}, '2026-11-06'), { [PROP.lastUsed]: '2026-11-06' });
	assert.deepEqual(usedUpdates({ [PROP.lastUsed]: '2026-11-06' }, '2026-11-06'), {}, 'no write when unchanged');
	assert.deepEqual(madeUpdates({}, '2026-11-06'), { [PROP.lastMade]: '2026-11-06', [PROP.timesMade]: 1 });
	assert.deepEqual(madeUpdates({ [PROP.timesMade]: 4, [PROP.lastMade]: '2026-12-01' }, '2026-11-06'), {
		[PROP.lastMade]: '2026-12-01',
		[PROP.timesMade]: 5,
	});
	assert.equal(madeUpdates({ [PROP.timesMade]: 'lots' }, '2026-11-06')[PROP.timesMade], 1);
});
