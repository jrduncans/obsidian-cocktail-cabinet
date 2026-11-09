import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLoggingLines } from '../src/core/logging-lines';
import { splitIngredient } from '../src/core/recipe-amount';
import { groupUnlinked, ingredientKey, ingredientLines, ingredientParts, linkAt, linkedLine, linkedLinePreview, linkLines, linkSpans, linkTextError, replacedPreview, replaceLink, StaleLineError, unlinkedLines } from '../src/core/unlinked-lines';
import type { CabinetNote } from '../src/core/schema';

const GIN = 'Cocktails/Types/Gin.md';
const recipe = (name: string): CabinetNote => ({ name, path: `Cocktails/Recipes/${name}.md`, kind: 'recipe', parents: [] });

void test('review includes unmeasured lines only for exact normalized ingredient names or aliases', () => {
	const notes: CabinetNote[] = [
		{ name: 'Saline Solution', aliases: ['saline'], path: 'Cocktails/Ingredients/Saline.md', kind: 'ingredient', parents: [] },
		{ name: 'Mint', aliases: ['mint leaves'], path: 'Cocktails/Types/Mint.md', kind: 'type', parents: [] },
		{ name: 'Dry Curaçao', path: 'Cocktails/Bottles/Curacao.md', kind: 'bottle', parents: [] },
		{ name: 'Rum', path: 'Cocktails/Families/Rum.md', kind: 'family', parents: [] },
		{ name: 'Spirit', path: 'Cocktails/Categories/Spirit.md', kind: 'category', parents: [] },
		recipe('Ice'),
	];
	const groups = groupUnlinked([{ note: recipe('A'), content: '### Ingredients\n- 2 drops SALINE\n- mint   leaves\n- 1 sprig mint\n- dry curacao\n- Rum\n- Spirit\n- Ice\n- fresh mint\n- Curacao\n- mystery ingredient\n- 2 drops [[Saline]]\n- 1 oz unknown' }], notes);
	assert.deepEqual(groups.map(group => group.key), ['dry curacao', 'mint', 'mint leaves', 'rum', 'saline', 'spirit', 'unknown']);
});

void test('unmeasured wording excludes leading amounts while linking preserves them', () => {
	for (const [line, amount, wording, linked] of [
		['2 drops saline', '2 drops', 'saline', '- 2 drops [[Cocktails/Types/Gin|saline]]'],
		['1 sprig mint', '1 sprig', 'mint', '- 1 sprig [[Cocktails/Types/Gin|mint]]'],
		['pinch of salt', 'pinch of', 'salt', '- pinch of [[Cocktails/Types/Gin|salt]]'],
	] as const) {
		assert.deepEqual(splitIngredient(line), { amount, text: wording });
		assert.deepEqual(ingredientParts(line), { amount, lead: '', wording });
		assert.equal(linkedLine(`- ${line}`, GIN), linked);
	}
	const notes: CabinetNote[] = [{ name: 'Salt', path: 'Cocktails/Ingredients/Salt.md', kind: 'ingredient', parents: [] }];
	assert.equal(groupUnlinked([{ note: recipe('A'), content: '### Ingredients\n- pinch of salt' }], notes)[0]?.key, 'salt');
});

void test('review hides marked garnishes by default and can show matching garnishes', () => {
	const notes: CabinetNote[] = [{ name: 'Mint', aliases: ['Mint sprig'], path: 'Cocktails/Types/Mint.md', kind: 'type', parents: [] }];
	const recipes = [{ note: recipe('A'), content: '### Ingredients\n- 1 sprig mint\n- Garnish: 1 sprig mint\n- Mint sprig, to garnish\n- GARNISH: mint\n- mint (to garnish)\n- Garnish: unknown\n- 2 oz unknown' }];
	assert.deepEqual(groupUnlinked(recipes, notes).flatMap(group => group.uses.map(use => use.text)).sort(), ['1 sprig mint', '2 oz unknown']);
	assert.deepEqual(groupUnlinked(recipes, notes, { includeGarnishes: true }).flatMap(group => group.uses.map(use => use.text)).sort(), [
		'1 sprig mint', '2 oz unknown', 'GARNISH: mint', 'Garnish: 1 sprig mint', 'Mint sprig, to garnish', 'mint (to garnish)',
	]);
});

