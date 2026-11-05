import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bottleStock, bottleVolume, cleanNavigation, readDocument, writeDocument } from '../scripts/knowledge/document';
import { applyPlan, safeDestination, sameSnapshot, snapshot, textSource, writeReport } from '../scripts/knowledge/io';
import { readMapping } from '../scripts/knowledge/mapping';
import type { AdoptionMapping } from '../scripts/knowledge/mapping';
import { migrationPlan } from '../scripts/knowledge/plan';
import { migrationReport } from '../scripts/knowledge/report';
import { navigationEmbeds } from '../src/core/navigation';
import { PROP } from '../src/core/schema';
import { STARTER_CATALOG } from '../src/catalog/catalog';

const doc = (metadata: Record<string, unknown>, body = '') => writeDocument({ metadata, body });
const mapping = (): AdoptionMapping => ({
	types: new Map([
		['Old type', { name: 'Bourbon', family: 'Whiskey' }], ['Bourbon', { name: 'Bourbon', family: 'Whiskey' }],
		['Second old type', { name: 'Bourbon', family: 'Whiskey' }], ['Retired type', null],
		['Local test', { name: 'Local test', family: 'Whiskey' }],
	]),
	bottles: new Map([['Example bottle', { previous: 'Old type', type: 'Bourbon' }]]), links: [],
	additionalTypes: [{ name: 'New local test', family: 'Whiskey' }],
	additionalBottles: [{ name: 'Unowned example', type: 'Bourbon' }],
});

void test('bottle fractions retain unknown and explicit zero; units use the plugin ounce conversion', () => {
	assert.equal(bottleStock({ Volume: '750 mL', 'Remaining in Open Bottle': 0.4 })[PROP.open], 300);
	assert.equal(bottleStock({ Volume: '750 mL', 'Remaining in Open Bottle': null })[PROP.open], null);
	assert.equal(bottleStock({ Volume: '', 'Remaining in Open Bottle': 0 })[PROP.open], 0);
	assert.equal(bottleStock({})[PROP.unopened], null);
	assert.equal(bottleVolume('1 L'), 1000);
	assert.equal(bottleVolume('4 oz'), 118.29411825);
	for (const metadata of [
		{ Volume: '', 'Remaining in Open Bottle': 0.4 }, { Volume: '750 mL', 'Remaining in Open Bottle': 1.2 },
		{ Volume: 'a bottle' }, { ABV: 20 }, { 'Unopened Bottles': 0.5 }, { 'Last Purchase Price': -1 },
	]) assert.throws(() => bottleStock(metadata));
});

void test('mapping tables are parsed and checked against catalog parents', () => {
	const text = '## Ingredient types\n\n| Current type | New type | Family | Status | Recipes |\n| --- | --- | --- | --- | --- |\n'
		+ '| Example type | Bourbon | Whiskey | Starter | 0 |\n| Old one | — | — | Retired | 0 |\n'
		+ '## Bottles whose type changes\n\n| Bottle | Current type | New type | Family | Recipes naming it |\n| --- | --- | --- | --- | --- |\n'
		+ '| Sample bottle | Example type | Bourbon | Whiskey | 0 |\n';
	assert.deepEqual(readMapping(text).types.get('Example type'), { name: 'Bourbon', family: 'Whiskey' });
	assert.equal(readMapping(text).types.get('Old one'), null);
	assert.equal(readMapping(text).bottles.get('Sample bottle')?.type, 'Bourbon');
	assert.throws(() => readMapping(text.replace('| Bourbon | Whiskey | Starter', '| Bourbon | Gin | Starter')));
});

