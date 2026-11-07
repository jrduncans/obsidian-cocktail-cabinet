import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTER_CATALOG } from '../src/catalog/catalog';
import { cabinetFolder, fileName, noteName, notePath, optionalNumber, parseRating, PROP, wikiLink } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';
import { ingredientSection, localDate, renderNote } from '../src/core/notes';
import { isWithin, relatedTargets } from '../src/core/relationships';
import { starterPlan } from '../src/core/setup';
import { STARTER_EXAMPLES, examplePlan } from '../src/catalog/examples';
import { recipeVolumeMl, splitIngredient } from '../src/core/recipe-amount';
import { basePath, RESOURCE_BASES } from '../src/core/bases';
import { NAVIGATION_BASE, NAVIGATION_VIEWS, navigationBase, navigationEmbeds } from '../src/core/navigation';
import { RESTOCK_BASE, RESTOCK_VIEWS, restockBase } from '../src/core/restock';
import { SHOPPING_BASE, SHOPPING_VIEWS, shoppingBase, shoppingNote, shoppingNotePath } from '../src/core/shopping';

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
	const families = new Set(STARTER_CATALOG.filter(entry => entry.kind === 'family').map(entry => entry.name.toLowerCase()));
	assert.ok(!STARTER_CATALOG.some(entry => entry.kind === 'type' && families.has(entry.name.toLowerCase())), 'types do not share a family name');
	const paths = new Set(files.flatMap(file => [file.path, file.path.replace(/\.md$/, '')]));
	for (const file of files) {
		for (const match of file.content.matchAll(/\[\[([^\]]+)\]\]/g)) assert.ok(paths.has(match[1]?.split('|')[0]?.split('#')[0] || ''), `${file.path}: ${match[1]}`);
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
	assert.ok(files.every(file => ['category', 'family', 'type', 'bottle', 'cabinet', 'shopping', 'base'].includes(file.kind)));
	assert.ok(files.filter(file => file.kind !== 'base').every(file => !file.content.includes(`${PROP.open}:`) && !file.content.includes(`${PROP.unopened}:`)));
	const bottles = files.filter(file => file.kind === 'bottle');
	assert.ok(bottles.length > 0);
	for (const bottle of bottles) {
		assert.ok(bottle.content.includes(`${PROP.stockTracking}: "status"`));
		assert.ok(bottle.content.includes(`${PROP.availability}: "Unknown"`));
		assert.ok(bottle.content.includes(`${PROP.shoppingList}: false`));
	}
	assert.ok(!STARTER_CATALOG.some(entry => entry.name === 'Angostura Bitters' && entry.kind === 'type'));
	assert.ok(bottles.find(file => file.catalogId === 'bottle/Angostura Bitters')?.content.includes(`${PROP.type}: "[[Cocktails/Types/Aromatic Bitters|Aromatic Bitters]]"`));
});

void test('three default sugar syrups retain distinct identities, ratios, and preparation instructions', () => {
	const syrups = STARTER_CATALOG.filter(entry => ['Simple Syrup (1:1)', 'Simple Syrup (2:1)', 'Demerara Syrup (2:1)'].includes(entry.name));
	assert.equal(syrups.length, 3);
	assert.deepEqual(syrups.map(entry => entry.properties?.[PROP.sugarWaterRatio]), ['1:1 by weight', '2:1 by weight', '2:1 by weight']);
	assert.ok(syrups.every(entry => entry.method?.includes('by weight') && entry.description));
});