void test('linking unmeasured lines leaves them unsubtracted when logging', () => {
	const ingredients = ([
		['Saline Solution', '- 2 drops saline'], ['Mint', '- 1 sprig mint'], ['Salt', '- pinch of salt'],
	] as const).map(([name, raw]) => {
		const note: CabinetNote = { name, path: `Cocktails/Ingredients/${name}.md`, kind: 'ingredient', parents: [] };
		return { note, raw };
	});
	const content = '### Ingredients\n' + ingredients.map(({ note, raw }) => linkedLine(raw, note.path)).join('\n');
	const { counted, skipped } = classifyLoggingLines(content, ingredients.map(item => item.note), [], link => `${link.split('|')[0]}.md`);
	assert.deepEqual(counted, []);
	assert.deepEqual(skipped.map(line => line.reason), ['No mL or oz amount', 'No mL or oz amount', 'No mL or oz amount']);
});

void test('linking a prefixed garnish keeps its label and amount outside the link', () => {
	assert.deepEqual(ingredientParts('Garnish: 1 sprig mint'), { prefix: 'Garnish:', amount: '1 sprig', lead: '', wording: 'mint' });
	assert.equal(linkedLine('- Garnish: 1 sprig mint', GIN), '- Garnish: 1 sprig [[Cocktails/Types/Gin|mint]]');
	assert.equal(linkedLine('- Garnish: 1 sprig mint', GIN, 'Mint'), '- Garnish: 1 sprig [[Cocktails/Types/Gin|Mint]]');
	assert.deepEqual(linkedLinePreview('Garnish: 1 sprig mint', 'Mint'), { before: 'Garnish: 1 sprig', link: 'Mint', after: '' });
});

void test('the recipe link store reviews unmeasured matches and forwards the garnish choice', async () => {
	const { RecipeLinkStore } = await import('../src/vault/recipe-links');
	const { TFile } = await import('./obsidian-stub');
	const notes: CabinetNote[] = [recipe('A'), { name: 'Mint', path: 'Cocktails/Types/Mint.md', kind: 'type', parents: [] }];
	const app = { vault: {
		getAbstractFileByPath: (path: string) => new TFile(path),
		cachedRead: () => Promise.resolve('### Ingredients\n- 1 sprig mint\n- Garnish: mint'),
	} };
	const store = new RecipeLinkStore(app as never, { notes: () => notes } as never);
	assert.deepEqual((await store.unlinked()).map(group => group.key), ['mint']);
	const withGarnishes = await store.unlinked({ includeGarnishes: true });
	assert.deepEqual(withGarnishes.map(group => group.key), ['mint']);
	assert.deepEqual(withGarnishes[0]!.uses.map(use => use.text), ['1 sprig mint', 'Garnish: mint']);
});

void test('ingredient lines carry their line number in the note and stop at the next heading', () => {
	const content = '---\ncc-kind: recipe\n---\n# Drink\n\n### Ingredients\n- 2 oz gin\r\n\n1. ½ oz [[Lime]]\n### Method\n- 1 oz rum';
	assert.deepEqual(ingredientLines(content), [
		{ line: 6, raw: '- 2 oz gin', text: '2 oz gin' },
		{ line: 8, raw: '1. ½ oz [[Lime]]', text: '½ oz [[Lime]]' },
	]);
});

void test('only measured lines without links count as unlinked', () => {
	const lines = unlinkedLines('### Ingredients\n- 2 oz gin\n- 1 oz [[Lime]]\n- Mint sprig, to garnish\n- 2 dashes bitters\n- 22.5 ml lemon');
	assert.deepEqual(lines.map(line => line.text), ['2 oz gin', '22.5 ml lemon']);
});

void test('the wording leaves out amounts and echoed volumes, and keys ignore case and accents', () => {
	assert.deepEqual(ingredientParts('1½ oz (45 ml) pineapple juice'), { amount: '1½ oz (45 ml)', lead: '', wording: 'pineapple juice' });
	assert.deepEqual(ingredientParts('1½ oz / 45 ml. gin'), { amount: '1½ oz', lead: '/ 45 ml.', wording: 'gin' });
	assert.equal(ingredientKey('Dry  Curaçao'), ingredientKey('dry curacao'));
});