void test('migration rewrites recipes without rebuilding their sections or inventing metadata', () => {
	const config = mapping();
	config.links.push({ recipe: 'Synthetic cocktail', target: 'Old type', destination: { kind: 'bottle', name: 'Unowned example' } });
	const body = '### Ingredients\n\n- 1 oz [[Old type|a chosen style]]\n- Garnish: peel\n\n### Method\n\nKeep this exact wording.\n\n### Tasting Notes\n\n[[Old type]] #stirred';
	const source = new Map([
		['Cocktails/Types/Old type.md', doc({ Subcategory: ['[[Whiskey]]'], 'Shopping List': true })],
		['Cocktails/Recipes/Synthetic cocktail.md', doc({ rating: '⭐️⭐️⭐️', source: 'Synthetic', created: '2001-01-02', custom: { details: ['keep me'] } }, body)],
		['Cocktails/Recipes/Unrated example.md', '### Ingredients\n\n- water\n'],
	]);
	const plan = migrationPlan(source, 'Rehearsal', config);
	const recipe = readDocument(plan.files.get('Rehearsal/Recipes/Synthetic cocktail.md')!);
	assert.equal(recipe.metadata.rating, 3);
	assert.equal(recipe.metadata.created, '2001-01-02');
	assert.deepEqual(recipe.metadata.custom, { details: ['keep me'] });
	assert.ok(recipe.body.includes('[[Rehearsal/Bottles/Unowned example|a chosen style]]'));
	assert.ok(recipe.body.includes('[[Rehearsal/Types/Bourbon|Old type]] #stirred'));
	assert.ok(recipe.body.includes('Keep this exact wording.'));
	assert.ok(!('created' in readDocument(plan.files.get('Rehearsal/Recipes/Unrated example.md')!).metadata));
	assert.ok(plan.issues.some(issue => issue.category === 'Unmapped properties'));
});

void test('parents are single links, merged flags survive, local types and unowned bottles are generated', () => {
	const source = new Map([
		['Cocktails/Types/Old type.md', doc({ 'Shopping List': false }, 'First synthetic description.')],
		['Cocktails/Types/Second old type.md', doc({ 'Shopping List': true }, 'Second synthetic description.')],
		['Cocktails/Bottles/Example bottle.md', doc({ Type: ['[[Cocktails/Types/Old type|Old type]]'], Volume: '750 mL', 'Remaining in Open Bottle': 0.5, 'Shopping List': null, ABV: 0.4 })],
	]);
	const plan = migrationPlan(source, 'Rehearsal', mapping());
	const type = readDocument(plan.files.get('Rehearsal/Types/Bourbon.md')!);
	assert.equal(type.metadata[PROP.family], '[[Rehearsal/Families/Whiskey|Whiskey]]');
	assert.equal(type.metadata[PROP.shoppingList], true);
	assert.ok(type.body.includes('First synthetic description.') && type.body.includes('Second synthetic description.'));
	const bottle = readDocument(plan.files.get('Rehearsal/Bottles/Example bottle.md')!);
	assert.equal(bottle.metadata[PROP.type], '[[Rehearsal/Types/Bourbon|Bourbon]]');
	assert.equal(bottle.metadata[PROP.open], 375);
	assert.equal(bottle.metadata[PROP.abv], 0.4);
	assert.ok(!(PROP.availability in bottle.metadata));
	assert.ok(!('Substitutes For' in bottle.metadata));
	assert.equal(readDocument(plan.files.get('Rehearsal/Bottles/Unowned example.md')!).metadata[PROP.open], null);
	assert.ok(plan.files.has('Rehearsal/Types/Local test.md'));
	assert.ok(plan.files.has('Rehearsal/Types/New local test.md'));
	assert.ok(!plan.issues.some(issue => issue.category === 'Conversion errors'));
});

void test('fresh fruit supplies juice using status and generated navigation', () => {
	const source = new Map([['Cocktails/Ingredients/Fresh Limes.md', doc({ Provides: ['[[Lime Juice]]'], Form: 'Whole fruit', Availability: 'Low', 'Shopping List': true })]]);
	const plan = migrationPlan(source, 'Rehearsal', mapping());
	const result = readDocument(plan.files.get('Rehearsal/Ingredients/Fresh Limes.md')!);
	assert.deepEqual(result.metadata[PROP.provides], ['[[Rehearsal/Types/Lime Juice|Lime Juice]]']);
	assert.equal(result.metadata[PROP.stockTracking], 'status');
	assert.equal(result.metadata[PROP.availability], 'Low');
	assert.equal(result.metadata[PROP.form], 'Fresh ingredient');
	assert.ok(result.body.includes(navigationEmbeds('Rehearsal', 'ingredient')));
});

