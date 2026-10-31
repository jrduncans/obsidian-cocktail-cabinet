import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTER_CATALOG } from '../src/catalog/catalog';
import { cabinetFolder, fileName, noteName, notePath, optionalNumber, PROP, wikiLink } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';
import { ingredientSection, localDate, renderNote } from '../src/core/notes';
import { isWithin, relatedTargets } from '../src/core/relationships';
import { starterPlan } from '../src/core/setup';
import { basePath, RESOURCE_BASES } from '../src/core/bases';

void test('cabinet paths remain inside a visible vault folder', () => {
	assert.equal(cabinetFolder(' Drinks/Cabinet/ '), 'Drinks/Cabinet');
	for (const root of ['', '/', '/tmp/cabinet', '../Cabinet', 'Cocktails/../Other', '.obsidian', 'A//B', 'C:\\Cabinet', 'Cocktails/NUL']) {
		assert.throws(() => cabinetFolder(root), root);
	}
});

void test('names cannot escape their folder or alter wiki-link syntax', () => {
	assert.equal(noteName(' Lime Juice '), 'Lime Juice');
	for (const name of ['../Outside', 'A/B', 'A\\B', 'A#Heading', 'A|Alias', '[Link]', 'A^block', 'A\nB', 'CON', 'a.', '.hidden']) {
		assert.throws(() => notePath('Cocktails', 'type', name), name);
	}
});

void test('blank stock is unknown, zero is explicit, invalid stock is rejected', () => {
	assert.equal(optionalNumber('', 'Stock', 0), null);
	assert.equal(optionalNumber('0', 'Stock', 0), 0);
	assert.equal(optionalNumber('2', 'Bottles', 0, Infinity, true), 2);
	for (const value of ['-1', '1.5', 'NaN', 'Infinity', 'two']) {
		assert.throws(() => optionalNumber(value, 'Bottles', 0, Infinity, true));
	}
	assert.throws(() => optionalNumber('101', 'Percent', 0, 100));
});

void test('starter notes have unique identities and valid, complete parent links', () => {
	const files = starterPlan('Drinks/Cabinet');
	assert.equal(new Set(files.map(file => file.path.toLowerCase())).size, files.length);
	assert.equal(new Set(STARTER_CATALOG.map(entry => entry.name.toLowerCase())).size, STARTER_CATALOG.length);
	assert.equal(new Set(STARTER_CATALOG.map(entry => entry.id)).size, STARTER_CATALOG.length);
	const paths = new Set(files.map(file => file.path.replace(/\.md$/, '')));
	for (const file of files) {
		for (const match of file.content.matchAll(/\[\[([^\]]+)\]\]/g)) assert.ok(paths.has(match[1]?.split('|')[0] || ''), `${file.path}: ${match[1]}`);
	}
});

void test('catalog identities use current starter names without URL schemes', () => {
	const files = starterPlan('Cocktails');
	for (const entry of STARTER_CATALOG) assert.equal(entry.id, `${entry.kind}/${fileName(entry.name)}`);
	for (const file of files.filter(file => file.catalogId)) {
		assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(file.catalogId!), file.catalogId);
		assert.ok(file.content.includes(`${PROP.catalogId}: ${JSON.stringify(file.catalogId)}`));
	}
	assert.ok(files.some(file => file.catalogId === 'family/Apple Brandy Family'));
	assert.ok(files.some(file => file.catalogId === 'type/Apple Brandy'));
	assert.equal(files.find(file => file.catalogId === 'family/Apple Brandy Family')?.path, 'Cocktails/Families/Apple Brandy Family.md');
	assert.equal(files.find(file => file.catalogId === 'family/Amaro Family')?.path, 'Cocktails/Families/Amaro Family.md');
});

void test('starter catalog supplies definitions without implying owned stock or supplying cocktail recipes', () => {
	const files = starterPlan('Cocktails');
	assert.ok(files.filter(file => file.kind === 'type').length >= 90);
	assert.ok(files.every(file => ['category', 'family', 'type', 'cabinet', 'base'].includes(file.kind)));
	assert.ok(files.filter(file => file.kind !== 'base').every(file => !file.content.includes(`${PROP.open}:`) && !file.content.includes(`${PROP.availability}:`)));
});

