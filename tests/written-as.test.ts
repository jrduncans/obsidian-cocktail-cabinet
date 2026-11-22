import assert from 'node:assert/strict';
import test from 'node:test';
import type { CabinetNote } from '../src/core/schema';
import { suggestIngredient } from '../src/core/recipe-import';
import { canRemember, rememberedNote, rememberingNotes, withWording, writtenAsProperty } from '../src/core/written-as';

const note = (name: string, kind: CabinetNote['kind'], extra: Partial<CabinetNote> = {}): CabinetNote => ({
	path: `Cocktails/${kind}/${name}.md`,
	name,
	kind,
	parents: [],
	...extra,
});

const agedRum = note('Aged Jamaican Rum', 'type', { writtenAs: ['rum, such as Coruba'] });
const sweet = note('Sweet Vermouth', 'type', { aliases: ['Rosso Vermouth'], writtenAs: ['Vermouth (Sweet)'] });
const cocchi = note('Cocchi Vermouth di Torino', 'bottle', { writtenAs: ['vermouth (sweet)'] });
const rye = note('Rye Whiskey', 'type');
const recipe = note('Rum Old Fashioned', 'recipe', { writtenAs: ['rum'] });

void test('the property reads strings from ingredient notes only', () => {
	assert.deepEqual(writtenAsProperty('type', ['rum, such as Coruba', ' ', 3, ' Rye (Bonded) ']), {
		writtenAs: ['rum, such as Coruba', 'Rye (Bonded)'],
	});
	assert.deepEqual(writtenAsProperty('bottle', 'Cocchi American'), { writtenAs: ['Cocchi American'] });
	assert.deepEqual(writtenAsProperty('type', null), {});
	assert.deepEqual(writtenAsProperty('recipe', ['rum']), {});
});

void test('a wording links only when exactly one note remembers it, compared loosely', () => {
	const notes = [agedRum, sweet, cocchi, rye, recipe];
	assert.equal(rememberedNote('Rum, such as Coruba', notes), agedRum);
	assert.equal(rememberedNote('rum such as coruba', notes), agedRum);
	assert.equal(rememberedNote('rum, such as Smith & Cross', notes), undefined);
	// Remembered by two notes: no link, both offered.
	assert.equal(rememberedNote('Vermouth (Sweet)', notes), undefined);
	assert.deepEqual(rememberingNotes('Vermouth (Sweet)', notes), [sweet, cocchi]);
	// Recipes never remember wordings, and a name is not a remembered wording.
	assert.equal(rememberedNote('rum', notes), undefined);
	assert.equal(rememberedNote('Rye Whiskey', notes), undefined);
	assert.equal(rememberedNote('', notes), undefined);
});

void test('remembering is offered only for wordings the note does not already recognize', () => {
	assert.equal(canRemember('rum, such as Smith & Cross', agedRum), true);
	assert.equal(canRemember('Rum, such as Coruba', agedRum), false);
	assert.equal(canRemember('aged jamaican rum', agedRum), false);
	assert.equal(canRemember('Rosso vermouth', sweet), false);
	assert.equal(canRemember('Rye (Bonded)', rye), true);
	assert.equal(canRemember('[[Rye Whiskey]]', rye), false);
	assert.equal(canRemember('  ', rye), false);
	assert.equal(canRemember('rum', recipe), false);
});

void test('adding a wording keeps what is there and skips loose duplicates', () => {
	assert.deepEqual(withWording(undefined, ' Rye (Bonded) '), ['Rye (Bonded)']);
	assert.deepEqual(withWording('Cocchi American', 'Cocchi Americano'), ['Cocchi American', 'Cocchi Americano']);
	assert.deepEqual(withWording(['Gin'], 'Gin (London Dry)'), ['Gin', 'Gin (London Dry)']);
	assert.equal(withWording(['Gin (London Dry)'], 'gin london dry'), null);
	assert.equal(withWording(['Gin'], '!!'), null);
});

void test('suggestions put notes remembering the exact wording first', () => {
	const notes = [agedRum, sweet, cocchi, rye, note('Rum', 'family')];
	assert.equal(suggestIngredient('rum, such as Coruba', notes)[0], agedRum);
	assert.deepEqual(suggestIngredient('Vermouth (Sweet)', notes).slice(0, 2), [sweet, cocchi]);
	// Partial matches never come from remembered wordings.
	assert.ok(!suggestIngredient('Coruba', notes).includes(agedRum));
	// Wordings with alternatives get no name suggestions, but a remembered one still shows.
	const both = note('Lemon Juice', 'type', { writtenAs: ['lemon or lime juice'] });
	assert.deepEqual(suggestIngredient('lemon or lime juice', [both]), [both]);
	assert.deepEqual(suggestIngredient('lemon or lime juice', [rye]), []);
});