void test('renamed catalog pages remain the target of new parent links', () => {
	const paths = new Map([
		['family/Rum', 'Cocktails/Families/My Rum.md'], ['category/Spirit', 'Cocktails/Categories/Spirits.md'],
		['family/Apple Brandy Family', 'Cocktails/Families/My Apple Brandies.md'], ['family/Amaro Family', 'Cocktails/Families/My Amari.md'],
		['type/Aromatic Bitters', 'Cocktails/Types/My Aromatic Bitters.md'], ['bottle/Angostura Bitters', 'Cocktails/Bottles/My Angostura.md'],
	]);
	const files = starterPlan('Cocktails', paths);
	assert.ok(files.some(file => file.path === 'Cocktails/Families/My Rum.md'));
	const jamaican = files.find(file => file.path.endsWith('/Aged Jamaican Rum.md'));
	assert.ok(jamaican?.content.includes('[[Cocktails/Families/My Rum|Rum]]'));
	assert.ok(files.find(file => file.catalogId === 'type/Apple Brandy')?.content.includes('[[Cocktails/Families/My Apple Brandies|Apple Brandy Family]]'));
	assert.ok(files.find(file => file.catalogId === 'type/Amaro')?.content.includes('[[Cocktails/Families/My Amari|Amaro Family]]'));
	const angostura = files.find(file => file.catalogId === 'bottle/Angostura Bitters');
	assert.equal(angostura?.path, 'Cocktails/Bottles/My Angostura.md');
	assert.ok(angostura?.content.includes(`${PROP.type}: "[[Cocktails/Types/My Aromatic Bitters|Aromatic Bitters]]"`));
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

void test('types and families store one parent link and reject lists', () => {
	const family = wikiLink('Cocktails/Families/Rum.md');
	const type = renderNote('Cocktails', { kind: 'type', name: 'Example Rum', description: '', properties: { [PROP.family]: family } }, '2026-11-04');
	assert.ok(type.content.includes(`cc-family: ${JSON.stringify(family)}\n`));
	assert.throws(() => renderNote('Cocktails', { kind: 'type', name: 'Example Rum', description: '', properties: { [PROP.family]: [family] } }, '2026-11-04'), /one ingredient family/);
	assert.throws(() => renderNote('Cocktails', { kind: 'family', name: 'Example', description: '', properties: { [PROP.category]: [wikiLink('Cocktails/Categories/Spirit.md')] } }, '2026-11-04'), /one ingredient category/);
	for (const file of starterPlan('Cocktails')) assert.ok(!/cc-(family|category): \[/.test(file.content), file.path);
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
		const parentKind = entry.kind === 'bottle' ? 'type' : entry.kind === 'type' ? 'family' : 'category';
		assert.ok(STARTER_CATALOG.some(parent => parent.name === entry.parent && parent.kind === parentKind), entry.name);
	}
});

void test('home introduces all six resource Bases in context without embeds or stock-unit advice', () => {
	const files = starterPlan('Drinks/Cabinet');
	const home = files.find(file => file.kind === 'cabinet')!;
	const bases = files.filter(file => file.kind === 'base');
	assert.equal(bases.length, 9);
	assert.ok(home.content.includes(wikiLink(basePath('Drinks/Cabinet', RESTOCK_BASE), RESTOCK_BASE)));
	assert.ok(bases.some(file => file.path === basePath('Drinks/Cabinet', NAVIGATION_BASE)));
	assert.ok(bases.some(file => file.path === basePath('Drinks/Cabinet', SHOPPING_BASE)));
	assert.ok(home.content.includes(wikiLink(shoppingNotePath('Drinks/Cabinet'), 'Shopping list')));
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
	const bases = starterPlan(root).filter(file => file.kind === 'base' && RESOURCE_BASES.some(resource => file.path === basePath(root, resource.name)));
	assert.equal(bases.length, RESOURCE_BASES.length);
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
	for (const [name, expected] of [['Cachaça', 'Cachaca'], ['Añejo Tequila', 'Anejo Tequila'], ['Bénédictine', 'Benedictine'], ['Crème de Cacao', 'Creme de Cacao'], ['Ærø', 'AEroe'], ['Last Wørd', 'Last Woerd']]) {
		assert.equal(fileName(name!), expected);
	}
	assert.equal(notePath('Cocktails', 'type', 'Cachaça'), notePath('Cocktails', 'type', 'Cachaca'));
	assert.equal(fileName('Cafe\u0301'), 'Cafe');
	assert.equal(fileName('Ti’ Punch'), "Ti' Punch");
	assert.throws(() => fileName('東京'));
	assert.throws(() => fileName('NúL'));
});

void test('filenames are derived by rule from names with numbers and initialisms', () => {
	assert.equal(fileName('Tuxedo #2'), 'Tuxedo No 2');
	assert.equal(fileName('Biloxi Deluxe #2'), 'Biloxi Deluxe No 2');
	assert.equal(fileName('Maison Rouge Cognac V.S.'), 'Maison Rouge Cognac VS');
	assert.equal(fileName('Mr. Bali Hai Tribute'), 'Mr. Bali Hai Tribute');
	assert.equal(fileName('F.B.I. Sour'), 'F.B.I. Sour');
	assert.equal(fileName('Simple Syrup (2:1)'), 'Simple Syrup (2 to 1)');
	assert.throws(() => fileName('Note: draft'));
	for (const name of ['A#Heading', 'Done.']) assert.throws(() => fileName(name), name);
	const note = renderNote('Cocktails', { kind: 'recipe', name: 'Tuxedo #2', description: '' }, '2026-11-04');
	assert.equal(note.path, 'Cocktails/Recipes/Tuxedo No 2.md');
	assert.ok(note.content.includes('cc-name: "Tuxedo #2"'));
	assert.ok(note.content.includes('aliases: ["Tuxedo #2"]'));
	assert.ok(note.content.includes('# Tuxedo #2\n'));
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
		['Green Herbal Liqueur', 'Herbal & Spice Liqueur'], ['Yellow Herbal Liqueur', 'Herbal & Spice Liqueur'], ['Herbal Liqueur', 'Herbal & Spice Liqueur'],
		['Crème de Menthe', 'Herbal & Spice Liqueur'], ['Contemporary Gin', 'Gin'],
		['Vermouth Amaro', 'Vermouth'], ['Vanilla Syrup', 'Flavored Syrup'],
		['Elderflower Liqueur', 'Floral Liqueur'], ['Violet Liqueur', 'Floral Liqueur'],
		['Allspice Dram', 'Herbal & Spice Liqueur'], ['Falernum', 'Herbal & Spice Liqueur'], ['Vanilla Liqueur', 'Herbal & Spice Liqueur'], ['Spice Liqueur', 'Herbal & Spice Liqueur'], ['Amaretto', 'Nut Liqueur'],
		['Flavored Rum', 'Rum'], ['Specialty Bitters', 'Bitters'], ['Tiki Bitters', 'Bitters'], ['Grapefruit Bitters', 'Bitters'],
		['Pineapple Liqueur', 'Fruit Liqueur'], ['Melon Liqueur', 'Fruit Liqueur'], ['Bergamot Liqueur', 'Fruit Liqueur'], ['Bitter Aperitif Wine', 'Aperitif Wine'],
		['Coffee Liqueur', undefined], ['Crème de Cacao', undefined], ['Vodka', undefined],
		['Amaro', 'Amaro Family'], ['Red Bitter Liqueur', 'Amaro Family'], ['Orange Bitter Liqueur', 'Amaro Family'], ['Gentian Liqueur', 'Amaro Family'], ['Fernet', 'Amaro Family'], ['Artichoke Amaro', 'Amaro Family'],
	];
	for (const [name, parent] of expected) {
		const entry = STARTER_CATALOG.find(entry => entry.kind === 'type' && entry.name === name);
		assert.ok(entry, name);
		assert.equal(entry.parent, parent, name);
	}
	for (const name of ['Herbal and Floral Liqueur', 'Nut and Dessert Liqueur', 'Unflavored Vodka', 'Bitter Liqueur', 'Red Bitter Aperitif', 'Gentian Aperitif', 'Swedish Punsch', 'Sloe Gin', 'Coconut Rum', 'Bénédictine']) {
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

void test('the Recipes Base adds a Latest view, newest first', () => {
	const recipes = starterPlan('Cocktails').find(file => file.path.endsWith('/Recipes.base'))!.content;
	const [, byName, latest] = recipes.split('  - type: table\n');
	assert.match(byName!, /name: "Recipes"[\s\S]*property: file\.name\n {8}direction: ASC/);
	assert.match(latest!, /name: "Latest"[\s\S]*property: note\.created\n {8}direction: DESC/);
	assert.ok(latest!.includes('      - note.created'), 'Latest shows the Created column');
});

void test('the navigation Base is scoped to the root and serves every embedded view', () => {
	const root = "My cabinet's/Drinks";
	const base = navigationBase(root);
	assert.equal(base.path, basePath(root, NAVIGATION_BASE));
	assert.ok(base.content.includes(`- 'file.inFolder("My cabinet''s/Drinks")'`));
	assert.ok(base.content.includes('direction: DESC'), 'recipes sort by rating');
	for (const view of Object.values(NAVIGATION_VIEWS)) assert.ok(base.content.includes(`name: "${view}"`), view);
	assert.ok(!base.content.includes(PROP.catalogId));
	// Every formula line is one YAML single-quoted scalar.
	for (const line of base.content.split('formulas:\n')[1]!.split('properties:')[0]!.trimEnd().split('\n')) assert.match(line, /^ {2}\w+: '.*'$/);
});

void test('resource notes embed their navigation sections; recipes do not', () => {
	const embed = (view: string) => `![[Cocktails/Views/${NAVIGATION_BASE}.base#${view}]]`;
	assert.equal(navigationEmbeds('Cocktails', 'category'), [NAVIGATION_VIEWS.families, NAVIGATION_VIEWS.recipes].map(embed).join('\n\n'));
	assert.equal(navigationEmbeds('Cocktails', 'family'), [NAVIGATION_VIEWS.types, NAVIGATION_VIEWS.stock, NAVIGATION_VIEWS.recipes].map(embed).join('\n\n'));
	assert.equal(navigationEmbeds('Cocktails', 'type'), [NAVIGATION_VIEWS.stock, NAVIGATION_VIEWS.recipes].map(embed).join('\n\n'));
	for (const kind of ['bottle', 'ingredient'] as const) assert.equal(navigationEmbeds('Cocktails', kind), [NAVIGATION_VIEWS.sameType, NAVIGATION_VIEWS.recipes].map(embed).join('\n\n'));
	assert.equal(navigationEmbeds('Cocktails', 'recipe'), '');
	const type = renderNote('Cocktails', { kind: 'type', name: 'Example', description: 'About it.' }, '2026-11-04');
	assert.ok(type.content.endsWith(`About it.\n\n${navigationEmbeds('Cocktails', 'type')}\n`));
	const recipe = renderNote('Cocktails', { kind: 'recipe', name: 'Example', description: '' }, '2026-11-04');
	assert.ok(!recipe.content.includes(NAVIGATION_BASE));
});

void test('ratings read numbers, numeric strings, and star runs from 1 to 5', () => {
	assert.equal(parseRating(4), 4);
	assert.equal(parseRating('3'), 3);
	assert.equal(parseRating('⭐️⭐️⭐️⭐️'), 4);
	assert.equal(parseRating('⭐⭐'), 2);
	for (const value of [null, undefined, '', '  ']) assert.equal(parseRating(value), null);
	for (const value of [0, 6, 3.5, 'great', '⭐️ good', ['⭐️']]) assert.equal(parseRating(value), undefined);
});

void test('the shopping list is a Base with a section per kind, embedded in its own note', () => {
	const base = shoppingBase('Cocktails');
	assert.equal(base.path, 'Cocktails/Views/Shopping list.base');
	for (const view of Object.values(SHOPPING_VIEWS)) assert.ok(base.content.includes(`name: "${view}"`), view);
	assert.equal((base.content.match(/note\["cc-shopping-list"\] == true/g) ?? []).length, 3);
	for (const label of ['Type', 'Provides', 'Have', 'Not in stock', 'Last price']) assert.ok(base.content.includes(`displayName: "${label}"`), label);
	const note = shoppingNote('Cocktails');
	assert.equal(note.path, 'Cocktails/Shopping list.md');
	assert.ok(note.content.startsWith('---\ncc-kind: "shopping"\n---\n# Shopping list\n'));
	for (const view of Object.values(SHOPPING_VIEWS)) assert.ok(note.content.includes(`![[Cocktails/Views/Shopping list.base#${view}]]`), view);
	assert.ok(note.content.includes('[[Cocktails/Views/Restock.base|Restock]]'));
});

void test('starter syrups use ratio names, keep their filenames and IDs, and alias the everyday names', () => {
	const files = starterPlan('Cocktails');
	const rich = files.find(file => file.catalogId === 'type/Simple Syrup (2 to 1)')!;
	assert.equal(rich.path, 'Cocktails/Types/Simple Syrup (2 to 1).md');
	assert.ok(rich.content.includes('cc-name: "Simple Syrup (2:1)"'));
	assert.ok(rich.content.includes('"Rich Simple Syrup"') && rich.content.includes('"Simple Syrup (2:1)"'));
	assert.ok(files.find(file => file.catalogId === 'type/Simple Syrup (1 to 1)')!.content.includes('"Simple Syrup"'));
	assert.ok(files.find(file => file.catalogId === 'type/Demerara Syrup (2 to 1)')!.content.includes('"Rich Demerara Syrup"'));
});

void test('the worked example links starter types, measures every pour, and starts with unknown stock', () => {
	assert.ok(!starterPlan('Cocktails').some(file => file.example), 'examples only when asked for');
	const files = examplePlan('Cocktails', '2026-11-04');
	const paths = new Set(starterPlan('Cocktails').map(file => file.path));
	const ids = new Set(STARTER_CATALOG.map(entry => entry.id));
	for (const example of STARTER_EXAMPLES) assert.ok(!ids.has(example.id), example.id);
	assert.equal(new Set(STARTER_EXAMPLES.map(example => example.id)).size, STARTER_EXAMPLES.length);
	for (const file of files) {
		assert.ok(file.example && file.catalogId && file.content.includes(`cc-catalog-id: "${file.catalogId}"`), file.path);
		for (const [, target] of file.content.matchAll(/\[\[([^|\]]+)\|/g)) assert.ok(paths.has(`${target}.md`), `${file.path} → ${target}`);
	}
	const syrup = files.find(file => file.path === 'Cocktails/Ingredients/House Simple Syrup (1 to 1).md')!;
	assert.ok(syrup.content.includes('cc-name: "House Simple Syrup (1:1)"'));
	assert.ok(syrup.content.includes('cc-stock-tracking: "volume"') && syrup.content.includes('cc-remaining-ml: null'));
	const limes = files.find(file => file.path === 'Cocktails/Ingredients/Limes.md')!;
	assert.ok(limes.content.includes('cc-availability: "Unknown"'));
	for (const recipe of files.filter(file => file.kind === 'recipe')) {
		const lines = ingredientSection(recipe.content).split('\n').filter(line => line.startsWith('- '));
		assert.equal(lines.length, 3, recipe.path);
		for (const line of lines) assert.ok(recipeVolumeMl(splitIngredient(line.slice(2)).amount) !== null, line);
		assert.ok(recipe.content.includes('[[Cocktails/Types/Simple Syrup (1 to 1)|Simple Syrup]]'));
	}
});

void test('the home note introduces the example only in a new cabinet', () => {
	const home = (examples: boolean) => starterPlan('Cocktails', new Map(), examples).find(file => file.kind === 'cabinet')!.content;
	assert.ok(!home(false).includes('Try an example'));
	assert.ok(home(true).includes('[[Cocktails/Ingredients/Limes|Limes]], [[Cocktails/Ingredients/Lemons|Lemons]], and [[Cocktails/Ingredients/House Simple Syrup (1 to 1)|House Simple Syrup (1:1)]]'));
	assert.ok(home(true).includes('[[Cocktails/Recipes/Daiquiri|Daiquiri]] and [[Cocktails/Recipes/Whiskey Sour|Whiskey Sour]]'));
});

void test('Restock is a Base of shopping candidates: running low, out, unknown', () => {
	const base = restockBase('Cocktails');
	assert.equal(base.path, basePath('Cocktails', RESTOCK_BASE));
	const { content } = base;
	const views = content.split('\n  - type: table\n').slice(1);
	assert.deepEqual(views.map(view => /name: "(.*)"/.exec(view)![1]), Object.values(RESTOCK_VIEWS));
	for (const view of views) {
		assert.ok(view.includes('note["cc-kind"] == "bottle" || note["cc-kind"] == "ingredient"'));
		assert.ok(view.includes('      - note.cc-shopping-list\n'), 'each view can add to the shopping list');
	}
	assert.match(views[0]!, /formula\.low/);
	// Out is ordered by last change, so a bottle bought once sinks without being dismissed.
	assert.match(views[1]!, /formula\.out'\n[\s\S]*property: file\.mtime\n {8}direction: DESC/);
	assert.match(views[2]!, /formula\.unknown/);
	assert.ok(views[2]!.includes('      - formula.unknownStock\n'));
	// Low: Low status, or the last bottle under the share (or mL without a size); out needs known zeros.
	for (const part of ['== "Low"', 'note["cc-open-ml"] > 0 && if(note["cc-unopened"] == null, true, note["cc-unopened"] <= 0)', '<= formula.lowShare', '<= formula.lowMl', 'note["cc-remaining-ml"] > 0 && note["cc-remaining-ml"] <= formula.lowMl']) assert.ok(content.includes(part), part);
	// Blank amounts are none: out is nothing above 0, and unknown is only availability or a missing mode.
	for (const part of ['== "Out"', 'if(note["cc-open-ml"] == null, true, note["cc-open-ml"] <= 0) && if(note["cc-unopened"] == null, true, note["cc-unopened"] <= 0)', 'if(note["cc-remaining-ml"] == null, true, note["cc-remaining-ml"] <= 0)']) assert.ok(content.includes(part), part);
	// Bases doesn't treat `!(blank > 0)` or `!blank` as true for numbers.
	assert.ok(!content.includes('!(note[') && !content.includes('!note["cc-unopened"]'));
	assert.ok(content.includes(`unknown: 'if(note["cc-stock-tracking"] == "status", !note["cc-availability"] || note["cc-availability"] == "Unknown", note["cc-stock-tracking"] != "volume")'`));
		assert.ok(content.includes("lowShare: '0.1'") && content.includes("lowMl: '70'"), 'defaults: 10% and 70 mL');
	const custom = restockBase('Cocktails', { percent: 25, ml: 100 }).content;
	assert.ok(custom.includes("lowShare: '0.25'") && custom.includes("lowMl: '100'"));
	for (const line of content.split('formulas:\n')[1]!.split('properties:')[0]!.trimEnd().split('\n')) assert.match(line, /^ {2}\w+: '.*'$/);
});