void test('only known old navigation is removed, including bare base targets', () => {
	const legacy = 'Preserve prose.\n\n![[Types.base#For Subcategory]]\n\n```dataviewjs\nawait dv.view("Cocktails/Views/RelatedRecipes", {\n  page: dv.current().file.path\n});\n```\n\n```dataviewjs\ncustomCode();\n```';
	const result = cleanNavigation(legacy);
	assert.ok(result.includes('Preserve prose.'));
	assert.ok(result.includes('customCode();'));
	assert.ok(!result.includes('RelatedRecipes') && !result.includes('Types.base'));
});

void test('unmapped content is reported and conversion errors block apply; report lists generated Bases', () => {
	const plan = migrationPlan(new Map([
		['Cocktails/Recipes/Synthetic.md', doc({ rating: 'excellent' }, '### Ingredients\n- [[No mapping]]')],
		['Cocktails/Resources/Example.md', 'A synthetic resource.'],
		['Cocktails/Types/Unlisted.md', doc({})],
		['Cocktails/Types/Retired type.md', doc({}, 'Authored prose cannot disappear.')],
		['Cocktails/Recipes/Other synthetic.md', doc({}, '### Ingredients\n- [[No mapping]]')],
	]), 'Rehearsal', mapping());
	assert.ok(plan.issues.some(issue => issue.category === 'Conversion errors' && issue.detail.includes('rating')));
	assert.ok(plan.issues.some(issue => issue.category === 'Conversion errors' && issue.detail.includes('authored')));
	assert.equal(plan.issues.filter(issue => issue.category === 'Unmapped notes').length, 2);
	assert.ok(plan.issues.some(issue => issue.category === 'Unmapped links'));
	for (const name of ['Related', 'Shopping list', 'Recipes', 'Other stock']) assert.ok(plan.files.has(`Rehearsal/Views/${name}.base`));
	assert.ok(plan.files.has('Rehearsal/Shopping list.md'));
	const report = migrationReport(plan);
	assert.ok(report.includes('## Generated Bases') && report.includes('## Conversion errors') && report.includes('## Confirmation'));
});

void test('Latin filename collisions are reported rather than losing a recipe', () => {
	const plan = migrationPlan(new Map([
		['Cocktails/Recipes/Example.md', doc({}, 'First recipe')],
		['Cocktails/Recipes/Exámple.md', doc({}, 'Second recipe')],
	]), 'Rehearsal', mapping());
	assert.ok(plan.issues.some(issue => issue.detail.includes('collision')));
});

void test('filenames come from rules, keeping the proper name, and links follow them', () => {
	const config = mapping();
	config.bottles.set('Example V.S.', { previous: 'Old type', type: 'Bourbon' });
	const source = new Map([
		['Cocktails/Bottles/Example V.S..md', doc({ Type: ['[[Old type]]'], Volume: '500 mL', 'Remaining in Open Bottle': 0.1 })],
		['Cocktails/Recipes/Example #2.md', doc({}, '### Ingredients\n- 1 oz [[Example V.S.]]')],
	]);
	const plan = migrationPlan(source, 'Rehearsal', config);
	const bottle = readDocument(plan.files.get('Rehearsal/Bottles/Example VS.md')!);
	assert.equal(bottle.metadata[PROP.open], 50);
	assert.equal(bottle.metadata[PROP.name], 'Example V.S.');
	assert.deepEqual(bottle.metadata.aliases, ['Example V.S.']);
	const recipe = readDocument(plan.files.get('Rehearsal/Recipes/Example No 2.md')!);
	assert.equal(recipe.metadata[PROP.name], 'Example #2');
	assert.ok(recipe.body.includes('[[Rehearsal/Bottles/Example VS|Example V.S.]]'));
	assert.ok(!plan.issues.some(issue => issue.category === 'Conversion errors'));
});

