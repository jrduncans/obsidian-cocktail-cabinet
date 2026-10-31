import { cabinetFolder, PROP } from './schema';
import type { NoteKind, PlannedFile } from './schema';

interface ResourceBase {
	kind: NoteKind;
	name: string;
	columns: [string, string][];
}

export const RESOURCE_BASES: readonly ResourceBase[] = [
	{ kind: 'type', name: 'Ingredient types', columns: [[PROP.family, 'Family'], [PROP.brix, 'Brix'], [PROP.sugarWaterRatio, 'Sugar to water ratio']] },
	{ kind: 'family', name: 'Ingredient families', columns: [[PROP.category, 'Category']] },
	{ kind: 'category', name: 'Ingredient categories', columns: [] },
	{ kind: 'bottle', name: 'Bottles', columns: [[PROP.types, 'Ingredient types'], [PROP.volume, 'Bottle volume (mL)'], [PROP.abv, 'ABV (fraction)'], [PROP.open, 'Open bottle (fraction)'], [PROP.unopened, 'Unopened bottles']] },
	{ kind: 'ingredient', name: 'Other stock', columns: [[PROP.provides, 'Provides'], [PROP.form, 'Form'], [PROP.availability, 'Availability']] },
	{ kind: 'recipe', name: 'Recipes', columns: [['source', 'Source'], ['rating', 'Rating'], ['created', 'Created']] },
];

export function basePath(root: string, name: string): string {
	return `${cabinetFolder(root)}/Views/${name}.base`;
}

/** Standalone core Bases configuration, with no plugin functions or generated data. */
export function resourceBases(root: string): PlannedFile[] {
	root = cabinetFolder(root);
	return RESOURCE_BASES.map(resource => {
		const columns: [string, string][] = [['file.name', 'Note'], [`note.${PROP.name}`, 'Name'],
			...resource.columns.map(([property, label]): [string, string] => [`note.${property}`, label])];
		const filters = [`file.inFolder(${JSON.stringify(root)})`, 'file.ext == "md"', `note[${JSON.stringify(PROP.kind)}] == ${JSON.stringify(resource.kind)}`];
		return {
			path: basePath(root, resource.name), kind: 'base',
			content: 'filters:\n  and:\n' + filters.map(filter => `    - ${JSON.stringify(filter)}\n`).join('')
				+ 'properties:\n' + columns.map(([property, label]) => `  ${property}:\n    displayName: ${JSON.stringify(label)}\n`).join('')
				+ `views:\n  - type: table\n    name: ${JSON.stringify(resource.name)}\n    order:\n`
				+ columns.map(([property]) => `      - ${property}\n`).join('')
				+ '    sort:\n      - property: file.name\n        direction: ASC\n',
		};
	});
}
