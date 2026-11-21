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
	const recipe: CabinetNote = {
		path: 'Cocktails/Recipes/Test drink.md',
		name: 'Test drink',
		kind: 'recipe',
		parents: [],
	};
	const type: CabinetNote = { path: 'Cocktails/Types/Test type.md', name: 'Test type', kind: 'type', parents: [] };
	const a: CabinetNote = {
		path: 'Cocktails/Bottles/Test A.md',
		name: 'Test A',
		kind: 'bottle',
		parents: [type.path],
	};
	const b: CabinetNote = {
		path: 'Cocktails/Bottles/Test B.md',
		name: 'Test B',
		kind: 'bottle',
		parents: [type.path],
	};
	const notes = [recipe, type, a, b];
	const properties = new Map<string, Record<string, unknown>>(
		[a, b].map((note) => [
			note.path,
			{
				[PROP.kind]: 'bottle',
				[PROP.stockTracking]: 'volume',
				[PROP.volume]: 100,
				[PROP.open]: 80,
				[PROP.unopened]: 2,
				[PROP.shoppingList]: true,
				custom: { preserve: 'yes' },
			},
		]),
	);
	const contents = new Map([
		[recipe.path, '### Ingredients\n- 20 ml [[Test A]]\n- 10 ml [[Test B]]\n### Method\nStir.'],
	]);
	const dailyPath = `Journal/${moment().format('YYYY/MM/YYYY-MM-DD')}.md`;
	const events: string[] = [];
	const folders = new Set(['', 'Journal']);
	let failBottle = '',
		failDaily = false;
	// Recipe properties live apart from its body, which `read` returns.
	const recipeProperties: Record<string, unknown> = { [PROP.timesMade]: 2, [PROP.lastMade]: '2000-01-01' };
	const dailyProperties: Record<string, unknown> = {};
	const dailyInstance = {
		options: { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD', template: 'Templates/Daily' },
		getFormat: () => dailyInstance.options.format,
		getDailyNote: () => {
			events.push('daily-create');
			if (failDaily) return Promise.reject(new Error('Daily disk failure'));
			if (!contents.has(dailyPath))
				contents.set(dailyPath, `# ${moment().format('YYYY/MM/YYYY-MM-DD')}\nTemplate content\n`);
			return Promise.resolve(new TFile(dailyPath));
		},
	};
	contents.set('Templates/Daily.md', '# {{title}}\nTemplate content\n');
	const app = {
		internalPlugins: { plugins: { 'daily-notes': { enabled: true, instance: dailyInstance } } },
		metadataCache: {
			getFirstLinkpathDest: (link: string) => {
				const path = notes.find((note) => note.name === link || note.path.replace(/\.md$/, '') === link)?.path;
				return path ? new TFile(path) : null;
			},
		},
		vault: {
			getAbstractFileByPath: (path: string) =>
				properties.has(path) || contents.has(path)
					? new TFile(path)
					: folders.has(path)
						? new TFolder(path)
						: null,
			getAllLoadedFiles: () => [...properties.keys(), ...contents.keys()].map((path) => new TFile(path)),
			read: (file: TFile) =>
				Promise.resolve(
					properties.has(file.path)
						? `---\n${JSON.stringify(properties.get(file.path))}\n---\nStock body`
						: contents.get(file.path)!,
				),
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
				transform(properties.get(file.path) ?? (file.path === dailyPath ? dailyProperties : recipeProperties));
				return Promise.resolve();
			},
		},
	};
	const cabinet = new CabinetStore(app as unknown as App, () => 'Cocktails');
	cabinet.notes = () => notes;
	cabinet.readNotes = () => Promise.resolve(notes);
	const logger = new LoggingStore(app as unknown as App, cabinet);
	return {
		app,
		logger,
		properties,
		recipeProperties,
		dailyProperties,
		contents,
		events,
		dailyPath,
		recipe,
		a,
		b,
		failBottle: (path: string) => {
			failBottle = path;
		},
		failDaily: () => {
			failDaily = true;
		},
	};
}
async function ready(f: ReturnType<typeof fixture>) {
	const review = await f.logger.review(f.recipe);
	const selections = new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!]));
	const plan = planLogging(review.lines, review.sources, selections, 1);
	assert.deepEqual(plan.errors, []);
	return { review, plan };
}

