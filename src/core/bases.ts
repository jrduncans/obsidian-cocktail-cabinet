import { cabinetFolder, PROP } from './schema';
import type { NoteKind, PlannedFile } from './schema';

type Column = [property: string, label: string];

interface ResourceBase {
	kind: NoteKind;
	name: string;
	columns: Column[];
}

const purchasingColumns: Column[] = [
	[PROP.lastPurchasePrice, 'Last purchase price'],
	[PROP.shoppingList, 'Shopping list'],
];

export const RESOURCE_BASES: readonly ResourceBase[] = [
	{
		kind: 'type',
		name: 'Ingredient types',
		columns: [
			[PROP.family, 'Family'],
			[PROP.brix, 'Brix'],
			[PROP.sugarWaterRatio, 'Sugar to water ratio'],
			[PROP.shoppingList, 'Shopping list'],
		],
	},
	{
		kind: 'family',
		name: 'Ingredient families',
		columns: [[PROP.category, 'Category']],
	},
	{ kind: 'category', name: 'Ingredient categories', columns: [] },
	{
		kind: 'bottle',
		name: 'Bottles',
		columns: [
			[PROP.type, 'Ingredient type'],
			[PROP.volume, 'Bottle volume (mL)'],
			[PROP.abv, 'ABV (fraction)'],
			[PROP.stockTracking, 'Stock tracking'],
			[PROP.open, 'Open bottle (mL)'],
			[PROP.unopened, 'Unopened bottles'],
			[PROP.availability, 'Availability (status mode)'],
			...purchasingColumns,
		],
	},
	{
		kind: 'ingredient',
		name: 'Other stock',
		columns: [
			[PROP.provides, 'Provides'],
			[PROP.form, 'Form'],
			[PROP.stockTracking, 'Stock tracking'],
			[PROP.remaining, 'Remaining volume (mL)'],
			[PROP.availability, 'Availability (status mode)'],
			...purchasingColumns,
		],
	},
	{
		kind: 'recipe',
		name: 'Recipes',
		columns: [['source', 'Source'], ['rating', 'Rating'], ['created', 'Created']],
	},
];

export function basePath(root: string, name: string): string {
	return `${cabinetFolder(root)}/Views/${name}.base`;
}

function renderBase(root: string, resource: ResourceBase): string {
	const columns: Column[] = [
		['file.name', 'Note'],
		[`note.${PROP.name}`, 'Name'],
		...resource.columns.map(([property, label]): Column => [`note.${property}`, label]),
	];
	const filters = [
		`file.inFolder(${JSON.stringify(root)})`,
		'file.ext == "md"',
		`note[${JSON.stringify(PROP.kind)}] == ${JSON.stringify(resource.kind)}`,
	];
	const properties = columns.map(([property, label]) =>
		`  ${property}:\n    displayName: ${JSON.stringify(label)}`,
	);
	return [
		'filters:',
		'  and:',
		...filters.map(filter => `    - ${JSON.stringify(filter)}`),
		'properties:',
		...properties,
		'views:',
		'  - type: table',
		`    name: ${JSON.stringify(resource.name)}`,
		'    order:',
		...columns.map(([property]) => `      - ${property}`),
		'    sort:',
		'      - property: file.name',
		'        direction: ASC',
		'',
	].join('\n');
}

/** Standalone core Bases configuration, with no plugin functions or generated data. */
export function resourceBases(root: string): PlannedFile[] {
	root = cabinetFolder(root);
	return RESOURCE_BASES.map(resource => ({
		path: basePath(root, resource.name),
		kind: 'base',
		content: renderBase(root, resource),
	}));
}
