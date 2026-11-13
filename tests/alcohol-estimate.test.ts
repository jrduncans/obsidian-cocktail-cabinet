import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DASH_ML,
	DEFAULT_TOP_ML,
	estimateAlcohol,
	methodPreparation,
	noteAbv,
	standardDrinks,
} from '../src/core/alcohol-estimate';
import type { AbvNote, LinkInfo } from '../src/core/alcohol-estimate';

const close = (actual: number | null, expected: number, digits = 3) =>
	assert.ok(actual !== null && Math.abs(actual - expected) < 10 ** -digits, `${actual} ≈ ${expected}`);

void test('a note’s ABV comes from the bottle, then the type, your bottles of it, then the family', () => {
	const family: AbvNote = { kind: 'family', abvTypical: 0.4 };
	const type: AbvNote = { kind: 'type', abvTypical: 0.43, parent: family };
	assert.deepEqual(noteAbv({ kind: 'bottle', abv: 0.47, parent: type }), { abv: 0.47, source: 'bottle' });
	assert.deepEqual(noteAbv({ kind: 'bottle', parent: type }), { abv: 0.43, source: 'typical' });
	assert.deepEqual(noteAbv({ kind: 'type', bottleAbvs: [0.4, 0.5, 0.45], parent: family }), {
		abv: 0.45,
		source: 'bottles',
	});
	assert.deepEqual(noteAbv({ kind: 'type', bottleAbvs: [0.4, 0.5] }), { abv: 0.45, source: 'bottles' });
	assert.deepEqual(noteAbv({ kind: 'type', parent: family }), { abv: 0.4, source: 'typical' });
	assert.deepEqual(noteAbv({ kind: 'type' }), { abv: null, source: 'unknown' });
	assert.deepEqual(noteAbv({ kind: 'type', abvTypical: 0 }), { abv: 0, source: 'typical' });
	assert.deepEqual(noteAbv({ kind: 'ingredient', provides: [{ kind: 'type', abvTypical: 0 }] }), {
		abv: 0,
		source: 'typical',
	});
	assert.deepEqual(noteAbv({ kind: 'ingredient', staple: true }), { abv: 0, source: 'typical' });
	assert.deepEqual(noteAbv({ kind: 'category' }), { abv: null, source: 'unknown' });
	assert.deepEqual(noteAbv({ kind: 'bottle', abv: '40%' }), { abv: null, source: 'unknown' });
});

const LINKS: Record<string, LinkInfo> = {
	Rum: { abv: 0.4, source: 'bottle', facts: [] },
	Gin: { abv: 0.43, source: 'typical', facts: [] },
	Rye: { abv: 0.5, source: 'bottles', facts: [] },
	Vermouth: { abv: 0.16, source: 'bottle', facts: [] },
	Lime: { abv: 0, source: 'typical', facts: ['citrus', 'juice'] },
	Syrup: { abv: 0, source: 'typical', facts: [] },
	Bitters: { abv: 0.447, source: 'bottle', facts: [] },
	Soda: { abv: 0, source: 'typical', facts: ['sparkling'] },
	Champagne: { abv: 0.12, source: 'bottle', facts: ['sparkling'] },
	Mystery: { abv: null, source: 'unknown', facts: [] },
	Overproof: { abv: 0.63, source: 'bottle', facts: [] },
};
const link = (target: string) => LINKS[target] ?? null;

void test('a Daiquiri: measured lines, shaken because it has juice, exact with bottles', () => {
	const estimate = estimateAlcohol({
		lines: ['2 oz (60 ml) [[Rum]]', '1 oz (30 ml) [[Lime]]', '¾ oz (22.5 ml) [[Syrup]]'],
		method: 'Combine and strain.',
		link,
	});
	assert.equal(estimate.preparation, 'shaken');
	assert.equal(estimate.preparationFrom, 'ingredients');
	close(estimate.alcoholMl, 24);
	close(estimate.volumeMl, 112.5 * 1.25);
	close(estimate.abv, 24 / 140.625);
	assert.equal(estimate.basis, 'exact');
	assert.deepEqual(estimate.facts.sort(), ['citrus', 'juice']);
});

