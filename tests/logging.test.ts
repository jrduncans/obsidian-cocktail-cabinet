import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLoggingLines, SKIP_LINE } from '../src/core/logging-lines';
import {
	dailyAlcoholUpdates,
	dailyLogLine,
	dailyLogText,
	hasDailyLog,
	indefiniteArticle,
} from '../src/core/logging-daily';
import { planLogging } from '../src/core/logging-plan';
import { isStocked, planDrawdown, sameStock, stockSnapshot } from '../src/core/logging-stock';
import { PROP } from '../src/core/schema';
import { applyRestore, isLogRecord, planUndo, removeDailyEntry } from '../src/core/log-undo';
import type { LogRecord } from '../src/core/log-undo';
import type { CabinetNote, NoteKind } from '../src/core/schema';

function note(name: string, kind: NoteKind, parents: string[] = []): CabinetNote {
	return { name, path: `Cocktails/${kind}/${name}.md`, kind, parents };
}
const category = note('Spirit', 'category');
const family = note('Gin', 'family', [category.path]);
const type = note('London Dry Gin', 'type', [family.path]);
const siblingType = note('Contemporary Gin', 'type', [family.path]);
const a = note('First Gin', 'bottle', [type.path]);
const b = note('Second Gin', 'bottle', [type.path]);
const c = note('Third Gin', 'bottle', [siblingType.path]);
const juice = note('Lime Juice', 'type');
const prepared = note('Prepared juice', 'ingredient', [juice.path]);
const fruit = note('Fresh limes', 'ingredient', [juice.path]);
const unclassified = note('Unclassified', 'bottle');
const notes = [category, family, type, siblingType, a, b, c, juice, prepared, fruit, unclassified];
function bottle(target = a, open: number | null = 100, unopened: number | null = 0, volume: number | null = 750) {
	return stockSnapshot(target, {
		[PROP.kind]: 'bottle',
		[PROP.stockTracking]: 'volume',
		[PROP.open]: open,
		[PROP.unopened]: unopened,
		[PROP.volume]: volume,
	});
}
function ingredient(target = prepared, remaining: number | null = 200) {
	return stockSnapshot(target, {
		[PROP.kind]: 'ingredient',
		[PROP.stockTracking]: 'volume',
		[PROP.remaining]: remaining,
	});
}
function status(target = fruit) {
	return stockSnapshot(target, {
		[PROP.kind]: target.kind,
		[PROP.stockTracking]: 'status',
		[PROP.availability]: 'Have',
	});
}
function classify(text: string, sources = [bottle(a), bottle(b), bottle(c)], volumeUnit: 'oz' | 'ml' = 'oz') {
	return classifyLoggingLines(
		`### Ingredients\n${text}\n### Method\n- 30 ml [[First Gin]]`,
		notes,
		sources,
		(link) =>
			notes.find(
				(item) => item.path.replace(/\.md$/, '') === link.split('|')[0] || item.name === link.split('|')[0],
			)?.path ?? null,
		volumeUnit,
	);
}

