import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { CabinetStore } from '../src/vault/cabinet-store';
import { starterPlan } from '../src/core/setup';
import { TFile } from './obsidian-stub';

function fixture() {
	const contents = new Map(starterPlan('Cocktails').map(note => {
		const frontmatter = note.content.split('---\n')[1] || '';
		const properties: Record<string, unknown> = Object.fromEntries(frontmatter.trim().split('\n').map(line => {
			const colon = line.indexOf(':');
			return [line.slice(0, colon), JSON.parse(line.slice(colon + 1)) as unknown];
		}));
		return [note.path, `---\n${JSON.stringify(properties)}\n---\nPersonal content to preserve.\n`];
	}));
	const app = {
		vault: {
			getFiles: () => [...contents.keys()].map(path => new TFile(path)),
			getAbstractFileByPath: (path: string) => contents.has(path) ? new TFile(path) : null,
			read: (file: TFile) => Promise.resolve(contents.get(file.path)),
			create: () => { throw new Error('Existing notes must not be overwritten.'); },
		},
	} as unknown as App;
	return { contents, store: new CabinetStore(app, () => 'Cocktails') };
}

void test('setup preserves a complete cabinet', async () => {
	const { contents, store } = fixture();
	const before = [...contents];
	assert.deepEqual(await store.setup('Cocktails'), { created: 0, kept: contents.size });
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
