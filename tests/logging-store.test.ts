import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { moment, TFile, TFolder } from './obsidian-stub';
import { CabinetStore } from '../src/vault/cabinet-store';
import { LoggingStore, LoggingWriteError } from '../src/vault/logging-store';
import { planLogging } from '../src/core/logging-plan';
import { PROP } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';

function fixture() {
	const recipe: CabinetNote = { path: 'Cocktails/Recipes/Test drink.md', name: 'Test drink', kind: 'recipe', parents: [] };
	const type: CabinetNote = { path: 'Cocktails/Types/Test type.md', name: 'Test type', kind: 'type', parents: [] };
	const a: CabinetNote = { path: 'Cocktails/Bottles/Test A.md', name: 'Test A', kind: 'bottle', parents: [type.path] };
	const b: CabinetNote = { path: 'Cocktails/Bottles/Test B.md', name: 'Test B', kind: 'bottle', parents: [type.path] };
	const notes = [recipe, type, a, b];
	const properties = new Map<string, Record<string, unknown>>([a, b].map(note => [note.path, {
		[PROP.kind]: 'bottle', [PROP.stockTracking]: 'volume', [PROP.volume]: 100,
		[PROP.open]: 80, [PROP.unopened]: 2, [PROP.shoppingList]: true, custom: { preserve: 'yes' },
	}]));
	const contents = new Map([[recipe.path, '### Ingredients\n- 20 ml [[Test A]]\n- 10 ml [[Test B]]\n### Method\nStir.']]);
	const dailyPath = `Journal/${moment().format('YYYY/MM/YYYY-MM-DD')}.md`;
	const events: string[] = [];
	const folders = new Set(['', 'Journal']);
	let failBottle = '', failDaily = false;
	const dailyInstance = {
		options: { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD', template: 'Templates/Daily' },
		getFormat: () => dailyInstance.options.format,
		getDailyNote: () => {
			events.push('daily-create');
			if (failDaily) return Promise.reject(new Error('Daily disk failure'));
			if (!contents.has(dailyPath)) contents.set(dailyPath, `# ${moment().format('YYYY/MM/YYYY-MM-DD')}\nTemplate content\n`);
			return Promise.resolve(new TFile(dailyPath));
		},
	};
	contents.set('Templates/Daily.md', '# {{title}}\nTemplate content\n');
	const app = {
		internalPlugins: { plugins: { 'daily-notes': { enabled: true, instance: dailyInstance } } },
		metadataCache: {
			getFirstLinkpathDest: (link: string) => {
				const path = notes.find(note => note.name === link || note.path.replace(/\.md$/, '') === link)?.path;
				return path ? new TFile(path) : null;
			},
		},
		vault: {
			getAbstractFileByPath: (path: string) => properties.has(path) || contents.has(path) ? new TFile(path) : folders.has(path) ? new TFolder(path) : null,
			getAllLoadedFiles: () => [...properties.keys(), ...contents.keys()].map(path => new TFile(path)),
			read: (file: TFile) => Promise.resolve(properties.has(file.path) ? `---\n${JSON.stringify(properties.get(file.path))}\n---\nStock body` : contents.get(file.path)!),
			process: (file: TFile, transform: (content: string) => string) => {
				events.push('daily-append');
				contents.set(file.path, transform(contents.get(file.path)!));
				return Promise.resolve(contents.get(file.path));
			},
		},
		fileManager: {
			getNewFileParent: () => new TFolder(''),
			processFrontMatter: (file: TFile, transform: (properties: Record<string, unknown>) => void) => {
				events.push(file.path);
				if (file.path === failBottle) return Promise.reject(new Error('Bottle disk failure'));
				transform(properties.get(file.path)!);
				return Promise.resolve();
			},
		},
	};
	const cabinet = new CabinetStore(app as unknown as App, () => 'Cocktails');
	cabinet.notes = () => notes;
	cabinet.readNotes = () => Promise.resolve(notes);
	const logger = new LoggingStore(app as unknown as App, cabinet);
	return { app, logger, properties, contents, events, dailyPath, recipe, a, b,
		failBottle: (path: string) => { failBottle = path; }, failDaily: () => { failDaily = true; } };
}
async function ready(f: ReturnType<typeof fixture>) {
	const review = await f.logger.review(f.recipe);
	const selections = new Map(review.lines.counted.map(line => [line.id, line.initialSelection!]));
	const plan = planLogging(review.lines, review.sources, selections, 1);
	assert.deepEqual(plan.errors, []);
	return { review, plan };
}

void test('apply writes only reviewed stock fields and appends daily text after every bottle succeeds', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const before = structuredClone(f.properties.get(f.a.path)!);
	assert.equal((await f.logger.apply(review, plan, true)).status, 'applied');
	assert.deepEqual(f.events, [f.a.path, f.b.path, 'daily-create', 'daily-append']);
	assert.deepEqual(f.properties.get(f.a.path), { ...before, [PROP.open]: 60 });
	assert.match(f.contents.get(f.dailyPath)!, /Made a \[\[Cocktails\/Recipes\/Test drink\|Test drink\]\]\./);
	assert.match(f.contents.get(f.dailyPath)!, /Template content/);
});
void test('a stale second bottle prevents every write and returns refreshed stock', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.properties.get(f.b.path)![PROP.open] = 40;
	const result = await f.logger.apply(review, plan, true);
	assert.equal(result.status, 'stale');
	assert.deepEqual(f.events, []);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 80);
	if (result.status === 'stale') assert.equal(result.review.sources.find(source => source.note.path === f.b.path)!.fields[PROP.open], 40);
});
void test('shortfall prevents all writes even if another selected source can cover its pour', async () => {
	const f = fixture();
	f.properties.get(f.b.path)![PROP.open] = 0;
	f.properties.get(f.b.path)![PROP.unopened] = 0;
	const review = await f.logger.review(f.recipe);
	const plan = planLogging(review.lines, review.sources, new Map(review.lines.counted.map((line, index) => [line.id, index ? f.b.path : f.a.path])), 1);
	await assert.rejects(f.logger.apply(review, plan, true), /Select what you used/);
	assert.deepEqual(f.events, []);
});
void test('a changed recipe requires another review without writing stock', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.contents.set(f.recipe.path, review.content.replace('20 ml', '30 ml'));
	assert.equal((await f.logger.apply(review, plan, true)).status, 'stale');
	assert.deepEqual(f.events, []);
});
void test('changed daily settings and a newly appearing duplicate both require a fresh preview', async () => {
	for (const settings of [false, true]) {
		const f = fixture();
		const { review, plan } = await ready(f);
		if (settings) f.app.internalPlugins.plugins['daily-notes'].instance.options.format = 'YYYY-MM-DD';
		else f.contents.set(f.dailyPath, 'Made a [[Test drink]].');
		assert.equal((await f.logger.apply(review, plan, true)).status, 'stale');
		assert.deepEqual(f.events, []);
	}
});
void test('duplicate preview recognizes bare links, and intentional second rounds are allowed', async () => {
	const f = fixture();
	f.contents.set(f.dailyPath, 'Made a [[Test drink]].\n');
	const { review, plan } = await ready(f);
	assert.equal(review.daily.duplicate, true);
	await f.logger.apply(review, plan, true);
	assert.equal((f.contents.get(f.dailyPath)!.match(/Made /g) ?? []).length, 2);
});
void test('leaving daily logging off updates stock without creating or changing daily notes', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	await f.logger.apply(review, plan, false);
	assert.deepEqual(f.events, [f.a.path, f.b.path]);
	assert.equal(f.contents.has(f.dailyPath), false);
});
void test('daily note failure reports successful inventory and never repeats it', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.failDaily();
	await assert.rejects(f.logger.apply(review, plan, true), error => error instanceof LoggingWriteError && /Your stock was updated.*Do not log this drink again/.test(error.message));
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
	assert.equal(f.contents.has(f.dailyPath), false);
	assert.equal(f.events.filter(event => event === f.a.path).length, 1);
	assert.equal((await f.logger.apply(review, plan, true)).status, 'stale');
	assert.equal(f.events.filter(event => event === f.a.path).length, 1);
});
void test('partial bottle failure stops subsequent writes and leaves daily notes untouched', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.failBottle(f.b.path);
	await assert.rejects(f.logger.apply(review, plan, true), error => error instanceof LoggingWriteError && /Already updated: Test A.*daily note was not changed/.test(error.message));
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
	assert.equal(f.properties.get(f.b.path)![PROP.open], 80);
	assert.deepEqual(f.events, [f.a.path, f.b.path]);
});
void test('disabled Daily notes and missing templates block daily logging but allow inventory-only apply', async () => {
	for (const disabled of [true, false]) {
		const f = fixture();
		if (disabled) f.app.internalPlugins.plugins['daily-notes'].enabled = false;
		else f.contents.delete('Templates/Daily.md');
		const { review, plan } = await ready(f);
		assert.ok(review.daily.error);
		await assert.rejects(f.logger.apply(review, plan, true));
		assert.deepEqual(f.events, []);
		await f.logger.apply(review, plan, false);
		assert.deepEqual(f.events, [f.a.path, f.b.path]);
	}
});
void test('a new duplicate racing the inventory writes is not appended again', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const original = f.app.fileManager.processFrontMatter;
	f.app.fileManager.processFrontMatter = (file, transform) => {
		f.contents.set(f.dailyPath, 'Made a [[Test drink]].\n');
		return original(file, transform);
	};
	await f.logger.apply(review, plan, true);
	assert.equal(f.contents.get(f.dailyPath), 'Made a [[Test drink]].\n');
});
void test('a stock change during processFrontMatter is checked before assigning stock fields', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const original = f.app.fileManager.processFrontMatter;
	f.app.fileManager.processFrontMatter = (file, transform) => {
		f.properties.get(file.path)![PROP.open] = 75;
		return original(file, transform);
	};
	await assert.rejects(f.logger.apply(review, plan, true), /recorded amount changed while saving/);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 75);
	assert.equal(f.contents.has(f.dailyPath), false);
});


