import { cabinetFolder, PROP } from './schema';
import type { NoteKind } from './schema';

/** Building blocks for generated core Bases that use formulas (navigation, shopping list). */

export const q = (key: string) => JSON.stringify(key);
/** YAML single-quoted scalar, so formulas stay readable when users edit the Base. */
export const yaml = (text: string) => `'${text.replace(/'/g, "''")}'`;

const PARENT_KEYS = [PROP.type, PROP.provides, PROP.family, PROP.category];

/** Parent files of each file in `list` (or of the row itself when `list` is omitted). */
export function parentsOf(list?: string): string {
	const read = (key: string) => list ? `list(value.properties[${q(key)}])` : `list(note[${q(key)}])`;
	const links = `[${PARENT_KEYS.map(read).join(', ')}]`;
	const flat = list ? `${list}.map(${links}).flat().flat()` : `${links}.flat()`;
	return `${flat}.filter(value).map(link(value).asFile()).filter(value)`;
}

/** Parent files of the note the Base is embedded in, or of each file in `list`. */
export function thisParentsOf(list?: string): string {
	if (list) return parentsOf(list);
	const links = `[${PARENT_KEYS.map(key => `list(this.file.properties[${q(key)}])`).join(', ')}]`;
	return `${links}.flat().filter(value).map(link(value).asFile()).filter(value)`;
}

export const kindIs = (...kinds: NoteKind[]) => kinds.map(kind => `note[${q(PROP.kind)}] == ${q(kind)}`).join(' || ');

/** A link showing the proper name (`cc-name`) of the file in `value`. */
export const linkWithName = `value.asLink(if(value.properties[${q(PROP.name)}], value.properties[${q(PROP.name)}], value.name))`;

/** Mirrors `bottleStockText`: "88% (660 mL), 2 unopened", mL alone without a bottle size, or "None". */
function bottleStock(open: string, unopened: string, volume: string): string {
	const ml = `${open}.round() + " mL"`;
	const percent = `if(${open} / ${volume} < 0.01, "<1", (${open} / ${volume} * 100).round())`;
	const openText = `if(${volume} > 0, ${percent} + "% (" + ${ml} + ")", ${ml})`;
	const unopenedText = `${unopened} + " unopened"`;
	return `if(${open} > 0 && ${unopened} > 0, ${openText} + ", " + ${unopenedText}, `
		+ `if(${open} > 0, ${openText}, if(${unopened} > 0, ${unopenedText}, "None")))`;
}

export const COMMON_FORMULAS = {
	name: `file.asLink(if(note[${q(PROP.name)}], note[${q(PROP.name)}], file.name))`,
	parents: parentsOf(),
	parentLinks: `formula.parents.map(${linkWithName})`,
	stock: `if(note[${q(PROP.stockTracking)}] == "status", if(note[${q(PROP.availability)}], note[${q(PROP.availability)}], "Unknown"), `
		+ `if(note[${q(PROP.stockTracking)}] != "volume", "", if(note[${q(PROP.kind)}] == "bottle", `
		+ bottleStock(`note[${q(PROP.open)}]`, `note[${q(PROP.unopened)}]`, `note[${q(PROP.volume)}]`) + ', '
		+ `if(note[${q(PROP.remaining)}] == null, "?", note[${q(PROP.remaining)}].round()) + " mL")))`,
	// Ratings are numbers 1–5; anything else is shown as written.
	rating: 'if(note.rating.isType("number"), "⭐️".repeat(note.rating.round()), note.rating)',
};

export type Sort = [property: string, direction: 'ASC' | 'DESC'];
export interface FormulaView {
	name: string;
	type: 'list' | 'table';
	filter: string;
	columns: [property: string, label: string][];
	sort?: Sort[];
}

export function renderFormulaBase(root: string, formulas: Record<string, string>, views: readonly FormulaView[]): string {
	root = cabinetFolder(root);
	const labels = new Map(views.flatMap(view => view.columns));
	return [
		'filters:',
		'  and:',
		`    - ${yaml(`file.inFolder(${q(root)})`)}`,
		`    - ${yaml('file.ext == "md"')}`,
		'formulas:',
		...Object.entries(formulas).map(([name, expression]) => `  ${name}: ${yaml(expression)}`),
		'properties:',
		...[...labels].map(([property, label]) => `  ${property}:\n    displayName: ${q(label)}`),
		'views:',
		...views.flatMap(view => [
			`  - type: ${view.type}`,
			`    name: ${q(view.name)}`,
			'    filters:',
			'      and:',
			`        - ${yaml(view.filter)}`,
			'    order:',
			...view.columns.map(([property]) => `      - ${property}`),
			'    sort:',
			...(view.sort ?? [['file.name', 'ASC']]).flatMap(([property, direction]) => [`      - property: ${property}`, `        direction: ${direction}`]),
		]),
		'',
	].join('\n');
}
