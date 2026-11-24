import assert from 'node:assert/strict';
import test from 'node:test';
import { tidiedLine, tidyChanges, tidyContent, tidyLines } from '../src/core/tidy-recipe';
import type { TidyOptions } from '../src/core/tidy-recipe';
import { StaleLineError } from '../src/core/unlinked-lines';
import type { CabinetNote } from '../src/core/schema';

const note = (name: string, aliases: string[] = [], folder = 'Types'): CabinetNote =>
	({ path: `Cocktails/${folder}/${name}.md`, name, kind: 'type', aliases }) as unknown as CabinetNote;

const notes = [
	note('Lime Juice'),
	note('Campari', [], 'Bottles'),
	note('Liquore Strega', ['Strega'], 'Bottles'),
	note('Falernum Syrup', ['Falernum']),
	note('Gin', [], 'Families'),
];
const resolve = (target: string) =>
	notes.find((item) => item.path === `${target}.md` || item.path.split('/').at(-1) === `${target}.md`);
const name: TidyOptions = { level: 'name', fractions: true };
const alias: TidyOptions = { level: 'alias', fractions: true };

const tidy = (raw: string, options = name, all = false) =>
	tidiedLine(
		raw,
		tidyChanges(raw, resolve, options).filter((change) => all || change.ticked),
	);
const kinds = (raw: string, options = name) =>
	tidyChanges(raw, resolve, options).map((change) => `${change.kind}${change.ticked ? '+' : '-'}`);

void test('a line already tidy has no changes', () => {
	assert.deepEqual(kinds('- 1½ oz [[Cocktails/Types/Lime Juice|Lime Juice]]'), []);
	assert.deepEqual(kinds('- 2 dashes Angostura'), []);
	assert.deepEqual(kinds('- 1 oz [[Missing Note]]'), []);
});

void test('fraction characters and full paths start ticked', () => {
	assert.deepEqual(kinds('- 1 1/2 oz [[Gin]]'), ['fraction+', 'path+']);
	assert.equal(tidy('- 1 1/2 oz [[Gin]]'), '- 1½ oz [[Cocktails/Families/Gin|Gin]]');
	assert.equal(tidy('- .75 oz [[Campari|campari]]'), '- ¾ oz [[Cocktails/Bottles/Campari|Campari]]');
	assert.deepEqual(kinds('- 1 1/2 oz gin', { level: 'name', fractions: false }), []);
});

void test('link text that is the same name starts ticked, and an alias only at the alias level', () => {
	assert.deepEqual(kinds('- ¾ oz [[Cocktails/Types/Lime Juice|lime juice]]'), ['name+']);
	assert.deepEqual(kinds('- ¾ oz [[Cocktails/Types/Lime Juice|lime juice]]', { level: 'keep', fractions: true }), [
		'name-',
	]);
	assert.deepEqual(kinds('- ¼ oz [[Cocktails/Bottles/Liquore Strega|Strega]]'), ['name-']);
	assert.deepEqual(kinds('- ¼ oz [[Cocktails/Bottles/Liquore Strega|Strega]]', alias), ['name+']);
	assert.equal(
		tidy('- ¼ oz [[Cocktails/Bottles/Liquore Strega|Strega]]', alias),
		'- ¼ oz [[Cocktails/Bottles/Liquore Strega|Liquore Strega]]',
	);
});

void test('link text without the name is offered unticked', () => {
	const raw = '- ½ oz [[Cocktails/Types/Falernum Syrup|Falernum]]';
	assert.deepEqual(kinds(raw), ['name-']);
	assert.equal(tidy(raw), raw);
	assert.equal(tidy(raw, name, true), '- ½ oz [[Cocktails/Types/Falernum Syrup|Falernum Syrup]]');
});

void test('extra words in the link are offered to move outside it, unticked', () => {
	const raw = '- 1 oz [[Cocktails/Bottles/Campari|bitter Amaro Campari]]';
	assert.deepEqual(kinds(raw), ['move-']);
	assert.equal(tidy(raw, name, true), '- 1 oz bitter Amaro [[Cocktails/Bottles/Campari|Campari]]');
	assert.equal(
		tidy('- ¾ oz [[Lime Juice|fresh lime juice]]', name, true),
		'- ¾ oz fresh [[Cocktails/Types/Lime Juice|Lime Juice]]',
	);
});

void test('punctuation inside the link moves outside it with the cabinet name', () => {
	assert.equal(
		tidy('- 1 oz [[Cocktails/Bottles/Campari|Campari,]] chilled'),
		'- 1 oz [[Cocktails/Bottles/Campari|Campari]], chilled',
	);
});

void test('each link in a line is tidied on its own, and words outside links stay', () => {
	const raw = '- 1 oz [[Gin]] or [[Cocktails/Bottles/Campari|campari]], preferably cold';
	assert.deepEqual(kinds(raw), ['path+', 'name+']);
	assert.equal(
		tidy(raw),
		'- 1 oz [[Cocktails/Families/Gin|Gin]] or [[Cocktails/Bottles/Campari|Campari]], preferably cold',
	);
});

void test('a recipe lists only lines with changes, and writes only the given changes', () => {
	const content = [
		'# Test',
		'### Ingredients',
		'- 1 1/2 oz [[Gin]]',
		'- ¾ oz [[Cocktails/Types/Lime Juice|Lime Juice]]',
		'- ½ oz [[Cocktails/Types/Falernum Syrup|Falernum]]',
		'### Method',
		'- 1 1/2 oz in a method line',
	].join('\n');
	const lines = tidyLines(content, resolve, name);
	assert.deepEqual(
		lines.map((line) => line.line),
		[2, 4],
	);
	const edits = lines.map((line) => ({ ...line, changes: line.changes.filter((change) => change.ticked) }));
	const written = tidyContent(content, edits);
	assert.match(written, /^- 1½ oz \[\[Cocktails\/Families\/Gin\|Gin\]\]$/m);
	assert.match(written, /^- ½ oz \[\[Cocktails\/Types\/Falernum Syrup\|Falernum\]\]$/m);
	assert.match(written, /^- 1 1\/2 oz in a method line$/m);
	assert.throws(() => tidyContent(content.replace('1 1/2 oz [[Gin]]', '2 oz [[Gin]]'), edits), StaleLineError);
});
