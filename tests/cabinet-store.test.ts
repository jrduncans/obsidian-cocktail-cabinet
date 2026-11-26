import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { CabinetStore } from '../src/vault/cabinet-store';
import { cabinetViews, managedNotes, starterPlan } from '../src/core/setup';
import { navigationEmbed, NAVIGATION_VIEWS } from '../src/core/navigation';
import { asManaged, lineDiff, managedMarker, managedState, withoutMarker } from '../src/core/managed';
import { relatedTargets } from '../src/core/relationships';
import { contentFingerprint } from '../src/core/schema';
import { restockBase } from '../src/core/restock';
import type { RestockThresholds } from '../src/core/restock';
import { parseYaml, TFile, TFolder } from './obsidian-stub';

function fixture() {
	const contents = new Map(
		starterPlan('Cocktails').map((note) => {
			if (note.kind === 'base') return [note.path, note.content];
			const frontmatter = note.content.split('---\n')[1] || '';
			const properties: Record<string, unknown> = Object.fromEntries(
				frontmatter
					.trim()
					.split('\n')
					.map((line) => {
						const colon = line.indexOf(':');
						return [line.slice(0, colon), JSON.parse(line.slice(colon + 1)) as unknown];
					}),
			);
			return [note.path, `---\n${JSON.stringify(properties)}\n---\nPersonal content to preserve.\n`];
		}),
	);
	const folders = new Set([
		'Cocktails',
		'Cocktails/Views',
		'Cocktails/Types',
		'Cocktails/Families',
		'Cocktails/Categories',
	]);
	const app = {
		vault: {
			getFiles: () => [...contents.keys()].map((path) => new TFile(path)),
			getMarkdownFiles: () =>
				[...contents.keys()].filter((path) => path.endsWith('.md')).map((path) => new TFile(path)),
			getAllLoadedFiles: () => [...contents.keys()].map((path) => new TFile(path)),
			getAbstractFileByPath: (path: string) =>
				contents.has(path) ? new TFile(path) : folders.has(path) ? new TFolder() : null,
			read: (file: TFile) => Promise.resolve(contents.get(file.path)),
			createFolder: (path: string) => {
				folders.add(path);
				return Promise.resolve();
			},
			create: (path: string, content: string) => {
				assert.ok(!contents.has(path), 'Existing files must not be overwritten.');
				contents.set(path, content);
				return Promise.resolve(new TFile(path));
			},
			process: (file: TFile, transform: (content: string) => string) => {
				const content = transform(contents.get(file.path)!);
				contents.set(file.path, content);
				return Promise.resolve(content);
			},
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const source = contents.get(file.path)?.match(/^---\n([\s\S]*?)\n---/)?.[1];
				return source ? { frontmatter: parseYaml(source) as Record<string, unknown> } : null;
			},
			getFirstLinkpathDest: (link: string) => {
				const path = contents.has(`${link}.md`) ? `${link}.md` : contents.has(link) ? link : null;
				return path ? new TFile(path) : null;
			},
		},
		fileManager: {
			renameFile: (file: TFile, destination: string) => {
				assert.ok(!contents.has(destination));
				contents.set(destination, contents.get(file.path)!);
				contents.delete(file.path);
				Object.assign(file, { path: destination });
				return Promise.resolve();
			},
		},
	} as unknown as App;
	const thresholds: RestockThresholds = { percent: 10, ml: 70 };
	return {
		app,
		contents,
		folders,
		thresholds,
		store: new CabinetStore(
			app,
			() => 'Cocktails',
			() => thresholds,
		),
	};
}

void test('setup preserves a complete cabinet', async () => {
	const { contents, store } = fixture();
	const before = [...contents];
	assert.deepEqual(await store.setup('Cocktails'), { created: 0, updated: 0, kept: contents.size });
	assert.deepEqual([...contents], before);
});

void test('setup preserves renamed pages and supplies their paths to missing child notes', async () => {
	const { contents, store } = fixture();
	const original = 'Cocktails/Families/Rum.md';
	const renamed = 'Cocktails/Families/My Rum.md';
	contents.set(renamed, contents.get(original)!);
	contents.delete(original);
	contents.delete('Cocktails/Types/Aged Jamaican Rum.md');
	const preview = await store.previewSetup('Cocktails');
	assert.deepEqual(preview.conflicts, []);
	assert.ok(preview.keep.includes(renamed));
	assert.equal(preview.create.length, 1);
	assert.ok(preview.create[0]?.content.includes('[[Cocktails/Families/My Rum|Rum]]'));
	assert.ok(preview.create[0]?.content.includes('cc-catalog-id: "type/Aged Jamaican Rum"'));
});

