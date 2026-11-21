import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecipe } from '../src/core/availability';
import type { LineAvailability } from '../src/core/availability';
import {
	compareRecipes,
	describeLine,
	filterRecipes,
	lineStatus,
	recipeSections,
	recipeTags,
	STATUS_LABELS,
	statusText,
	stockToFix,
	toBuy,
} from '../src/core/availability-lists';
import type { RecipeEntry, RecipeFilter } from '../src/core/availability-lists';
import { canMakeReport, makeableReport, parseListFlags, toBuyReport } from '../src/core/availability-report';
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

const entry = (
	name: string,
	lines: string[],
	sources: StockSource[],
	extra: Partial<RecipeEntry> = {},
): RecipeEntry => ({
	path: `Cocktails/recipe/${name}.md`,
	name,
	rating: null,
	lastMade: null,
	tags: [],
	availability: recipe(lines, sources),
	...extra,
});
const stock = [bottle(plain, 500), bottle(campari, 60), status(mint, 'Unknown')];

void test('recipes sort by status, then rating, then least recently made', () => {
	const entries = [
		entry('Missing', ['1 oz [[Rye Whiskey]]'], stock, { rating: 5 }),
		entry('Recent', ['2 oz [[Bourbon]]'], stock, { rating: 4, lastMade: '2026-11-20' }),
		entry('Unknown', ['1 sprig [[Mint]]'], stock, { rating: 5 }),
		entry('Older', ['2 oz [[Bourbon]]'], stock, { rating: 4, lastMade: '2026-10-01' }),
		entry('Never', ['2 oz [[Bourbon]]'], stock, { rating: 4 }),
		entry('Best', ['2 oz [[Bourbon]]'], stock, { rating: 5, lastMade: '2026-11-20' }),
		entry('Unrated', ['2 oz [[Bourbon]]'], stock),
	];
	assert.deepEqual(
		[...entries].sort(compareRecipes).map((item) => item.name),
		['Best', 'Never', 'Older', 'Recent', 'Unrated', 'Unknown', 'Missing'],
	);
});

void test('filters: uses follows the Recipes rule; status, rating, and tag', () => {
	const entries = [
		entry('Bourbon drink', ['2 oz [[Bourbon]]'], stock, { rating: 4, tags: ['stirred'] }),
		entry('Whiskey drink', ['2 oz [[Whiskey]]'], stock, { rating: 2 }),
		entry('Rye drink', ['2 oz [[Rye Whiskey]]'], stock, { rating: 5, tags: ['stirred'] }),
	];
	const names = (filter: RecipeFilter) => filterRecipes(entries, notes, filter).map((item) => item.name);
	assert.deepEqual(names({ uses: plain.path }), ['Bourbon drink', 'Whiskey drink']);
	assert.deepEqual(names({ uses: rye.path }), ['Whiskey drink', 'Rye drink']);
	assert.deepEqual(names({ statuses: ['missing-one'] }), ['Rye drink']);
	assert.deepEqual(names({ minRating: 4 }), ['Bourbon drink', 'Rye drink']);
	assert.deepEqual(names({ tag: '#Stirred' }), ['Bourbon drink', 'Rye drink']);
});

void test('lines are described briefly by name', () => {
	const name = (path: string) => notes.find((item) => item.path === path)?.name ?? path;
	const said = (text: string, sources: StockSource[]) => describeLine(only(text, sources), name);
	assert.equal(said('2 oz [[Bourbon]]', [bottle(plain, 500)]), undefined);
	assert.equal(said('1 oz [[Campari]]', [bottle(campari, 60)]), 'Low: Campari');
	assert.equal(said('1 oz [[Campari]]', [bottle(campari, 10)]), 'Short: Campari (10 of 29.6 mL)');
	assert.equal(said('1 oz [[Meletti]]', [bottle(averna, 500)]), 'Substitute: Averna for Meletti');
	assert.equal(said('1 sprig [[Mint]]', [status(mint, null)]), 'Unknown: Mint');
	assert.equal(said('2 oz [[Bourbon]]', [status(plain, 'Out')]), 'Missing: Bourbon (out: Plain Bourbon)');
	assert.equal(said('Garnish: [[Orange Peel|orange peel]]', []), 'Missing: garnish Orange Peel');
	assert.equal(said('2 oz [[Bourbon|bourbon]] or [[Rye Whiskey|rye]]', []), 'Missing: Bourbon, Rye Whiskey');
	assert.equal(said('2 oz gin', []), 'Not linked: gin');
	assert.equal(said('Garnish: ground cinnamon', []), 'Not linked: garnish ground cinnamon');
});

void test('to buy: grouped by what a line links, most recipes unlocked first', () => {
	const entries = [
		entry('A', ['1 oz [[Rye Whiskey]]', '1 oz [[Bourbon]]'], stock),
		entry('B', ['1 oz [[Rye Whiskey]]'], stock),
		entry('C', ['1 oz [[Aromatic Bitters]]', '1 oz [[Rye Whiskey]]', '2 oz gin'], stock),
		entry('D', ['1 oz [[Aromatic Bitters]]', 'Garnish: [[Orange Peel]]'], stock),
		entry('E', ['1 oz [[Campari]]', '2 oz gin'], [bottle(campari, 5)]),
	];
	assert.deepEqual(
		toBuy(entries).map((item) => [item.targets, item.unlocks, item.closer]),
		[
			[[rye.path], ['Cocktails/recipe/A.md', 'Cocktails/recipe/B.md'], ['Cocktails/recipe/C.md']],
			[[aromatic.path], ['Cocktails/recipe/D.md'], ['Cocktails/recipe/C.md']],
			[[campari.path], [], ['Cocktails/recipe/E.md']],
		],
	);
	const report = toBuyReport(entries, notes, 1);
	assert.deepEqual(report.items, [{ need: 'Rye Whiskey', targets: [rye.path], unlocks: ['A', 'B'], closer: 1 }]);
});

