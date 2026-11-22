import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, parentsOf, q, renderFormulaBase, thisParentsOf } from './base-formulas';
import type { FormulaView } from './base-formulas';
import { cabinetFolder, PROP } from './schema';
import type { NoteKind, PlannedFile } from './schema';

/**
 * One shared core Base, embedded in each resource note through `this`, so navigation
 * renders without the plugin. Its recipe rule mirrors `relatedTargets`, kept for the planned availability resolver.
 */
export const NAVIGATION_BASE = 'Related';

export const NAVIGATION_VIEWS = {
	families: 'Families',
	types: 'Types',
	subtypes: 'Subtypes',
	stock: 'Stock',
	sameType: 'Same type',
	recipes: 'Recipes',
} as const;
type View = (typeof NAVIGATION_VIEWS)[keyof typeof NAVIGATION_VIEWS];

const SECTIONS: Partial<Record<NoteKind, readonly View[]>> = {
	category: [NAVIGATION_VIEWS.families, NAVIGATION_VIEWS.recipes],
	family: [NAVIGATION_VIEWS.types, NAVIGATION_VIEWS.stock, NAVIGATION_VIEWS.recipes],
	type: [NAVIGATION_VIEWS.stock, NAVIGATION_VIEWS.recipes],
	bottle: [NAVIGATION_VIEWS.sameType, NAVIGATION_VIEWS.recipes],
	ingredient: [NAVIGATION_VIEWS.sameType, NAVIGATION_VIEWS.recipes],
};

const FORMULAS: Record<string, string> = {
	name: COMMON_FORMULAS.name,
	// The hierarchy is at most four levels above a bottle: subtype, type, family, category.
	parents: COMMON_FORMULAS.parents,
	up2: parentsOf('formula.parents'),
	up3: parentsOf('formula.up2'),
	up4: parentsOf('formula.up3'),
	ancestors: '[formula.parents, formula.up2, formula.up3, formula.up4].flat().map(value.path)',
	parentPaths: 'formula.parents.map(value.path)',
	// A subtype bottle's parent type (Bourbon for a bonded bourbon).
	up2Types: `formula.up2.filter(value.properties[${q(PROP.kind)}] == "type").map(value.path)`,
	parentLinks: COMMON_FORMULAS.parentLinks,
	thisUp1: thisParentsOf(),
	thisUp2: thisParentsOf('formula.thisUp1'),
	thisUp3: thisParentsOf('formula.thisUp2'),
	thisUp4: thisParentsOf('formula.thisUp3'),
	thisLineage: '[formula.thisUp1, formula.thisUp2, formula.thisUp3, formula.thisUp4].flat().map(value.path)',
	thisParents: 'formula.thisUp1.map(value.path)',
	thisUp2Types: `formula.thisUp2.filter(value.properties[${q(PROP.kind)}] == "type").map(value.path)`,
	// A catch-all type groups bottles that aren't assumed to replace each other (Amaro, Specialty Bitters).
	// A subtype bottle also stands in for bottles of its parent type.
	thisSwapTypes: `[formula.thisUp1, formula.thisUp2.filter(value.properties[${q(PROP.kind)}] == "type")].flat().filter(value.properties[${q(PROP.catchAll)}] != true).map(value.path)`,
	// Recipes: the notes their Ingredients section links (`cc-ingredients`, kept by the plugin), followed up the
	// hierarchy. A recipe the plugin hasn't reached yet falls back to every link in the note.
	linked: `if(note[${q(PROP.ingredients)}].isType("list"), list(note[${q(PROP.ingredients)}]).filter(value).map(link(value).asFile()).filter(value), file.links.map(value.asFile()).filter(value))`,
	linkedUp1: parentsOf('formula.linked'),
	linkedUp2: parentsOf('formula.linkedUp1'),
	linkedUp3: parentsOf('formula.linkedUp2'),
	linkedUp4: parentsOf('formula.linkedUp3'),
	uses: '[formula.linked, formula.linkedUp1, formula.linkedUp2, formula.linkedUp3, formula.linkedUp4].flat().map(value.path)',
	// The types of the bottles a recipe names, for the same-type rule; a subtype link is not a bottle.
	linkedBottleTypes: parentsOf(`formula.linked.filter(value.properties[${q(PROP.kind)}] == "bottle")`),
	related: [
		// The recipe calls for this note or something under it.
		'formula.uses.contains(this.file.path)',
		// The recipe calls for something broader than this note.
		'formula.linked.filter(formula.thisLineage.contains(value.path)).length > 0',
		// A bottle also serves recipes that name another bottle of its type, unless the type is a catch-all.
		`(this.file.properties[${q(PROP.kind)}] == "bottle" && formula.linkedBottleTypes.filter(formula.thisSwapTypes.contains(value.path)).length > 0)`,
	].join(' || '),
	// Recipes that call for this note (or, on a type or family, something under it) are grouped above
	// the ones it can fill through a broader requirement; "Calls…" sorts before "Can…".
	match: `if(formula.uses.contains(this.file.path), "Calls for " + if(this.file.properties[${q(PROP.name)}], this.file.properties[${q(PROP.name)}], this.file.name), "Can fill")`,
	stock: COMMON_FORMULAS.stock,
	rating: COMMON_FORMULAS.rating,
};

interface ViewDefinition extends FormulaView {
	name: View;
}

const stockColumns: [string, string][] = [
	['formula.name', 'Name'],
	['formula.parentLinks', 'Type'],
	['formula.stock', 'Stock'],
];