void test('setup keeps other stock the user already created at a starter path', async () => {
	const { contents, store } = fixture();
	const path = 'Cocktails/Ingredients/Salt.md';
	contents.set(path, '---\ncc-kind: "ingredient"\ncc-name: "Salt"\n---\n# Salt\n');
	const preview = await store.previewSetup('Cocktails');
	assert.deepEqual(preview.conflicts, []);
	assert.ok(preview.keep.includes(path));
});

void test('setup rejects duplicate catalog identities', async () => {
	const { contents, store } = fixture();
	const original = contents.get('Cocktails/Families/Rum.md')!;
	const duplicate = 'Cocktails/Families/Another Rum.md';
	contents.set(duplicate, original);
	const before = [...contents];
	assert.ok((await store.previewSetup('Cocktails')).conflicts.includes(duplicate));
	await assert.rejects(store.setup('Cocktails'), /Setup conflicts/);
	assert.deepEqual([...contents], before);
});

void test('setup adds missing views, replaces changed ones, keeps the Cocktail Cabinet note, and creates Custom views', async () => {
	const { contents, folders, store } = fixture();
	const edited = 'Cocktails/Views/Bottles.base';
	const original = contents.get(edited)!;
	contents.set(edited, 'views: []\n# My change\n');
	const home = contents.get('Cocktails/Cocktail Cabinet.md');
	contents.delete('Cocktails/Views/Ingredient types.base');
	const preview = await store.previewSetup('Cocktails');
	assert.deepEqual(
		preview.create.map((file) => file.path),
		['Cocktails/Views/Ingredient types.base'],
	);
	assert.deepEqual(
		preview.update.map((file) => file.path),
		[edited],
	);
	assert.deepEqual(preview.conflicts, []);
	assert.deepEqual(await store.setup('Cocktails'), { created: 1, updated: 1, kept: contents.size - 2 });
	assert.equal(contents.get(edited), original);
	assert.equal(contents.get('Cocktails/Cocktail Cabinet.md'), home);
	assert.ok(folders.has('Cocktails/Custom views'));
	assert.equal((await store.setup('Cocktails')).created, 0);
});

void test('views are rewritten when the generated version changes, not when Obsidian or the user saves them', async () => {
	const { contents, store, thresholds } = fixture();
	const views = cabinetViews('Cocktails', thresholds);
	// The first sync adopts views that already match and records every view.
	const first = await store.syncViews({});
	assert.deepEqual(first.updated, []);
	assert.deepEqual(Object.keys(first.written).sort(), views.map((view) => view.path).sort());
	// A view saved with column widths, or deleted, stays while the plugin's version is the same.
	const bottles = 'Cocktails/Views/Bottles.base';
	contents.set(bottles, `${contents.get(bottles)!}columnSize: {}\n`);
	contents.delete('Cocktails/Views/Ingredient types.base');
	assert.deepEqual((await store.syncViews(first.written)).updated, []);
	assert.match(contents.get(bottles)!, /columnSize/);
	// A release that changes a view rewrites it, and recreates it if deleted.
	const stale = { ...first.written, [bottles]: 'older', 'Cocktails/Views/Ingredient types.base': 'older' };
	assert.deepEqual((await store.syncViews(stale)).updated.sort(), [bottles, 'Cocktails/Views/Ingredient types.base']);
	assert.ok(!contents.get(bottles)!.includes('columnSize'));
	// A threshold change rewrites Restock only.
	thresholds.percent = 15;
	const restock = await store.syncViews(first.written);
	assert.deepEqual(restock.updated, ['Cocktails/Views/Restock.base']);
	assert.equal(contents.get('Cocktails/Views/Restock.base'), restockBase('Cocktails', thresholds).content);
	assert.equal(
		restock.written['Cocktails/Views/Restock.base'],
		contentFingerprint(restockBase('Cocktails', thresholds).content, 'Cocktails'),
	);
});

void test('Refresh rewrites every changed or missing view, and nothing syncs before setup', async () => {
	const { contents, store } = fixture();
	const { written } = await store.syncViews({});
	const related = 'Cocktails/Views/Related.base';
	const original = contents.get(related)!;
	contents.set(related, '# changed\n');
	contents.delete('Cocktails/Views/Restock.base');
	assert.deepEqual((await store.syncViews(written, true)).updated.sort(), [
		'Cocktails/Views/Related.base',
		'Cocktails/Views/Restock.base',
	]);
	assert.equal(contents.get(related), original);
	contents.delete('Cocktails/Cocktail Cabinet.md');
	contents.set(related, '# changed\n');
	assert.deepEqual((await store.syncViews({}, true)).updated, []);
	assert.equal(contents.get(related), '# changed\n');
});

