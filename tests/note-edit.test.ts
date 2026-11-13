import assert from 'node:assert/strict';
import test from 'node:test';
import {
	abvText,
	editedFields,
	formOptions,
	planFieldEdit,
	ratingOptions,
	ratingText,
	sameFields,
} from '../src/core/note-edit';
import { readRecipeSections, replaceRecipeSections } from '../src/core/recipe-sections';
import { PROP } from '../src/core/schema';
import { EditStore } from '../src/vault/edit-store';
import type { EditChanges } from '../src/vault/edit-store';
import { TFile } from './obsidian-stub';
import type { App } from 'obsidian';

const recipe = [
	'---',
	'cc-kind: "recipe"',
	'rating: 4',
	'---',
	'# Last Word',
	'',
	'### Ingredients',
	'',
	'- ¾ oz [[Cocktails/Types/Gin|gin]]',
	'- ¾ oz Lime Juice',
	'',
	'### Method',
	'',
	'Shake.',
	'',
	'### Tasting Notes',
	'',
	'Sharp.',
	'',
	'#shaken',
	'',
	'### AI Tasting Notes',
	'',
	'Keep me.',
	'',
	'![[Cocktails/Views/Related.base#Recipes]]',
	'',
].join('\n');

void test('recipe sections are read as written, with list markers removed', () => {
	assert.deepEqual(readRecipeSections(recipe), {
		ingredients: ['¾ oz [[Cocktails/Types/Gin|gin]]', '¾ oz Lime Juice'],
		ingredientsEditable: true,
		method: 'Shake.',
		description: '',
		tastingNotes: 'Sharp.\n\n#shaken',
	});
	const nested = readRecipeSections('### Ingredients\n\n- Syrup\n\t- 1 part sugar\n\n### Method\n\nStir.\n');
	assert.equal(nested.ingredientsEditable, false);
	assert.deepEqual(readRecipeSections('### Ingredients\n\n- 2 oz Rye\n#### Garnish\n- Twist\n').ingredients, [
		'2 oz Rye',
		'Twist',
	]);
	assert.equal(readRecipeSections('```\n### Method\n```\n').method, '');
});

void test('changing a section leaves the rest of the note as it was', () => {
	const changed = replaceRecipeSections(recipe, { method: 'Shake hard.\n\nDouble strain.' });
	assert.equal(changed, recipe.replace('Shake.', 'Shake hard.\n\nDouble strain.'));
	const cleared = replaceRecipeSections(recipe, { tastingNotes: '' });
	assert.ok(cleared.includes('### Tasting Notes\n\n### AI Tasting Notes\n\nKeep me.'));
	assert.equal(replaceRecipeSections(recipe, {}), recipe);
	assert.equal(replaceRecipeSections('### Method\nOld', { method: 'New' }), '### Method\n\nNew\n');
});

void test('a missing section is added after the one before it, at the same heading level', () => {
	const added = replaceRecipeSections(recipe, { description: 'A classic.' });
	assert.ok(added.includes('Shake.\n\n### Description\n\nA classic.\n\n### Tasting Notes'), added);
	assert.equal(replaceRecipeSections(recipe, { description: '' }), recipe);
	assert.equal(
		replaceRecipeSections('---\na: 1\n---\n# X\n', { method: 'Stir.' }),
		'---\na: 1\n---\n# X\n\n### Method\n\nStir.\n',
	);
	assert.equal(
		replaceRecipeSections('## Method\n\nStir.\n', { ingredients: '- Rye' }),
		'## Ingredients\n\n- Rye\n\n## Method\n\nStir.\n',
	);
});