void test('homemade syrup bottles become House other stock with mL remaining', () => {
	const source = new Map([
		['Cocktails/Bottles/Simple Syrup, 1 to 1.md', doc({ Type: ['[[Simple Syrup]]'], Volume: '400 mL', 'Remaining in Open Bottle': 0.5, 'Unopened Bottles': 1, 'Shopping List': false })],
		['Cocktails/Recipes/Example.md', doc({}, '### Ingredients\n- 1 oz [[Simple Syrup, 1 to 1]]')],
	]);
	const plan = migrationPlan(source, 'Rehearsal', mapping());
	const syrup = readDocument(plan.files.get('Rehearsal/Ingredients/House Simple Syrup (1 to 1).md')!);
	assert.equal(syrup.metadata[PROP.kind], 'ingredient');
	assert.equal(syrup.metadata[PROP.form], 'Homemade syrup');
	assert.equal(syrup.metadata[PROP.stockTracking], 'volume');
	assert.equal(syrup.metadata[PROP.remaining], 600);
	assert.deepEqual(syrup.metadata[PROP.provides], ['[[Rehearsal/Types/Simple Syrup (1 to 1)|Simple Syrup (1 to 1)]]']);
	assert.ok((syrup.metadata.aliases as string[]).includes('Simple Syrup, 1 to 1'));
	for (const key of [PROP.type, PROP.open, PROP.unopened, 'Volume', 'Type']) assert.ok(!(key in syrup.metadata), key);
	assert.ok(readDocument(plan.files.get('Rehearsal/Recipes/Example.md')!).body.includes('[[Rehearsal/Ingredients/House Simple Syrup (1 to 1)|Simple Syrup, 1 to 1]]'));
});

void test('a migrated type with no prose of its own keeps the starter description', () => {
	const config = mapping();
	config.types.set('Amaro', { name: 'Amaro', family: 'Amaro Family' });
	const plan = migrationPlan(new Map([['Cocktails/Types/Amaro.md', doc({ Subcategory: ['[[Amaro]]'] }, '```dataviewjs\nawait dv.view("Cocktails/Views/RelatedRecipes", { page: dv.current().file.path });\n```\n')]]), 'Rehearsal', config);
	const body = readDocument(plan.files.get('Rehearsal/Types/Amaro.md')!).body;
	const starter = STARTER_CATALOG.find(entry => entry.kind === 'type' && entry.name === 'Amaro')!.description;
	assert.ok(body.includes(starter), body);
});

void test('ambiguous bare links and unknown bottle classifications are reported without selecting a target', () => {
	const plan = migrationPlan(new Map([
		['Cocktails/Bottles/Unlisted.md', doc({ Type: ['[[Retired type]]'] })],
		['Cocktails/Recipes/Synthetic.md', doc({}, '### Ingredients\n- [[Unlisted]]')],
	]), 'Rehearsal', mapping());
	assert.ok(plan.issues.some(issue => issue.category === 'Conversion errors'));
	assert.ok(plan.issues.some(issue => issue.category === 'Unmapped links'));
});

