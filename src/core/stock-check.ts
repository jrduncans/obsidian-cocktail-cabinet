import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, q, renderFormulaBase } from './base-formulas';
import type { FormulaView } from './base-formulas';
import { cabinetFolder, PROP } from './schema';
import type { PlannedFile } from './schema';

/**
 * Bottles and other stock in the order they most need a look: unknown stock first, then
 * never checked, then the oldest **Edit stock** check. A user-owned Base: setup creates it
 * when missing and never replaces it.
 */
export const STOCK_CHECK_BASE = 'Stock to check';

const note = (key: string) => `note[${q(key)}]`;

/** Mirrors what logging can't draw down from: no mode, Unknown availability, or a missing amount. */
const unknown = `if(${note(PROP.stockTracking)} == "status", !${note(PROP.availability)} || ${note(PROP.availability)} == "Unknown", `
	+ `if(${note(PROP.stockTracking)} != "volume", true, `
	+ `if(${note(PROP.kind)} == "bottle", ${note(PROP.open)} == null, ${note(PROP.remaining)} == null)))`;

const FORMULAS: Record<string, string> = {
	name: COMMON_FORMULAS.name,
	parents: COMMON_FORMULAS.parents,
	parentLinks: COMMON_FORMULAS.parentLinks,
	stock: COMMON_FORMULAS.stock,
	unknown,
	// A bottle with no open amount would otherwise read "None", which looks like empty.
	shownStock: 'if(formula.unknown, "Unknown", formula.stock)',
	priority: `if(formula.unknown, 0, if(${note(PROP.stockChecked)}, 2, 1))`,
};

const VIEWS: readonly FormulaView[] = [{
	name: STOCK_CHECK_BASE,
	type: 'table',
	filter: kindIs('bottle', 'ingredient'),
	columns: [['formula.name', 'Name'], ['formula.parentLinks', 'Type'], ['formula.shownStock', 'Stock'], [`note.${PROP.stockChecked}`, 'Checked']],
	sort: [['formula.priority', 'ASC'], [`note.${PROP.stockChecked}`, 'ASC'], ['file.name', 'ASC']],
}];

export function stockCheckBase(root: string): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, STOCK_CHECK_BASE), kind: 'base', content: renderFormulaBase(root, FORMULAS, VIEWS) };
}
