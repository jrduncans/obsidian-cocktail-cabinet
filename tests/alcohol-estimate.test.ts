import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DASH_ML,
	DEFAULT_TOP_ML,
	estimateAlcohol,
	drinksText,
	estimateText,
	factsOf,
	methodPreparation,
	noteAbv,
	standardDrinks,
} from '../src/core/alcohol-estimate';
import type { AbvNote, LinkInfo } from '../src/core/alcohol-estimate';
import { storedEstimate } from '../src/vault/recipe-sync';
import { hasStock } from '../src/core/stock-formulas';

const close = (actual: number | null, expected: number, digits = 3) =>
	assert.ok(actual !== null && Math.abs(actual - expected) < 10 ** -digits, `${actual} ≈ ${expected}`);

void test('a note’s ABV comes from the bottle, your in-stock bottles, the typical value, bottles you’ve had, then the family', () => {
	const family: AbvNote = { kind: 'family', bottleAbvs: [0.4, 0.5, 0.42] };
	assert.deepEqual(noteAbv({ kind: 'bottle', abv: 0.47, parent: { kind: 'type', abvTypical: 0.43 } }), {
		abv: 0.47,
		source: 'bottle',
	});
	assert.deepEqual(noteAbv({ kind: 'bottle', parent: { kind: 'type', abvTypical: 0.43 } }), {
		abv: 0.43,
		source: 'typical',
	});
	// In-stock bottles win over the typical value; bottles you've had only follow it.
	const type = (extra: Partial<AbvNote>): AbvNote => ({ kind: 'type', parent: family, ...extra });
	assert.deepEqual(noteAbv(type({ stockedAbvs: [0.5], abvTypical: 0.43, bottleAbvs: [0.5, 0.4] })), {
		abv: 0.5,
		source: 'stocked',
	});
	assert.deepEqual(noteAbv(type({ abvTypical: 0.43, bottleAbvs: [0.5, 0.4] })), { abv: 0.43, source: 'typical' });
	assert.deepEqual(noteAbv(type({ bottleAbvs: [0.4, 0.5] })), { abv: 0.45, source: 'past' });
	assert.deepEqual(noteAbv(type({})), { abv: 0.42, source: 'past' });
	assert.deepEqual(noteAbv({ kind: 'type' }), { abv: null, source: 'unknown' });
	assert.deepEqual(noteAbv({ kind: 'type', abvTypical: 0 }), { abv: 0, source: 'typical' });
	// A family has no ABV of its own: your in-stock bottles in it, then any, or 0 when every type is non-alcoholic.
	assert.deepEqual(noteAbv({ kind: 'family', stockedAbvs: [0.4], bottleAbvs: [0.4, 0.6] }), {
		abv: 0.4,
		source: 'stocked',
	});
	assert.deepEqual(noteAbv({ kind: 'family', abvTypical: 0.4 }), { abv: null, source: 'unknown' });
	assert.deepEqual(noteAbv({ kind: 'family', typeAbvs: [0, 0] }), { abv: 0, source: 'typical' });
	assert.deepEqual(noteAbv({ kind: 'family', typeAbvs: [0, NaN] }), { abv: null, source: 'unknown' });
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
	Rye: { abv: 0.5, source: 'stocked', facts: [] },
	OldRye: { abv: 0.45, source: 'past', facts: [] },
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
	assert.equal(basis(['2 oz [[Rye]]', '1 oz [[Rum]]']), 'bottles');
	assert.equal(basis(['2 oz [[Rye]]', '1 oz [[Gin]]']), 'typical');
	assert.equal(basis(['2 oz [[OldRye]]', '1 oz [[Gin]]']), 'past');
	assert.equal(basis(['2 oz [[Rum]]', '1 oz [[Mystery]]']), 'partial');
	assert.equal(basis(['2 oz gin, unlinked', '1 oz [[Lime]]']), 'partial');
	assert.equal(basis(['Splash of [[Overproof]]', '2 oz [[Rum]]']), 'partial');
	assert.equal(basis(['1 [[Egg White]]', '2 oz [[Rum]]']), 'exact');
	assert.equal(basis(['Pinch of salt', '2 oz [[Rum]]']), 'exact');
	assert.equal(basis(['2 dashes [[Mystery]]', '2 oz [[Rum]]']), 'exact');
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

void test('facts come from catalog IDs, or starter names when a note has none', () => {
	assert.deepEqual(factsOf('family', 'family/Citrus Juice', 'Anything'), ['citrus']);
	assert.deepEqual(factsOf('category', undefined, 'juice'), ['juice']);
	assert.deepEqual(factsOf('ingredient', undefined, 'Heavy Cream'), ['dairy']);
	assert.deepEqual(factsOf('type', 'type/London Dry Gin', 'London Dry Gin'), []);
});

void test('stored estimates are rounded, and a recipe with nothing to pour stores no numbers', () => {
	const estimate = estimateAlcohol({
		lines: ['2 oz (60 ml) [[Rum]]', '1 oz (30 ml) [[Lime]]', '¾ oz (22.5 ml) [[Syrup]]'],
		method: 'Shake.',
		link,
	});
	assert.deepEqual(storedEstimate(estimate), {
		'cc-est-alcohol-ml': 24,
		'cc-est-abv': 0.171,
		'cc-est-volume-ml': 141,
		'cc-est-basis': 'exact',
		'cc-contains': ['citrus', 'juice'],
	});
	const none = estimateAlcohol({ lines: ['Garnish: cherry'], method: '', link });
	assert.deepEqual(storedEstimate(none), {
		'cc-est-alcohol-ml': null,
		'cc-est-abv': null,
		'cc-est-volume-ml': null,
		'cc-est-basis': 'none',
		'cc-contains': [],
	});
});

void test('the logging line scales by servings and says how sure it is', () => {
	const daiquiri = estimateAlcohol({
		lines: ['2 oz (60 ml) [[Rum]]', '1 oz (30 ml) [[Lime]]', '¾ oz (22.5 ml) [[Syrup]]'],
		method: 'Shake.',
		link,
	});
	assert.equal(estimateText(daiquiri, 1), '≈ 1.4 drinks (24.0 mL alcohol), 17.1% ABV · exact');
	assert.equal(estimateText(daiquiri, 2), '≈ 2.7 drinks (48.0 mL alcohol), 17.1% ABV · exact');
	assert.equal(estimateText(daiquiri, 1, 'uk'), '≈ 2.4 units (24.0 mL alcohol), 17.1% ABV · exact');
	assert.equal(drinksText(daiquiri, 2), '≈ 2.7 drinks');
	assert.equal(drinksText(daiquiri, 1, 'uk'), '≈ 2.4 units');
	const partial = estimateAlcohol({ lines: ['2 oz (60 ml) [[Rum]]', '1 oz [[Mystery]]'], method: 'Stir.', link });
	assert.match(estimateText(partial, 1), /^≥ 1\.4 drinks .* ≥ \d+\.\d% ABV · some ABVs or amounts unknown$/);
	assert.equal(estimateText(estimateAlcohol({ lines: ['Garnish: cherry'], method: '', link }), 1), '');
});

void test('in stock means Have or Low, or a positive amount, as in the In stock view', () => {
	const bottle = (extra: Record<string, unknown>) => ({
		'cc-kind': 'bottle',
		'cc-stock-tracking': 'volume',
		...extra,
	});
	assert.equal(hasStock(bottle({ 'cc-open-ml': 120 })), true);
	assert.equal(hasStock(bottle({ 'cc-open-ml': 0, 'cc-unopened': 1 })), true);
	assert.equal(hasStock(bottle({ 'cc-open-ml': 0, 'cc-unopened': null })), false);
	assert.equal(hasStock({ 'cc-kind': 'ingredient', 'cc-stock-tracking': 'volume', 'cc-remaining-ml': 50 }), true);
	assert.equal(hasStock({ 'cc-stock-tracking': 'status', 'cc-availability': 'Low' }), true);
	assert.equal(hasStock({ 'cc-stock-tracking': 'status', 'cc-availability': 'Unknown' }), false);
	assert.equal(hasStock({ 'cc-kind': 'bottle', 'cc-open-ml': 500 }), false);
});