void test('apply writes only reviewed stock fields and appends daily text after every bottle succeeds', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const before = structuredClone(f.properties.get(f.a.path)!);
	assert.equal((await f.logger.apply(review, plan, true)).status, 'applied');
	assert.deepEqual(f.events, [f.a.path, f.b.path, f.recipe.path, 'daily-create', 'daily-append']);
	const today = moment().format('YYYY-MM-DD');
	assert.deepEqual(f.properties.get(f.a.path), { ...before, [PROP.open]: 60, [PROP.lastUsed]: today });
	assert.deepEqual(f.recipeProperties, { [PROP.timesMade]: 3, [PROP.lastMade]: today });
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
	if (result.status === 'stale')
		assert.equal(result.review.sources.find((source) => source.note.path === f.b.path)!.fields[PROP.open], 40);
});
void test('shortfall prevents all writes even if another selected source can cover its pour', async () => {
	const f = fixture();
	f.properties.get(f.b.path)![PROP.open] = 0;
	f.properties.get(f.b.path)![PROP.unopened] = 0;
	const review = await f.logger.review(f.recipe);
	const plan = planLogging(
		review.lines,
		review.sources,
		new Map(review.lines.counted.map((line, index) => [line.id, index ? f.b.path : f.a.path])),
		1,
	);
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
	assert.deepEqual(f.events, [f.a.path, f.b.path, f.recipe.path]);
	assert.equal(f.contents.has(f.dailyPath), false);
});
void test('daily note failure reports successful inventory and never repeats it', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.failDaily();
	await assert.rejects(
		f.logger.apply(review, plan, true),
		(error) =>
			error instanceof LoggingWriteError &&
			/Stock updated, but the daily note wasn’t.*don’t log again/.test(error.message),
	);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
	assert.equal(f.contents.has(f.dailyPath), false);
	assert.equal(f.events.filter((event) => event === f.a.path).length, 1);
	assert.equal((await f.logger.apply(review, plan, true)).status, 'stale');
	assert.equal(f.events.filter((event) => event === f.a.path).length, 1);
});
void test('partial bottle failure stops subsequent writes and leaves daily notes untouched', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	f.failBottle(f.b.path);
	await assert.rejects(
		f.logger.apply(review, plan, true),
		(error) =>
			error instanceof LoggingWriteError && /Already updated: Test A\. Daily note unchanged/.test(error.message),
	);
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
		assert.deepEqual(f.events, [f.a.path, f.b.path, f.recipe.path]);
	}
});
void test('recording last made is bookkeeping: a failure is reported without undoing the log', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const original = f.app.fileManager.processFrontMatter;
	f.app.fileManager.processFrontMatter = (file, transform) =>
		file.path === f.recipe.path ? Promise.reject(new Error('disk')) : original(file, transform);
	const result = await f.logger.apply(review, plan, true);
	assert.equal(result.status, 'applied');
	if (result.status === 'applied')
		assert.match(result.notice, /Cocktail logged\. Couldn’t record last used or times made on Test drink\./);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
	assert.match(f.contents.get(f.dailyPath)!, /Made a/);
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
	await assert.rejects(f.logger.apply(review, plan, true), /stock changed while saving/);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 75);
	assert.equal(f.contents.has(f.dailyPath), false);
});

