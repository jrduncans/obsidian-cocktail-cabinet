import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { CabinetStore } from '../src/vault/cabinet-store';
import { starterPlan } from '../src/core/setup';
import { relatedTargets } from '../src/core/relationships';
import { managedFingerprint } from '../src/core/schema';
import { PREVIOUS_NAVIGATION_VERSIONS } from '../src/core/navigation';
import { TFile, TFolder } from './obsidian-stub';

function fixture() {
	const contents = new Map(starterPlan('Cocktails').map(note => {
		if (note.kind === 'base') return [note.path, note.content];
		const frontmatter = note.content.split('---\n')[1] || '';
		const properties: Record<string, unknown> = Object.fromEntries(frontmatter.trim().split('\n').map(line => {
			const colon = line.indexOf(':');
			return [line.slice(0, colon), JSON.parse(line.slice(colon + 1)) as unknown];
		}));
		return [note.path, `---\n${JSON.stringify(properties)}\n---\nPersonal content to preserve.\n`];
	}));
	const folders = new Set(['Cocktails', 'Cocktails/Views', 'Cocktails/Types', 'Cocktails/Families', 'Cocktails/Categories']);
	const app = {
		vault: {
			getFiles: () => [...contents.keys()].map(path => new TFile(path)),
			getAllLoadedFiles: () => [...contents.keys()].map(path => new TFile(path)),
			getAbstractFileByPath: (path: string) => contents.has(path) ? new TFile(path) : folders.has(path) ? new TFolder() : null,
			read: (file: TFile) => Promise.resolve(contents.get(file.path)),
			createFolder: (path: string) => { folders.add(path); return Promise.resolve(); },
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
	return { app, contents, folders, store: new CabinetStore(app, () => 'Cocktails') };
}

void test('setup preserves a complete cabinet', async () => {
	const { contents, store } = fixture();
	const before = [...contents];
	assert.deepEqual(await store.setup('Cocktails'), { created: 0, updated: 0, kept: contents.size, customized: [] });
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

void test('setup adds missing Bases to an older cabinet and preserves the home and customized views', async () => {
	const { contents, store } = fixture();
	const customized = 'Cocktails/Views/Bottles.base';
	contents.set(customized, 'views: []\n# My custom view\n');
	const home = contents.get('Cocktails/Cocktail Cabinet.md');
	contents.delete('Cocktails/Views/Ingredient types.base');
	const preview = await store.previewSetup('Cocktails');
	assert.equal(preview.create.length, 1);
	assert.equal(preview.create[0]?.kind, 'base');
	assert.deepEqual(preview.conflicts, []);
	assert.equal((await store.setup('Cocktails')).created, 1);
	assert.equal(contents.get(customized), 'views: []\n# My custom view\n');
	assert.equal(contents.get('Cocktails/Cocktail Cabinet.md'), home);
	assert.equal((await store.setup('Cocktails')).created, 0);
});

void test('setup updates the managed navigation Base only while it matches an earlier generated version', async () => {
	const { contents, store } = fixture();
	const path = 'Cocktails/Views/Related.base';
	const current = contents.get(path)!;
	const earlier = 'filters:\n  and:\n    - \'file.inFolder("Cocktails")\'\n# an earlier generated version\n';
	const previous = PREVIOUS_NAVIGATION_VERSIONS as string[];
	previous.push(managedFingerprint(earlier, 'Cocktails'));
	try {
		assert.deepEqual((await store.previewSetup('Cocktails')).update, []);
		contents.set(path, earlier);
		const preview = await store.previewSetup('Cocktails');
		assert.deepEqual(preview.update.map(file => file.path), [path]);
		assert.deepEqual(preview.customized, []);
		assert.equal((await store.setup('Cocktails')).updated, 1);
		assert.equal(contents.get(path), current);
		contents.set(path, `${earlier}# my change\n`);
		const result = await store.setup('Cocktails');
		assert.equal(result.updated, 0);
		assert.deepEqual(result.customized, [path]);
		assert.equal(contents.get(path), `${earlier}# my change\n`);
	} finally { previous.pop(); }
});

void test('managed fingerprints ignore the cabinet folder and line endings', () => {
	assert.equal(managedFingerprint('a "Cocktails" b\n', 'Cocktails'), managedFingerprint('a "Drinks/Bar" b\r\n', 'Drinks/Bar'));
	assert.notEqual(managedFingerprint('a', 'Cocktails'), managedFingerprint('b', 'Cocktails'));
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
		['Cocktails/Ingredients/Other.md', { 'cc-kind': 'ingredient', 'cc-name': 'Other', 'cc-provides': [`[[${first}]]`, `[[${second}]]`] }],
	]);
	const app = {
		vault: { getMarkdownFiles: () => [...frontmatters.keys()].map(path => new TFile(path)) },
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
			getFirstLinkpathDest: (path: string) => frontmatters.has(path) ? new TFile(path) : null,
		},
	} as unknown as App;
	const store = new CabinetStore(app, () => 'Cocktails');
	const read = () => store.notes().find(note => note.path === bottle)!;
	assert.deepEqual(read().parents, [first]);
	assert.deepEqual(store.notes().find(note => note.kind === 'ingredient')?.parents, [first, second]);
	assert.ok(relatedTargets(store.notes(), read()).has(alternatives));
	assert.ok(!relatedTargets(store.notes(), read()).has(second));
	for (const value of [undefined, null, [], [`[[${first}]]`], [`[[${first}]]`, `[[${second}]]`], `[[${bottle}]]`, '[[Missing]]']) {
		frontmatters.set(bottle, { 'cc-kind': 'bottle', 'cc-name': 'Example', 'cc-type': value });
		assert.deepEqual(read().parents, []);
		assert.ok(!relatedTargets(store.notes(), read()).has(alternatives));
	}
	frontmatters.set(bottle, { 'cc-kind': 'bottle', 'cc-name': 'Example', 'cc-types': [`[[${first}]]`, `[[${second}]]`] });
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
		vault: { getMarkdownFiles: () => [...frontmatters.keys()].map(path => new TFile(path)) },
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
			getFirstLinkpathDest: (path: string) => frontmatters.has(path) ? new TFile(path) : null,
		},
	} as unknown as App;
	const store = new CabinetStore(app, () => 'Cocktails');
	const parents = (path: string) => store.notes().find(note => note.path === path)!.parents;
	assert.deepEqual(parents(type), [family]);
	assert.deepEqual(parents(family), [category]);
	frontmatters.set(type, { 'cc-kind': 'type', 'cc-name': 'Light Rum', 'cc-family': [`[[${family}]]`] });
	frontmatters.set(family, { 'cc-kind': 'family', 'cc-name': 'Rum', 'cc-category': [`[[${category}]]`] });
	assert.deepEqual(parents(type), []);
	assert.deepEqual(parents(family), []);
});

