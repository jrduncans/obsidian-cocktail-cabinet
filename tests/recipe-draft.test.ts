import assert from 'node:assert/strict';
import test from 'node:test';
import type { CabinetNote } from '../src/core/schema';
import { draftFromText } from '../src/core/recipe-draft';

const note = (name: string, kind: CabinetNote['kind'], extra: Partial<CabinetNote> = {}): CabinetNote => ({
	path: `Cocktails/${kind}/${name}.md`,
	name,
	kind,
	parents: [],
	...extra,
});

const notes = [
	note('Aged Jamaican Rum', 'type', { writtenAs: ['rum, such as Coruba'] }),
	note('Campari', 'bottle'),
	note('Lime Juice', 'type'),
	note('Sweet Vermouth', 'type', { writtenAs: ['Vermouth (Sweet)'] }),
	note('Cocchi Vermouth di Torino', 'bottle', { writtenAs: ['Vermouth (Sweet)'] }),
	note('Rum Swizzle', 'recipe', { writtenAs: ['lime juice'] }),
];

void test('a draft links only wordings one note remembers, keeping echoed volumes with the amount', () => {
	const { draft, lines, warnings } = draftFromText(
		'Yacht Rock\n\n## Ingredients\n- 3/4 ounce rum, such as Coruba\n- 1 oz · 30 ml Campari\n- 1/2 oz Vermouth (Sweet)\n- 1/2 ounce lime juice\n\n## Directions\nShake with ice.\n\n## Tasting Notes\nBright.\n\n#shaken #tiki',
		notes,
		{ source: 'https://example.test/yacht-rock' },
	);
	assert.equal(draft.name, 'Yacht Rock');
	assert.deepEqual(draft.ingredients, [
		'3/4 ounce [[Cocktails/type/Aged Jamaican Rum|rum, such as Coruba]]',
		'1 oz · 30 ml Campari',
		'1/2 oz Vermouth (Sweet)',
		'1/2 ounce lime juice',
	]);
	assert.equal(lines[0]!.link?.name, 'Aged Jamaican Rum');
	assert.equal(lines[1]!.wording, 'Campari');
	assert.equal(lines[1]!.suggestions[0]?.name, 'Campari');
	// Remembered by two notes: both suggested, neither linked.
	assert.equal(lines[2]!.link, undefined);
	assert.deepEqual(
		lines[2]!.suggestions.slice(0, 2).map((item) => item.name),
		['Sweet Vermouth', 'Cocchi Vermouth di Torino'],
	);
	// Recipes never remember wordings.
	assert.equal(lines[3]!.link, undefined);
	assert.equal(draft.method, 'Shake with ice.');
	assert.equal(draft.tastingNotes, 'Bright.');
	assert.deepEqual(draft.properties, {
		source: 'https://example.test/yacht-rock',
		rating: null,
		tags: ['shaken', 'tiki'],
	});
	// The name came from a bare first line, which the review would ask to check.
	assert.ok(warnings.some((warning) => /first line/.test(warning)));
});

void test('a draft takes a given name and rating, and refuses text it cannot make a recipe from', () => {
	const { draft } = draftFromText('- 1 oz gin\n- 1 oz Campari', notes, { name: 'Two Parts', rating: '4' });
	assert.equal(draft.name, 'Two Parts');
	assert.equal(draft.properties?.rating, 4);
	assert.equal(draft.properties?.source, null);
	assert.throws(() => draftFromText('- 1 oz gin', notes), /no name/);
	assert.throws(() => draftFromText('Just a title', notes), /No ingredient lines/);
	assert.throws(() => draftFromText('- 1 oz gin', notes, { name: 'X', rating: 'great' }), /rating/);
	// Lines already linked are kept as written, with no suggestions.
	const linked = draftFromText('- 1 oz [[Gin]]', notes, { name: 'Linked' });
	assert.deepEqual(linked.draft.ingredients, ['1 oz [[Gin]]']);
	assert.deepEqual(linked.lines[0]!.suggestions, []);
});

void test('a draft writes fluid-ounce amounts with fraction characters only when asked', () => {
	const text = 'Halves\n- 1 1/2 oz. / 45 ml. gin\n- .75 oz lime juice\n- 22.5 ml syrup';
	assert.deepEqual(draftFromText(text, notes, { fractions: true }).draft.ingredients, [
		'1½ oz. / 45 ml. gin',
		'¾ oz lime juice',
		'22.5 ml syrup',
	]);
	assert.deepEqual(draftFromText(text, notes).draft.ingredients, [
		'1 1/2 oz. / 45 ml. gin',
		'.75 oz lime juice',
		'22.5 ml syrup',
	]);
});
