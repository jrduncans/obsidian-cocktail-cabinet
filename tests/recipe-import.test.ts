import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecipeText, recipeIngredientNotes, suggestIngredient } from '../src/core/recipe-import';
import { recipeVolumeMl, splitIngredient } from '../src/core/recipe-amount';
import { renderNote } from '../src/core/notes';
import { wikiLink } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';

void test('Markdown review extracts source sections without inventing missing recipe details', () => {
	const result = parseRecipeText(
		'# A long recipe name\r\nSource: https://example.test/recipe\r\n\r\n## Ingredients\r\n- 1½ oz Gin\r\n- ¾ oz lime juice\r\n- Lime wheel, for garnish\r\n## Directions\r\n1. Shake.\r\n2. Strain.\r\n## Tasting Notes\r\nBright.',
	);
	assert.equal(result.name, 'A long recipe name');
	assert.equal(result.source, 'https://example.test/recipe');
	assert.deepEqual(result.ingredients, [
		{ amount: '1½ oz', text: 'Gin' },
		{ amount: '¾ oz', text: 'lime juice' },
		{ amount: '', text: 'Lime wheel, for garnish' },
	]);
	assert.equal(result.method, '1. Shake.\n2. Strain.');
	assert.equal(result.description, '');
	assert.equal(result.tastingNotes, 'Bright.');
	assert.deepEqual(result.warnings, []);
	assert.equal(parseRecipeText('## Ingredients\n- 1 oz Gin').method, '');
});

void test('plain ingredient lists, existing links, alternatives, and unsupported quantities survive rendering', () => {
	const result = parseRecipeText(
		'- 1–2 oz [[Gin]] or [[Vodka]]\n- a splash of soda\n- 1 oz (30 ml) lime juice\n- 2 dashes bitters',
	);
	const ingredients = result.ingredients.map((row) => [row.amount, row.text].filter(Boolean).join(' '));
	assert.deepEqual(ingredients, [
		'1–2 oz [[Gin]] or [[Vodka]]',
		'a splash of soda',
		'1 oz (30 ml) lime juice',
		'2 dashes bitters',
	]);
	const note = renderNote(
		'Cocktails',
		{ kind: 'recipe', name: 'Test', description: result.description, ingredients },
		'2026-10-31',
	);
	for (const ingredient of ingredients) assert.ok(note.content.includes(`- ${ingredient}`));
	assert.ok(result.warnings[0]?.includes('No Ingredients heading'));
	assert.equal(recipeVolumeMl(result.ingredients[0]!.amount), null);
	assert.equal(recipeVolumeMl(result.ingredients[2]!.amount), 30);
});

void test('unrecognized headings and indented continuations are retained for review', () => {
	const result = parseRecipeText(
		'# Test\n## Ingredients\n  - 30 ml Gin\n    optional brand notes\n### Garnish\n- Lime wheel\n## Glass\nCoupe\n## Method\nShake.\n## Notes\nFrom a notebook.',
	);
	assert.deepEqual(result.ingredients, [
		{ amount: '30 ml', text: 'Gin' },
		{ amount: '', text: 'Lime wheel' },
	]);
	assert.ok(result.description.includes('optional brand notes'));
	assert.ok(result.description.includes('### Garnish'));
	assert.ok(result.description.includes('## Glass\nCoupe'));
	assert.ok(result.description.includes('From a notebook.'));
	assert.equal(result.method, 'Shake.');
	assert.ok(result.warnings.length);
});

void test('metadata names and source are used without duplicating the title', () => {
	const result = parseRecipeText('# Source title\n## Ingredients\n1. 2 oz Gin', {
		'cc-name': 'Proper title',
		source: 'My notebook',
	});
	assert.equal(result.name, 'Proper title');
	assert.equal(result.source, 'My notebook');
	assert.equal(result.description, '');
	assert.deepEqual(result.ingredients, [{ amount: '2 oz', text: 'Gin' }]);
});

void test('bold section labels with colons are recognized', () => {
	const result = parseRecipeText('**Ingredients:**\n- 1 oz Gin\n**Instructions:**\nStir.');
	assert.deepEqual(result.ingredients, [{ amount: '1 oz', text: 'Gin' }]);
	assert.equal(result.method, 'Stir.');
});

void test('familiar amounts remain text while only single precise volumes are recognized', () => {
	for (const [amount, expected] of [
		['30 mL', 30],
		['3 cl', 30],
		['1 oz', 29.5735295625],
		['1½ fl. oz.', 44.36029434375],
		['1 1/2 ounces', 44.36029434375],
		['¾ oz', 22.180147171875],
		['.5 oz', 14.78676478125],
		['2,5 cl', 25],
	] as const)
		assert.ok(Math.abs(recipeVolumeMl(amount)! - expected) < 1e-9, amount);
	for (const amount of [
		'',
		'2 dashes',
		'1–2 barspoon',
		'1–2 oz',
		'about 30 ml',
		'1 oz (about 30 ml)',
		'1 part',
		'0 ml',
		'1/0 oz',
		'-1 oz',
		'2 oz + 1 oz',
	]) {
		assert.equal(recipeVolumeMl(amount), null, amount);
	}
	for (const line of [
		'1½ oz Gin',
		'1 1/2 ounces Gin',
		'2 dashes bitters',
		'1–2 oz Gin',
		'1 oz (30 ml) Gin',
		'a splash of Gin',
		'1 lime wheel',
	]) {
		const parsed = splitIngredient(line);
		assert.equal([parsed.amount, parsed.text].filter(Boolean).join(' '), line);
	}
});

