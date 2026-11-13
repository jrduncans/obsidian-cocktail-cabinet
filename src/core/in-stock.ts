import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, q, renderFormulaBase } from './base-formulas';
import { PROP } from './schema';
import type { PlannedFile } from './schema';
import { stockedExpression } from './stock-formulas';

export const IN_STOCK_BASE = 'In stock';

export function inStockBase(root: string): PlannedFile {
	return {
		path: basePath(root, IN_STOCK_BASE),
		kind: 'base',
		content: renderFormulaBase(
			root,
			{
				name: COMMON_FORMULAS.name,
				parents: COMMON_FORMULAS.parents,
				parentLinks: COMMON_FORMULAS.parentLinks,
				stock: COMMON_FORMULAS.stock,
				stocked: stockedExpression((key) => `note[${q(key)}]`),
			},
			[
				{
					name: IN_STOCK_BASE,
					type: 'table',
					filter: `(${kindIs('bottle', 'ingredient')}) && formula.stocked`,
					columns: [
						['formula.name', 'Name'],
						['formula.parentLinks', 'Type'],
						['formula.stock', 'Stock'],
						[`note.${PROP.lastUsed}`, 'Last used'],
						[`note.${PROP.shoppingList}`, 'Shopping list'],
					],
				},
			],
		),
	};
}
