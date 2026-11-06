import { basePath } from './bases';
import { COMMON_FORMULAS, kindIs, q, renderFormulaBase } from './base-formulas';
import type { FormulaView } from './base-formulas';
import { cabinetFolder, PROP } from './schema';
import type { PlannedFile } from './schema';

/**
 * Candidates for the shopping list: stock running low, stock that's out (most recently
 * changed first, so a bottle bought once sinks without anyone dismissing it), and stock
 * never filled in. Each view has the shopping-list checkbox to pick from. A user-owned
 * Base: setup creates it when missing and never replaces it.
 */
export const RESTOCK_BASE = 'Restock';
export const RESTOCK_VIEWS = { low: 'Running low', out: 'Out', unknown: 'Unknown' } as const;

const note = (key: string) => `note[${q(key)}]`;
const tracking = note(PROP.stockTracking);
const isBottle = `${note(PROP.kind)} == "bottle"`;
const noUnopened = `!(${note(PROP.unopened)} > 0)`;

/** Mirrors what logging can't draw down from: no mode, Unknown availability, or a missing amount. */
const unknown = `if(${tracking} == "status", !${note(PROP.availability)} || ${note(PROP.availability)} == "Unknown", `
	+ `if(${tracking} != "volume", true, `
	+ `if(${isBottle}, ${note(PROP.open)} == null, ${note(PROP.remaining)} == null)))`;

/** Amounts are known and zero; an unknown amount is never out. */
const out = `if(${tracking} == "status", ${note(PROP.availability)} == "Out", `
	+ `${tracking} == "volume" && if(${isBottle}, ${note(PROP.open)} == 0 && ${noUnopened}, ${note(PROP.remaining)} == 0))`;

/**
 * Low, or the last bottle under `lowShare` full; without a bottle size, and for other
 * stock, under `lowMl`. Both thresholds are formulas so they can be changed in the Base.
 */
const low = `if(${tracking} == "status", ${note(PROP.availability)} == "Low", `
	+ `${tracking} == "volume" && if(${isBottle}, `
	+ `${note(PROP.open)} > 0 && ${noUnopened} && if(${note(PROP.volume)} > 0, ${note(PROP.open)} / ${note(PROP.volume)} <= formula.lowShare, ${note(PROP.open)} <= formula.lowMl), `
	+ `${note(PROP.remaining)} > 0 && ${note(PROP.remaining)} <= formula.lowMl))`;

const FORMULAS: Record<string, string> = {
	name: COMMON_FORMULAS.name,
	parents: COMMON_FORMULAS.parents,
	parentLinks: COMMON_FORMULAS.parentLinks,
	stock: COMMON_FORMULAS.stock,
	lowShare: '0.25',
	lowMl: '100',
	low,
	out,
	unknown,
};

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
	{ name: RESTOCK_VIEWS.unknown, type: 'table', filter: `(${stocked}) && formula.unknown`, columns: [name, type, ['formula.stock', 'Stock'], shopping] },
];

export function restockBase(root: string): PlannedFile {
	root = cabinetFolder(root);
	return { path: basePath(root, RESTOCK_BASE), kind: 'base', content: renderFormulaBase(root, FORMULAS, VIEWS) };
}