const notes: CabinetNote[] = [
	{ path: 'Cocktails/Families/Gin.md', name: 'Gin', kind: 'family', parents: [] },
	{ path: 'Cocktails/Types/London Dry Gin.md', name: 'London Dry Gin', kind: 'type', parents: [] },
	{ path: 'Cocktails/Bottles/Named Gin.md', name: 'Named Gin', kind: 'bottle', parents: [] },
	{
		path: 'Cocktails/Types/Rhum Agricole Blanc.md',
		name: 'Unaged Rhum Agricole',
		aliases: ['Rhum Agricole Blanc'],
		kind: 'type',
		parents: [],
	},
	{ path: 'Cocktails/Ingredients/Lime.md', name: 'Fresh lime', kind: 'ingredient', parents: [] },
	{ path: 'Cocktails/Recipes/Gin.md', name: 'Gin', kind: 'recipe', parents: [] },
];

void test('suggestions rank exact identities and aliases without inferring a stocked bottle or a style default', () => {
	assert.equal(suggestIngredient('Gin', notes)[0]?.kind, 'family');
	assert.equal(suggestIngredient('rhum agricole blanc', notes)[0]?.name, 'Unaged Rhum Agricole');
	assert.equal(suggestIngredient('fresh lime', notes)[0]?.kind, 'ingredient');
	assert.deepEqual(
		suggestIngredient('Gin', [{ path: 'Types/Ginger Ale.md', name: 'Ginger Ale', kind: 'type', parents: [] }]),
		[],
	);
	assert.deepEqual(suggestIngredient('Gin or Vodka', notes), []);
	assert.deepEqual(suggestIngredient('[[Gin]]', notes), []);
	assert.deepEqual(suggestIngredient('Unknown ingredient', notes), []);
	assert.ok(recipeIngredientNotes(notes).every((note) => note.kind !== 'recipe'));
	assert.equal(notes[0]?.name, 'Gin');
});

void test('an explicitly empty Ingredients section cannot borrow unrelated lists', () => {
	const result = parseRecipeText('# Test\n## Ingredients\n## Shopping\n- Buy a shaker');
	assert.deepEqual(result.ingredients, []);
	assert.ok(result.description.includes('Buy a shaker'));
});

void test('accepted links retain the recipe wording while identifying the actual cabinet note', () => {
	const note = suggestIngredient('rhum agricole blanc', notes)[0]!;
	const ingredient = `1 oz ${wikiLink(note.path, 'rhum agricole blanc')}`;
	const rendered = renderNote(
		'Cocktails',
		{ kind: 'recipe', name: 'Test', description: '', ingredients: [ingredient] },
		'2026-10-31',
	);
	assert.ok(rendered.content.includes('1 oz [[Cocktails/Types/Rhum Agricole Blanc|rhum agricole blanc]]'));
});

const COPIED_RECIPE = `2 oz Gin (Cold River)
1 oz Sweet Vermouth (Cocchi Vermouth di Torino)
1/2 oz Strega
1/4 oz Fernet Branca
1 barspoon (1/8 oz) Benedictine
2 dash Regan's Orange Bitters
2 dash Peychaud's Bitters

Stir with ice and strain into a cocktail glass. Garnish with a grapefruit twist.`;

void test('copied website text needs no Markdown headings or bullets', () => {
	const recipe = parseRecipeText(COPIED_RECIPE);
	assert.equal(recipe.name, '');
	assert.equal(recipe.ingredients.length, 7);
	assert.deepEqual(recipe.ingredients[0], { amount: '2 oz', text: 'Gin (Cold River)' });
	assert.deepEqual(recipe.ingredients[1], { amount: '1 oz', text: 'Sweet Vermouth (Cocchi Vermouth di Torino)' });
	assert.deepEqual(recipe.ingredients[4], { amount: '1 barspoon (1/8 oz)', text: 'Benedictine' });
	assert.deepEqual(recipe.ingredients[5], { amount: '2 dash', text: "Regan's Orange Bitters" });
	assert.equal(recipe.method, 'Stir with ice and strain into a cocktail glass. Garnish with a grapefruit twist.');
	assert.equal(recipe.description, '');
	assert.equal(recipe.source, '');
	const lines = recipe.ingredients.map((row) => `${row.amount} ${row.text}`);
	assert.equal(lines.join('\n'), COPIED_RECIPE.split('\n\n')[0]);
});