void test('stock changed during Daily notes preflight is caught before any inventory write', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const original = f.logger.daily.preview.bind(f.logger.daily);
	f.logger.daily.preview = async recipe => {
		const preview = await original(recipe);
		f.properties.get(f.b.path)![PROP.open] = 40;
		return preview;
	};
	assert.equal((await f.logger.apply(review, plan, true)).status, 'stale');
	assert.deepEqual(f.events, []);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 80);
});


void test('logging treats blank unopened counts as zero and leaves the stored blank alone', async () => {
	for (const blank of [undefined, null, '', '  ']) {
		const f = fixture();
		if (blank === undefined) delete f.properties.get(f.a.path)![PROP.unopened];
		else f.properties.get(f.a.path)![PROP.unopened] = blank;
		const { review, plan } = await ready(f);
		assert.equal((await f.logger.apply(review, plan, false)).status, 'applied');
		assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
		assert.equal(f.properties.get(f.a.path)![PROP.unopened], blank);
	}
});

void test('changing an empty unopened count to explicit zero does not invalidate the review', async () => {
	const f = fixture();
	delete f.properties.get(f.a.path)![PROP.unopened];
	const { review, plan } = await ready(f);
	f.properties.get(f.a.path)![PROP.unopened] = 0;
	assert.equal((await f.logger.apply(review, plan, false)).status, 'applied');
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
});