const enhancementDraft = {
	kind: 'recipe' as const, name: 'A clipped recipe',
	ingredients: ['2 oz [[Cocktails/Families/Gin|Gin (Cold River)]]'],
	method: 'Stir with ice.', description: 'Personal annotation.', properties: { source: 'https://example.test/recipe' },
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
	const path = 'Cocktails/My recipes/Original.md', original = '2 oz Gin\n\nStir with ice.';
	contents.set(path, original);
	assert.equal(store.recipeDestination(path), path);
	assert.equal((await store.enhanceRecipe({ path, content: original }, enhancementDraft)).path, path);
	assert.ok(contents.get(path)?.includes('cc-kind'));
});

void test('a stale review, renamed original, conflicting destination, or different resource kind cannot overwrite notes', async () => {
	const { store, contents } = fixture();
	const path = 'Clippings/Original.md', original = '2 oz Gin';
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
	const path = 'Clippings/Original.md', original = '2 oz Gin';
	contents.set(path, original);
	app.fileManager.renameFile = () => Promise.reject(new Error('Move failed'));
	await assert.rejects(store.enhanceRecipe({ path, content: original }, enhancementDraft), /original note content was restored/);
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
	contents.set(original, `\uFEFF---\n${JSON.stringify({ 'cc-kind': 'bottle', 'cc-name': 'Cache race', 'cc-open-ml': 25 })}\n---\n`);
	app.vault.getMarkdownFiles = () => [...contents.keys()].filter(path => path.endsWith('.md')).map(path => new TFile(path)) as unknown as ReturnType<typeof app.vault.getMarkdownFiles>;
	Object.assign(app, { metadataCache: { getFileCache: () => undefined, getFirstLinkpathDest: () => null } });
	assert.deepEqual(store.notes(), []);
	assert.equal((await store.readNotes()).find(note => note.path === original)?.name, 'Cache race');
});