void test('stock changed during Daily notes preflight is caught before any inventory write', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	const original = f.logger.daily.preview.bind(f.logger.daily);
	f.logger.daily.preview = async (recipe) => {
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
void test('a status-tracked source gets a last-used date though nothing is subtracted', async () => {
	const f = fixture();
	f.b.parents = []; // On its own, so its line isn't filled from Test A.
	Object.assign(f.properties.get(f.b.path)!, { [PROP.stockTracking]: 'status', [PROP.availability]: 'Have' });
	const { review, plan } = await ready(f);
	assert.deepEqual(
		plan.changes.map((change) => change.source.note.path),
		[f.a.path],
	);
	assert.deepEqual(plan.alsoUsed, [f.b.path]);
	await f.logger.apply(review, plan, false);
	assert.deepEqual(f.events, [f.a.path, f.b.path, f.recipe.path]);
	assert.equal(f.properties.get(f.b.path)![PROP.lastUsed], moment().format('YYYY-MM-DD'));
	assert.equal(f.properties.get(f.b.path)![PROP.availability], 'Have');
});
void test('logging on an earlier day records that day and never moves later dates backward', async () => {
	const f = fixture();
	f.properties.get(f.a.path)![PROP.lastUsed] = '2026-11-06';
	f.recipeProperties[PROP.lastMade] = '2026-11-05';
	const review = await f.logger.review(f.recipe, '2026-11-01');
	assert.equal(review.daily.date, '2026-11-01');
	const plan = planLogging(
		review.lines,
		review.sources,
		new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!])),
		1,
	);
	assert.equal((await f.logger.apply(review, plan, false)).status, 'applied');
	assert.equal(f.properties.get(f.a.path)![PROP.lastUsed], '2026-11-06');
	assert.equal(f.properties.get(f.b.path)![PROP.lastUsed], '2026-11-01');
	assert.equal(f.recipeProperties[PROP.lastMade], '2026-11-05');
	assert.equal(f.recipeProperties[PROP.timesMade], 3);
});
void test('a future or malformed log date is rejected before any write', async () => {
	const f = fixture();
	for (const day of ['2999-01-01', 'yesterday']) {
		const review = await f.logger.review(f.recipe, day);
		const plan = planLogging(
			review.lines,
			review.sources,
			new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!])),
			1,
		);
		await assert.rejects(f.logger.apply(review, plan, false), /today or an earlier date/);
	}
	assert.deepEqual(f.events, []);
});
void test('a one-off subtracts stock and writes its lines to the daily note, with no recipe to count', async () => {
	const f = fixture();
	const review = await f.logger.reviewOneOff({
		name: 'Scratch',
		lines: ['30 ml [[Test A]]', '15 ml lemon juice', 'Mint sprig'],
	});
	assert.equal(review.recipe, undefined);
	assert.ok(review.lines.skipped.every((line) => !line.link));
	const plan = planLogging(
		review.lines,
		review.sources,
		new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!])),
		1,
	);
	assert.deepEqual(plan.errors, []);
	assert.equal((await f.logger.apply(review, plan, true)).status, 'applied');
	assert.deepEqual(f.events, [f.a.path, 'daily-create', 'daily-append']);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 50);
	assert.deepEqual(f.recipeProperties, { [PROP.timesMade]: 2, [PROP.lastMade]: '2000-01-01' });
	assert.match(
		f.contents.get(f.dailyPath)!,
		/Made a one-off \(Scratch\):\n- 30 ml \[\[Test A\]\]\n- 15 ml lemon juice\n- Mint sprig\n$/,
	);
});
void test('the same one-off can be logged twice on one day', async () => {
	const f = fixture();
	for (let round = 0; round < 2; round++) {
		const review = await f.logger.reviewOneOff({ name: '', lines: ['10 ml [[Test B]]'] });
		assert.equal(review.daily.duplicate, false);
		const plan = planLogging(
			review.lines,
			review.sources,
			new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!])),
			1,
		);
		assert.equal((await f.logger.apply(review, plan, true)).status, 'applied');
	}
	assert.equal(f.contents.get(f.dailyPath)!.match(/Made a one-off:/g)!.length, 2);
});

/** Undo reads the recipe's properties from its file, as Obsidian stores them. */
function undoable(f: ReturnType<typeof fixture>) {
	const read = f.app.vault.read;
	f.app.vault.read = (file: TFile) =>
		file.path === f.recipe.path
			? Promise.resolve(`---\n${JSON.stringify(f.recipeProperties)}\n---\n${f.contents.get(file.path)}`)
			: read(file);
	return f;
}