void test('a new cabinet gets the worked example; reruns never restore a deleted example', async () => {
	const { contents, store } = fixture();
	contents.delete('Cocktails/Cocktail Cabinet.md');
	const fresh = await store.previewSetup('Cocktails');
	assert.deepEqual(fresh.conflicts, []);
	assert.deepEqual(
		fresh.create
			.filter((file) => file.example)
			.map((file) => file.path)
			.sort(),
		[
			'Cocktails/Ingredients/House Simple Syrup (1 to 1).md',
			'Cocktails/Ingredients/Lemons.md',
			'Cocktails/Ingredients/Limes.md',
			'Cocktails/Recipes/Daiquiri.md',
			'Cocktails/Recipes/Whiskey Sour.md',
		],
	);
	await store.setup('Cocktails');
	assert.ok(contents.get('Cocktails/Cocktail Cabinet.md')?.includes('[[Cocktails/Recipes/Daiquiri|Daiquiri]]'));
	contents.delete('Cocktails/Recipes/Daiquiri.md');
	assert.equal((await store.setup('Cocktails')).created, 0);
	assert.ok(!contents.has('Cocktails/Recipes/Daiquiri.md'));
});

void test('an existing note at an example path is kept rather than blocking a new cabinet', async () => {
	const { contents, store } = fixture();
	contents.delete('Cocktails/Cocktail Cabinet.md');
	contents.set('Cocktails/Recipes/Daiquiri.md', '---\ncc-kind: recipe\n---\nMy own Daiquiri.\n');
	const preview = await store.previewSetup('Cocktails');
	assert.deepEqual(preview.conflicts, []);
	assert.ok(preview.keep.includes('Cocktails/Recipes/Daiquiri.md'));
	await store.setup('Cocktails');
	assert.equal(contents.get('Cocktails/Recipes/Daiquiri.md'), '---\ncc-kind: recipe\n---\nMy own Daiquiri.\n');
});

void test('view fingerprints ignore the cabinet folder and line endings', () => {
	assert.equal(
		contentFingerprint('a "Cocktails" b\n', 'Cocktails'),
		contentFingerprint('a "Drinks/Bar" b\r\n', 'Drinks/Bar'),
	);
	assert.notEqual(contentFingerprint('a', 'Cocktails'), contentFingerprint('b', 'Cocktails'));
});

void test('a file blocking the Views folder stops setup before any files are created', async () => {
	const { contents, folders, store } = fixture();
	folders.delete('Cocktails/Views');
	for (const path of contents.keys()) if (path.endsWith('.base')) contents.delete(path);
	contents.set('Cocktails/Views', 'Personal file');
	const before = [...contents];
	assert.ok((await store.previewSetup('Cocktails')).conflicts.includes('Cocktails/Views'));
	await assert.rejects(store.setup('Cocktails'), /Setup conflicts/);
	assert.deepEqual([...contents], before);
});

void test('setup rejects a Base path with different casing', async () => {
	const { contents, store } = fixture();
	const original = 'Cocktails/Views/Bottles.base';
	contents.set('Cocktails/Views/bottles.base', contents.get(original)!);
	contents.delete(original);
	await assert.rejects(store.setup('Cocktails'), /Setup conflicts/);
});

