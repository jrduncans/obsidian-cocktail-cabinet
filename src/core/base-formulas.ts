import { stringify } from 'yaml';
import { cabinetFolder, PROP } from './schema';
import type { NoteKind } from './schema';

/** Building blocks for generated core Bases that use formulas (navigation, shopping list). */

export const q = (key: string) => JSON.stringify(key);

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
		+ `if(note[${q(PROP.remaining)}] > 0, note[${q(PROP.remaining)}].round(), 0) + " mL")))`,
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
	/** Rows grouped by a property; `label` prefixes each group heading (blank hides it). Groups sort by their value. */
	groupBy?: { property: string; direction: 'ASC' | 'DESC'; label: string };
}

/**
 * A Base as Obsidian itself saves one: written with the `yaml` library, no line wrapping, and
 * bare property names in view columns and sorts (Obsidian drops `note.` there, keeping it in
 * `properties`). Opening a generated view then doesn't rewrite the file. Checked in 1.15.
 */
export function serializeBase(base: Record<string, unknown>): string {
	return stringify(base, { lineWidth: 0 });
}

/** A property as views list it: `note.` dropped, `formula.` and `file.` kept. */
export const viewProperty = (property: string) => property.replace(/^note\./, '');

export const sortEntries = (sort: readonly Sort[]) => sort.map(([property, direction]) => ({ property: viewProperty(property), direction }));

export function renderFormulaBase(root: string, formulas: Record<string, string>, views: readonly FormulaView[]): string {
	root = cabinetFolder(root);
	const labels = new Map(views.flatMap(view => [...view.columns, ...view.groupBy ? [[view.groupBy.property, view.groupBy.label] as const] : []]));
	return serializeBase({
		filters: { and: [`file.inFolder(${q(root)})`, 'file.ext == "md"'] },
		formulas,
		properties: Object.fromEntries([...labels].map(([property, label]) => [property, { displayName: label }])),
		views: views.map(view => ({
			type: view.type,
			name: view.name,
			filters: { and: [view.filter] },
			// Obsidian saves groupBy between filters and order.
			...view.groupBy ? { groupBy: { property: viewProperty(view.groupBy.property), direction: view.groupBy.direction } } : {},
			order: view.columns.map(([property]) => viewProperty(property)),
			sort: sortEntries(view.sort ?? [['file.name', 'ASC']]),
		})),
	});
}