const VIEWS: readonly ViewDefinition[] = [
	{
		name: NAVIGATION_VIEWS.families,
		type: 'list',
		filter: `(${kindIs('family')}) && formula.parentPaths.contains(this.file.path)`,
		columns: [['formula.name', 'Name']],
	},
	{
		name: NAVIGATION_VIEWS.types,
		type: 'list',
		filter: `(${kindIs('type')}) && formula.parentPaths.contains(this.file.path)`,
		columns: [['formula.name', 'Name']],
	},
	{
		name: NAVIGATION_VIEWS.subtypes,
		type: 'list',
		filter: `(${kindIs('type')}) && formula.parentPaths.contains(this.file.path)`,
		columns: [['formula.name', 'Name']],
	},
	{
		name: NAVIGATION_VIEWS.stock,
		type: 'table',
		filter: `(${kindIs('bottle', 'ingredient')}) && formula.ancestors.contains(this.file.path)`,
		columns: stockColumns,
	},
	{
		name: NAVIGATION_VIEWS.sameType,
		type: 'table',
		// The same type, reaching between a type and its subtypes both ways.
		filter: `(${kindIs('bottle', 'ingredient')}) && file.path != this.file.path && (formula.parents.filter(formula.thisParents.contains(value.path)).length > 0 || formula.up2Types.filter(formula.thisParents.contains(value)).length > 0 || formula.parents.filter(formula.thisUp2Types.contains(value.path)).length > 0)`,
		columns: stockColumns,
	},
	{
		name: NAVIGATION_VIEWS.recipes,
		// A table lines ratings up, so the drop from 5 to 4 stars is easy to scan.
		type: 'table',
		filter: `(${kindIs('recipe')}) && formula.related`,
		columns: [
			['formula.name', 'Name'],
			['formula.rating', 'Rating'],
		],
		// A blank label leaves only the group name in each heading.
		groupBy: { property: 'formula.match', direction: 'ASC', label: ' ' },
		// Unrated recipes sort after rated ones.
		sort: [
			['note.rating', 'DESC'],
			['file.name', 'ASC'],
		],
	},
];

export function navigationBase(root: string): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, NAVIGATION_BASE), kind: 'base', content: renderFormulaBase(root, FORMULAS, VIEWS) };
}

/** One section's embed line. */
export function navigationEmbed(root: string, view: View): string {
	return `![[${basePath(cabinetFolder(root), NAVIGATION_BASE)}#${view}]]`;
}

/** The sections a note of this kind shows, in order; a type with subtypes lists them first. */
export function navigationSections(kind: NoteKind, hasSubtypes = false): View[] {
	return [...(kind === 'type' && hasSubtypes ? [NAVIGATION_VIEWS.subtypes] : []), ...(SECTIONS[kind] ?? [])];
}

/** Fingerprint of the section rules, so the plugin rechecks notes only when a release changes them. */
export const NAVIGATION_SECTIONS_VERSION = JSON.stringify([SECTIONS, NAVIGATION_VIEWS.subtypes]);

const VIEW_NAMES = new Set<string>(Object.values(NAVIGATION_VIEWS));

/**
 * Which section a line embeds, if any. Accepts any link Obsidian resolves to the Related Base by name
 * (`![[Related.base#Stock]]`, `![[Cocktails/Views/Related#Stock|…]]`), not only the form the plugin writes.
 */
function embeddedView(line: string): View | null {
	const match = line.trim().match(/^!\[\[([^\]#|]*)#([^\]|]+)(?:\|[^\]]*)?\]\]$/);
	if (!match) return null;
	const target = match[1]!
		.split('/')
		.at(-1)!
		.replace(/\.base$/, '');
	const view = match[2]!.trim();
	return target === NAVIGATION_BASE && VIEW_NAMES.has(view) ? (view as View) : null;
}

/**
 * The content with each of `wanted` (in `order`) embedded, if missing. A missing section goes before the
 * next present one in order, else after the previous one, else at the end. Nothing is removed or moved.
 */
function withSections(root: string, content: string, order: readonly View[], wanted: readonly View[]): string {
	const lines = content.split('\n');
	const at = () => {
		const found = new Map<View, number>();
		lines.forEach((line, index) => {
			const view = embeddedView(line);
			if (view && !found.has(view)) found.set(view, index);
		});
		return found;
	};
	for (const view of wanted) {
		const present = at();
		if (present.has(view)) continue;
		const embed = navigationEmbed(root, view);
		const position = order.indexOf(view);
		const next = order.slice(position + 1).find((other) => present.has(other));
		const previous = order
			.slice(0, position)
			.reverse()
			.find((other) => present.has(other));
		if (next) lines.splice(present.get(next)!, 0, embed, '');
		else if (previous) lines.splice(present.get(previous)! + 1, 0, '', embed);
		else {
			while (lines.length && !lines.at(-1)!.trim()) lines.pop();
			lines.push('', embed, '');
		}
	}
	return lines.join('\n');
}

/**
 * A type note's content with a Subtypes section, ahead of its other sections; unchanged when it has one.
 * Notes are generated without it until a subtype appears, so most types don't show an empty list.
 */
export function withSubtypesSection(root: string, content: string): string {
	return withSections(root, content, navigationSections('type', true), [NAVIGATION_VIEWS.subtypes]);
}

/** A resource note's content with every section its kind shows, adding only what's missing (docs/ownership.md). */
export function withNavigationSections(root: string, kind: NoteKind, content: string, hasSubtypes = false): string {
	const order = navigationSections(kind, hasSubtypes);
	return withSections(root, content, order, order);
}

/** Embed lines for a resource note; empty for recipes and other kinds. A type with subtypes lists them first. */
export function navigationEmbeds(root: string, kind: NoteKind, hasSubtypes = false): string {
	return navigationSections(kind, hasSubtypes)
		.map((view) => navigationEmbed(root, view))
		.join('\n\n');
}