void test('bottle classification reads one scalar type without broadening, while other stock can provide several', () => {
	const first = 'Cocktails/Types/Aged Jamaican Rum.md';
	const second = 'Cocktails/Types/Aged Barbados Rum.md';
	const bottle = 'Cocktails/Bottles/Example.md';
	const alternatives = 'Cocktails/Bottles/Alternative.md';
	const frontmatters = new Map<string, Record<string, unknown>>([
		[first, { 'cc-kind': 'type', 'cc-name': 'Aged Jamaican Rum' }],
		[second, { 'cc-kind': 'type', 'cc-name': 'Aged Barbados Rum' }],
		[bottle, { 'cc-kind': 'bottle', 'cc-name': 'Example', 'cc-type': `[[${first}]]` }],
		[alternatives, { 'cc-kind': 'bottle', 'cc-name': 'Alternative', 'cc-type': `[[${first}]]` }],
		[
			'Cocktails/Ingredients/Other.md',
			{ 'cc-kind': 'ingredient', 'cc-name': 'Other', 'cc-provides': [`[[${first}]]`, `[[${second}]]`] },
		],
	]);
	const app = {
		vault: { getMarkdownFiles: () => [...frontmatters.keys()].map((path) => new TFile(path)) },
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
			getFirstLinkpathDest: (path: string) => (frontmatters.has(path) ? new TFile(path) : null),
		},
	} as unknown as App;
	const store = new CabinetStore(app, () => 'Cocktails');
	const read = () => store.notes().find((note) => note.path === bottle)!;
	assert.deepEqual(read().parents, [first]);
	assert.deepEqual(store.notes().find((note) => note.kind === 'ingredient')?.parents, [first, second]);
	assert.ok(relatedTargets(store.notes(), read()).has(alternatives));
	assert.ok(!relatedTargets(store.notes(), read()).has(second));
	for (const value of [
		undefined,
		null,
		[],
		[`[[${first}]]`],
		[`[[${first}]]`, `[[${second}]]`],
		`[[${bottle}]]`,
		'[[Missing]]',
	]) {
		frontmatters.set(bottle, { 'cc-kind': 'bottle', 'cc-name': 'Example', 'cc-type': value });
		assert.deepEqual(read().parents, []);
		assert.ok(!relatedTargets(store.notes(), read()).has(alternatives));
	}
	frontmatters.set(bottle, {
		'cc-kind': 'bottle',
		'cc-name': 'Example',
		'cc-types': [`[[${first}]]`, `[[${second}]]`],
	});
	assert.deepEqual(read().parents, []);
});

void test('types and families read one scalar parent and ignore lists', () => {
	const family = 'Cocktails/Families/Rum.md';
	const category = 'Cocktails/Categories/Spirit.md';
	const type = 'Cocktails/Types/Light Rum.md';
	const frontmatters = new Map<string, Record<string, unknown>>([
		[category, { 'cc-kind': 'category', 'cc-name': 'Spirit' }],
		[family, { 'cc-kind': 'family', 'cc-name': 'Rum', 'cc-category': `[[${category}]]` }],
		[type, { 'cc-kind': 'type', 'cc-name': 'Light Rum', 'cc-family': `[[${family}]]` }],
	]);
	const app = {
		vault: { getMarkdownFiles: () => [...frontmatters.keys()].map((path) => new TFile(path)) },
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
			getFirstLinkpathDest: (path: string) => (frontmatters.has(path) ? new TFile(path) : null),
		},
	} as unknown as App;
	const store = new CabinetStore(app, () => 'Cocktails');
	const parents = (path: string) => store.notes().find((note) => note.path === path)!.parents;
	assert.deepEqual(parents(type), [family]);
	assert.deepEqual(parents(family), [category]);
	frontmatters.set(type, { 'cc-kind': 'type', 'cc-name': 'Light Rum', 'cc-family': [`[[${family}]]`] });
	frontmatters.set(family, { 'cc-kind': 'family', 'cc-name': 'Rum', 'cc-category': [`[[${category}]]`] });
	assert.deepEqual(parents(type), []);
	assert.deepEqual(parents(family), []);
});

const enhancementDraft = {
	kind: 'recipe' as const,
	name: 'A clipped recipe',
	ingredients: ['2 oz [[Cocktails/Families/Gin|Gin (Cold River)]]'],
	method: 'Stir with ice.',
	description: 'Personal annotation.',
	properties: { source: 'https://example.test/recipe' },
};

void test('enhancing an existing page moves it into Recipes and preserves metadata', async () => {
	const { store, contents } = fixture();
	const path = 'Clippings/Original filename.md';
	const original = `---\n${JSON.stringify({ source: 'Old source', rating: 'Loved it', created: '2024-04-11', tags: ['cocktails'], custom: { nested: [1, 2] }, aliases: ['Old title'] })}\n---\n2 oz Gin\n\nStir with ice.`;
	contents.set(path, original);
	const result = await store.enhanceRecipe({ path, content: original }, enhancementDraft);
	assert.equal(result.path, 'Cocktails/Recipes/Original filename.md');
	assert.ok(!contents.has(path));
	const saved = contents.get(result.path)!;
	const properties = JSON.parse(saved.split('---\n')[1]!) as Record<string, unknown>;
	assert.equal(properties['cc-kind'], 'recipe');
	assert.equal(properties['cc-name'], 'A clipped recipe');
	assert.equal(properties.rating, 'Loved it');
	assert.equal(properties.created, '2024-04-11');
	assert.equal(properties.source, 'https://example.test/recipe');
	assert.deepEqual(properties.tags, ['cocktails']);
	assert.deepEqual(properties.aliases, ['Old title']);
	assert.deepEqual(properties.custom, { nested: [1, 2] });
	assert.ok(saved.includes('### Method\n\nStir with ice.'));
	assert.ok(saved.includes('Personal annotation.'));
});