void test('only changed fields are planned, and untouched values keep their exact form', () => {
	const bottle = {
		[PROP.type]: '[[Cocktails/Types/Gin|Gin]]',
		[PROP.volume]: 750,
		[PROP.abv]: 0.457,
		[PROP.open]: 600,
	};
	assert.equal(abvText(0.457), '45.7');
	assert.deepEqual(
		planFieldEdit('bottle', bottle, { parents: ['[[Cocktails/Types/Gin|Gin]]'], volume: '750', abv: '45.7' }),
		{},
	);
	assert.deepEqual(planFieldEdit('bottle', bottle, { abv: '47' }), { [PROP.abv]: 0.47 });
	assert.deepEqual(planFieldEdit('bottle', bottle, { parents: [], volume: '' }), {
		[PROP.type]: null,
		[PROP.volume]: null,
	});
	assert.deepEqual(planFieldEdit('bottle', { [PROP.volume]: 750 }, { parents: [] }), {});
	assert.throws(() => planFieldEdit('bottle', bottle, { volume: '500' }), /Edit stock first/);
	assert.throws(() => planFieldEdit('bottle', bottle, { volume: '0' }), /greater than zero/);
	assert.throws(() => planFieldEdit('bottle', bottle, { abv: '140' }), /between 0 and 100/);
});

void test('other stock, types, and families edit their own fields', () => {
	const stock = { [PROP.provides]: ['[[A|A]]'], [PROP.form]: 'Fresh ingredient' };
	assert.deepEqual(
		planFieldEdit('ingredient', stock, { parents: ['[[A|A]]', '[[B|B]]'], form: 'Fresh ingredient' }),
		{ [PROP.provides]: ['[[A|A]]', '[[B|B]]'] },
	);
	assert.throws(() => planFieldEdit('ingredient', stock, { form: 'Pickled' }), /form/);
	assert.deepEqual(planFieldEdit('ingredient', { [PROP.form]: 'Pickled' }, { form: 'Pickled' }), {});
	assert.ok('Pickled' in formOptions('Pickled'));
	assert.deepEqual(planFieldEdit('type', {}, { shoppingList: false }), {});
	assert.deepEqual(planFieldEdit('type', {}, { catchAll: false }), {});
	assert.deepEqual(planFieldEdit('type', { [PROP.catchAll]: false }, { catchAll: true }), { [PROP.catchAll]: true });
	assert.deepEqual(planFieldEdit('type', {}, { shoppingList: true, parents: ['[[F|F]]'] }), {
		[PROP.shoppingList]: true,
		[PROP.family]: '[[F|F]]',
	});
	assert.deepEqual(planFieldEdit('family', { [PROP.category]: '[[C|C]]' }, { parents: [] }), {
		[PROP.category]: null,
	});
	assert.throws(() => planFieldEdit('family', {}, { parents: ['[[C|C]]', '[[D|D]]'] }), /one parent/);
});

void test('recipe source and rating, keeping an unreadable rating unless one is chosen', () => {
	assert.deepEqual(planFieldEdit('recipe', { source: 'Book', rating: 4 }, { source: ' Book ', rating: '4' }), {});
	assert.deepEqual(planFieldEdit('recipe', { source: 'Book', rating: 4 }, { source: '', rating: '' }), {
		source: null,
		rating: null,
	});
	assert.deepEqual(planFieldEdit('recipe', {}, { rating: '5' }), { rating: 5 });
	assert.equal(ratingText('great'), 'keep');
	assert.equal(ratingText('⭐️⭐️⭐️'), '3');
	assert.deepEqual(planFieldEdit('recipe', { rating: 'great' }, { rating: 'keep' }), {});
	assert.deepEqual(planFieldEdit('recipe', { rating: '⭐️⭐️⭐️' }, { rating: '3' }), {});
	assert.deepEqual(planFieldEdit('recipe', { rating: '⭐️⭐️⭐️' }, { rating: '2' }), { rating: 2 });
});

void test('stale checks look only at the edited fields', () => {
	assert.ok(sameFields('type', { [PROP.family]: '[[F]]', other: 1 }, { [PROP.family]: '[[F]]', other: 2 }));
	assert.ok(!sameFields('bottle', { [PROP.open]: 600 }, { [PROP.open]: 300 }));
	assert.deepEqual(editedFields('family', {}), { [PROP.category]: null, [PROP.abvTypical]: null });
});

