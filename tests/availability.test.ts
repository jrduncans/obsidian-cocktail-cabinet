import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecipe } from '../src/core/availability';
import type { LineAvailability } from '../src/core/availability';
import { stockSnapshot } from '../src/core/logging-stock';
import type { StockSource } from '../src/core/logging-stock';
import { DEFAULT_RESTOCK } from '../src/core/restock';
import { PROP } from '../src/core/schema';
import type { CabinetNote, NoteKind } from '../src/core/schema';

function note(name: string, kind: NoteKind, parents: string[] = [], extra: Partial<CabinetNote> = {}): CabinetNote {
	return { name, path: `Cocktails/${kind}/${name}.md`, kind, parents, ...extra };
}
const spirit = note('Spirit', 'category');
const whiskey = note('Whiskey', 'family', [spirit.path]);
const bitterLiqueurs = note('Bitter Liqueur', 'family');
const bourbon = note('Bourbon', 'type', [whiskey.path]);
const bonded = note('Bonded Bourbon', 'type', [bourbon.path]);
const rye = note('Rye Whiskey', 'type', [whiskey.path]);
const amaro = note('Amaro', 'type', [bitterLiqueurs.path], { catchAll: true });
const campariType = note('Red Bitter', 'type', [bitterLiqueurs.path]);
const limeJuice = note('Lime Juice', 'type');
const aromatic = note('Aromatic Bitters', 'type');
const plain = note('Plain Bourbon', 'bottle', [bourbon.path]);
const bib = note('Bonded Bottle', 'bottle', [bonded.path]);
const ryeBottle = note('Rye Bottle', 'bottle', [rye.path]);
const meletti = note('Meletti', 'bottle', [amaro.path]);
const averna = note('Averna', 'bottle', [amaro.path]);
const campari = note('Campari', 'bottle', [campariType.path]);
const angostura = note('Angostura', 'bottle', [aromatic.path]);
const limes = note('Limes', 'ingredient', [limeJuice.path]);
const mint = note('Mint', 'ingredient');
const orangePeel = note('Orange Peel', 'ingredient');
const notes = [
	spirit,
	whiskey,
	bitterLiqueurs,
	bourbon,
	bonded,
	rye,
	amaro,
	campariType,
	limeJuice,
	aromatic,
	plain,
	bib,
	ryeBottle,
	meletti,
	averna,
	campari,
	angostura,
	limes,
	mint,
	orangePeel,
];

const bottle = (target: CabinetNote, open: number | null, unopened: number | null = 0, volume: number | null = 750) =>
	stockSnapshot(target, {
		[PROP.kind]: 'bottle',
		[PROP.stockTracking]: 'volume',
		[PROP.open]: open,
		[PROP.unopened]: unopened,
		[PROP.volume]: volume,
	});
const status = (target: CabinetNote, availability: string | null) =>
	stockSnapshot(target, {
		[PROP.kind]: target.kind,
		[PROP.stockTracking]: 'status',
		[PROP.availability]: availability,
	});
const untracked = (target: CabinetNote) => stockSnapshot(target, { [PROP.kind]: target.kind });

const resolve = (link: string) => notes.find((item) => item.name === link.split('|')[0])?.path ?? null;
function recipe(lines: string[], sources: StockSource[]) {
	return resolveRecipe(`# R\n\n### Ingredients\n${lines.map((line) => `- ${line}`).join('\n')}\n\n### Method\n`, {
		notes,
		sources,
		resolve,
		thresholds: DEFAULT_RESTOCK,
	});
}
const only = (text: string, sources: StockSource[]): LineAvailability => recipe([text], sources).lines[0]!;

void test('a stocked bottle that fits makes the line Have, including through the hierarchy', () => {
	const sources = [bottle(plain, 500)];
	for (const link of ['Plain Bourbon', 'Bourbon', 'Whiskey', 'Spirit']) {
		const line = only(`2 oz [[${link}]]`, sources);
		assert.equal(line.state, 'have', link);
		assert.deepEqual(line.sources, [plain.path]);
	}
	assert.equal(recipe(['2 oz [[Bourbon]]'], sources).status, 'can-make');
});

void test('a type line never broadens to siblings, and a family never narrows', () => {
	const line = only('2 oz [[Rye Whiskey]]', [bottle(plain, 500)]);
	assert.equal(line.state, 'missing');
	assert.deepEqual(line.substitutes, []);
});

void test('unmeasured lines and status-tracked stock count', () => {
	assert.equal(only('2 dashes [[Angostura]]', [status(angostura, 'Have')]).state, 'have');
	assert.equal(only('1 sprig [[Mint]]', [status(mint, 'Have')]).state, 'have');
	assert.equal(only('1 sprig [[Mint]]', [status(mint, 'Out')]).state, 'missing');
});

void test('other stock fills the types it provides', () => {
	assert.equal(only('¾ oz [[Lime Juice]]', [status(limes, 'Have')]).state, 'have');
	assert.equal(only('¾ oz [[Lime Juice]]', [status(limes, 'Low')]).state, 'low');
});