void test('enhancement converts a star rating to a number', async () => {
	const { store, contents } = fixture();
	const path = 'Clippings/Starred.md';
	const original = `---\n${JSON.stringify({ rating: '⭐️⭐️⭐️⭐️' })}\n---\n2 oz Gin`;
	contents.set(path, original);
	const result = await store.enhanceRecipe({ path, content: original }, enhancementDraft);
	assert.equal((JSON.parse(contents.get(result.path)!.split('---\n')[1]!) as Record<string, unknown>).rating, 4);
});

void test('enhancement retains the location of a note already inside the cabinet', async () => {
	const { store, contents } = fixture();
	const path = 'Cocktails/My recipes/Original.md',
		original = '2 oz Gin\n\nStir with ice.';
	contents.set(path, original);
	assert.equal(store.recipeDestination(path), path);
	assert.equal((await store.enhanceRecipe({ path, content: original }, enhancementDraft)).path, path);
	assert.ok(contents.get(path)?.includes('cc-kind'));
});

void test('a stale review, renamed original, conflicting destination, or different resource kind cannot overwrite notes', async () => {
	const { store, contents } = fixture();
	const path = 'Clippings/Original.md',
		original = '2 oz Gin';
	contents.set(path, 'Edited while review is open.');
	await assert.rejects(store.enhanceRecipe({ path, content: original }, enhancementDraft), /note changed/);
	assert.equal(contents.get(path), 'Edited while review is open.');
	contents.delete(path);
	await assert.rejects(store.enhanceRecipe({ path, content: original }, enhancementDraft), /moved or removed/);
	contents.set(path, original);
	contents.set('Cocktails/Recipes/original.md', 'A different recipe.');
	await assert.rejects(store.enhanceRecipe({ path, content: original }, enhancementDraft), /already exists/);
	assert.equal(contents.get(path), original);
	assert.equal(contents.get('Cocktails/Recipes/original.md'), 'A different recipe.');
	contents.delete('Cocktails/Recipes/original.md');
	const other = `---\n${JSON.stringify({ 'cc-kind': 'type' })}\n---\nOriginal ingredient description.`;
	contents.set(path, other);
	await assert.rejects(store.enhanceRecipe({ path, content: other }, enhancementDraft), /another cabinet resource/);
	assert.equal(contents.get(path), other);
});

void test('a failed move restores the source content but never overwrites concurrent edits', async () => {
	const { app, store, contents } = fixture();
	const path = 'Clippings/Original.md',
		original = '2 oz Gin';
	contents.set(path, original);
	app.fileManager.renameFile = () => Promise.reject(new Error('Move failed'));
	await assert.rejects(
		store.enhanceRecipe({ path, content: original }, enhancementDraft),
		/original note content was restored/,
	);
	assert.equal(contents.get(path), original);
	app.fileManager.renameFile = () => {
		contents.set(path, contents.get(path)! + '\nConcurrent edit.');
		return Promise.reject(new Error('Move failed'));
	};
	await assert.rejects(store.enhanceRecipe({ path, content: original }, enhancementDraft), /enhanced note remains/);
	assert.ok(contents.get(path)?.endsWith('Concurrent edit.'));
});

void test('editor newline normalization does not make an unchanged note appear stale', async () => {
	const { store, contents } = fixture();
	const path = 'Cocktails/Recipes/Normalized.md';
	contents.set(path, '\uFEFF2 oz Gin\r\n\r\nStir with ice.');
	await store.enhanceRecipe({ path, content: '2 oz Gin\n\nStir with ice.' }, enhancementDraft);
	assert.ok(contents.get(path)?.includes('### Method'));
});

void test('fresh cabinet reads retain a just-edited resource while metadata cache is temporarily missing', async () => {
	const { app, contents, store } = fixture();
	const original = 'Cocktails/Bottles/Cache race.md';
	contents.set(
		original,
		`\uFEFF---\n${JSON.stringify({ 'cc-kind': 'bottle', 'cc-name': 'Cache race', 'cc-open-ml': 25 })}\n---\n`,
	);
	app.vault.getMarkdownFiles = () =>
		[...contents.keys()]
			.filter((path) => path.endsWith('.md'))
			.map((path) => new TFile(path)) as unknown as ReturnType<typeof app.vault.getMarkdownFiles>;
	Object.assign(app, { metadataCache: { getFileCache: () => undefined, getFirstLinkpathDest: () => null } });
	assert.deepEqual(store.notes(), []);
	assert.equal((await store.readNotes()).find((note) => note.path === original)?.name, 'Cache race');
});

