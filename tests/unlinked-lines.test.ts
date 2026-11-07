import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLoggingLines } from '../src/core/logging-lines';
import { groupUnlinked, ingredientKey, ingredientLines, ingredientParts, linkAt, linkedLine, linkedLinePreview, linkLines, linkSpans, linkTextError, replacedPreview, replaceLink, StaleLineError, unlinkedLines } from '../src/core/unlinked-lines';
import type { CabinetNote } from '../src/core/schema';

const GIN = 'Cocktails/Types/Gin.md';
const recipe = (name: string): CabinetNote => ({ name, path: `Cocktails/Recipes/${name}.md`, kind: 'recipe', parents: [] });

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