void test('undo puts back the stock, dates, count, and daily entry a log changed', async () => {
	const f = undoable(fixture());
	f.contents.set(f.dailyPath, '# Day\nWent out.\n');
	const before = structuredClone(f.properties.get(f.a.path)!);
	const recipeBefore = structuredClone(f.recipeProperties);
	const { review, plan } = await ready(f);
	const result = await f.logger.apply(review, plan, true);
	assert.ok(result.status === 'applied' && result.undoable);
	const undo = await f.logger.undo.preview();
	assert.ok(undo);
	assert.deepEqual(undo.blocked, []);
	assert.equal(undo.restores.length, 3);
	assert.match(undo.restores[0]!.text, /^Test A: open 60 mL → 80 mL, last used \S+ → none$/);
	assert.equal((await f.logger.undo.undo(undo)).status, 'done');
	assert.deepEqual(f.properties.get(f.a.path), before);
	assert.deepEqual(f.recipeProperties, recipeBefore);
	assert.equal(f.contents.get(f.dailyPath), '# Day\nWent out.\n');
	assert.equal(f.logger.undo.last(), null);
});
void test('undo refuses when stock changed since the log, and a stale review is refreshed', async () => {
	const f = undoable(fixture());
	const { review, plan } = await ready(f);
	await f.logger.apply(review, plan, true);
	const undo = (await f.logger.undo.preview())!;
	f.properties.get(f.b.path)![PROP.open] = 50;
	const result = await f.logger.undo.undo(undo);
	assert.equal(result.status, 'stale');
	if (result.status === 'stale') assert.deepEqual(result.plan!.blocked, ['Test B: open changed since (now 50 mL).']);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 60);
	assert.match(f.contents.get(f.dailyPath)!, /Made a/);
});
void test('undo keeps dates and counts a later change moved, and removes only the last matching entry', async () => {
	const f = undoable(fixture());
	f.contents.set(f.dailyPath, 'Made a [[Test drink]].\n');
	const { review, plan } = await ready(f);
	await f.logger.apply(review, plan, true);
	f.recipeProperties[PROP.timesMade] = 7;
	const undo = (await f.logger.undo.preview())!;
	assert.deepEqual(undo.kept, ['Test drink: times made changed since; left as 7.']);
	await f.logger.undo.undo(undo);
	assert.equal(f.recipeProperties[PROP.timesMade], 7);
	assert.equal(f.recipeProperties[PROP.lastMade], '2000-01-01');
	assert.equal(f.contents.get(f.dailyPath), 'Made a [[Test drink]].\n');
});
void test('a log that failed partway undoes what it saved', async () => {
	const f = undoable(fixture());
	const { review, plan } = await ready(f);
	f.failBottle(f.b.path);
	await assert.rejects(f.logger.apply(review, plan, true), /Use Undo last log to put those back/);
	const undo = (await f.logger.undo.preview())!;
	assert.deepEqual(
		undo.restores.map((restore) => restore.name),
		['Test A'],
	);
	f.failBottle('');
	await f.logger.undo.undo(undo);
	assert.equal(f.properties.get(f.a.path)![PROP.open], 80);
	assert.equal(f.properties.get(f.a.path)![PROP.lastUsed], undefined);
	assert.equal(f.properties.get(f.b.path)![PROP.open], 80);
});
void test('a log that saved nothing is dropped, so undo reaches the one before', async () => {
	const f = undoable(fixture());
	let { review, plan } = await ready(f);
	await f.logger.apply(review, plan, false);
	const first = f.logger.undo.last()!.id;
	({ review, plan } = await ready(f));
	f.failBottle(f.a.path);
	await assert.rejects(f.logger.apply(review, plan, true), /Check those bottles/);
	assert.equal(f.logger.undo.last()!.id, first);
});
void test('only the latest logs are kept, and undoing them in turn walks back', async () => {
	const f = undoable(fixture());
	f.properties.get(f.a.path)![PROP.unopened] = 20;
	f.properties.get(f.b.path)![PROP.unopened] = 20;
	for (let index = 0; index < 12; index++) {
		const { review, plan } = await ready(f);
		await f.logger.apply(review, plan, false);
	}
	assert.equal(f.logger.journal.load().length, 10);
	for (let index = 0; index < 2; index++) await f.logger.undo.undo((await f.logger.undo.preview())!);
	assert.equal(f.recipeProperties[PROP.timesMade], 12);
	assert.equal(f.logger.journal.load().length, 8);
});