void test('a managed note records its fingerprint, and edits other than the marker count as changes', () => {
	const [note] = managedNotes('Cocktails');
	const content = note!.content;
	const marker = managedMarker(content);
	assert.ok(marker);
	assert.match(content, /^cc-managed: "[^"]+"$/m);
	assert.equal(asManaged(note!, 'Cocktails').content, content, 'adding the marker twice changes nothing');
	assert.equal(managedState(content, content, 'Cocktails'), 'current');
	// Obsidian may rewrite the marker without quotes, or with CRLF line endings.
	const unquoted = content.replace(`cc-managed: "${marker}"`, `cc-managed: ${marker}`).replace(/\n/g, '\r\n');
	assert.equal(managedState(unquoted, content, 'Cocktails'), 'current');
	const older = asManaged(
		{ ...note!, content: withoutMarker(content).replace('New here?', 'First time?') },
		'Cocktails',
	);
	assert.equal(managedState(older.content, content, 'Cocktails'), 'unchanged');
	const edited = older.content.replace('# Cocktail Cabinet', '# My bar');
	assert.equal(managedState(edited, content, 'Cocktails'), 'changed');
	assert.equal(managedState(withoutMarker(edited), content, 'Cocktails'), 'unmanaged');
	assert.equal(managedState(null, content, 'Cocktails'), 'missing');
});

void test('the review diff marks lines only in your version and only in the new one', () => {
	const diff = lineDiff(
		'---\ncc-managed: "a"\n---\none\nmine\nthree\n',
		'---\ncc-managed: "b"\n---\none\nnew\nthree\n',
	);
	assert.deepEqual(
		diff.filter((line) => line.side !== 'same'),
		[
			{ side: 'new', text: 'new' },
			{ side: 'yours', text: 'mine' },
		],
	);
	assert.equal(diff.filter((line) => line.side === 'same').length, 4);
});

void test('managed notes update when untouched, wait for review when edited, and stay deleted', async () => {
	const { contents, store } = fixture();
	const planned = managedNotes('Cocktails');
	const [cabinet, shopping] = planned.map((note) => note.path) as [string, string];
	// An earlier version of each, as a previous release wrote it.
	for (const note of planned)
		contents.set(
			note.path,
			asManaged({ ...note, content: `${withoutMarker(note.content)}\nOlder line.\n` }, 'Cocktails').content,
		);
	contents.set(shopping, contents.get(shopping)!.replace('Older line.', 'My own line.'));
	const first = await store.syncManaged({});
	assert.deepEqual(
		first.updated,
		planned.map((note) => note.path).filter((path) => path !== shopping),
	);
	assert.deepEqual(first.review, [shopping]);
	assert.equal(contents.get(cabinet), planned[0]!.content);
	assert.match(contents.get(shopping)!, /My own line/);
	// Recorded: nothing is looked at again until the plugin's version changes.
	assert.deepEqual(await store.syncManaged(first.written), {
		created: [],
		updated: [],
		review: [],
		written: first.written,
	});
	assert.deepEqual(
		(await store.managedUpdates()).map((update) => update.path),
		[shopping],
	);
	// Keep mine: the marker goes, and the note is the user's, even on Refresh.
	const edited = contents.get(shopping)!;
	await store.keepMine(shopping, edited);
	assert.equal(managedMarker(contents.get(shopping)!), null);
	assert.deepEqual((await store.syncManaged(first.written, true)).review, []);
	assert.deepEqual(await store.managedUpdates(), []);
	assert.match(contents.get(shopping)!, /My own line/);
	// A managed note deleted after it was written stays deleted, until Refresh restores it.
	contents.delete(shopping);
	assert.deepEqual((await store.syncManaged({ ...first.written, [shopping]: 'older' })).created, []);
	assert.ok(!contents.has(shopping));
	assert.deepEqual((await store.syncManaged(first.written, true)).created, [shopping]);
	assert.equal(contents.get(shopping), planned[1]!.content);
	// A note new in this release is created.
	contents.delete(shopping);
	const { [shopping]: _, ...withoutShopping } = first.written;
	assert.deepEqual((await store.syncManaged(withoutShopping)).created, [shopping]);
});

