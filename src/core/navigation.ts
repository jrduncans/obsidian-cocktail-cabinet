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

/**
 * Fingerprints of every earlier released version of the navigation Base. When the generated
 * content changes, add the previous version's `managedFingerprint` here so setup updates it.
 */
export const PREVIOUS_NAVIGATION_VERSIONS: readonly string[] = [
	// 0.1.0: bottle stock as "? mL open, 0 unopened".
	'5357-fc366e60',
	// Development only: "660 mL open", "None".
	'5493-e44f3a35',
];

export const NAVIGATION_VIEWS = {
	families: 'Families',
	types: 'Types',
	stock: 'Stock',
	sameType: 'Same type',
	recipes: 'Recipes',
} as const;
type View = typeof NAVIGATION_VIEWS[keyof typeof NAVIGATION_VIEWS];

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
	// Recipes: every link anywhere in the note, followed up the hierarchy.
	linked: 'file.links.map(value.asFile()).filter(value)',
	linkedUp1: parentsOf('formula.linked'),
	linkedUp2: parentsOf('formula.linkedUp1'),
	linkedUp3: parentsOf('formula.linkedUp2'),
	uses: '[formula.linked, formula.linkedUp1, formula.linkedUp2, formula.linkedUp3].flat().map(value.path)',
	related: [
		// The recipe calls for this note or something under it.
		'formula.uses.contains(this.file.path)',
		// The recipe calls for something broader than this note.
		'formula.linked.filter(formula.thisLineage.contains(value.path)).length > 0',
		// A bottle also serves recipes that name another bottle of its type.
		`(this.file.properties[${q(PROP.kind)}] == "bottle" && formula.linkedUp1.filter(formula.thisParents.contains(value.path)).length > 0)`,
	].join(' || '),
	stock: COMMON_FORMULAS.stock,
	rating: COMMON_FORMULAS.rating,
};

interface ViewDefinition extends FormulaView { name: View; }

const stockColumns: [string, string][] = [['formula.name', 'Name'], ['formula.parentLinks', 'Type'], ['formula.stock', 'Stock']];

const VIEWS: readonly ViewDefinition[] = [
	{ name: NAVIGATION_VIEWS.families, type: 'list', filter: `(${kindIs('family')}) && formula.parentPaths.contains(this.file.path)`, columns: [['formula.name', 'Name']] },
	{ name: NAVIGATION_VIEWS.types, type: 'list', filter: `(${kindIs('type')}) && formula.parentPaths.contains(this.file.path)`, columns: [['formula.name', 'Name']] },
	{ name: NAVIGATION_VIEWS.stock, type: 'table', filter: `(${kindIs('bottle', 'ingredient')}) && formula.ancestors.contains(this.file.path)`, columns: stockColumns },
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
		columns: [['formula.name', 'Name'], ['formula.rating', 'Rating']],
		// Unrated recipes sort after rated ones.
		sort: [['note.rating', 'DESC'], ['file.name', 'ASC']],
	},
];

export function navigationBase(root: string): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, NAVIGATION_BASE), kind: 'base', content: renderFormulaBase(root, FORMULAS, VIEWS), managed: PREVIOUS_NAVIGATION_VERSIONS };
}

/** Embed lines for a resource note; empty for recipes and other kinds. */
export function navigationEmbeds(root: string, kind: NoteKind): string {
	const path = basePath(cabinetFolder(root), NAVIGATION_BASE);
	return (SECTIONS[kind] ?? []).map(view => `![[${path}#${view}]]`).join('\n\n');
}
