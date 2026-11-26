import assert from 'node:assert/strict';
import test from 'node:test';
import { bottleProperties, unlinkedReport } from '../src/core/agent-cli';
import { PROP } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';

const recipe = (name: string): CabinetNote => ({
	name,
	path: `Cocktails/Recipes/${name}.md`,
	kind: 'recipe',
	parents: [],
});
const notes: CabinetNote[] = [
	{ name: 'Lime Juice', path: 'Cocktails/Types/Lime Juice.md', kind: 'type', parents: [] },
	{ name: 'London Dry Gin', path: 'Cocktails/Types/London Dry Gin.md', kind: 'type', parents: [] },
	{ name: 'Gin', path: 'Cocktails/Families/Gin.md', kind: 'family', parents: [] },
];

void test('the unlinked report gives each line as link-line takes it, grouped by wording, with suggestions', () => {
	const recipes = [
		{
			note: recipe('A'),
			content:
				'---\ncc-kind: recipe\n---\n# A\n\n### Ingredients\n\n- 2 oz gin\n- ¾ oz [[Cocktails/Types/Lime Juice|Lime Juice]]\n- 1 oz mystery syrup\n- Garnish: lime wheel',
		},
		{ note: recipe('B'), content: '### Ingredients\n- ¾ oz lime juice\n- 1½ oz Gin' },
	];
	const report = unlinkedReport(recipes, notes);
	assert.equal(report.lines, 4);
	assert.deepEqual(
		report.groups.map((group) => [group.wording, group.lines.map((line) => [line.path, line.line, line.text])]),
		[
			[
				'gin',
				[
					['Cocktails/Recipes/A.md', 1, '2 oz gin'],
					['Cocktails/Recipes/B.md', 2, '1½ oz Gin'],
				],
			],
			['lime juice', [['Cocktails/Recipes/B.md', 1, '¾ oz lime juice']]],
			['mystery syrup', [['Cocktails/Recipes/A.md', 3, '1 oz mystery syrup']]],
		],
	);
	assert.deepEqual(
		report.groups[0]!.suggestions.map((note) => note.path),
		['Cocktails/Families/Gin.md', 'Cocktails/Types/London Dry Gin.md'],
	);
	assert.deepEqual(report.groups[2]!.suggestions, []);
	// Garnishes only on request; one recipe only; at most `limit` groups, with the total still counted.
	assert.equal(unlinkedReport(recipes, notes, { includeGarnishes: true }).lines, 4);
	assert.deepEqual(
		unlinkedReport(recipes, notes, { recipe: 'Cocktails/Recipes/B.md' }).groups.map((group) => group.wording),
		['Gin', 'lime juice'],
	);
	const limited = unlinkedReport(recipes, notes, { limit: 1 });
	assert.equal(limited.groups.length, 1);
	assert.equal(limited.lines, 4);
});

void test('bottle properties: volume tracking with nothing open unless given, ABV as a percent, aliases', () => {
	const properties = bottleProperties({ abv: '40', volume: '750', aliases: 'Myers’s Rum, Myers Dark' });
	assert.equal(properties[PROP.stockTracking], 'volume');
	assert.equal(properties[PROP.abv], 0.4);
	assert.equal(properties[PROP.volume], 750);
	assert.equal(properties[PROP.open], 0);
	assert.equal(properties[PROP.unopened], 0);
	assert.deepEqual(properties.aliases, ['Myers’s Rum', 'Myers Dark']);
	const stocked = bottleProperties({ volume: '280', unopened: '1' });
	assert.equal(stocked[PROP.unopened], 1);
	assert.equal(stocked[PROP.abv], null);
	assert.equal('aliases' in stocked, false);
	assert.throws(() => bottleProperties({ abv: '140' }), /Alcohol by volume/);
	assert.throws(() => bottleProperties({ unopened: '1.5' }), /Unopened/);
});