void test('linking keeps the marker, amount, and recipe wording', () => {
	assert.equal(linkedLine('- 1½ oz (45 ml) Gin', GIN), '- 1½ oz (45 ml) [[Cocktails/Types/Gin|Gin]]');
	assert.equal(linkedLine('2. 1½ oz / 45 ml. gin', GIN), '2. 1½ oz / 45 ml. [[Cocktails/Types/Gin|gin]]');
	assert.equal(linkedLine('- dry curaçao, preferably Pierre Ferrand', GIN), '- [[Cocktails/Types/Gin|dry curaçao, preferably Pierre Ferrand]]');
	// A broken link is replaced, keeping what the reader saw.
	assert.equal(linkedLine('- 1 oz [[Missing/Old Tom|old tom gin]]', GIN), '- 1 oz [[Cocktails/Types/Gin|old tom gin]]');
	assert.throws(() => linkedLine('- 1 oz gin | vodka', GIN), /vertical bar/);
});

void test('lines are linked only while they still read as reviewed', () => {
	const content = '### Ingredients\r\n- 2 oz gin\r\n- 1 oz gin\r\n### Method\r\nStir.';
	assert.equal(linkLines(content, [{ line: 1, raw: '- 2 oz gin' }, { line: 2, raw: '- 1 oz gin' }], GIN),
		'### Ingredients\r\n- 2 oz [[Cocktails/Types/Gin|gin]]\r\n- 1 oz [[Cocktails/Types/Gin|gin]]\r\n### Method\r\nStir.');
	assert.throws(() => linkLines(content, [{ line: 1, raw: '- 2 oz vodka' }], GIN), StaleLineError);
});

void test('unlinked wordings group across recipes, most recipes first, ', () => {
	const groups = groupUnlinked([
		{ note: recipe('B'), content: '### Ingredients\n- 2 oz Gin\n- 1 oz water\n- ½ oz Gin' },
		{ note: recipe('A'), content: '### Ingredients\n- 1 oz gin\n- ½ oz lemon' },
	]);
	assert.deepEqual(groups.map(group => [group.key, group.uses.map(use => use.recipe.name)]), [['gin', ['A', 'B', 'B']], ['lemon', ['A']], ['water', ['B']]]);
	assert.equal(groups[0]!.wording, 'Gin');
});

void test('logging offers to link unlinked measured lines and broken links', () => {
	const content = '### Ingredients\n- 2 oz gin\n- Mint sprig\n- 1 oz [[Missing]]';
	const { skipped } = classifyLoggingLines(content, [], [], () => null);
	assert.deepEqual(skipped.map(line => [line.reason, line.link]), [
		['Not linked', { line: 1, raw: '- 2 oz gin' }],
		['Not linked', undefined],
		['Link not found', { line: 3, raw: '- 1 oz [[Missing]]' }],
	]);
});

void test('linking many writes each recipe once and reports recipes that changed', async () => {
	const { RecipeLinkStore } = await import('../src/vault/recipe-links');
	const { TFile } = await import('./obsidian-stub');
	const contents = new Map([
		['Cocktails/Recipes/A.md', '### Ingredients\n- 2 oz gin\n- 1 oz gin'],
		['Cocktails/Recipes/B.md', '### Ingredients\n- 2 oz vodka'],
	]);
	let writes = 0;
	const app = { vault: {
		getAbstractFileByPath: (path: string) => contents.has(path) ? new TFile(path) : null,
		process: (file: { path: string }, transform: (content: string) => string) => {
			const next = transform(contents.get(file.path)!);
			writes++;
			contents.set(file.path, next);
			return Promise.resolve(next);
		},
	} };
	const store = new RecipeLinkStore(app as never, {} as never);
	const result = await store.linkMany([
		{ path: 'Cocktails/Recipes/A.md', line: 1, raw: '- 2 oz gin' },
		{ path: 'Cocktails/Recipes/A.md', line: 2, raw: '- 1 oz gin' },
		{ path: 'Cocktails/Recipes/B.md', line: 1, raw: '- 2 oz gin' },
	], GIN);
	assert.deepEqual(result, { linked: 1, failed: [{ path: 'Cocktails/Recipes/B.md', name: 'B', changed: true }] });
	assert.equal(writes, 1);
	assert.equal(contents.get('Cocktails/Recipes/A.md'), '### Ingredients\n- 2 oz [[Cocktails/Types/Gin|gin]]\n- 1 oz [[Cocktails/Types/Gin|gin]]');
	assert.equal(contents.get('Cocktails/Recipes/B.md'), '### Ingredients\n- 2 oz vodka');
});