void test('Low: status Low, or the last bottle under the thresholds; any non-low source makes it Have', () => {
	assert.equal(only('1 oz [[Campari]]', [bottle(campari, 60)]).state, 'low');
	assert.equal(only('1 oz [[Campari]]', [bottle(campari, 60, null, null)]).state, 'low');
	assert.equal(only('1 oz [[Campari]]', [bottle(campari, 60, 1)]).state, 'have');
	assert.equal(only('1 oz [[Bourbon]]', [bottle(plain, 50), bottle(bib, 500)]).state, 'have');
	assert.equal(recipe(['1 oz [[Campari]]'], [bottle(campari, 60)]).status, 'can-make');
});

void test('Short: volume-tracked sources together hold less than the pour', () => {
	const line = only('1 oz [[Campari]]', [bottle(campari, 10)]);
	assert.equal(line.state, 'short');
	assert.equal(line.heldMl, 10);
	assert.equal(only('2 oz [[Bourbon]]', [bottle(plain, 30), bottle(bib, 30)]).state, 'low');
	assert.equal(only('1 oz [[Bourbon]]', [bottle(plain, 10), status(bib, 'Have')]).state, 'have');
	assert.equal(only('1 dash [[Campari]]', [bottle(campari, 1)]).state, 'low');
	assert.equal(recipe(['1 oz [[Campari]]'], [bottle(campari, 10)]).status, 'missing-one');
});

void test('alternatives on one line: any stocked link fills it', () => {
	const line = only('1 oz [[Campari]] or [[Meletti]]', [bottle(meletti, 500)]);
	assert.equal(line.state, 'have');
	assert.deepEqual(line.sources, [meletti.path]);
});

void test('a catch-all bottle that is out offers the type’s other bottles as substitutes, never Have', () => {
	const sources = [bottle(meletti, 0), bottle(averna, 500)];
	const line = only('1 oz [[Meletti]]', sources);
	assert.equal(line.state, 'substitute');
	assert.deepEqual(line.substitutes, [averna.path]);
	assert.deepEqual(line.out, [meletti.path]);
	assert.equal(
		recipe(['1 oz [[Meletti]]', '1 oz [[Bourbon]]'], [...sources, bottle(plain, 500)]).status,
		'substitute',
	);
	// A line naming the catch-all type accepts any of its bottles.
	assert.equal(only('1 oz [[Amaro]]', sources).state, 'have');
});

void test('a subtype line takes only subtype bottles; parent bottles are substitutes', () => {
	const line = only('2 oz [[Bonded Bourbon]]', [bottle(plain, 500)]);
	assert.equal(line.state, 'substitute');
	assert.deepEqual(line.substitutes, [plain.path]);
	assert.equal(only('2 oz [[Bourbon]]', [bottle(bib, 500)]).state, 'have');
	assert.equal(only('2 oz [[Plain Bourbon]]', [bottle(bib, 500)]).state, 'have');
});

void test('Unknown: only Unknown or untracked sources fit', () => {
	const line = only('1 sprig [[Mint]]', [status(mint, 'Unknown')]);
	assert.equal(line.state, 'unknown');
	assert.deepEqual(line.unknown, [mint.path]);
	assert.equal(only('2 oz [[Bourbon]]', [untracked(plain)]).state, 'unknown');
	assert.equal(
		recipe(['1 sprig [[Mint]]', '2 oz [[Bourbon]]'], [status(mint, null), bottle(plain, 500)]).status,
		'check-stock',
	);
});

void test('Missing names sources that are out or empty', () => {
	const line = only('2 oz [[Bourbon]]', [bottle(plain, 0, null), status(bib, 'Out')]);
	assert.equal(line.state, 'missing');
	assert.deepEqual(line.out, [plain.path, bib.path]);
	assert.equal(only('2 oz [[Bourbon]]', []).state, 'missing');
});

void test('unlinked lines and broken links count as missing', () => {
	assert.equal(only('2 oz gin', []).state, 'unlinked');
	assert.equal(only('2 oz [[Nowhere]]', []).state, 'unlinked');
	assert.equal(recipe(['2 oz gin', '2 oz [[Bourbon]]'], [bottle(plain, 500)]).status, 'missing-one');
	assert.equal(recipe(['2 oz gin', '2 oz [[Bourbon]]'], []).status, 'missing-more');
});

void test('marked garnishes never lower the status', () => {
	const result = recipe(
		['2 oz [[Bourbon]]', 'Garnish: [[Orange Peel|orange peel]]', '1 sprig [[Mint]] to garnish', 'Garnish: cherry'],
		[bottle(plain, 500), status(orangePeel, 'Out')],
	);
	assert.equal(result.status, 'can-make');
	assert.deepEqual(
		result.lines.map((line) => [line.state, line.garnish]),
		[
			['have', false],
			['missing', true],
			['missing', true],
			['unlinked', true],
		],
	);
});

void test('a recipe with no Ingredients lines is Check stock, not Can make', () => {
	assert.equal(
		resolveRecipe('# R\n', { notes, sources: [], resolve, thresholds: DEFAULT_RESTOCK }).status,
		'check-stock',
	);
});