void test('reports: makeable counts every match and limits the list; can-make lists each line', () => {
	const entries = [
		entry('Bourbon drink', ['2 oz [[Bourbon]]', '1 oz [[Campari]]'], stock, { rating: 4 }),
		entry('Rye drink', ['2 oz [[Rye Whiskey]]'], stock),
	];
	const report = makeableReport(entries, notes, {}, 1);
	assert.equal(report.counts['can-make'], 1);
	assert.equal(report.counts['missing-one'], 1);
	assert.deepEqual(report.recipes, [
		{
			path: 'Cocktails/recipe/Bourbon drink.md',
			name: 'Bourbon drink',
			status: 'can-make',
			rating: 4,
			lastMade: null,
			caveats: ['Low: Campari'],
		},
	]);
	const one = canMakeReport(entries[1]!, notes);
	assert.equal(one.status, 'missing-one');
	assert.deepEqual(one.lines, [
		{ text: '2 oz [[Rye Whiskey]]', state: 'missing', detail: 'Missing: Rye Whiskey', sources: [] },
	]);
});

void test('list flags: statuses checked, numbers positive', () => {
	assert.deepEqual(parseListFlags({ status: 'can-make, substitute', 'min-rating': '4', tag: 'tiki', limit: '5' }), {
		filter: { statuses: ['can-make', 'substitute'], minRating: 4, tag: 'tiki' },
		limit: 5,
	});
	assert.deepEqual(parseListFlags({}), { filter: {} });
	assert.throws(() => parseListFlags({ status: 'ready' }), /Unknown status: ready/);
	assert.throws(() => parseListFlags({ limit: '0' }), /limit must be/);
});

void test('the check: headline, line wording, stock to fix, and where each line is', () => {
	const name = (path: string) => notes.find((item) => item.path === path)?.name ?? path;
	const sources = [
		bottle(plain, 500),
		bottle(campari, 10),
		status(mint, 'Unknown'),
		bottle(meletti, 0),
		bottle(averna, 500),
	];
	assert.equal(statusText(recipe(['2 oz [[Bourbon]]'], sources)), 'You can make it.');
	assert.equal(statusText(recipe(['1 oz [[Meletti]]'], sources)), 'You can make it with a substitute.');
	assert.equal(statusText(recipe(['1 sprig [[Mint]]'], sources)), 'Check stock first.');
	assert.equal(statusText(recipe(['1 oz [[Campari]]'], sources)), 'Missing one ingredient.');
	assert.equal(statusText(recipe(['1 oz [[Campari]]', '2 oz gin'], sources)), 'Missing 2 ingredients.');
	assert.equal(statusText(recipe(['Garnish: [[Mint]]'], sources)), 'No ingredients to check.');
	assert.equal(lineStatus(only('2 oz [[Bourbon]]', sources), name), 'Have: Plain Bourbon');
	assert.equal(lineStatus(only('1 oz [[Campari]]', sources), name), 'Short: Campari (10 of 29.6 mL)');
	assert.deepEqual(stockToFix(only('1 oz [[Campari]]', sources)), [campari.path]);
	assert.deepEqual(stockToFix(only('1 sprig [[Mint]]', sources)), [mint.path]);
	assert.deepEqual(stockToFix(only('1 oz [[Meletti]]', sources)), [meletti.path]);
	assert.deepEqual(stockToFix(only('2 oz [[Bourbon]]', sources)), []);
	const lines = recipe(['2 oz gin', '2 oz [[Bourbon]]'], sources).lines;
	assert.deepEqual(lines[0]!.at, { line: 3, raw: '- 2 oz gin' });
	assert.deepEqual(lines[1]!.at, { line: 4, raw: '- 2 oz [[Bourbon]]' });
});

void test('a named bottle that ran out reads as Out, with other empty bottles after it', () => {
	const name = (path: string) => notes.find((item) => item.path === path)?.name ?? path;
	const another = note('Another Bourbon', 'bottle', [bourbon.path]);
	notes.push(another);
	try {
		const line = only('2 oz [[Plain Bourbon]]', [bottle(plain, 0), bottle(another, 0)]);
		assert.equal(describeLine(line, name), 'Out: Plain Bourbon (also out: Another Bourbon)');
		assert.equal(describeLine(only('1 oz [[Campari]]', [bottle(campari, 0)]), name), 'Out: Campari');
	} finally {
		notes.pop();
	}
});

void test('pane sections: every status, filtered and sorted; tags most used first', () => {
	const entries = [
		entry('B', ['2 oz [[Bourbon]]'], stock, { rating: 3, tags: ['stirred'] }),
		entry('A', ['2 oz [[Bourbon]]'], stock, { rating: 5, tags: ['stirred', 'tiki'] }),
		entry('R', ['2 oz [[Rye Whiskey]]'], stock, { tags: ['tiki', 'stirred'] }),
	];
	const sections = recipeSections(entries, notes, { minRating: 3 });
	assert.deepEqual(
		sections.map(({ status, recipes }) => [status, recipes.map((item) => item.name)]),
		[
			['can-make', ['A', 'B']],
			['substitute', []],
			['check-stock', []],
			['missing-one', []],
			['missing-more', []],
		],
	);
	assert.deepEqual(recipeTags(entries), ['stirred', 'tiki']);
	assert.equal(STATUS_LABELS['missing-one'], 'Missing one');
});