void test('a line can be linked with the cabinet name or other text instead of its wording', () => {
	const COCONUT = 'Cocktails/Types/Cream of Coconut.md';
	assert.equal(linkedLine('- ¾ oz Coconut Cream', COCONUT, 'Cream of Coconut'), '- ¾ oz [[Cocktails/Types/Cream of Coconut|Cream of Coconut]]');
	assert.throws(() => linkedLine('- ¾ oz Coconut Cream', COCONUT, 'a | b'), /vertical bar/);
	assert.throws(() => linkedLine('- ¾ oz Coconut Cream', COCONUT, ' '), /Enter the link text/);
	// Wording with a bar can still be linked once other text is chosen.
	assert.equal(linkedLine('- 1 oz gin | vodka', GIN, 'Gin'), '- 1 oz [[Cocktails/Types/Gin|Gin]]');
	const content = '### Ingredients\n- 2 oz gin\n- 1 oz Gin';
	assert.equal(linkLines(content, [{ line: 1, raw: '- 2 oz gin', text: 'Gin' }, { line: 2, raw: '- 1 oz Gin' }], GIN),
		'### Ingredients\n- 2 oz [[Cocktails/Types/Gin|Gin]]\n- 1 oz [[Cocktails/Types/Gin|Gin]]');
	assert.equal(linkTextError('Gin'), '');
});

void test('previews show the line as a reader will see it', () => {
	assert.deepEqual(linkedLinePreview('1½ oz / 45 ml. coconut cream', 'Cream of Coconut'), { before: '1½ oz / 45 ml.', link: 'Cream of Coconut', after: '' });
	const line = '- 1 oz [[Cocktails/Types/Sweet Vermouth|Sweet Vermouth]] ([[Cocktails/Bottles/Cocchi Storico|Cocchi Storico]])';
	const [type, bottle] = linkSpans(line);
	assert.deepEqual(replacedPreview(line, bottle!.start, bottle!.end, 'Storico'), { before: '1 oz Sweet Vermouth (', link: 'Storico', after: ')' });
	assert.equal(type!.text, 'Sweet Vermouth');
});

void test('the link under the cursor is found and replaced, leaving the rest of the line', () => {
	const line = '- 6 dashes [[Orange Bitters]], preferably [[Cocktails/Bottles/Regans|Regans]] ![[image.png]]';
	assert.deepEqual(linkSpans(line).map(span => span.text), ['Orange Bitters', 'Regans']);
	assert.equal(linkAt(line, 5), undefined);
	const span = linkAt(line, line.indexOf('Orange'))!;
	assert.deepEqual(linkAt(line, span.end), span);
	assert.equal(replaceLink(line, span, 'Cocktails/Types/Orange Bitters.md', 'Orange Bitters'),
		'- 6 dashes [[Cocktails/Types/Orange Bitters|Orange Bitters]], preferably [[Cocktails/Bottles/Regans|Regans]] ![[image.png]]');
	assert.throws(() => replaceLink(line, span, GIN, '[x]'), /brackets/);
});

void test('a trailing garnish marker groups with the ingredient and stays outside the link', () => {
	assert.deepEqual(ingredientParts('nutmeg to garnish'), { amount: '', lead: '', wording: 'nutmeg', suffix: ' to garnish' });
	assert.equal(linkedLine('- nutmeg to garnish', GIN), '- [[Cocktails/Types/Gin|nutmeg]] to garnish');
	assert.equal(linkedLine('- Mint sprig, to garnish', GIN, 'Mint'), '- [[Cocktails/Types/Gin|Mint]], to garnish');
	assert.deepEqual(linkedLinePreview('nutmeg to garnish', 'Whole Nutmeg'), { before: '', link: 'Whole Nutmeg', after: ' to garnish' });
	const note = { path: 'Cocktails/Ingredients/Whole Nutmeg.md', name: 'Whole Nutmeg', kind: 'ingredient', parents: [], aliases: ['Nutmeg'] } as const;
	const recipe = { path: 'Cocktails/Recipes/A.md', name: 'A', kind: 'recipe', parents: [] } as const;
	const groups = groupUnlinked([{ note: recipe, content: '### Ingredients\n- nutmeg\n- nutmeg to garnish' }], [note], { includeGarnishes: true });
	assert.deepEqual(groups.map(group => [group.key, group.wording, group.uses.length]), [['nutmeg', 'nutmeg', 2]]);
});

void test('a measured line keeps its whole wording, even ending in a garnish phrase', () => {
	assert.equal(ingredientParts('15 ml syrup to garnish').wording, 'syrup to garnish');
});