void test('plain copied text accepts CRLF, hard breaks, list markers, and a numbered method', () => {
	const recipe = parseRecipeText(COPIED_RECIPE.replaceAll('\n', '\\\r\n').replace('Stir with', '1. Stir with'));
	assert.equal(recipe.ingredients.length, 7);
	assert.ok(recipe.method.startsWith('1. Stir with'));
	assert.equal(recipe.ingredients[0]?.text, 'Gin (Cold River)');
	const bulleted = parseRecipeText('- 2 oz Gin\n- 1 oz Sweet Vermouth\n\nStir with ice.\nStrain.');
	assert.equal(bulleted.ingredients.length, 2);
	assert.equal(bulleted.method, 'Stir with ice.\nStrain.');
});

void test('unknown prose and embedded code remain content for review', () => {
	const recipe = parseRecipeText(
		'From a clipping.\n```text\n2 oz This is a code example\n```\n2 oz Gin\n\nThis is an unusual preparation without a recognized verb.',
	);
	assert.deepEqual(recipe.ingredients, [{ amount: '2 oz', text: 'Gin' }]);
	assert.ok(recipe.description.includes('From a clipping.'));
	assert.ok(recipe.description.includes('```text\n2 oz This is a code example\n```'));
	assert.ok(recipe.description.includes('unusual preparation'));
});

void test('bare barspoons and teaspoons count as one US teaspoon; explicit volumes win', () => {
	assert.equal(recipeVolumeMl('1 barspoon'), 4.92892159375);
	assert.equal(recipeVolumeMl('2 barspoons'), 2 * 4.92892159375);
	assert.equal(recipeVolumeMl('1/2 tsp'), 4.92892159375 / 2);
	assert.equal(recipeVolumeMl('1 teaspoon'), 4.92892159375);
	assert.equal(recipeVolumeMl('1 tablespoon'), 3 * 4.92892159375);
	assert.equal(recipeVolumeMl('1/2 tbsp'), 1.5 * 4.92892159375);
	assert.equal(recipeVolumeMl('1 tbsp (15 ml)'), 15);
	assert.equal(recipeVolumeMl('1 barspoon (1/8 oz)'), 29.5735295625 / 8);
	assert.equal(recipeVolumeMl('1 barspoon (5 ml)'), 5);
	assert.equal(recipeVolumeMl('1/0 barspoon (5 ml)'), null);
	assert.equal(recipeVolumeMl('1 barspoon (about 5 ml)'), null);
});

void test('parenthetical brands are offered before a generic identity without changing source wording', () => {
	const brandNotes: CabinetNote[] = [
		...notes,
		{ path: 'Cocktails/Bottles/Cold River Gin.md', name: 'Cold River Gin', kind: 'bottle', parents: [] },
		{ path: 'Cocktails/Types/Sweet Vermouth.md', name: 'Sweet Vermouth', kind: 'type', parents: [] },
		{ path: 'Cocktails/Bottles/Cocchi.md', name: 'Cocchi Vermouth di Torino', kind: 'bottle', parents: [] },
	];
	const recipe = parseRecipeText(COPIED_RECIPE);
	assert.equal(suggestIngredient(recipe.ingredients[0]!.text, brandNotes)[0]?.name, 'Cold River Gin');
	assert.ok(suggestIngredient(recipe.ingredients[0]!.text, brandNotes).some((note) => note.name === 'Gin'));
	assert.equal(suggestIngredient(recipe.ingredients[1]!.text, brandNotes)[0]?.name, 'Cocchi Vermouth di Torino');
	assert.equal(recipe.ingredients[0]!.text, 'Gin (Cold River)');
});

void test('a method without a heading stays in order before explicitly headed steps', () => {
	const result = parseRecipeText('## Ingredients\n- 2 oz Gin\n\nStir with ice.\n## Method\nStrain.');
	assert.equal(result.ingredients.length, 1);
	assert.equal(result.method, 'Stir with ice.\nStrain.');
});

void test('parenthetical ounce and mL equivalents prefer the printed mL while preserving source text', () => {
	for (const [amount, expected] of [
		['2 oz (60 ml)', 60],
		['2oz (60ml)', 60],
		['¼ oz (7.5 ml)', 7.5],
		['60 ml (2 oz)', 60],
		['1 1/2 ounces (45 milliliters)', 45],
		['1½ fl. oz. (45 mL)', 45],
		['¼ oz (7,5 ml)', 7.5],
	] as const) {
		assert.equal(recipeVolumeMl(amount), expected, amount);
		assert.deepEqual(splitIngredient(`${amount} Bourbon`), { amount, text: 'Bourbon' });
	}
	for (const amount of [
		'1–2 oz (30 ml)',
		'2 oz (30–60 ml)',
		'1 oz (about 30 ml)',
		'1/0 oz (30 ml)',
		'0 oz (30 ml)',
		'1 oz (0 ml)',
		'1 oz (30 ml + 5 ml)',
		'1 oz (2 oz)',
		'30 ml (45 ml)',
	]) {
		assert.equal(recipeVolumeMl(amount), null, amount);
	}
});