function fixture(content: string) {
	const note = { path: 'Cocktails/Recipes/Last Word.md', name: 'Last Word', kind: 'recipe' as const, parents: [] };
	const state = { content, frontmatter: { [PROP.kind]: 'recipe', rating: 4 } as Record<string, unknown> };
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === note.path ? new TFile(path) : null),
			read: () => Promise.resolve(state.content),
			process: (_file: TFile, transform: (current: string) => string) => {
				state.content = transform(state.content);
				return Promise.resolve(state.content);
			},
		},
		fileManager: {
			processFrontMatter: (_file: TFile, transform: (properties: Record<string, unknown>) => void) => {
				transform(state.frontmatter);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	return { note, state, store: new EditStore(app) };
}

void test('saving writes sections and properties, and refuses a note changed since opening', async () => {
	const { note, state, store } = fixture(recipe);
	const snapshot = await store.read(note);
	const changes: EditChanges = { properties: { rating: 5 }, sections: { method: 'Shake hard.' } };
	await store.save(note, snapshot, changes);
	assert.ok(state.content.includes('Shake hard.'));
	assert.equal(state.frontmatter.rating, 5);

	const later = fixture(recipe);
	const opened = await later.store.read(later.note);
	later.state.content = recipe.replace('Sharp.', 'Bright.');
	await assert.rejects(later.store.save(later.note, opened, changes), /changed after the form opened/);
	assert.equal(later.state.frontmatter.rating, 4);

	const properties = fixture(recipe);
	const before = await properties.store.read(properties.note);
	properties.state.frontmatter.rating = 2;
	await assert.rejects(
		properties.store.save(properties.note, before, { properties: { rating: 5 }, sections: {} }),
		/changed after/,
	);
	assert.equal(properties.state.frontmatter.rating, 2);
});

void test('removing a section takes its heading and keeps the sections around it', () => {
	const removed = replaceRecipeSections(recipe, { tastingNotes: null });
	assert.ok(removed.includes('Shake.\n\n### AI Tasting Notes\n\nKeep me.'), removed);
	assert.equal(
		replaceRecipeSections('### Method\n\nStir.\n\n### Tasting Notes\n', { tastingNotes: null }),
		'### Method\n\nStir.\n',
	);
	assert.equal(replaceRecipeSections('### Method\n\nStir.\n', { tastingNotes: null }), '### Method\n\nStir.\n');
});
void test('recipe tags are saved as a list, left alone when only their order differs, and removed when cleared', () => {
	assert.deepEqual(planFieldEdit('recipe', { tags: ['tiki', 'shaken'] }, { tags: ['shaken', 'tiki'] }), {});
	assert.deepEqual(planFieldEdit('recipe', {}, { tags: ['shaken'] }), { tags: ['shaken'] });
	assert.deepEqual(planFieldEdit('recipe', { tags: 'shaken tiki' }, { tags: ['shaken', 'tiki'] }), {
		tags: ['shaken', 'tiki'],
	});
	assert.deepEqual(planFieldEdit('recipe', { tags: ['shaken'] }, { tags: [] }), { tags: null });
	assert.deepEqual(planFieldEdit('recipe', {}, { tags: [] }), {});
});

void test('a type or family takes a typical ABV as a percent and stores a fraction', () => {
	assert.deepEqual(planFieldEdit('type', {}, { typicalAbv: '43' }), { [PROP.abvTypical]: 0.43 });
	assert.deepEqual(planFieldEdit('family', { [PROP.abvTypical]: 0.4 }, { typicalAbv: '40' }), {});
	assert.deepEqual(planFieldEdit('type', { [PROP.abvTypical]: 0 }, { typicalAbv: '' }), { [PROP.abvTypical]: null });
	assert.deepEqual(planFieldEdit('type', {}, { typicalAbv: '0' }), { [PROP.abvTypical]: 0 });
	assert.throws(() => planFieldEdit('type', {}, { typicalAbv: '140' }));
	assert.deepEqual(planFieldEdit('bottle', {}, { typicalAbv: '40' }), {});
});

void test('rating options list Unrated first, then one to five stars, after any unreadable saved value', () => {
	assert.deepEqual(
		ratingOptions(4).map(([value]) => value),
		['', '1', '2', '3', '4', '5'],
	);
	assert.deepEqual(ratingOptions('great')[0], ['keep', 'Keep as written: great']);
});