void test('three default sugar syrups retain distinct identities, ratios, and preparation instructions', () => {
	const syrups = STARTER_CATALOG.filter(entry => ['Simple Syrup (1 to 1)', 'Simple Syrup (2 to 1)', 'Demerara Syrup (2 to 1)'].includes(entry.name));
	assert.equal(syrups.length, 3);
	assert.deepEqual(syrups.map(entry => entry.properties?.[PROP.sugarWaterRatio]), ['1:1 by weight', '2:1 by weight', '2:1 by weight']);
	assert.ok(syrups.every(entry => entry.method?.includes('by weight') && entry.description));
});

void test('renamed catalog pages remain the target of new parent links', () => {
	const paths = new Map([
		['family/Rum', 'Cocktails/Families/My Rum.md'], ['category/Spirit', 'Cocktails/Categories/Spirits.md'],
		['family/Apple Brandy Family', 'Cocktails/Families/My Apple Brandies.md'], ['family/Amaro Family', 'Cocktails/Families/My Amari.md'],
	]);
	const files = starterPlan('Cocktails', paths);
	assert.ok(files.some(file => file.path === 'Cocktails/Families/My Rum.md'));
	const jamaican = files.find(file => file.path.endsWith('/Aged Jamaican Rum.md'));
	assert.ok(jamaican?.content.includes('[[Cocktails/Families/My Rum|Rum]]'));
	assert.ok(files.find(file => file.catalogId === 'type/Apple Brandy')?.content.includes('[[Cocktails/Families/My Apple Brandies|Apple Brandy Family]]'));
	assert.ok(files.find(file => file.catalogId === 'type/Amaro')?.content.includes('[[Cocktails/Families/My Amari|Amaro Family]]'));
});

void test('unparented types are valid notes', () => {
	const note = renderNote('Cocktails', { kind: 'type', name: 'My Ingredient', description: 'A personal ingredient.' }, '2026-10-29');
	assert.ok(note.content.includes('cc-kind: "type"'));
	assert.ok(!note.content.includes('cc-family:'));
});

void test('bottle creation stores one type or leaves it unclassified and rejects lists', () => {
	const type = wikiLink('Cocktails/Types/Aged Jamaican Rum.md');
	const draft = { kind: 'bottle' as const, name: 'Example Rum', description: '' };
	const classified = renderNote('Cocktails', { ...draft, properties: { [PROP.type]: type } }, '2026-10-31');
	assert.ok(classified.content.includes(`cc-type: ${JSON.stringify(type)}\n`));
	assert.ok(!renderNote('Cocktails', draft, '2026-10-31').content.includes('cc-type:'));
	assert.throws(() => renderNote('Cocktails', { ...draft, properties: { [PROP.type]: [type] } }, '2026-10-31'), /Select one ingredient type/);
});

void test('starter groupings are optional at both parent levels', () => {
	const files = starterPlan('Cocktails');
	const bitters = files.find(file => file.path === 'Cocktails/Families/Bitters.md');
	const egg = files.find(file => file.path === 'Cocktails/Types/Egg White.md');
	assert.ok(bitters && !bitters.content.includes(`${PROP.category}:`));
	assert.ok(egg && !egg.content.includes(`${PROP.family}:`));
	assert.ok(files.some(file => file.content.includes('[[Cocktails/Families/Bitters|Bitters]]')));
	for (const entry of STARTER_CATALOG) {
		if (!entry.parent) continue;
		const parentKind = entry.kind === 'type' ? 'family' : 'category';
		assert.ok(STARTER_CATALOG.some(parent => parent.name === entry.parent && parent.kind === parentKind), entry.name);
	}
});

void test('home introduces all six resource Bases in context without embeds or stock-unit advice', () => {
	const files = starterPlan('Drinks/Cabinet');
	const home = files.find(file => file.kind === 'cabinet')!;
	const bases = files.filter(file => file.kind === 'base');
	assert.equal(bases.length, 6);
	for (const resource of RESOURCE_BASES) {
		const path = basePath('Drinks/Cabinet', resource.name);
		assert.ok(bases.some(file => file.path === path));
		assert.ok(home.content.includes(wikiLink(path, resource.name)));
	}
	assert.ok(!home.content.includes('![['));
	assert.ok(!home.content.includes('0.5'));
	assert.ok(!home.content.includes('fraction'));
	assert.ok(home.content.indexOf('## Your collection') < home.content.indexOf('## Ingredient catalog'));
	assert.ok(home.content.indexOf('### Types') < home.content.indexOf('### Families'));
	assert.ok(home.content.indexOf('### Families') < home.content.indexOf('### Categories'));
	assert.ok(!home.content.includes('/Types/'));
});

