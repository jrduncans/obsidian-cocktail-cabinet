import { renderNote } from '../core/notes';
import { fileName, notePath, PROP, wikiLink } from '../core/schema';
import type { NoteKind, PlannedFile, Properties } from '../core/schema';

/**
 * A worked example for new cabinets: stock and recipes that let a drink be logged on day one.
 * Unlike the catalog, these are the user's own notes, so setup adds them only with a new
 * cabinet home and never restores one the user deleted. Their catalog IDs identify them
 * (for example, so a migration can skip an example the vault already has an equivalent of).
 */
export interface StarterExample {
	id: string;
	kind: Extract<NoteKind, 'ingredient' | 'recipe'>;
	name: string;
	/** For stock: the type it exists to supply; other stock providing it is an equivalent. */
	provides?: string;
}

interface ExampleDefinition extends StarterExample {
	render(root: string, link: (type: string, wording?: string) => string, date: string): PlannedFile;
}

const id = (kind: StarterExample['kind'], name: string) => `${kind}/${fileName(name)}`;

function fruit(name: string, juice: string, peel: string): ExampleDefinition {
	return {
		id: id('ingredient', name),
		kind: 'ingredient',
		name,
		provides: juice,
		render: (root, link) =>
			renderNote(
				root,
				{
					kind: 'ingredient',
					name,
					description: `Fresh ${name.toLowerCase()} for juice and peel. Set availability when you buy them.`,
					properties: {
						[PROP.provides]: [link(juice), link(peel)],
						[PROP.form]: 'Fresh ingredient',
						[PROP.stockTracking]: 'status',
						[PROP.availability]: 'Unknown',
						[PROP.lastPurchasePrice]: null,
						[PROP.shoppingList]: false,
						[PROP.catalogId]: id('ingredient', name),
					},
				},
				'',
			),
	};
}

const HOUSE_SYRUP = 'House Simple Syrup (1:1)';

function recipe(
	name: string,
	ingredients: [amount: string, type: string, wording?: string][],
	method: string,
	description: string,
): ExampleDefinition {
	return {
		id: id('recipe', name),
		kind: 'recipe',
		name,
		render: (root, link, date) =>
			renderNote(
				root,
				{
					kind: 'recipe',
					name,
					description,
					method,
					ingredients: ingredients.map(([amount, type, wording]) => `${amount} ${link(type, wording)}`),
					properties: { [PROP.catalogId]: id('recipe', name) } satisfies Properties,
				},
				date,
			),
	};
}

const EXAMPLES: readonly ExampleDefinition[] = [
	fruit('Limes', 'Lime Juice', 'Lime Peel'),
	fruit('Lemons', 'Lemon Juice', 'Lemon Peel'),
	{
		id: id('ingredient', HOUSE_SYRUP),
		kind: 'ingredient',
		name: HOUSE_SYRUP,
		provides: 'Simple Syrup (1:1)',
		render: (root, link) =>
			renderNote(
				root,
				{
					kind: 'ingredient',
					name: HOUSE_SYRUP,
					description: `Made at home; see ${link('Simple Syrup (1:1)')} for the ratio. Set the amount when you make a batch, and logging subtracts each pour.`,
					properties: {
						[PROP.provides]: [link('Simple Syrup (1:1)')],
						[PROP.form]: 'Homemade syrup',
						[PROP.stockTracking]: 'volume',
						[PROP.remaining]: null,
						[PROP.lastPurchasePrice]: null,
						[PROP.shoppingList]: false,
						[PROP.catalogId]: id('ingredient', HOUSE_SYRUP),
					},
				},
				'',
			),
	},
	recipe(
		'Daiquiri',
		[
			['2 oz (60 ml)', 'Light Rum'],
			['1 oz (30 ml)', 'Lime Juice'],
			['¾ oz (22.5 ml)', 'Simple Syrup (1:1)', 'Simple Syrup'],
		],
		'Shake with ice and strain into a chilled coupe.',
		'Rum, lime, and sugar.',
	),
	recipe(
		'Whiskey Sour',
		[
			['2 oz (60 ml)', 'Bourbon'],
			['¾ oz (22.5 ml)', 'Lemon Juice'],
			['¾ oz (22.5 ml)', 'Simple Syrup (1:1)', 'Simple Syrup'],
		],
		'Shake with ice and strain into a rocks glass over fresh ice.',
		'Bourbon, lemon, and sugar.',
	),
];

export const STARTER_EXAMPLES: readonly StarterExample[] = EXAMPLES.map(({ id, kind, name, provides }) => ({
	id,
	kind,
	name,
	...(provides ? { provides } : {}),
}));

/** Example notes for a new cabinet, linked to catalog types at their current paths. */
export function examplePlan(root: string, date: string, paths: ReadonlyMap<string, string> = new Map()): PlannedFile[] {
	const link = (type: string, wording = type) =>
		wikiLink(paths.get(`type/${fileName(type)}`) || notePath(root, 'type', type), wording);
	return EXAMPLES.map((example) => ({
		...example.render(root, link, date),
		path: paths.get(example.id) || notePath(root, example.kind, example.name),
		catalogId: example.id,
		example: true,
	}));
}
