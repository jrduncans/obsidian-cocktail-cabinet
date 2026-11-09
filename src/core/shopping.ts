import { sourceStocked as stocked, typeSources } from './stock-formulas';
import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, linkWithName, q, renderFormulaBase } from './base-formulas';
import type { FormulaView } from './base-formulas';
import { markdown } from './notes';
import { RESTOCK_BASE } from './restock';
import { cabinetFolder, PROP, wikiLink } from './schema';
import type { PlannedFile } from './schema';

/**
 * Everything marked **Add to shopping list**, in one note with a section per kind.
 */
export const SHOPPING_BASE = 'Shopping list';
export const SHOPPING_NOTE = 'Shopping list';
export const SHOPPING_VIEWS = { bottles: 'Bottles', types: 'Types', other: 'Other stock' } as const;

const flagged = `note[${q(PROP.shoppingList)}] == true`;
const FORMULAS: Record<string, string> = {
	name: COMMON_FORMULAS.name,
	parents: COMMON_FORMULAS.parents,
	// Same links, separate formulas: a Base gives each column one label across views.
	type: COMMON_FORMULAS.parentLinks,
	provides: COMMON_FORMULAS.parentLinks,
	stock: COMMON_FORMULAS.stock,
	// For a type: the bottles and other stock classified under it, via backlinks.
	sources: typeSources,
	have: `formula.sources.filter(${stocked}).map(${linkWithName})`,
	notInStock: `formula.sources.filter(!${stocked}).map(${linkWithName})`,
};

const VIEWS: readonly FormulaView[] = [
	{
		name: SHOPPING_VIEWS.bottles, type: 'table', filter: `(${kindIs('bottle')}) && ${flagged}`,
		columns: [['formula.name', 'Name'], ['formula.type', 'Type'], ['formula.stock', 'Stock'], [`note.${PROP.lastPurchasePrice}`, 'Last price']],
	},
	{
		name: SHOPPING_VIEWS.types, type: 'table', filter: `(${kindIs('type')}) && ${flagged}`,
		columns: [['formula.name', 'Name'], ['formula.have', 'Have'], ['formula.notInStock', 'Not in stock']],
	},
	{
		name: SHOPPING_VIEWS.other, type: 'table', filter: `(${kindIs('ingredient')}) && ${flagged}`,
		columns: [['formula.name', 'Name'], ['formula.provides', 'Provides'], [`note.${PROP.form}`, 'Form'], ['formula.stock', 'Stock'], [`note.${PROP.lastPurchasePrice}`, 'Last price']],
	},
];

export function shoppingBase(root: string): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, SHOPPING_BASE), kind: 'base', content: renderFormulaBase(root, FORMULAS, VIEWS) };
}

export function shoppingNotePath(root: string): string {
	return `${cabinetFolder(root)}/${SHOPPING_NOTE}.md`;
}

export function shoppingNote(root: string): PlannedFile {
	root = cabinetFolder(root);
	const embeds = Object.values(SHOPPING_VIEWS).map(view => `![[${basePath(root, SHOPPING_BASE)}#${view}]]`).join('\n\n');
	return {
		path: shoppingNotePath(root),
		kind: 'shopping',
		content: markdown({ [PROP.kind]: 'shopping' }, `# ${SHOPPING_NOTE}\n\nTurn on **Add to shopping list** on a bottle, ingredient type, or other stock to list it here. A type means any bottle of that type will do. To find more to add, see ${wikiLink(basePath(root, RESTOCK_BASE), RESTOCK_BASE)}. After shopping, use the cart button in this note's header (**Record purchases**) to add what you bought to your stock.\n\n${embeds}`),
	};
}