void test('Bases use the selected root and kind without requiring parents or catalog membership', () => {
	const root = "My cabinet's/Drinks";
	const bases = starterPlan(root).filter(file => file.kind === 'base');
	for (const [index, base] of bases.entries()) {
		const filters = base.content.split('properties:')[0]!.split('\n')
			.filter(line => line.startsWith('    - ')).map(line => JSON.parse(line.slice(6)) as string);
		assert.deepEqual(filters, [`file.inFolder(${JSON.stringify(root)})`, 'file.ext == "md"', `note["cc-kind"] == "${RESOURCE_BASES[index]!.kind}"`]);
		assert.ok(!base.content.includes(PROP.catalogId));
		assert.ok(base.content.includes('note.cc-name:'));
	}
});

void test('a family without a category still finds its types and their bottles', () => {
	const bitters: CabinetNote = { path: 'Bitters', name: 'Bitters', kind: 'family', parents: [] };
	const orange: CabinetNote = { path: 'Orange Bitters', name: 'Orange Bitters', kind: 'type', parents: ['Bitters'] };
	const bottle: CabinetNote = { path: 'My Orange Bitters', name: 'My Orange Bitters', kind: 'bottle', parents: ['Orange Bitters'] };
	assert.deepEqual([...relatedTargets([bitters, orange, bottle], bitters)].sort(), ['Bitters', 'My Orange Bitters', 'Orange Bitters']);
	assert.equal(isWithin([bitters, orange, bottle], bottle.path, bitters.path), true);
});

void test('Latin diacritics and ligatures produce plain filenames with predictable collisions', () => {
	for (const [name, expected] of [['Cachaça', 'Cachaca'], ['Añejo Tequila', 'Anejo Tequila'], ['Bénédictine', 'Benedictine'], ['Crème de Cacao', 'Creme de Cacao'], ['Ærø', 'AEro']]) {
		assert.equal(fileName(name!), expected);
	}
	assert.equal(notePath('Cocktails', 'type', 'Cachaça'), notePath('Cocktails', 'type', 'Cachaca'));
	assert.equal(fileName('Cafe\u0301'), 'Cafe');
	assert.equal(fileName('Ti’ Punch'), "Ti' Punch");
	assert.throws(() => fileName('東京'));
	assert.throws(() => fileName('NúL'));
});

void test('proper names survive in properties, page headings, aliases, and link display text', () => {
	const note = renderNote('Cocktails', { kind: 'type', name: 'Bénédictine', description: 'Herbal liqueur.', properties: { aliases: ['My herbal liqueur'] } }, '2026-10-29');
	assert.equal(note.path, 'Cocktails/Types/Benedictine.md');
	assert.ok(note.content.includes('cc-name: "Bénédictine"'));
	assert.ok(note.content.includes('# Bénédictine\n'));
	assert.ok(note.content.includes('aliases: ["My herbal liqueur","Bénédictine"]'));
	assert.equal(wikiLink(note.path, 'Bénédictine'), '[[Cocktails/Types/Benedictine|Bénédictine]]');
	for (const name of ['Broken|Alias', 'Broken]]link', 'Line\nbreak']) assert.throws(() => wikiLink(note.path, name));
});

void test('agricole starter notes preserve both French names as aliases for distinct age-based types', () => {
	const files = starterPlan('Cocktails');
	for (const [name, alias] of [['Unaged Rhum Agricole', 'Rhum Agricole Blanc'], ['Aged Rhum Agricole', 'Rhum Agricole Vieux']]) {
		const file = files.find(file => file.path === notePath('Cocktails', 'type', name!));
		assert.ok(file, name);
		const aliases = file.content.split('\n').find(line => line.startsWith('aliases: '));
		assert.ok(aliases, name);
		assert.deepEqual(JSON.parse(aliases.slice('aliases: '.length)), [alias]);
		assert.ok(!files.some(other => other.path === notePath('Cocktails', 'type', alias!)));
	}
});

void test('accented starter names keep their catalog identity and plain parent filenames', () => {
	const files = starterPlan('Cocktails');
	const cachaca = files.find(file => file.catalogId === 'family/Cachaca');
	const aged = files.find(file => file.catalogId === 'type/Aged Cachaca');
	assert.equal(cachaca?.path, 'Cocktails/Families/Cachaca.md');
	assert.ok(cachaca?.content.includes('# Cachaça'));
	assert.ok(aged?.content.includes('[[Cocktails/Families/Cachaca|Cachaça]]'));
	assert.ok(files.every(file => Array.from(file.path).every(character => character.charCodeAt(0) < 128)));
});