/** The daily note's properties read back from its file, as undo reads them. */
function dailyFrontmatter(f: ReturnType<typeof fixture>) {
	const read = f.app.vault.read;
	f.app.vault.read = (file: TFile) =>
		file.path === f.dailyPath && Object.keys(f.dailyProperties).length
			? Promise.resolve(`---\n${JSON.stringify(f.dailyProperties)}\n---\n${f.contents.get(file.path)}`)
			: read(file);
	return f;
}

void test('alcohol goes on the daily line and adds to the daily total, and undo takes it back', async () => {
	const f = dailyFrontmatter(undoable(fixture()));
	f.contents.set(f.dailyPath, '# Day\n');
	f.dailyProperties['cc-alcohol-ml'] = 10;
	const { review, plan } = await ready(f);
	const result = await f.logger.apply(review, plan, true, { ml: 24.04, text: '≈ 1.4 drinks' });
	assert.ok(result.status === 'applied' && result.undoable);
	assert.equal(result.notice, 'Cocktail logged.');
	assert.match(
		f.contents.get(f.dailyPath)!,
		/Made a \[\[Cocktails\/Recipes\/Test drink\|Test drink\]\] \(≈ 1\.4 drinks\)\.\n$/,
	);
	assert.equal(f.dailyProperties['cc-alcohol-ml'], 34);
	const undo = (await f.logger.undo.preview())!;
	assert.ok(undo.restores.some((restore) => /: alcohol 34 mL → 10 mL$/.test(restore.text)));
	assert.equal((await f.logger.undo.undo(undo)).status, 'done');
	assert.equal(f.dailyProperties['cc-alcohol-ml'], 10);
	assert.equal(f.contents.get(f.dailyPath), '# Day\n');
});
void test('a first drink starts the daily total, and undo removes it', async () => {
	const f = dailyFrontmatter(undoable(fixture()));
	f.contents.set(f.dailyPath, '# Day\n');
	const { review, plan } = await ready(f);
	await f.logger.apply(review, plan, true, { ml: 20, text: '≈ 1.1 drinks' });
	assert.deepEqual(f.dailyProperties, { 'cc-alcohol-ml': 20 });
	await f.logger.undo.undo((await f.logger.undo.preview())!);
	assert.deepEqual(f.dailyProperties, {});
});
void test('without the daily entry, no alcohol is recorded', async () => {
	const f = fixture();
	const { review, plan } = await ready(f);
	await f.logger.apply(review, plan, false, { ml: 20, text: '≈ 1.1 drinks' });
	assert.deepEqual(f.dailyProperties, {});
	assert.ok(!f.events.includes(f.dailyPath));
});
void test('a one-off header carries its drinks, and its alcohol adds to the daily total', async () => {
	const f = fixture();
	f.contents.set(f.dailyPath, '# Day\n');
	const review = await f.logger.reviewOneOff({ name: 'Rye thing', lines: ['20 ml [[Test A]]'] });
	const selections = new Map(review.lines.counted.map((line) => [line.id, line.initialSelection!]));
	const plan = planLogging(review.lines, review.sources, selections, 1);
	await f.logger.apply(review, plan, true, { ml: 8, text: '≈ 0.5 drinks' });
	assert.equal(
		f.contents.get(f.dailyPath),
		'# Day\nMade a one-off (Rye thing) (≈ 0.5 drinks):\n- 20 ml [[Test A]]\n',
	);
	assert.deepEqual(f.dailyProperties, { 'cc-alcohol-ml': 8 });
});