void test('type, family, and category candidates follow explicit hierarchy without broadening a type', () => {
	assert.deepEqual(classify('- 30 ml [[London Dry Gin]]').counted[0]?.candidates, [a.path, b.path]);
	assert.deepEqual(classify('- 30 ml [[Gin]]').counted[0]?.candidates, [a.path, b.path, c.path]);
	assert.deepEqual(classify('- 30 ml [[Spirit]]').counted[0]?.candidates, [a.path, b.path, c.path]);
});
void test('a bottle link includes its own stock and same-type alternatives and preselects the named stocked bottle', () => {
	const line = classify('- 30 ml [[First Gin]]').counted[0]!;
	assert.deepEqual(line.candidates, [a.path, b.path]);
	assert.equal(line.initialSelection, a.path);
	assert.equal(
		classify('- 30 ml [[Unclassified]]', [bottle(unclassified)]).counted[0]?.initialSelection,
		unclassified.path,
	);
});
void test('a catch-all type offers its other bottles as alternatives but never selects one', () => {
	const amaro = { ...note('Amaro', 'type', [family.path]), catchAll: true };
	const meletti = note('Meletti', 'bottle', [amaro.path]),
		averna = note('Averna', 'bottle', [amaro.path]);
	const all = [...notes, amaro, meletti, averna];
	const run = (text: string, sources: ReturnType<typeof bottle>[]) =>
		classifyLoggingLines(
			`### Ingredients\n${text}`,
			all,
			sources,
			(link) => all.find((item) => item.name === link.split('|')[0])?.path ?? null,
		).counted[0]!;
	const stocked = run('- 30 ml [[Meletti]]', [bottle(meletti), bottle(averna)]);
	assert.deepEqual(
		[stocked.candidates, stocked.alternatives, stocked.alternativesLabel, stocked.initialSelection],
		[[meletti.path], [averna.path], 'Other Amaro', meletti.path],
	);
	const out = run('- 30 ml [[Meletti]]', [bottle(meletti, 0), bottle(averna)]);
	assert.deepEqual([out.candidates, out.alternatives, out.initialSelection], [[], [averna.path], null]);
	const untracked = run('- 30 ml [[Meletti]]', [bottle(averna)]);
	assert.deepEqual([untracked.alternatives, untracked.initialSelection], [[averna.path], null]);
	// A line asking for the type itself takes any of its bottles, like a family.
	const generic = run('- 30 ml [[Amaro]]', [bottle(averna)]);
	assert.deepEqual(
		[generic.candidates, generic.alternatives, generic.initialSelection],
		[[averna.path], [], averna.path],
	);
});
void test('a sole candidate is preselected; several candidates require an explicit selection', () => {
	assert.equal(classify('- 30 ml [[London Dry Gin]]', [bottle(a)]).counted[0]?.initialSelection, a.path);
	const lines = classify('- 30 ml [[London Dry Gin]]');
	assert.equal(lines.counted[0]?.initialSelection, null);
	assert.equal(planLogging(lines, [bottle(a), bottle(b)], new Map(), 1).unselected, 1);
});
void test('every link on a line is an alternative, including parenthetical and comma-separated links', () => {
	for (const text of [
		'[[First Gin]] or [[Third Gin]]',
		'[[London Dry Gin]] ([[First Gin]])',
		'[[First Gin]], [[Second Gin]], [[Third Gin]]',
	]) {
		const lines = classify(`- 30 ml ${text}`);
		assert.equal(lines.counted.length, 1);
		const plan = planLogging(
			lines,
			[bottle(a), bottle(b), bottle(c)],
			new Map([[lines.counted[0]!.id, c.path]]),
			2,
		);
		assert.deepEqual(plan.errors, []);
		assert.equal(plan.changes.length, 1);
		assert.equal(plan.changes[0]?.consumedMl, 60);
	}
});
void test('two named stocked alternatives require a choice', () => {
	assert.equal(classify('- 30 ml [[First Gin]] or [[Second Gin]]').counted[0]?.initialSelection, null);
});
void test('matching volume-tracked other stock participates through provides and direct links', () => {
	assert.deepEqual(classify('- 15 ml [[Lime Juice]]', [ingredient(), status()]).counted[0]?.candidates, [
		prepared.path,
	]);
	assert.deepEqual(classify('- 15 ml [[Prepared juice]]', [ingredient()]).counted[0]?.candidates, [prepared.path]);
});
void test('unlinked, unmeasured, ambiguous, and status-only requirements have explicit skip reasons', () => {
	const lines = classify(
		'- 30 ml gin\n- 2 dashes [[First Gin]]\n- to taste [[First Gin]]\n- 1–2 oz (30 ml) [[First Gin]]\n- 15 ml [[Fresh limes]]\n- 10 ml [[Missing]]',
		[bottle(), status()],
	);
	assert.equal(lines.counted.length, 0);
	assert.equal(lines.skipped.length, 6);
	assert.match(lines.skipped[0]!.reason, /Not linked/);
	assert.match(lines.skipped[4]!.reason, /Not tracked in mL/);
	assert.match(lines.skipped[5]!.reason, /Link not found/);
});
void test('a type with only status-tracked sources is not drawn down', () => {
	assert.match(classify('- 20 ml [[Lime Juice]]', [status()]).skipped[0]!.reason, /Not tracked in mL/);
});
void test('explicit nonvolume equivalents use recipeVolumeMl while bare barspoons count as a teaspoon and dashes are skipped', () => {
	const lines = classify('- 1 barspoon (1/8 oz) [[First Gin]]\n- 1 barspoon [[First Gin]]\n- 2 dashes [[First Gin]]');
	assert.equal(lines.counted.length, 2);
	assert.equal(lines.skipped.length, 1);
	assert.equal(lines.counted[0]!.ml, 29.5735295625 / 8);
});
void test('out-of-stock and unknown bottles are not preselected but can be explicitly selected to show problems', () => {
	const sources = [bottle(a, 0), bottle(b, null), bottle(c, null, 1, null)];
	assert.deepEqual(classify('- 30 ml [[Gin]]', sources).counted[0]?.candidates, [c.path]);
	assert.equal(isStocked(bottle(a, null, 1)), true);
});
void test('single and multiple bottles draw down independently, scaling servings', () => {
	const plan = planDrawdown(
		[bottle(a), bottle(b)],
		[
			{ path: a.path, ml: 20 },
			{ path: b.path, ml: 10 },
		],
		2,
	);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(
		plan.changes.map((change) => change.updates),
		[{ [PROP.open]: 60 }, { [PROP.open]: 80 }],
	);
});
void test('multiple lines selecting the same bottle aggregate into one write and one rollover calculation', () => {
	const lines = classify('- 30 ml [[First Gin]]\n- 25 ml [[First Gin]]', [bottle(a, 40, 1, 100)]);
	const plan = planLogging(
		lines,
		[bottle(a, 40, 1, 100)],
		new Map(lines.counted.map((line) => [line.id, a.path])),
		2,
	);
	assert.equal(plan.changes.length, 1);
	assert.equal(plan.changes[0]!.consumedMl, 110);
	assert.deepEqual(plan.changes[0]!.updates, { [PROP.open]: 30, [PROP.unopened]: 0 });
});
void test('rollover opens several unopened bottles after consuming open stock first', () => {
	const plan = planDrawdown([bottle(a, 20, 4, 100)], [{ path: a.path, ml: 250 }], 1);
	assert.deepEqual(plan.changes[0]!.updates, { [PROP.open]: 70, [PROP.unopened]: 1 });
	assert.equal(plan.changes[0]!.opened, 3);
});
void test('exact finishing leaves zero open stock without opening an extra bottle', () => {
	assert.deepEqual(planDrawdown([bottle(a, 20, 2, 100)], [{ path: a.path, ml: 220 }], 1).changes[0]!.updates, {
		[PROP.open]: 0,
		[PROP.unopened]: 0,
	});
	assert.deepEqual(planDrawdown([bottle(a, 20, 2)], [{ path: a.path, ml: 20 }], 1).changes[0]!.updates, {
		[PROP.open]: 0,
	});
});
void test('shortfall invalidates a plan even when another bottle has enough', () => {
	const plan = planDrawdown(
		[bottle(a, 20), bottle(b, 100)],
		[
			{ path: a.path, ml: 30 },
			{ path: b.path, ml: 30 },
		],
		1,
	);
	assert.match(plan.errors.join(), /10 mL short/);
	assert.deepEqual(
		plan.blocked.map((item) => item.path),
		[a.path],
		'only the short bottle is offered for a stock edit',
	);
});
void test('a blank open amount is none open: it opens a sealed bottle, or is short', () => {
	assert.deepEqual(planDrawdown([bottle(a, null, 2, 100)], [{ path: a.path, ml: 120 }], 1).changes[0]!.updates, {
		[PROP.open]: 80,
		[PROP.unopened]: 0,
	});
	assert.match(planDrawdown([bottle(a, null, 0)], [{ path: a.path, ml: 1 }], 1).errors.join(), /1 mL short/);
	assert.deepEqual(
		planDrawdown([bottle(a, null, 0)], [{ path: a.path, ml: 1 }], 1).blocked.map((item) => item.path),
		[a.path],
	);
	assert.deepEqual(planDrawdown([bottle(a, null, 0)], [{ path: a.path, ml: 1 }], 0).blocked, []);
	assert.match(planDrawdown([bottle(a, 0, 0)], [{ path: a.path, ml: 1 }], 1).errors.join(), /1 mL short/);
});
void test('missing full bottle volume blocks rollover but is unnecessary for a known sufficient open amount', () => {
	assert.match(
		planDrawdown([bottle(a, 20, 1, null)], [{ path: a.path, ml: 30 }], 1).errors.join(),
		/Bottle size is unknown/,
	);
	assert.deepEqual(planDrawdown([bottle(a, 20, null, null)], [{ path: a.path, ml: 10 }], 1).changes[0]!.updates, {
		[PROP.open]: 10,
	});
});
void test('empty unopened count means zero and cannot cover a pour beyond the open amount', () => {
	assert.deepEqual(planDrawdown([bottle(a, 20, null)], [{ path: a.path, ml: 10 }], 1).changes[0]!.updates, {
		[PROP.open]: 10,
	});
	assert.match(planDrawdown([bottle(a, 20, null)], [{ path: a.path, ml: 30 }], 1).errors.join(), /10 mL short/);
});
void test('volume other stock decrements remaining with no rollover; a blank amount is empty', () => {
	assert.deepEqual(planDrawdown([ingredient()], [{ path: prepared.path, ml: 25 }], 2).changes[0]!.updates, {
		[PROP.remaining]: 150,
	});
	assert.match(
		planDrawdown([ingredient(prepared, null)], [{ path: prepared.path, ml: 1 }], 1).errors.join(),
		/1 mL short/,
	);
	assert.match(planDrawdown([ingredient(prepared, 0)], [{ path: prepared.path, ml: 1 }], 1).errors.join(), /short/);
});
void test('an explicitly selected status-tracked bottle stays unchanged and appears as not drawn down', () => {
	const lines = classify('- 30 ml [[London Dry Gin]]', [bottle(), status(b)]);
	const plan = planLogging(lines, [bottle(), status(b)], new Map([[lines.counted[0]!.id, b.path]]), 1);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(plan.changes, []);
	assert.match(plan.skipped[0]!.reason, /isn’t tracked in mL/);
});
void test('stock snapshots detect quantity, mode, volume, and kind changes but ignore purchasing metadata', () => {
	assert.equal(sameStock(bottle(a, null), bottle(a, 0)), false);
	assert.equal(sameStock(bottle(), bottle(a, 99)), false);
	assert.equal(sameStock(bottle(), bottle(a, 100, 1)), false);
	assert.equal(sameStock(bottle(), bottle(a, 100, 0, 700)), false);
	assert.equal(sameStock(bottle(), status(a)), false);
	assert.equal(sameStock(bottle(), stockSnapshot(a, { ...bottle().fields, [PROP.kind]: 'recipe' })), false);
	assert.equal(
		sameStock(
			bottle(),
			stockSnapshot(a, { ...bottle().fields, [PROP.lastPurchasePrice]: 99, [PROP.shoppingList]: true }),
		),
		true,
	);
});
void test('malformed stock and invalid servings cannot produce an applicable plan', () => {
	for (const servings of [0, -1, NaN, Infinity]) assert.ok(planDrawdown([bottle()], [], servings).errors.length);
	for (const value of [-1, NaN, Infinity, '10']) {
		const invalid = stockSnapshot(a, { ...bottle().fields, [PROP.open]: value });
		assert.ok(planDrawdown([invalid], [{ path: a.path, ml: 1 }], 1).errors.length);
	}
	assert.ok(planDrawdown([bottle(a, 1000, 0, 750)], [{ path: a.path, ml: 1 }], 1).errors.length);
	assert.ok(planDrawdown([bottle(a, 0, 1.5)], [{ path: a.path, ml: 1 }], 1).errors.length);
});
void test('article choice follows common spoken beginnings', () => {
	for (const name of ['Old Fashioned', 'Aviation', 'Hourglass', 'Honest Abe', 'Éclair', 'F.B.I. Sour', '8 Ball'])
		assert.equal(indefiniteArticle(name), 'an', name);
	for (const name of [
		'Manhattan',
		'Last Word',
		'One Last Word',
		'Unicorn',
		'European Union',
		'Hanky Panky',
		'Oaxacan Old Fashioned',
		'UFO',
	])
		assert.equal(indefiniteArticle(name), 'a', name);
});
void test('daily lines use proper names and path links, with the approved multiple-serving wording', () => {
	const recipe = note('Old Fashioned', 'recipe');
	assert.equal(dailyLogLine(recipe, 1), `Made an [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
	assert.equal(dailyLogText(recipe, 1), 'Made an Old Fashioned.');
	assert.equal(dailyLogText(recipe, 2), 'Made 2 servings of Old Fashioned.');
	assert.equal(dailyLogLine(recipe, 2), `Made 2 servings of [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
	assert.equal(dailyLogLine(recipe, 0.5), `Made 0.5 servings of [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
	assert.equal(
		dailyLogLine(recipe, 1, '≈ 1.6 drinks'),
		`Made an [[Cocktails/recipe/Old Fashioned|Old Fashioned]] (≈ 1.6 drinks).`,
	);
	assert.equal(
		dailyLogLine(recipe, 2, '≥ 3.0 drinks'),
		`Made 2 servings of [[Cocktails/recipe/Old Fashioned|Old Fashioned]] (≥ 3.0 drinks).`,
	);
	assert.deepEqual(dailyAlcoholUpdates({}, 24.04), { 'cc-alcohol-ml': 24 });
	assert.deepEqual(dailyAlcoholUpdates({ 'cc-alcohol-ml': 10.05 }, 5), { 'cc-alcohol-ml': 15.1 });
	assert.deepEqual(dailyAlcoholUpdates({ 'cc-alcohol-ml': 'lots' }, 5), { 'cc-alcohol-ml': 5 });
	assert.deepEqual(dailyAlcoholUpdates({}, 0), {});
});
void test('duplicate detection recognizes bare and path links, aliases, multiple servings, and mixed case', () => {
	const recipe = note('Old Fashioned', 'recipe');
	for (const line of [
		'Made an [[Old Fashioned]].',
		'- MADE [[Old Fashioned|Old-fashioned]].',
		dailyLogLine(recipe, 2),
		'Made an [[Old Fashioned.md]].',
	])
		assert.equal(hasDailyLog(line, recipe), true, line);
	assert.equal(hasDailyLog('Want to try [[Old Fashioned]].', recipe), false);
	assert.equal(hasDailyLog('Made a [[Manhattan]].\nRead [[Old Fashioned]].', recipe), false);
	assert.equal(
		hasDailyLog('Made [[Old Fashioned]].', recipe, () => 'Other/Old Fashioned.md'),
		false,
	);
});

void test('missing tracking mode never infers volume stock, and inactive status quantities are ignored', () => {
	const unknownMode = stockSnapshot(a, {
		[PROP.kind]: 'bottle',
		[PROP.open]: 100,
		[PROP.unopened]: 1,
		[PROP.volume]: 750,
	});
	assert.equal(isStocked(unknownMode), false);
	assert.match(planDrawdown([unknownMode], [{ path: a.path, ml: 10 }], 1).errors.join(), /Not tracked in mL/);
	const manual = stockSnapshot(a, {
		...bottle().fields,
		[PROP.stockTracking]: 'status',
		[PROP.availability]: 'Have',
	});
	assert.equal(isStocked(manual), false);
	assert.equal(manual.fields[PROP.open], undefined);
});

void test('rounded ounce/mL recipe amounts produce counted lines, pickers, and mL draw-down', () => {
	const sources = [bottle(), ingredient()];
	const lines = classify(
		'- 2 oz (60 ml) [[First Gin]]\n- ¼ oz (7.5 ml) [[Lime Juice]]\n- 3 dashes [[First Gin]]',
		sources,
		'ml',
	);
	assert.deepEqual(
		lines.counted.map((line) => line.ml),
		[60, 7.5],
	);
	assert.deepEqual(
		lines.counted.map((line) => line.initialSelection),
		[a.path, prepared.path],
	);
	assert.equal(lines.skipped.length, 1);
	const plan = planLogging(
		lines,
		sources,
		new Map(lines.counted.map((line) => [line.id, line.initialSelection!])),
		1,
	);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(
		plan.changes.map((change) => change.updates),
		[{ [PROP.open]: 40 }, { [PROP.remaining]: 192.5 }],
	);
});

void test('a line giving oz and mL logs the ounces by default and the mL when preferred, in any written form', () => {
	const oz = 29.5735295625;
	const text = '- 1 oz (30 ml) [[First Gin]]\n- 1 oz. / 30 ml. [[First Gin]]\n- 30 ml · 1 oz [[First Gin]]';
	assert.deepEqual(
		classify(text).counted.map((line) => line.ml),
		[oz, oz, oz],
	);
	assert.deepEqual(
		classify(text, undefined, 'ml').counted.map((line) => line.ml),
		[30, 30, 30],
	);
	const lines = classify('- 1 oz [[First Gin]]', [bottle(a), bottle(b)]);
	const parts = new Map([[lines.counted[0]!.id, [{ path: a.path, amount: '1 oz (30 ml)' }]]]);
	const pour = (unit: 'oz' | 'ml') => planLogging(lines, [bottle(a), bottle(b)], parts, 1, unit).changes[0]!.updates;
	assert.notDeepEqual(pour('oz'), pour('ml'));
	assert.deepEqual(
		pour('ml'),
		planLogging(
			lines,
			[bottle(a), bottle(b)],
			new Map([[lines.counted[0]!.id, [{ path: a.path, amount: '30' }]]]),
			1,
		).changes[0]!.updates,
	);
});

void test('missing, null, and empty unopened counts and open amounts behave like zero', () => {
	for (const unopened of [undefined, null, '', '  ', 0]) {
		const source = stockSnapshot(a, { ...bottle(a, 20).fields, [PROP.unopened]: unopened });
		assert.equal(source.fields[PROP.unopened], 0);
		assert.equal(sameStock(source, bottle(a, 20, 0)), true);
		assert.equal(sameStock(source, bottle(a, 20, 1)), false);
		assert.deepEqual(planDrawdown([source], [{ path: a.path, ml: 20 }], 1).changes[0]!.updates, { [PROP.open]: 0 });
		assert.match(planDrawdown([source], [{ path: a.path, ml: 30 }], 1).errors.join(), /10 mL short/);
		const unmeasured = stockSnapshot(a, { ...source.fields, [PROP.open]: null });
		assert.equal(isStocked(unmeasured), false);
		assert.match(planDrawdown([unmeasured], [{ path: a.path, ml: 1 }], 1).errors.join(), /1 mL short/);
		// Stale protection still compares what the file holds: blank and 0 are different text.
		assert.equal(sameStock(unmeasured, bottle(a, 0)), false);
	}
});

void test('a line nothing in the cabinet stocks defaults to not subtracted, and any line can be skipped', () => {
	const lines = classify('- 15 ml [[Lime Juice]]\n- 30 ml [[London Dry Gin]]', [bottle(a), bottle(b)]);
	assert.equal(lines.counted[0]?.initialSelection, SKIP_LINE);
	const selections = new Map(lines.counted.map((line) => [line.id, line.initialSelection ?? SKIP_LINE]));
	const plan = planLogging(lines, [bottle(a), bottle(b)], selections, 1);
	assert.equal(plan.unselected, 0);
	assert.deepEqual(plan.changes, []);
	assert.deepEqual(
		plan.skipped.map((line) => line.reason),
		['Not subtracted', 'Not subtracted'],
	);
});

void test('a skipped line that clearly uses one source names it for last used', () => {
	// Dashes have no mL: a named bottle is still used.
	assert.equal(classify('- 2 dashes [[First Gin]]').skipped[0]!.used, a.path);
	// The only source for a type, tracked by status.
	assert.equal(classify('- 1 oz [[Lime Juice]]', [status(fruit)]).skipped[0]!.used, fruit.path);
	// Several sources fit: no guess.
	assert.equal(classify('- 2 dashes [[London Dry Gin]]').skipped[0]!.used, undefined);
	assert.equal(classify('- 1 oz [[Lime Juice]]', [status(fruit), status(prepared)]).skipped[0]!.used, undefined);
	// Unlinked lines use nothing.
	assert.equal(classify('- 1 oz lime juice').skipped[0]!.used, undefined);
});
void test('a split line draws each part from its own source, with “rest” finishing what’s open', () => {
	const lines = classify('- 60 ml [[London Dry Gin]]');
	const id = lines.counted[0]!.id;
	const split = (parts: { path: string | null; amount: string }[], servings = 1) =>
		planLogging(lines, [bottle(a, 20), bottle(b, 100, 1), bottle(c)], new Map([[id, parts]]), servings);
	const plan = split(
		[
			{ path: a.path, amount: 'rest' },
			{ path: b.path, amount: '1.5 oz' },
		],
		2,
	);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(
		plan.changes.map((change) => [change.source.note.path, Number(change.consumedMl.toFixed(3))]),
		[
			[a.path, 20],
			[b.path, 88.721],
		],
	);
	assert.equal(plan.changes[0]!.updates[PROP.open], 0);
	assert.deepEqual(
		plan.selected.map((source) => source.note.path),
		[a.path, b.path],
	);
	assert.deepEqual(
		split([
			{ path: b.path, amount: '30' },
			{ path: c.path, amount: '1 oz' },
		]).changes.map((change) => change.consumedMl),
		[30, 29.5735295625],
	);
	assert.equal(
		split([
			{ path: a.path, amount: '30 ml' },
			{ path: null, amount: '' },
		]).unselected,
		1,
	);
	assert.match(split([{ path: a.path, amount: 'some' }]).errors[0]!, /First Gin: Enter mL, oz/);
	assert.match(
		planLogging(lines, [bottle(a, 0)], new Map([[id, [{ path: a.path, amount: 'rest' }]]]), 1).errors[0]!,
		/Nothing open/,
	);
});

void test('undo planning restores what a log set, skips what it never saved, and blocks on changed stock', () => {
	const record: LogRecord = {
		id: 'x',
		title: 'Gimlet',
		date: '2026-11-13',
		servings: 1,
		notes: [
			{
				path: 'a.md',
				name: 'First Gin',
				fields: [
					{ key: PROP.open, before: 100, after: 40 },
					{ key: PROP.unopened, before: null, after: 1 },
				],
			},
			{ path: 'b.md', name: 'Second Gin', fields: [{ key: PROP.open, before: 50, after: 20 }] },
			{ path: 'c.md', name: 'Third Gin', fields: [{ key: PROP.lastUsed, after: '2026-11-13' }] },
		],
	};
	const plan = planUndo(record, (path) =>
		path === 'a.md' ? { [PROP.open]: 40, [PROP.unopened]: 1 } : path === 'b.md' ? { [PROP.open]: 50 } : null,
	);
	assert.deepEqual(plan.blocked, []);
	assert.deepEqual(plan.kept, ['Third Gin: Moved or deleted.']);
	assert.deepEqual(plan.restores, [
		{
			path: 'a.md',
			name: 'First Gin',
			expected: { [PROP.open]: 40, [PROP.unopened]: 1 },
			updates: { [PROP.open]: 100, [PROP.unopened]: null },
			text: 'First Gin: open 40 mL → 100 mL, unopened 1 → none',
		},
	]);
	const changed = planUndo(record, (path) => (path === 'b.md' ? { [PROP.open]: 10 } : null));
	assert.deepEqual(changed.blocked, ['First Gin: Moved or deleted.', 'Second Gin: open changed since (now 10 mL).']);
	const properties: Record<string, unknown> = { [PROP.lastUsed]: '2026-11-13', other: 1 };
	applyRestore(
		{ path: 'c.md', name: 'c', expected: {}, updates: { [PROP.lastUsed]: undefined }, text: '' },
		properties,
	);
	assert.deepEqual(properties, { other: 1 });
});
void test('removing a daily entry takes the last whole copy, one line or several', () => {
	assert.equal(removeDailyEntry('Made a [[X]].\nNote\nMade a [[X]].\n', 'Made a [[X]].'), 'Made a [[X]].\nNote\n');
	assert.equal(
		removeDailyEntry(
			'Intro\nMade a one-off (Y):\n- 1 oz A\n- 2 oz B\n',
			'Made a one-off (Y):\n- 1 oz A\n- 2 oz B\n',
		),
		'Intro\n',
	);
	assert.equal(removeDailyEntry('Made a [[X]] again.\n', 'Made a [[X]].'), null);
	assert.equal(removeDailyEntry('A\r\nMade a [[X]].\r\n', 'Made a [[X]].'), 'A\r\n');
});
void test('saved logs are checked before undo trusts them', () => {
	assert.equal(isLogRecord({ id: 'x', title: 'T', date: 'd', servings: 1, notes: [] }), true);
	assert.equal(
		isLogRecord({
			id: 'x',
			title: 'T',
			date: 'd',
			servings: 1,
			notes: [{ path: 'a', name: 'a', fields: [{ key: 'k' }] }],
		}),
		false,
	);
	assert.equal(isLogRecord({ id: 'x', title: 'T', date: 'd', notes: [] }), false);
});

void test('a tasting note line isn’t a log, even when it says made', () => {
	const recipe = note('Daiquiri', 'recipe');
	const made = `Made a [[${recipe.path.replace(/\.md$/, '')}|Daiquiri]].`;
	assert.equal(hasDailyLog('Tasting note on [[Daiquiri]]: Made with too much lime.', recipe), false);
	assert.equal(hasDailyLog(made, recipe), true);
});
