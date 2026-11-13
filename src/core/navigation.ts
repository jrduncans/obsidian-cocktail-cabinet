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
	// The hierarchy is at most three levels above a bottle: type, family, category.
	parents: COMMON_FORMULAS.parents,
	up2: parentsOf('formula.parents'),
	up3: parentsOf('formula.up2'),
	ancestors: '[formula.parents, formula.up2, formula.up3].flat().map(value.path)',
	parentPaths: 'formula.parents.map(value.path)',
	parentLinks: COMMON_FORMULAS.parentLinks,
	thisUp1: thisParentsOf(),
	thisUp2: thisParentsOf('formula.thisUp1'),
	thisUp3: thisParentsOf('formula.thisUp2'),
	thisLineage: '[formula.thisUp1, formula.thisUp2, formula.thisUp3].flat().map(value.path)',
	thisParents: 'formula.thisUp1.map(value.path)',
	// A catch-all type groups bottles that aren't assumed to replace each other (Amaro, Specialty Bitters).
	thisSwapTypes: `formula.thisUp1.filter(value.properties[${q(PROP.catchAll)}] != true).map(value.path)`,
	// Recipes: the notes their Ingredients section links (`cc-ingredients`, kept by the plugin), followed up the
	// hierarchy. A recipe the plugin hasn't reached yet falls back to every link in the note.
	linked: `if(note[${q(PROP.ingredients)}].isType("list"), list(note[${q(PROP.ingredients)}]).filter(value).map(link(value).asFile()).filter(value), file.links.map(value.asFile()).filter(value))`,
	linkedUp1: parentsOf('formula.linked'),
	linkedUp2: parentsOf('formula.linkedUp1'),
	linkedUp3: parentsOf('formula.linkedUp2'),
	uses: '[formula.linked, formula.linkedUp1, formula.linkedUp2, formula.linkedUp3].flat().map(value.path)',
	related: [
		// The recipe calls for this note or something under it.
		'formula.uses.contains(this.file.path)',
		// The recipe calls for something broader than this note.
		'formula.linked.filter(formula.thisLineage.contains(value.path)).length > 0',
		// A bottle also serves recipes that name another bottle of its type, unless the type is a catch-all.
		`(this.file.properties[${q(PROP.kind)}] == "bottle" && formula.linkedUp1.filter(formula.thisSwapTypes.contains(value.path)).length > 0)`,
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
		name: NAVIGATION_VIEWS.stock,
		type: 'table',
		filter: `(${kindIs('bottle', 'ingredient')}) && formula.ancestors.contains(this.file.path)`,
		columns: stockColumns,
	},
	{
		name: NAVIGATION_VIEWS.sameType,
		type: 'table',
		filter: `(${kindIs('bottle', 'ingredient')}) && file.path != this.file.path && formula.parents.filter(formula.thisParents.contains(value.path)).length > 0`,
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

/** Embed lines for a resource note; empty for recipes and other kinds. */
export function navigationEmbeds(root: string, kind: NoteKind): string {
	const path = basePath(cabinetFolder(root), NAVIGATION_BASE);
	return (SECTIONS[kind] ?? []).map((view) => `![[${path}#${view}]]`).join('\n\n');
}
