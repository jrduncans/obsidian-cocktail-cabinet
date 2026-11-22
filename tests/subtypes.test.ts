import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { noteAbv } from '../src/core/alcohol-estimate';
import { classifyLoggingLines, fitsLine, lesserType } from '../src/core/logging-lines';
import { stockSnapshot } from '../src/core/logging-stock';
import { navigationBase, navigationEmbeds, withNavigationSections, withSubtypesSection } from '../src/core/navigation';
import { planFieldEdit } from '../src/core/note-edit';
import { relatedTargets, subtypeParents } from '../src/core/relationships';
import { PROP } from '../src/core/schema';
import type { CabinetNote, NoteKind } from '../src/core/schema';
import { CabinetStore } from '../src/vault/cabinet-store';
import { TFile } from './obsidian-stub';

function note(name: string, kind: NoteKind, parents: string[] = []): CabinetNote {
	return { name, path: `Cocktails/${kind}/${name}.md`, kind, parents };
}
const whiskey = note('Whiskey', 'family');
const bourbon = note('Bourbon', 'type', [whiskey.path]);
const bonded = note('Bonded Bourbon', 'type', [bourbon.path]);
const rye = note('Rye Whiskey', 'type', [whiskey.path]);
const plain = note('Plain Bourbon', 'bottle', [bourbon.path]);
const plainToo = note('Another Bourbon', 'bottle', [bourbon.path]);
const bib = note('Bonded Bottle', 'bottle', [bonded.path]);
const ryeBottle = note('Rye Bottle', 'bottle', [rye.path]);
const notes = [whiskey, bourbon, bonded, rye, plain, plainToo, bib, ryeBottle];

const stocked = (target: CabinetNote) =>
	stockSnapshot(target, {
		[PROP.kind]: 'bottle',
		[PROP.stockTracking]: 'volume',
		[PROP.open]: 300,
		[PROP.unopened]: 0,
		[PROP.volume]: 750,
	});
const line = (text: string, sources = [plain, plainToo, bib, ryeBottle].map(stocked)) =>
	classifyLoggingLines(
		`### Ingredients\n${text}`,
		notes,
		sources,
		(link) => notes.find((item) => item.name === link.split('|')[0])?.path ?? null,
	).counted[0]!;

void test('a subtype bottle fills its type and its type’s bottles; a plain bottle never fills the subtype', () => {
	assert.ok(fitsLine(notes, bib, bourbon));
	assert.ok(fitsLine(notes, bib, whiskey));
	assert.ok(fitsLine(notes, bib, plain));
	assert.ok(!fitsLine(notes, plain, bonded));
	assert.ok(!fitsLine(notes, plain, bib));
	assert.ok(!fitsLine(notes, ryeBottle, bib));
	assert.equal(lesserType(notes, plain, bonded), bourbon);
	assert.equal(lesserType(notes, plain, bib), bourbon);
	assert.equal(lesserType(notes, ryeBottle, bonded), undefined);
});

void test('related recipes: a subtype bottle serves recipes naming plain bottles, not the reverse', () => {
	const bonds = relatedTargets(notes, bib);
	for (const path of [bonded.path, bourbon.path, whiskey.path, plain.path, plainToo.path]) assert.ok(bonds.has(path));
	assert.ok(!bonds.has(rye.path));
	const plains = relatedTargets(notes, plain);
	assert.ok(plains.has(plainToo.path) && plains.has(bourbon.path));
	assert.ok(!plains.has(bonded.path) && !plains.has(bib.path));
	const types = relatedTargets(notes, bourbon);
	assert.ok(types.has(bonded.path) && types.has(bib.path));
});

void test('logging lists the type’s own bottles first, then each subtype’s under its name', () => {
	const type = line('- 60 ml [[Bourbon]]');
	assert.deepEqual(type.candidates, [plain.path, plainToo.path, bib.path]);
	assert.deepEqual(type.candidateGroups, [{ label: 'Bonded Bourbon', paths: [bib.path] }]);
	assert.equal(type.initialSelection, null);
	const subtype = line('- 60 ml [[Bonded Bourbon]]');
	assert.deepEqual(subtype.candidates, [bib.path]);
	assert.equal(subtype.initialSelection, bib.path);
	assert.deepEqual(subtype.alternatives, [plain.path, plainToo.path]);
	assert.equal(subtype.alternativesLabel, 'Other Bourbon');
	assert.equal(subtype.candidateGroups, undefined);
	const named = line('- 60 ml [[Plain Bourbon]]');
	assert.deepEqual(named.candidates, [plain.path, plainToo.path, bib.path]);
	assert.equal(named.initialSelection, plain.path);
});

void test('a type estimates from its own stocked bottles, then its subtypes’, then its typical ABV', () => {
	const type = (fields: object) => noteAbv({ kind: 'type', abvTypical: 0.43, ...fields });
	assert.deepEqual(type({ stockedAbvs: [0.4], subtypeStockedAbvs: [0.5] }), { abv: 0.4, source: 'stocked' });
	assert.deepEqual(type({ subtypeStockedAbvs: [0.5] }), { abv: 0.5, source: 'stocked' });
	assert.deepEqual(type({}), { abv: 0.43, source: 'typical' });
	// A subtype with nothing of its own falls back to its type.
	assert.deepEqual(noteAbv({ kind: 'type', parent: { kind: 'type', stockedAbvs: [0.4] } }), {
		abv: 0.4,
		source: 'stocked',
	});
});

