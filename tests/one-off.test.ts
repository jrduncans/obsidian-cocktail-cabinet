import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDailyLog } from '../src/core/logging-daily';
import {
	findOneOffs,
	oneOffContent,
	oneOffDailyEntry,
	oneOffDailyText,
	replaceOneOffHeader,
	savedOneOffHeader,
} from '../src/core/one-off';
import type { CabinetNote } from '../src/core/schema';

const negroni: CabinetNote = { path: 'Cocktails/Recipes/Negroni.md', name: 'Negroni', kind: 'recipe', parents: [] };
const lines = [
	'1½ oz [[Cocktails/Bottles/Old Overholt|Old Overholt]]',
	'¾ oz [[Cocktails/Bottles/Campari|Campari]]',
	'Orange peel',
];

void test('a one-off is logged as a header and its lines per serving', () => {
	assert.equal(oneOffDailyEntry({ name: '', lines }, 1), `Made a one-off:\n- ${lines.join('\n- ')}`);
	assert.equal(
		oneOffDailyEntry({ name: 'Rye thing (v2)', lines, riffOn: negroni }, 2).split('\n')[0],
		'Made 2 servings of a one-off (Rye thing (v2)), a riff on [[Cocktails/Recipes/Negroni|Negroni]]:',
	);
	assert.equal(
		oneOffDailyText({ name: 'Rye thing', lines, riffOn: negroni }, 1),
		'Made a one-off (Rye thing), a riff on Negroni.',
	);
	assert.equal(oneOffContent({ name: '', lines: ['1 oz gin'] }), '### Ingredients\n- 1 oz gin\n');
	assert.throws(() => oneOffDailyEntry({ name: 'Bad [[name]]', lines }, 1), /square brackets/);
	assert.throws(() => oneOffDailyEntry({ name: '', lines }, 0), /more than 0/);
});

void test('logged one-offs read back with their name, servings, riff, and lines', () => {
	const entry = oneOffDailyEntry({ name: 'Rye thing (v2)', lines, riffOn: negroni }, 2);
	const content = `# Today\nMade a [[Cocktails/Recipes/Negroni|Negroni]].\n${entry}\n\nLater text\n${oneOffDailyEntry({ name: '', lines: ['2 oz gin'] }, 1)}\n`;
	const found = findOneOffs(content);
	assert.deepEqual(
		found.map(({ name, servings, riffOn, ingredients, line }) => ({ name, servings, riffOn, ingredients, line })),
		[
			{ name: 'Rye thing (v2)', servings: 2, riffOn: 'Cocktails/Recipes/Negroni', ingredients: lines, line: 2 },
			{ name: '', servings: 1, riffOn: undefined, ingredients: ['2 oz gin'], line: 8 },
		],
	);
});

void test('a riff is not the recipe it riffs on, but a saved one-off is its recipe', () => {
	const riff = oneOffDailyEntry({ name: '', lines, riffOn: negroni }, 1);
	assert.equal(hasDailyLog(riff, negroni), false);
	const [found] = findOneOffs(`Notes\r\n${riff.replace(/\n/g, '\r\n')}\r\n`);
	const saved: CabinetNote = {
		path: 'Cocktails/Recipes/Old Pal-ish.md',
		name: 'Old Pal-ish',
		kind: 'recipe',
		parents: [],
	};
	const updated = replaceOneOffHeader(
		`Notes\r\n${riff.replace(/\n/g, '\r\n')}\r\n`,
		found!,
		savedOneOffHeader(found!, saved),
	)!;
	assert.equal(updated.split('\r\n')[1], 'Made an [[Cocktails/Recipes/Old Pal-ish|Old Pal-ish]]:');
	assert.equal(updated.split('\r\n')[2], `- ${lines[0]}`);
	assert.equal(hasDailyLog(updated, saved), true);
	assert.equal(replaceOneOffHeader('Notes\nsomething else\n', found!, 'x'), null);
	assert.equal(
		savedOneOffHeader({ ...found!, servings: 3 }, saved),
		'Made 3 servings of [[Cocktails/Recipes/Old Pal-ish|Old Pal-ish]]:',
	);
});
