import { q } from './base-formulas';
import { PROP } from './schema';
import { KITCHEN_STAPLE_FORM } from './stock';

/** Test kind first: bottles have no form, and blank comparisons can fail in Bases. */
export const kitchenStaple = `if(note[${q(PROP.kind)}] == "ingredient", note[${q(PROP.form)}] == ${q(KITCHEN_STAPLE_FORM)}, false)`;

/** Unknown is not stock. Guard each blank number before comparing it (Bases propagates blanks). */
export function stockedExpression(read: (key: string) => string): string {
	const positive = (key: string) => `if(${read(key)} == null, false, ${read(key)} > 0)`;
	return `if(${read(PROP.stockTracking)} == "status", ${read(PROP.availability)} == "Have" || ${read(PROP.availability)} == "Low", `
		+ `${read(PROP.stockTracking)} == "volume" && if(${read(PROP.kind)} == "bottle", `
		+ `${positive(PROP.open)} || ${positive(PROP.unopened)}, ${positive(PROP.remaining)}))`;
}

const prop = (key: string) => `value.properties[${q(key)}]`;
export const sourceStocked = stockedExpression(prop);

/** Sources explicitly classified under the row type, rather than every backlink. */
export const typeSources = `file.backlinks.map(value.asFile()).filter(value).filter((${prop(PROP.kind)} == "bottle" || ${prop(PROP.kind)} == "ingredient")`
	+ ` && [list(${prop(PROP.type)}), list(${prop(PROP.provides)})].flat().filter(value).map(link(value).asFile()).filter(value).map(value.path).contains(file.path))`;