void test('Apple Brandy Family groups regular apple brandy with the other recipe-facing types', () => {
	const apple = STARTER_CATALOG.find(entry => entry.kind === 'family' && entry.name === 'Apple Brandy Family');
	assert.ok(apple);
	assert.deepEqual(STARTER_CATALOG.filter(entry => entry.kind === 'type' && entry.parent === apple.name).map(entry => entry.name).sort(), ['Apple Brandy', 'Applejack', 'Bonded Apple Brandy', 'Calvados']);
	assert.deepEqual(STARTER_CATALOG.filter(entry => entry.kind === 'type' && entry.parent === 'Brandy').map(entry => entry.name).sort(), ['Armagnac', 'Cognac']);
	assert.ok(!STARTER_CATALOG.some(entry => entry.name === 'Pisco' || entry.name === 'Grape Brandy'));
	assert.notEqual(notePath('Cocktails', 'family', apple.name), notePath('Cocktails', 'type', 'Apple Brandy'));
});

void test('reviewed liqueur groupings and the default Vodka type replace the initial catch-all entries', () => {
	const expected: [string, string | undefined][] = [
		['Green Herbal Liqueur', 'Herbal Liqueur'], ['Yellow Herbal Liqueur', 'Herbal Liqueur'], ['Bénédictine', 'Herbal Liqueur'],
		['Crème de Menthe', 'Herbal Liqueur'], ['Contemporary Gin', 'Gin'],
		['Vermouth Amaro', 'Vermouth'], ['Vanilla Syrup', 'Flavored Syrup'],
		['Elderflower Liqueur', 'Floral Liqueur'], ['Violet Liqueur', 'Floral Liqueur'],
		['Allspice Dram', 'Spice Liqueur'], ['Falernum', 'Spice Liqueur'], ['Amaretto', 'Nut Liqueur'],
		['Coffee Liqueur', undefined], ['Crème de Cacao', undefined], ['Vodka', undefined],
		['Amaro', 'Amaro Family'], ['Red Bitter Liqueur', 'Amaro Family'], ['Orange Bitter Liqueur', 'Amaro Family'], ['Gentian Liqueur', 'Amaro Family'], ['Fernet', 'Amaro Family'], ['Artichoke Amaro', 'Amaro Family'],
	];
	for (const [name, parent] of expected) {
		const entry = STARTER_CATALOG.find(entry => entry.kind === 'type' && entry.name === name);
		assert.ok(entry, name);
		assert.equal(entry.parent, parent, name);
	}
	for (const name of ['Herbal and Floral Liqueur', 'Nut and Dessert Liqueur', 'Unflavored Vodka', 'Bitter Liqueur', 'Red Bitter Aperitif', 'Gentian Aperitif', 'Swedish Punsch', 'Sloe Gin', 'Coconut Rum']) {
		assert.ok(!STARTER_CATALOG.some(entry => entry.name === name), name);
	}
	assert.ok(!STARTER_CATALOG.some(entry => entry.kind === 'family' && entry.name === 'Vodka'));
});

void test('recipe rendering preserves broad references, free text, source, and resolved date', () => {
	const ingredients = [`30 ml ${wikiLink('Cocktails/Families/Rum.md')}`, 'A pinch of salt'];
	const note = renderNote('Cocktails', { kind: 'recipe', name: 'Example', description: '', ingredients, properties: { source: 'My notebook' } }, '2026-10-29');
	assert.ok(note.content.includes('- 30 ml [[Cocktails/Families/Rum]]'));
	assert.ok(note.content.includes('- A pinch of salt'));
	assert.ok(note.content.includes('created: "2026-10-29"'));
	assert.ok(note.content.includes('source: "My notebook"'));
	assert.ok(note.content.includes('rating: null'));
	assert.ok(!note.content.includes('{{date}}'));
});

void test('frontmatter safely contains punctuation and newlines in entered values', () => {
	const source = 'Quote " and colon: value\n---\ncc-kind: bottle';
	const note = renderNote('Cocktails', { kind: 'recipe', name: 'Example', description: '', properties: { source } }, '2026-10-29');
	const line = note.content.split('\n').find(line => line.startsWith('source: '));
	assert.equal(JSON.parse(line?.slice('source: '.length) || 'null'), source);
	assert.equal(note.content.split('\n').filter(line => line === '---').length, 2);
});