void test('the Method text picks the preparation first; a flash blend is shaken; an override replaces the percentage', () => {
	assert.equal(methodPreparation('Stir with ice, then strain. Do not shake.'), 'stirred');
	assert.equal(methodPreparation('Flash blend with crushed ice.'), 'shaken');
	assert.equal(methodPreparation('Blend until smooth.'), 'blended');
	assert.equal(methodPreparation('Build over ice in a highball.'), 'built');
	assert.equal(methodPreparation('Combine.'), null);
	const stirred = estimateAlcohol({ lines: ['2 oz [[Gin]]', '1 oz [[Vermouth]]'], method: 'Stir.', link });
	assert.equal(stirred.preparation, 'stirred');
	assert.equal(stirred.dilution, 0.18);
	const spirit = estimateAlcohol({ lines: ['2 oz [[Gin]]'], method: '', link });
	assert.equal(spirit.preparation, 'stirred');
	const custom = estimateAlcohol({ lines: ['2 oz [[Gin]]'], method: 'Stir.', dilution: 0.4, link });
	assert.equal(custom.preparationFrom, 'override');
	assert.equal(custom.dilution, 0.4);
});

void test('dashes count, ranges use the midpoint, and garnishes and rinses don’t', () => {
	const estimate = estimateAlcohol({
		lines: [
			'2 oz (60 ml) [[Rum]]',
			'2 dashes [[Bitters]]',
			'1–2 oz [[Vermouth]]',
			'Absinthe rinse',
			'Garnish: lime wheel',
			'Lemon peel oil',
		],
		method: 'Stir.',
		link,
	});
	const ml = estimate.lines.map((line) => line.ml);
	close(ml[1]!, 2 * DASH_ML);
	close(ml[2]!, 1.5 * 29.5735);
	assert.deepEqual(
		estimate.lines.map((line) => line.shape),
		['measured', 'dash', 'range', 'ignored', 'ignored', 'ignored'],
	);
	assert.equal(estimate.basis, 'rough');
	close(estimate.alcoholMl, 24 + 2 * DASH_ML * 0.447 + 1.5 * 29.5735 * 0.16, 2);
});

void test('a top without an amount assumes a pour, added after dilution; a stated amount is used', () => {
	const soda = estimateAlcohol({ lines: ['2 oz (60 ml) [[Gin]]', 'Top with [[Soda]]'], method: 'Build.', link });
	assert.equal(soda.lines[1]!.shape, 'top');
	close(soda.volumeMl, 60 * 1.1 + DEFAULT_TOP_ML);
	close(soda.alcoholMl, 25.8);
	assert.equal(soda.basis, 'rough');
	assert.deepEqual(soda.facts, ['sparkling']);
	const wine = estimateAlcohol({
		lines: ['1 oz (30 ml) [[Gin]]', 'Top with 3 oz (90 ml) [[Champagne]]'],
		method: 'Shake gin, top with champagne.',
		link,
	});
	assert.equal(wine.lines[1]!.shape, 'measured');
	assert.equal(wine.basis, 'typical');
});

void test('the basis says how sure it is, and non-alcoholic lines never lower it', () => {
	const basis = (lines: string[]) => estimateAlcohol({ lines, method: 'Shake.', link }).basis;
	assert.equal(basis(['2 oz [[Rum]]', '1 oz [[Lime]]']), 'exact');
	assert.equal(basis(['2 oz [[Gin]]', '1 oz [[Lime]]']), 'typical');
	assert.equal(basis(['2 oz [[Rye]]', '1 oz [[Gin]]']), 'bottles');
	assert.equal(basis(['2 oz [[Rum]]', '1 oz [[Mystery]]']), 'partial');
	assert.equal(basis(['2 oz gin, unlinked', '1 oz [[Lime]]']), 'partial');
	assert.equal(basis(['Splash of [[Overproof]]', '2 oz [[Rum]]']), 'partial');
	assert.equal(basis(['1 [[Egg White]]', '2 oz [[Rum]]']), 'exact');
	assert.equal(basis(['Pinch of salt', '2 oz [[Rum]]']), 'exact');
	assert.equal(basis(['Garnish: cherry']), 'none');
	const mocktail = estimateAlcohol({ lines: ['2 oz [[Lime]]', '1 oz [[Syrup]]'], method: 'Shake.', link });
	assert.equal(mocktail.basis, 'exact');
	assert.equal(mocktail.abv, 0);
});

void test('alternatives on one line use the first link and flag a wide spread', () => {
	const estimate = estimateAlcohol({ lines: ['2 oz [[Rum]] or [[Overproof]]'], method: 'Stir.', link });
	assert.equal(estimate.lines[0]!.abv, 0.4);
	assert.equal(estimate.lines[0]!.alternativesDiffer, true);
	const close5 = estimateAlcohol({ lines: ['2 oz [[Rum]] or [[Gin]]'], method: 'Stir.', link });
	assert.equal(close5.lines[0]!.alternativesDiffer, undefined);
});

void test('standard drinks use 14 g (US) or 8 g (UK) of ethanol', () => {
	close(standardDrinks(17.74), 1, 2);
	close(standardDrinks(10.14, 'uk'), 1, 2);
});