void test('Use new version replaces an edited note, optionally saving yours beside it', async () => {
	const { contents, store } = fixture();
	const planned = managedNotes('Cocktails');
	const path = planned[1]!.path;
	const mine = planned[1]!.content.replace('# Shopping list', '# Groceries');
	contents.set(path, mine);
	contents.set('Cocktails/Shopping list (your version).md', 'taken');
	const copy = 'Cocktails/Shopping list (your version 2).md';
	assert.equal(await store.useNewVersion(path, true, mine), copy);
	assert.equal(contents.get(copy), withoutMarker(mine));
	assert.equal(contents.get(path), planned[1]!.content);
	contents.set(path, mine);
	await assert.rejects(store.useNewVersion(path, false, 'something else'), /changed after review opened/);
	assert.equal(await store.useNewVersion(path, false), null);
	assert.equal(contents.get(path), planned[1]!.content);
});

void test('the Cocktail Cabinet note links the worked examples only while they remain', async () => {
	const { contents, store } = fixture();
	contents.delete('Cocktails/Cocktail Cabinet.md');
	await store.setup('Cocktails');
	const cabinet = 'Cocktails/Cocktail Cabinet.md';
	assert.match(contents.get(cabinet)!, /## Try an example/);
	assert.ok(managedMarker(contents.get(cabinet)!));
	const { written } = await store.syncManaged({});
	assert.equal(managedState(contents.get(cabinet)!, contents.get(cabinet)!, 'Cocktails'), 'current');
	for (const path of [...contents.keys()].filter((path) => /Recipes\/(Daiquiri|Whiskey Sour)\.md$/.test(path)))
		contents.delete(path);
	assert.deepEqual((await store.syncManaged(written)).updated, [cabinet]);
	assert.doesNotMatch(contents.get(cabinet)!, /Try an example/);
});

void test('resource notes get missing Related sections, once, without moving what is there', async () => {
	const { contents, store } = fixture();
	const embed = (view: (typeof NAVIGATION_VIEWS)[keyof typeof NAVIGATION_VIEWS]) =>
		navigationEmbed('Cocktails', view);
	const rum = 'Cocktails/Families/Rum.md';
	// The fixture's notes have no sections; one keeps a custom order and a short link form.
	contents.set(rum, `${contents.get(rum)!}\n![[Related.base#Recipes]]\n\nMy note.\n\n${embed('Types')}\n`);
	const updated = await store.syncSections();
	assert.ok(updated.includes(rum));
	assert.ok(updated.includes('Cocktails/Types/Aged Jamaican Rum.md'));
	assert.ok(!updated.some((path) => path.includes('/Views/') || path.endsWith('Cocktail Cabinet.md')));
	// Stock goes before the next section in order, Recipes, wherever that is.
	const [before] = contents.get(rum)!.split(embed('Stock'));
	assert.ok(before!.endsWith('Personal content to preserve.\n\n'));
	assert.ok(
		contents
			.get(rum)!
			.endsWith(`${embed('Stock')}\n\n![[Related.base#Recipes]]\n\nMy note.\n\n${embed('Types')}\n`),
	);
	assert.deepEqual(await store.syncSections(), []);
});

void test('the guide and Agent Reference are managed notes in Guide, linked from the Cocktail Cabinet note', () => {
	const notes = managedNotes('Drinks/Bar');
	const guide = notes.filter((note) => note.kind === 'guide');
	assert.deepEqual(
		guide.map((note) => note.path.replace('Drinks/Bar/Guide/', '')),
		[
			'Getting Started.md',
			'Recipes.md',
			'Stock.md',
			'Making Drinks.md',
			'Shopping.md',
			'Hierarchy and Substitutes.md',
			'Views and Customizing.md',
			'Agent Reference.md',
		],
	);
	for (const note of guide) assert.ok(managedMarker(note.content), note.path);
	const cabinet = notes.find((note) => note.kind === 'cabinet')!.content;
	for (const note of guide)
		assert.ok(cabinet.includes(`[[${note.path.replace(/\.md$/, '')}|`), `${note.path} is linked`);
	const agents = guide.at(-1)!.content;
	assert.match(agents, /obsidian cocktail-cabinet:makeable/);
	assert.match(agents, /`Drinks\/Bar\/Views\/`/);
});

void test('a note with unreadable properties is skipped by fresh reads and named when it is needed', async () => {
	const { app, contents, store } = fixture();
	const broken = 'Cocktails/Recipes/Broken.md';
	contents.set(broken, '---\n{"cc-kind": "recipe",\n---\n# Broken\n');
	app.vault.getMarkdownFiles = () =>
		[...contents.keys()]
			.filter((path) => path.endsWith('.md'))
			.map((path) => new TFile(path)) as unknown as ReturnType<typeof app.vault.getMarkdownFiles>;
	Object.assign(app, { metadataCache: { getFileCache: () => undefined, getFirstLinkpathDest: () => null } });
	const notes = await store.readNotes();
	assert.ok(notes.length > 100);
	assert.deepEqual(store.skipped, [broken]);
	assert.match(
		store.unreadable(broken)?.message ?? '',
		/Couldn’t read the properties of Cocktails\/Recipes\/Broken\.md/,
	);
	assert.equal(store.unreadable(notes[0]!.path), null);
	// Setup treats it as a note in the way only if it sits at a starter path; elsewhere preview goes ahead.
	assert.deepEqual((await store.previewSetup('Cocktails')).conflicts, []);
});

void test('cabinet changes made while another runs wait their turn instead of failing', async () => {
	const { store } = fixture();
	const order: string[] = [];
	const write = (store as unknown as { write: <T>(op: () => Promise<T>) => Promise<T> }).write.bind(store);
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const first = write(async () => {
		await gate;
		order.push('first');
		throw new Error('first failed');
	});
	const second = write(() => {
		order.push('second');
		return Promise.resolve('done');
	});
	release();
	await assert.rejects(first, /first failed/);
	assert.equal(await second, 'done');
	assert.deepEqual(order, ['first', 'second']);
});

void test('after a move, links get their full paths back and unedited managed notes the current version', async () => {
	const { app, contents, store } = fixture();
	// Written while the cabinet was in Old Bar, then moved to Cocktails, where Obsidian shortened the links.
	const shorten = (text: string) =>
		text
			.split('`')
			.map((part, index) =>
				index % 2 ? part : part.replace(/\[\[Old Bar\/(?:[^\]|#\n]*\/)?([^\]|#/\n]+)/g, '[[$1'),
			)
			.join('`');
	const planned = managedNotes('Cocktails');
	for (const note of managedNotes('Old Bar'))
		contents.set(note.path.replace('Old Bar/', 'Cocktails/'), shorten(note.content));
	const [cabinet, shopping] = planned.map((note) => note.path) as [string, string];
	contents.set(shopping, contents.get(shopping)!.replace('# Shopping list', '# Groceries'));
	const recipe = 'Cocktails/Recipes/House Sour.md';
	contents.set(
		recipe,
		'---\ncc-kind: "recipe"\ncc-ingredients: ["[[Bourbon|Bourbon]]"]\n---\n# House Sour\n\n- 2 oz [[Bourbon|Bourbon]] and [[Daily note]]\n',
	);
	Object.assign(app.metadataCache, {
		getFirstLinkpathDest: (link: string) => {
			const path = [...contents.keys()].find(
				(key) =>
					key === `${link}.md` || key === link || key.endsWith(`/${link}.md`) || key.endsWith(`/${link}`),
			);
			return path ? new TFile(path) : null;
		},
	});
	Object.assign(app, {
		fileManager: {
			processFrontMatter: (file: TFile, edit: (properties: Record<string, unknown>) => void) => {
				const content = contents.get(file.path)!;
				const match = content.match(/^---\n([\s\S]*?)\n---\n/)!;
				const properties = parseYaml(match[1]!) as Record<string, unknown>;
				edit(properties);
				const lines = Object.entries(properties).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
				contents.set(file.path, `---\n${lines.join('\n')}\n---\n${content.slice(match[0].length)}`);
				return Promise.resolve();
			},
		},
	});
	const { failed } = await store.restoreFullPaths();
	assert.deepEqual(failed, []);
	assert.match(contents.get(recipe)!, /cc-ingredients: \["\[\[Cocktails\/Types\/Bourbon\|Bourbon\]\]"\]/);
	assert.match(contents.get(recipe)!, /- 2 oz \[\[Cocktails\/Types\/Bourbon\|Bourbon\]\] and \[\[Daily note\]\]/);
	// The Agent Reference names the folder in its text too, which only rewriting brings up to date.
	const reference = planned.find((note) => note.path.endsWith('/Agent Reference.md'))!.path;
	assert.match(contents.get(reference)!, /Old Bar\//);
	const written = await store.relinkManaged('Old Bar');
	assert.ok(written.includes(reference));
	assert.ok(!written.includes(shopping));
	assert.equal(contents.get(cabinet), planned[0]!.content);
	for (const note of planned.filter((item) => item.path !== shopping))
		assert.equal(contents.get(note.path), note.content);
	assert.match(contents.get(shopping)!, /# Groceries/);
});