void test('related recipe parsing looks only at the Ingredients section', () => {
	const section = ingredientSection('---\nsource: test\n---\n### Ingredients\n\n- 1 oz [[Rum]]\n### Method\nSee [[Gin]]\n### Tasting Notes\n[[Whiskey]]\n');
	assert.ok(section.includes('[[Rum]]'));
	assert.ok(!section.includes('[[Gin]]'));
	assert.ok(!section.includes('[[Whiskey]]'));
	assert.ok(ingredientSection('## Ingredients\r\n- [[Lime Juice]]').includes('Lime Juice'));
});

const notes: CabinetNote[] = [
	{ path: 'Spirit', name: 'Spirit', kind: 'category', parents: [] },
	{ path: 'Rum', name: 'Rum', kind: 'family', parents: ['Spirit'] },
	{ path: 'Gin', name: 'Gin', kind: 'family', parents: ['Spirit'] },
	{ path: 'Jamaican', name: 'Jamaican', kind: 'type', parents: ['Rum'] },
	{ path: 'Agricole', name: 'Agricole', kind: 'type', parents: ['Rum'] },
	{ path: 'Bottle', name: 'Bottle', kind: 'bottle', parents: ['Jamaican'] },
	{ path: 'Orphan', name: 'Orphan', kind: 'type', parents: [] },
];

void test('a broad family finds descendants but does not include unrelated families', () => {
	assert.deepEqual([...relatedTargets(notes, notes[1]!)].sort(), ['Agricole', 'Bottle', 'Jamaican', 'Rum', 'Spirit']);
});

void test('a narrow type does not silently widen to other types in its family', () => {
	assert.deepEqual([...relatedTargets(notes, notes[3]!)].sort(), ['Bottle', 'Jamaican', 'Rum', 'Spirit']);
	assert.ok(!isWithin(notes, 'Agricole', 'Jamaican'));
});

void test('bottle discovery includes generic recipes and same-type bottle recipes without other rum types', () => {
	const alternatives = [...notes,
		{ path: 'Other Bottle', name: 'Other Bottle', kind: 'bottle' as const, parents: ['Jamaican'] },
		{ path: 'Agricole Bottle', name: 'Agricole Bottle', kind: 'bottle' as const, parents: ['Agricole'] },
	];
	assert.deepEqual([...relatedTargets(alternatives, notes[5]!)].sort(), ['Bottle', 'Jamaican', 'Other Bottle', 'Rum', 'Spirit']);
});

void test('cycles and missing parents from manual edits terminate safely', () => {
	const cyclic = [...notes, { path: 'A', name: 'A', kind: 'family' as const, parents: ['B', 'Missing'] }, { path: 'B', name: 'B', kind: 'family' as const, parents: ['A'] }];
	assert.equal(isWithin(cyclic, 'A', 'Rum'), false);
	assert.equal(isWithin(cyclic, 'A', 'B'), true);
	assert.deepEqual([...relatedTargets(cyclic, notes[6]!)], ['Orphan']);
});

void test('created date uses the local calendar day', () => {
	assert.equal(localDate(new Date(2026, 9, 29, 23, 59)), '2026-10-29');
});

void test('resource Bases expose mL stock, tracking choices, and independent purchasing fields', () => {
	const bases = starterPlan('Cocktails').filter(file => file.kind === 'base');
	const bottle = bases.find(file => file.path.endsWith('/Bottles.base'))!.content;
	const source = bases.find(file => file.path.endsWith('/Other stock.base'))!.content;
	const types = bases.find(file => file.path.endsWith('/Ingredient types.base'))!.content;
	assert.ok(bottle.includes('note.cc-type:'));
	assert.ok(bottle.includes('Ingredient type'));
	assert.ok(!bottle.includes('cc-types'));
	assert.ok(bottle.includes('note.cc-open-ml:'));
	assert.ok(bottle.includes('Open bottle (mL)'));
	assert.ok(!bottle.includes('cc-open-fraction'));
	assert.ok(source.includes('note.cc-remaining-ml:'));
	for (const content of [bottle, source]) {
		for (const key of [PROP.stockTracking, PROP.availability, PROP.lastPurchasePrice, PROP.shoppingList]) {
			assert.ok(content.includes(`note.${key}:`));
		}
	}
	assert.ok(types.includes('note.cc-shopping-list:'));
	for (const base of bases.filter(file => /families|categories|Recipes/i.test(file.path))) {
		assert.ok(!base.content.includes(PROP.shoppingList));
	}
});
