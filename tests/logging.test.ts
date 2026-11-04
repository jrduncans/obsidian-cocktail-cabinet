import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLoggingLines } from '../src/core/logging-lines';
import { dailyLogLine, hasDailyLog, indefiniteArticle } from '../src/core/logging-daily';
import { planLogging } from '../src/core/logging-plan';
import { isStocked, planDrawdown, sameStock, stockSnapshot } from '../src/core/logging-stock';
import { PROP } from '../src/core/schema';
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
	return stockSnapshot(target, { [PROP.kind]: 'bottle', [PROP.stockTracking]: 'volume', [PROP.open]: open, [PROP.unopened]: unopened, [PROP.volume]: volume });
}
function ingredient(target = prepared, remaining: number | null = 200) {
	return stockSnapshot(target, { [PROP.kind]: 'ingredient', [PROP.stockTracking]: 'volume', [PROP.remaining]: remaining });
}
function status(target = fruit) { return stockSnapshot(target, { [PROP.kind]: target.kind, [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' }); }
function classify(text: string, sources = [bottle(a), bottle(b), bottle(c)]) {
	return classifyLoggingLines(`### Ingredients\n${text}\n### Method\n- 30 ml [[First Gin]]`, notes, sources,
		link => notes.find(item => item.path.replace(/\.md$/, '') === link.split('|')[0] || item.name === link.split('|')[0])?.path ?? null);
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
	assert.equal(classify('- 30 ml [[Unclassified]]', [bottle(unclassified)]).counted[0]?.initialSelection, unclassified.path);
});
void test('a sole candidate is preselected; several candidates require an explicit selection', () => {
	assert.equal(classify('- 30 ml [[London Dry Gin]]', [bottle(a)]).counted[0]?.initialSelection, a.path);
	const lines = classify('- 30 ml [[London Dry Gin]]');
	assert.equal(lines.counted[0]?.initialSelection, null);
	assert.ok(planLogging(lines, [bottle(a), bottle(b)], new Map(), 1).errors.length);
});
void test('every link on a line is an alternative, including parenthetical and comma-separated links', () => {
	for (const text of ['[[First Gin]] or [[Third Gin]]', '[[London Dry Gin]] ([[First Gin]])', '[[First Gin]], [[Second Gin]], [[Third Gin]]']) {
		const lines = classify(`- 30 ml ${text}`);
		assert.equal(lines.counted.length, 1);
		const plan = planLogging(lines, [bottle(a), bottle(b), bottle(c)], new Map([[lines.counted[0]!.id, c.path]]), 2);
		assert.deepEqual(plan.errors, []);
		assert.equal(plan.changes.length, 1);
		assert.equal(plan.changes[0]?.consumedMl, 60);
	}
});
void test('two named stocked alternatives require a choice', () => {
	assert.equal(classify('- 30 ml [[First Gin]] or [[Second Gin]]').counted[0]?.initialSelection, null);
});
void test('matching volume-tracked other stock participates through provides and direct links', () => {
	assert.deepEqual(classify('- 15 ml [[Lime Juice]]', [ingredient(), status()]).counted[0]?.candidates, [prepared.path]);
	assert.deepEqual(classify('- 15 ml [[Prepared juice]]', [ingredient()]).counted[0]?.candidates, [prepared.path]);
});
void test('unlinked, unmeasured, ambiguous, and status-only requirements have explicit skip reasons', () => {
	const lines = classify('- 30 ml gin\n- 2 dashes [[First Gin]]\n- to taste [[First Gin]]\n- 1 oz (30 ml) [[First Gin]]\n- 15 ml [[Fresh limes]]\n- 10 ml [[Missing]]', [bottle(), status()]);
	assert.equal(lines.counted.length, 0);
	assert.equal(lines.skipped.length, 6);
	assert.match(lines.skipped[0]!.reason, /No cabinet link/);
	assert.match(lines.skipped[4]!.reason, /Status-tracked/);
	assert.match(lines.skipped[5]!.reason, /do not resolve/);
});
void test('a type with only status-tracked sources is not drawn down', () => {
	assert.match(classify('- 20 ml [[Lime Juice]]', [status()]).skipped[0]!.reason, /Status-tracked/);
});
void test('explicit nonvolume equivalents use recipeVolumeMl while bare barspoons are skipped', () => {
	const lines = classify('- 1 barspoon (1/8 oz) [[First Gin]]\n- 1 barspoon [[First Gin]]');
	assert.equal(lines.counted.length, 1);
	assert.equal(lines.skipped.length, 1);
	assert.equal(lines.counted[0]!.ml, 29.5735295625 / 8);
});
void test('out-of-stock and unknown bottles are not preselected but can be explicitly selected to show problems', () => {
	const sources = [bottle(a, 0), bottle(b, null), bottle(c, null, 1, null)];
	assert.deepEqual(classify('- 30 ml [[Gin]]', sources).counted[0]?.candidates, [c.path]);
	assert.equal(isStocked(bottle(a, null, 1)), true);
});
void test('single and multiple bottles draw down independently, scaling servings', () => {
	const plan = planDrawdown([bottle(a), bottle(b)], [{ path: a.path, ml: 20 }, { path: b.path, ml: 10 }], 2);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(plan.changes.map(change => change.updates), [{ [PROP.open]: 60 }, { [PROP.open]: 80 }]);
});
void test('multiple lines selecting the same bottle aggregate into one write and one rollover calculation', () => {
	const lines = classify('- 30 ml [[First Gin]]\n- 25 ml [[First Gin]]', [bottle(a, 40, 1, 100)]);
	const plan = planLogging(lines, [bottle(a, 40, 1, 100)], new Map(lines.counted.map(line => [line.id, a.path])), 2);
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
	assert.deepEqual(planDrawdown([bottle(a, 20, 2, 100)], [{ path: a.path, ml: 220 }], 1).changes[0]!.updates,
		{ [PROP.open]: 0, [PROP.unopened]: 0 });
	assert.deepEqual(planDrawdown([bottle(a, 20, 2)], [{ path: a.path, ml: 20 }], 1).changes[0]!.updates, { [PROP.open]: 0 });
});
void test('shortfall invalidates a plan even when another bottle has enough', () => {
	const plan = planDrawdown([bottle(a, 20), bottle(b, 100)], [{ path: a.path, ml: 30 }, { path: b.path, ml: 30 }], 1);
	assert.match(plan.errors.join(), /Shortfall: 10 mL/);
});
void test('unknown open amount can open known unopened stock; unknown stock never invents volume', () => {
	assert.deepEqual(planDrawdown([bottle(a, null, 2, 100)], [{ path: a.path, ml: 120 }], 1).changes[0]!.updates,
		{ [PROP.open]: 80, [PROP.unopened]: 0 });
	assert.match(planDrawdown([bottle(a, null, 0)], [{ path: a.path, ml: 1 }], 1).errors.join(), /unknown.*no unopened/);
	assert.match(planDrawdown([bottle(a, 0, 0)], [{ path: a.path, ml: 1 }], 1).errors.join(), /Shortfall: 1/);
});
void test('missing full bottle volume blocks rollover but is unnecessary for a known sufficient open amount', () => {
	assert.match(planDrawdown([bottle(a, 20, 1, null)], [{ path: a.path, ml: 30 }], 1).errors.join(), /volume is unknown/);
	assert.deepEqual(planDrawdown([bottle(a, 20, null, null)], [{ path: a.path, ml: 10 }], 1).changes[0]!.updates, { [PROP.open]: 10 });
});
void test('unknown unopened count is preserved when unused and blocks necessary rollover', () => {
	assert.deepEqual(planDrawdown([bottle(a, 20, null)], [{ path: a.path, ml: 10 }], 1).changes[0]!.updates, { [PROP.open]: 10 });
	assert.match(planDrawdown([bottle(a, 20, null)], [{ path: a.path, ml: 30 }], 1).errors.join(), /Unopened count is unknown/);
});
void test('volume other stock decrements remaining with no rollover and keeps unknown separate from zero', () => {
	assert.deepEqual(planDrawdown([ingredient()], [{ path: prepared.path, ml: 25 }], 2).changes[0]!.updates, { [PROP.remaining]: 150 });
	assert.match(planDrawdown([ingredient(prepared, null)], [{ path: prepared.path, ml: 1 }], 1).errors.join(), /unknown/);
	assert.match(planDrawdown([ingredient(prepared, 0)], [{ path: prepared.path, ml: 1 }], 1).errors.join(), /Shortfall/);
});
void test('an explicitly selected status-tracked bottle stays unchanged and appears as not drawn down', () => {
	const lines = classify('- 30 ml [[London Dry Gin]]', [bottle(), status(b)]);
	const plan = planLogging(lines, [bottle(), status(b)], new Map([[lines.counted[0]!.id, b.path]]), 1);
	assert.deepEqual(plan.errors, []);
	assert.deepEqual(plan.changes, []);
	assert.match(plan.skipped[0]!.reason, /status tracking/);
});
void test('stock snapshots detect quantity, mode, volume, and kind changes but ignore purchasing metadata', () => {
	assert.equal(sameStock(bottle(a, null), bottle(a, 0)), false);
	assert.equal(sameStock(bottle(), bottle(a, 99)), false);
	assert.equal(sameStock(bottle(), bottle(a, 100, 1)), false);
	assert.equal(sameStock(bottle(), bottle(a, 100, 0, 700)), false);
	assert.equal(sameStock(bottle(), status(a)), false);
	assert.equal(sameStock(bottle(), stockSnapshot(a, { ...bottle().fields, [PROP.kind]: 'recipe' })), false);
	assert.equal(sameStock(bottle(), stockSnapshot(a, { ...bottle().fields, [PROP.lastPurchasePrice]: 99, [PROP.shoppingList]: true })), true);
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
	for (const name of ['Old Fashioned', 'Aviation', 'Hourglass', 'Honest Abe', 'Éclair', 'F.B.I. Sour', '8 Ball']) assert.equal(indefiniteArticle(name), 'an', name);
	for (const name of ['Manhattan', 'Last Word', 'One Last Word', 'Unicorn', 'European Union', 'Hanky Panky', 'Oaxacan Old Fashioned', 'UFO']) assert.equal(indefiniteArticle(name), 'a', name);
});
void test('daily lines use proper names and path links, with the approved multiple-serving wording', () => {
	const recipe = note('Old Fashioned', 'recipe');
	assert.equal(dailyLogLine(recipe, 1), `Made an [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
	assert.equal(dailyLogLine(recipe, 2), `Made 2 servings of [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
	assert.equal(dailyLogLine(recipe, 0.5), `Made 0.5 servings of [[Cocktails/recipe/Old Fashioned|Old Fashioned]].`);
});
void test('duplicate detection recognizes bare and path links, aliases, multiple servings, and mixed case', () => {
	const recipe = note('Old Fashioned', 'recipe');
	for (const line of ['Made an [[Old Fashioned]].', '- MADE [[Old Fashioned|Old-fashioned]].', dailyLogLine(recipe, 2), 'Made an [[Old Fashioned.md]].']) assert.equal(hasDailyLog(line, recipe), true, line);
	assert.equal(hasDailyLog('Want to try [[Old Fashioned]].', recipe), false);
	assert.equal(hasDailyLog('Made a [[Manhattan]].\nRead [[Old Fashioned]].', recipe), false);
	assert.equal(hasDailyLog('Made [[Old Fashioned]].', recipe, () => 'Other/Old Fashioned.md'), false);
});


void test('missing tracking mode never infers volume stock, and inactive status quantities are ignored', () => {
	const unknownMode = stockSnapshot(a, { [PROP.kind]: 'bottle', [PROP.open]: 100, [PROP.unopened]: 1, [PROP.volume]: 750 });
	assert.equal(isStocked(unknownMode), false);
	assert.match(planDrawdown([unknownMode], [{ path: a.path, ml: 10 }], 1).errors.join(), /volume-tracked/);
	const manual = stockSnapshot(a, { ...bottle().fields, [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' });
	assert.equal(isStocked(manual), false);
	assert.equal(manual.fields[PROP.open], undefined);
});
