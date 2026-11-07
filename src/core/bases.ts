import { cabinetFolder, PROP } from './schema';
import type { NoteKind, PlannedFile } from './schema';

type Column = [property: string, label: string];

interface ResourceBase {
	kind: NoteKind;
	name: string;
	columns: Column[];
	/** More table views after the default one, which sorts by file name. */
	views?: { name: string; sort: [property: string, direction: 'ASC' | 'DESC'] }[];
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
			[PROP.lastUsed, 'Last used'],
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
			[PROP.lastUsed, 'Last used'],
			...purchasingColumns,
		],
	},
	{
		kind: 'recipe',
		name: 'Recipes',
		columns: [['source', 'Source'], ['rating', 'Rating'], ['created', 'Created'], [PROP.lastMade, 'Last made'], [PROP.timesMade, 'Times made']],
		views: [{ name: 'Latest', sort: ['note.created', 'DESC'] }, { name: 'Recently made', sort: [`note.${PROP.lastMade}`, 'DESC'] }],
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
	const views = [{ name: resource.name, sort: ['file.name', 'ASC'] }, ...resource.views ?? []];
	return [
		'filters:',
		'  and:',
		...filters.map(filter => `    - ${JSON.stringify(filter)}`),
		'properties:',
		...properties,
		'views:',
		...views.flatMap(view => [
			'  - type: table',
			`    name: ${JSON.stringify(view.name)}`,
			'    order:',
			...columns.map(([property]) => `      - ${property}`),
			'    sort:',
			`      - property: ${view.sort[0]}`,
			`        direction: ${view.sort[1]}`,
		]),
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