void test('meaning-changing links use recipe overrides only in Ingredients and keep display wording', () => {
	const config = mapping();
	config.types.set('Apple Brandy', { name: 'Apple Brandy', family: 'Apple Brandy Family' });
	config.types.set('Falernum', { name: 'Falernum Syrup', family: 'Flavored Syrup' });
	config.types.set('Falernum Liqueur', { name: 'Falernum', family: 'Herbal & Spice Liqueur' });
	config.types.set('Simple Syrup', { name: 'Simple Syrup (1 to 1)', family: 'Sugar Syrup' });
	config.links.push({ recipe: 'Synthetic rich recipe', target: 'Simple Syrup', destination: { kind: 'type', name: 'Simple Syrup (2 to 1)' } });
	const source = new Map([
		['Cocktails/Types/Apple Brandy.md', doc({})], ['Cocktails/Types/Falernum.md', doc({})],
		['Cocktails/Types/Falernum Liqueur.md', doc({})], ['Cocktails/Types/Simple Syrup.md', doc({})],
		['Cocktails/Subcategories/Aromatic Bitters.md', doc({})],
		['Cocktails/Recipes/Synthetic rich recipe.md', doc({}, '### Ingredients\n- [[Apple Brandy]]\n- [[Simple Syrup|rich syrup]]\n- [[Falernum]]\n- [[Falernum Liqueur]]\n- [[Aromatic Bitters]]\n\n### Description\n[[Simple Syrup]]')],
	]);
	const plan = migrationPlan(source, 'Rehearsal', config);
	const text = plan.files.get('Rehearsal/Recipes/Synthetic rich recipe.md')!;
	for (const link of [
		'Families/Apple Brandy Family|Apple Brandy', 'Types/Simple Syrup (2 to 1)|rich syrup',
		'Types/Falernum Syrup|Falernum', 'Types/Falernum|Falernum Liqueur', 'Types/Aromatic Bitters|Aromatic Bitters',
		'Types/Simple Syrup (1 to 1)|Simple Syrup',
	]) assert.ok(text.includes(`[[Rehearsal/${link}]]`), link);
	assert.ok(!plan.issues.some(issue => issue.category === 'Conversion errors'));
});

void test('rehearsal apply preserves unknown files, refuses edits, and never writes source or daily notes', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'migration-synthetic-'));
	try {
		const source = join(directory, 'source');
		const target = join(directory, 'target');
		await mkdir(join(source, 'Cocktails', 'Recipes'), { recursive: true });
		await mkdir(target);
		await writeFile(join(source, 'Cocktails', 'Recipes', 'Synthetic.md'), doc({ rating: '⭐️⭐️' }, '### Ingredients\n- water'));
		await writeFile(join(source, 'Cocktails', 'Unmapped.md'), 'Preserve this.');
		await writeFile(join(target, 'Daily.md'), 'Untouched daily note.');
		const before = await snapshot(join(source, 'Cocktails'));
		const plan = migrationPlan(textSource(before), 'Rehearsal', mapping());
		assert.ok(sameSnapshot(before, await snapshot(join(source, 'Cocktails'))));
		await cp(join(source, 'Cocktails'), join(target, 'Rehearsal'), { recursive: true });
		await applyPlan(source, target, plan, before);
		assert.equal(readDocument(await readFile(join(target, 'Rehearsal', 'Recipes', 'Synthetic.md'), 'utf8')).metadata.rating, 2);
		assert.equal(await readFile(join(target, 'Rehearsal', 'Unmapped.md'), 'utf8'), 'Preserve this.');
		assert.equal(await readFile(join(target, 'Daily.md'), 'utf8'), 'Untouched daily note.');
		assert.ok(sameSnapshot(before, await snapshot(join(source, 'Cocktails'))));
		await assert.rejects(applyPlan(source, target, plan, before), /unchanged copy/);
		await assert.rejects(safeDestination(source, source, 'Elsewhere'), /separate vaults/);
		const knowledge = join(directory, 'knowledge');
		await mkdir(knowledge);
		await assert.rejects(safeDestination(source, knowledge, 'Rehearsal'), /knowledge vault/);
		await symlink(source, join(directory, 'source-alias'));
		await assert.rejects(safeDestination(source, join(directory, 'source-alias'), 'Elsewhere'), /separate vaults/);
		await symlink(source, join(target, 'escaped'));
		await assert.rejects(safeDestination(source, target, 'escaped/Rehearsal'));
		await assert.rejects(writeReport(join(source, 'report.md'), 'Private', source), /outside/);
		await writeFile(join(source, 'Cocktails', 'New.md'), 'Concurrent edit.');
		await assert.rejects(applyPlan(source, target, { ...plan, root: 'Fresh' }, before), /Source changed/);
	} finally { await rm(directory, { recursive: true, force: true }); }
});