void test('editing a type sets or clears its parent type, and a subtype keeps no family', () => {
	const link = '[[Cocktails/Types/Bourbon|Bourbon]]';
	assert.deepEqual(planFieldEdit('type', {}, { parentType: [link] }), { [PROP.type]: link });
	assert.deepEqual(planFieldEdit('type', { [PROP.type]: link }, { parentType: [] }), { [PROP.type]: null });
	assert.deepEqual(planFieldEdit('type', { [PROP.family]: '[[Whiskey]]' }, { parents: [], parentType: [link] }), {
		[PROP.family]: null,
		[PROP.type]: link,
	});
	assert.throws(() => planFieldEdit('type', { [PROP.family]: '[[Whiskey]]' }, { parentType: [link] }), /family/);
	assert.deepEqual(
		subtypeParents(notes, bourbon.path).map((item) => item.name),
		['Rye Whiskey'],
	);
});

void test('a type gets a Subtypes section ahead of its others, once', () => {
	assert.equal(navigationEmbeds('Cocktails', 'type'), navigationEmbeds('Cocktails', 'type', false));
	assert.ok(navigationEmbeds('Cocktails', 'type', true).startsWith('![[Cocktails/Views/Related.base#Subtypes]]'));
	const before =
		'---\ncc-kind: type\n---\n# Bourbon\n\nText.\n\n![[Cocktails/Views/Related.base#Stock]]\n\n![[Cocktails/Views/Related.base#Recipes]]\n';
	const after = withSubtypesSection('Cocktails', before);
	assert.ok(
		after.includes(
			'Text.\n\n![[Cocktails/Views/Related.base#Subtypes]]\n\n![[Cocktails/Views/Related.base#Stock]]',
		),
	);
	assert.equal(withSubtypesSection('Cocktails', after), after);
	assert.ok(
		withSubtypesSection('Cocktails', '# Bare\n').endsWith('\n\n![[Cocktails/Views/Related.base#Subtypes]]\n'),
	);
});

void test('missing sections go beside their neighbors in order, and present ones never move', () => {
	const e = (view: string) => `![[Cocktails/Views/Related.base#${view}]]`;
	const head = '---\ncc-kind: type\n---\n# Bourbon\n\nText.\n';
	// Only Recipes: Subtypes and Stock go before it.
	assert.equal(
		withNavigationSections('Cocktails', 'type', `${head}\n${e('Recipes')}\n`, true),
		`${head}\n${e('Subtypes')}\n\n${e('Stock')}\n\n${e('Recipes')}\n`,
	);
	// Only Stock: Recipes goes after it.
	assert.equal(
		withNavigationSections('Cocktails', 'type', `${head}\n${e('Stock')}\n\nAfter.\n`),
		`${head}\n${e('Stock')}\n\n${e('Recipes')}\n\nAfter.\n`,
	);
	// None: all at the end. Reordered sections stay as they are.
	assert.equal(withNavigationSections('Cocktails', 'type', head), `${head}\n${e('Stock')}\n\n${e('Recipes')}\n`);
	const reordered = `${head}\n${e('Recipes')}\n\n${e('Stock')}\n`;
	assert.equal(withNavigationSections('Cocktails', 'type', reordered), reordered);
	// A short or aliased link counts as present; recipes have no sections.
	const short = `${head}\n![[Related#Stock|Stock]]\n\n![[Related.base#Recipes]]\n`;
	assert.equal(withNavigationSections('Cocktails', 'type', short), short);
	assert.equal(withNavigationSections('Cocktails', 'recipe', head), head);
});

void test('the Related Base reaches four levels and applies the same-type rule to named bottles only', () => {
	const base = navigationBase('Cocktails').content;
	for (const formula of ['up4:', 'thisUp4:', 'linkedUp4:', 'linkedBottleTypes:', 'up2Types:', 'thisUp2Types:'])
		assert.ok(base.includes(formula), formula);
	assert.match(base, /formula\.linkedBottleTypes\.filter\(formula\.thisSwapTypes/);
	assert.ok(!/formula\.linkedUp1\.filter\(formula\.thisSwapTypes/.test(base));
	assert.match(base, /name: Subtypes/);
});

void test('the store reads a subtype’s parent type, one level deep', () => {
	const path = (kind: string, name: string) => `Cocktails/${kind}/${name}.md`;
	const frontmatters = new Map<string, Record<string, unknown>>([
		[path('Families', 'Whiskey'), { 'cc-name': 'Whiskey', 'cc-kind': 'family' }],
		[
			path('Types', 'Bourbon'),
			{ 'cc-name': 'Bourbon', 'cc-kind': 'type', 'cc-family': `[[${path('Families', 'Whiskey')}]]` },
		],
		[
			path('Types', 'Bonded Bourbon'),
			{ 'cc-name': 'Bonded Bourbon', 'cc-kind': 'type', 'cc-type': `[[${path('Types', 'Bourbon')}]]` },
		],
		[
			path('Types', 'Too Deep'),
			{ 'cc-name': 'Too Deep', 'cc-kind': 'type', 'cc-type': `[[${path('Types', 'Bonded Bourbon')}]]` },
		],
		[
			path('Bottles', 'BiB'),
			{ 'cc-name': 'BiB', 'cc-kind': 'bottle', 'cc-type': `[[${path('Types', 'Bonded Bourbon')}]]` },
		],
	]);
	const app = {
		vault: { getMarkdownFiles: () => [...frontmatters.keys()].map((file) => new TFile(file)) },
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
			getFirstLinkpathDest: (target: string) => (frontmatters.has(target) ? new TFile(target) : null),
		},
	} as unknown as App;
	const read = new Map(new CabinetStore(app, () => 'Cocktails').notes().map((item) => [item.name, item.parents]));
	assert.deepEqual(read.get('Bonded Bourbon'), [path('Types', 'Bourbon')]);
	assert.deepEqual(read.get('Too Deep'), []);
	assert.deepEqual(read.get('BiB'), [path('Types', 'Bonded Bourbon')]);
});
