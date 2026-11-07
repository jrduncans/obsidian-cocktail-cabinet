import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, q, renderFormulaBase } from './base-formulas';
import type { FormulaView } from './base-formulas';
import { cabinetFolder, PROP } from './schema';
import type { PlannedFile } from './schema';

/**
 * Candidates for the shopping list: stock running low, stock that's out (most recently
 * changed first, so a bottle bought once sinks without anyone dismissing it), and stock
 * whose availability or tracking mode was never set. A blank amount is none, not unknown.
 * Each view has the shopping-list checkbox to pick from.
 */
export const RESTOCK_BASE = 'Restock';

/** What counts as running low, set in the plugin's settings. */
export interface RestockThresholds {
	/** The last bottle at or under this percent full. */
	percent: number;
	/** Without a bottle size, and for other stock tracked in mL, at or under this many mL. */
	ml: number;
}
export const DEFAULT_RESTOCK: RestockThresholds = { percent: 10, ml: 70 };
export const RESTOCK_VIEWS = { low: 'Running low', out: 'Out', unknown: 'Unknown' } as const;

const note = (key: string) => `note[${q(key)}]`;
const tracking = note(PROP.stockTracking);
const isBottle = `${note(PROP.kind)} == "bottle"`;
/**
 * Blank or at most 0. In Bases a comparison on a blank number fails the whole expression,
 * even beside `||`, so blank is tested first and the comparison runs only in `if`'s other branch.
 */
const none = (key: string) => `if(${note(key)} == null, true, ${note(key)} <= 0)`;
const noUnopened = none(PROP.unopened);

/** Unknown or missing availability, or no tracking mode. */
const unknown = `if(${tracking} == "status", !${note(PROP.availability)} || ${note(PROP.availability)} == "Unknown", ${tracking} != "volume")`;

/** Out, or nothing left: blank amounts count as 0. */
const out = `if(${tracking} == "status", ${note(PROP.availability)} == "Out", `
	+ `${tracking} == "volume" && if(${isBottle}, ${none(PROP.open)} && ${noUnopened}, ${none(PROP.remaining)}))`;

/** Low, or the last bottle at or under `lowShare` full; without a bottle size, and for other stock, `lowMl`. */
const low = `if(${tracking} == "status", ${note(PROP.availability)} == "Low", `
	+ `${tracking} == "volume" && if(${isBottle}, `
	+ `${note(PROP.open)} > 0 && ${noUnopened} && if(${note(PROP.volume)} > 0, ${note(PROP.open)} / ${note(PROP.volume)} <= formula.lowShare, ${note(PROP.open)} <= formula.lowMl), `
	+ `${note(PROP.remaining)} > 0 && ${note(PROP.remaining)} <= formula.lowMl))`;

const formulas = (thresholds: RestockThresholds): Record<string, string> => ({
	name: COMMON_FORMULAS.name,
	parents: COMMON_FORMULAS.parents,
	parentLinks: COMMON_FORMULAS.parentLinks,
	stock: COMMON_FORMULAS.stock,
	lowShare: String(thresholds.percent / 100),
	lowMl: String(thresholds.ml),
	low,
	out,
	unknown,
	unknownStock: `if(${tracking} == "status", "Unknown", "Tracking not set")`,
});

const stocked = kindIs('bottle', 'ingredient');
const name = ['formula.name', 'Name'] as [string, string];
const type = ['formula.parentLinks', 'Type'] as [string, string];
const price = [`note.${PROP.lastPurchasePrice}`, 'Last price'] as [string, string];
const shopping = [`note.${PROP.shoppingList}`, 'Shopping list'] as [string, string];

const VIEWS: readonly FormulaView[] = [
	{ name: RESTOCK_VIEWS.low, type: 'table', filter: `(${stocked}) && formula.low`, columns: [name, type, ['formula.stock', 'Stock'], price, shopping] },
	{
		name: RESTOCK_VIEWS.out, type: 'table', filter: `(${stocked}) && formula.out`,
		columns: [name, type, price, ['file.mtime', 'Last changed'], shopping],
		sort: [['file.mtime', 'DESC']],
	},
	{ name: RESTOCK_VIEWS.unknown, type: 'table', filter: `(${stocked}) && formula.unknown`, columns: [name, type, ['formula.unknownStock', 'Stock'], shopping] },
];

export function restockBase(root: string, thresholds: RestockThresholds = DEFAULT_RESTOCK): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, RESTOCK_BASE), kind: 'base', content: renderFormulaBase(root, formulas(thresholds), VIEWS) };
}
