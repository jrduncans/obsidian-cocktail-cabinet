import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { noteDescription, notePreparation, withDescription, withPreparation } from '../src/catalog/fields';
import { starterPlan } from '../src/core/setup';
import { CabinetStore } from '../src/vault/cabinet-store';
import { CatalogSync, keptKey, keptValue } from '../src/vault/catalog-sync';
import { parseYaml, TFile, TFolder } from './obsidian-stub';

function fixture() {
	const contents = new Map(
		starterPlan('Cocktails')
			.filter((file) => file.path.endsWith('.md'))
			.map((file) => [file.path, file.content]),
	);
	const folders = new Set<string>();
	const split = (content: string) => {
		const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
		return { properties: parseYaml(match[1]!) as Record<string, unknown>, body: match[2]! };
	};
	const app = {
		vault: {
			getMarkdownFiles: () => [...contents.keys()].map((path) => new TFile(path)),
			getAbstractFileByPath: (path: string) =>
				contents.has(path) ? new TFile(path) : folders.has(path) ? new TFolder() : null,
			read: (file: TFile) => Promise.resolve(contents.get(file.path)!),
			process: (file: TFile, transform: (content: string) => string) => {
				contents.set(file.path, transform(contents.get(file.path)!));
				return Promise.resolve(contents.get(file.path)!);
			},
			create: (path: string, content: string) => {
				assert.ok(!contents.has(path));
				contents.set(path, content);
				return Promise.resolve(new TFile(path));
			},
			createFolder: (path: string) => {
				folders.add(path);
				return Promise.resolve();
			},
		},
		fileManager: {
			processFrontMatter: (file: TFile, edit: (properties: Record<string, unknown>) => void) => {
				const { properties, body } = split(contents.get(file.path)!);
				edit(properties);
				const lines = Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
				contents.set(file.path, `---\n${lines.join('\n')}\n---\n${body}`);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	const kept: Record<string, string> = {};
	const skipped: string[] = [];
	const state: { seen: string[] | null; pending: string[] } = { seen: null, pending: [] };
	const catalog = new CatalogSync(app, new CabinetStore(app, () => 'Cocktails'), () => ({
		kept,
		skipped,
		...state,
	}));
	const edit = (path: string, change: (content: string) => string) => contents.set(path, change(contents.get(path)!));
	return { contents, catalog, kept, skipped, state, edit, split };
}

const NAVY = 'Cocktails/Types/Navy Strength Gin.md';
const BOURBON = 'Cocktails/Types/Bourbon.md';
const RYE = 'Cocktails/Types/Rye Whiskey.md';

void test('a new cabinet matches the catalog', async () => {
	const { catalog } = fixture();
	assert.deepEqual(await catalog.plan(), { silent: [], review: [], fresh: [], additions: [] });
});

void test('fields still at an earlier catalog value update silently; edited ones wait for review', async () => {
	const { contents, catalog, kept, edit, split } = fixture();
	const current = noteDescription(contents.get(NAVY)!)!;
	// An earlier catalog description, a typical ABV from before the catalog had one, and a user edit.
	edit(NAVY, (content) => content.replace(current, 'High-strength gin; strength affects the cocktail recipe.'));
	edit(BOURBON, (content) => content.replace(/^cc-abv-typical: .*\n/m, ''));
	edit(RYE, (content) => content.replace(noteDescription(content)!, 'My rye notes.'));
	// A value the catalog never had, where it has none, is simply the user's.
	edit('Cocktails/Types/Amontillado Sherry.md', (content) => content.replace('---\n#', 'cc-catch-all: true\n---\n#'));
	const plan = await catalog.plan();
	assert.deepEqual(
		plan.silent.map((update) => `${update.name}: ${update.field}`),
		['Bourbon: abvTypical', 'Navy Strength Gin: description'],
	);
	assert.deepEqual(
		plan.review.map((update) => `${update.name}: ${update.field}`),
		['Rye Whiskey: description'],
	);
	const navyBefore = contents.get(NAVY)!;
	assert.deepEqual((await catalog.apply(plan.silent)).sort(), [BOURBON, NAVY]);
	assert.equal(noteDescription(contents.get(NAVY)!), current);
	assert.equal(contents.get(NAVY)!.length - navyBefore.length, current.length - 56, 'only the description changed');
	assert.equal(split(contents.get(BOURBON)!).properties['cc-abv-typical'], 0.43);
	// Keep mine holds until the catalog's value changes again.
	kept[keptKey(plan.review[0]!)] = keptValue(plan.review[0]!);
	assert.deepEqual(await catalog.plan(), { silent: [], review: [], fresh: [], additions: [] });
	kept[keptKey(plan.review[0]!)] = JSON.stringify('an older catalog value');
	assert.equal((await catalog.plan()).review.length, 1);
});

void test('an edited parent is offered, and using the catalog’s rewrites the link', async () => {
	const { contents, catalog, edit, split } = fixture();
	edit(BOURBON, (content) =>
		content.replace('[[Cocktails/Families/Whiskey|Whiskey]]', '[[Cocktails/Families/Rum|Rum]]'),
	);
	const { review } = await catalog.plan();
	assert.deepEqual(
		review.map((update) => [update.field, update.yours, update.next]),
		[['parent', 'Rum', 'Whiskey']],
	);
	// A note changed after planning is left alone.
	edit(BOURBON, (content) => content.replace('|Rum]]', '|Rum!]]'));
	assert.deepEqual(await catalog.apply(review), []);
	edit(BOURBON, (content) => content.replace('|Rum!]]', '|Rum]]'));
	assert.deepEqual(await catalog.apply(review), [BOURBON]);
	assert.equal(split(contents.get(BOURBON)!).properties['cc-family'], '[[Cocktails/Families/Whiskey|Whiskey]]');
});

void test('a type moving under a same-named type is a parent change, applied as a subtype link', async () => {
	const { contents, catalog, edit, split } = fixture();
	const cognac = 'Cocktails/Types/Cognac.md';
	// Cognac as an earlier catalog wrote it: a type in the family then named Brandy.
	edit(cognac, (content) =>
		content.replace(
			'cc-type: "[[Cocktails/Types/Brandy|Brandy]]"',
			'cc-family: "[[Cocktails/Families/Brandy|Brandy]]"',
		),
	);
	const { silent, review } = await catalog.plan();
	assert.deepEqual(review, []);
	assert.deepEqual(
		silent.map((update) => [update.name, update.field, update.yours, update.next]),
		[['Cognac', 'parent', 'Brandy', 'Subtype of Brandy']],
	);
	assert.deepEqual(await catalog.apply(silent), [cognac]);
	const properties = split(contents.get(cognac)!).properties;
	assert.equal(properties['cc-type'], '[[Cocktails/Types/Brandy|Brandy]]');
	assert.equal(properties['cc-family'], undefined);
	assert.deepEqual(await catalog.plan(), { silent: [], review: [], fresh: [], additions: [] });
});

void test('missing catalog entries are offered until added or skipped', async () => {
	const { contents, catalog, skipped } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	const original = contents.get(absinthe)!;
	contents.delete(absinthe);
	const { additions } = await catalog.plan();
	assert.deepEqual(
		additions.map((item) => item.path),
		[absinthe],
	);
	await catalog.add(additions[0]!);
	assert.equal(contents.get(absinthe), original);
	contents.delete(absinthe);
	skipped.push(additions[0]!.id);
	assert.deepEqual((await catalog.plan()).additions, []);
});

void test('a first sync records the cabinet’s entries and offers missing ones without adding them', async () => {
	const { contents, catalog, state } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	contents.delete(absinthe);
	const result = (await catalog.sync())!;
	assert.deepEqual(result.added, []);
	assert.deepEqual(result.pending, ['type/Absinthe']);
	assert.equal(result.review, 1);
	assert.ok(result.seen.includes('type/Absinthe') && result.seen.includes('type/Bourbon'));
	assert.ok(!contents.has(absinthe));
	Object.assign(state, { seen: result.seen, pending: result.pending });
	assert.deepEqual(
		(await catalog.plan()).additions.map((item) => item.id),
		['type/Absinthe'],
	);
});

void test('entries new to the cabinet are added; ones it already had stay deleted', async () => {
	const { contents, catalog, state } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	const original = contents.get(absinthe)!;
	const all = (await catalog.sync())!.seen;
	// Absinthe is new to this cabinet; Bourbon was deleted after the cabinet had it.
	contents.delete(absinthe);
	contents.delete(BOURBON);
	Object.assign(state, { seen: all.filter((id) => id !== 'type/Absinthe'), pending: [] });
	const plan = await catalog.plan();
	assert.deepEqual(
		plan.fresh.map((item) => item.id),
		['type/Absinthe'],
	);
	assert.deepEqual(plan.additions, []);
	const result = (await catalog.sync())!;
	assert.deepEqual(result.added, ['Absinthe']);
	assert.equal(result.review, 0);
	assert.equal(contents.get(absinthe), original);
	assert.ok(!contents.has(BOURBON));
	assert.deepEqual(result.seen, all);
});

void test('a new entry blocked by a file is offered in review instead', async () => {
	const { contents, catalog, state } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	const all = (await catalog.sync())!.seen;
	contents.set(absinthe, '# My absinthe\n');
	Object.assign(state, { seen: all.filter((id) => id !== 'type/Absinthe'), pending: [] });
	const result = (await catalog.sync())!;
	assert.deepEqual(result.added, []);
	assert.deepEqual(result.pending, ['type/Absinthe']);
	assert.equal(contents.get(absinthe), '# My absinthe\n');
});

void test('a note of the user’s at a missing entry’s path is a conflict, and linking adopts it', async () => {
	const { contents, catalog, split } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	const mine = '---\ncc-kind: type\ncc-name: Absinthe\n---\n# Absinthe\n\nMy notes.\n';
	contents.set(absinthe, mine);
	const { additions } = await catalog.plan();
	assert.deepEqual(
		additions.map((item) => [item.id, item.existing]),
		[['type/Absinthe', { kind: 'type', differs: ['description', 'parent', 'abvTypical'] }]],
	);
	await catalog.adopt(additions[0]!);
	const { properties, body } = split(contents.get(absinthe)!);
	assert.equal(properties['cc-catalog-id'], 'type/Absinthe');
	assert.equal(properties['cc-name'], 'Absinthe');
	assert.equal(body, '# Absinthe\n\nMy notes.\n');
	const plan = await catalog.plan();
	assert.deepEqual(plan.additions, []);
	assert.ok(plan.review.some((item) => item.id === 'type/Absinthe' && item.field === 'description'));
});

void test('linking fills in the catalog’s aliases only where the note has none', async () => {
	const { contents, catalog, split } = fixture();
	const blanc = 'Cocktails/Types/Unaged Rhum Agricole.md';
	const vieux = 'Cocktails/Types/Aged Rhum Agricole.md';
	contents.set(blanc, '---\ncc-kind: type\n---\n# Unaged Rhum Agricole\n');
	contents.set(vieux, '---\ncc-kind: type\naliases: ["Vieux"]\n---\n# Aged Rhum Agricole\n');
	for (const addition of (await catalog.plan()).additions) await catalog.adopt(addition);
	assert.deepEqual(split(contents.get(blanc)!).properties.aliases, ['Rhum Agricole Blanc']);
	assert.deepEqual(split(contents.get(vieux)!).properties.aliases, ['Vieux']);
});

void test('a note of another kind can’t stand in for a missing entry', async () => {
	const { contents, catalog } = fixture();
	const absinthe = 'Cocktails/Types/Absinthe.md';
	contents.set(absinthe, '---\ncc-kind: bottle\n---\n# Absinthe\n');
	const [addition] = (await catalog.plan()).additions;
	assert.deepEqual(addition?.existing, { kind: 'bottle', differs: [] });
	await assert.rejects(catalog.adopt(addition), /isn’t a type note/);
	assert.equal(contents.get(absinthe), '---\ncc-kind: bottle\n---\n# Absinthe\n');
});

void test('description and preparation edits leave the rest of the note alone', () => {
	const note =
		'---\ncc-kind: type\n---\n# Syrup\n\nOld text.\n\n### Preparation\n\nStir.\n\n### My notes\n\nMine.\n\n![[Cocktails/Views/Related.base#Stock]]\n';
	assert.equal(noteDescription(note), 'Old text.');
	assert.equal(notePreparation(note), 'Stir.');
	assert.equal(withDescription(note, 'New text.'), note.replace('Old text.', 'New text.'));
	assert.equal(withPreparation(note, 'Shake.'), note.replace('Stir.', 'Shake.'));
	assert.equal(withPreparation(note, null), note.replace('### Preparation\n\nStir.\n\n', ''));
	const bare = '---\ncc-kind: type\n---\n# Syrup\n\nText.\n\n![[Cocktails/Views/Related.base#Stock]]\n';
	assert.equal(withPreparation(bare, 'Stir.'), bare.replace('Text.\n\n', 'Text.\n\n### Preparation\n\nStir.\n\n'));
});
