import {
	COMMON_FORMULAS,
	kindIs,
	linkWithName,
	q,
	renderFormulaBase,
	serializeBase,
	sortEntries,
	viewProperty,
} from './base-formulas';
import type { FormulaView, Sort } from './base-formulas';
import { kitchenStaple, sourceStocked, stockedExpression, typeSources } from './stock-formulas';
import { cabinetFolder, PROP } from './schema';
import type { NoteKind, PlannedFile } from './schema';

/** A note property, or `formula.<name>` for one of the Base's formulas. */
type Column = [property: string, label: string];

const ALCOHOL = `note[${q('cc-est-alcohol-ml')}]`;
const ABV = `note[${q('cc-est-abv')}]`;
const BASIS = `note[${q('cc-est-basis')}]`;
/** Partial estimates are lower bounds. */
const atLeast = `if(${BASIS} == "partial", "≥ ", "")`;

/** Formulas every resource Base can show; core Bases only, no plugin functions. */
function formulas(drinkGrams: number): Record<string, string> {
	return {
		// The proper name as a link, so it opens and previews like the file name.
		name: COMMON_FORMULAS.name,
		// Ratings as stars; unrated stays empty, which is easy to spot.
		rating: COMMON_FORMULAS.rating,
		// Standard drinks from the estimated mL of alcohol (ethanol is 0.789 g/mL), and ABV as a percent.
		drinks: `if(${ALCOHOL} == null, "", ${atLeast} + (${ALCOHOL} * 0.789 / ${drinkGrams}).toFixed(1))`,
		abv: `if(${ABV} == null, "", ${atLeast} + (${ABV} * 100).toFixed(1) + "%")`,
		// Group headings sort by value, so "In stock" comes first.
		inStock: `if(${stockedExpression((key) => `note[${q(key)}]`)}, "In stock", "Not in stock")`,
	};
}

interface ResourceBase {
	kind: NoteKind;
	name: string;
	/** The default view's name, when it isn't the Base's. */
	first?: string;
	/** After the linked name, in display order: narrow screens scroll the last ones off. */
	columns: Column[];
	/** More table views after the default one, which sorts by file name. */
	views?: ResourceView[];
}
interface ResourceView {
	name: string;
	sort: Sort[];
	filter?: string;
	/** Columns for this view alone, after the linked name; otherwise the Base's columns. */
	columns?: Column[];
	/** Rows grouped by a formula, not shown as a column; the heading shows only the group's value. */
	groupBy?: string;
	/** Another kind than the Base's, for a Base listing two; each view then filters by its own kind. */
	kind?: NoteKind;
}

/** Families and categories share a Base: both are short lists, added rarely. */
export const GROUPS_BASE = 'Ingredient families and categories';
/** Bases earlier releases wrote that no longer exist; syncing removes them from Views. */
export const RETIRED_BASES = ['Ingredient families', 'Ingredient categories'] as const;

const purchasingColumns: Column[] = [
	[PROP.lastPurchasePrice, 'Last purchase price'],
	[PROP.lastPurchased, 'Last purchased'],
	[PROP.shoppingList, 'Shopping list'],
];

export const RESOURCE_BASES: readonly ResourceBase[] = [
	{
		kind: 'type',
		name: 'Ingredient types',
		columns: [
			[PROP.family, 'Family'],
			[PROP.type, 'Subtype of'],
			[PROP.abvTypical, 'Typical ABV (fraction)'],
			[PROP.sugarWaterRatio, 'Sugar to water ratio'],
			[PROP.shoppingList, 'Shopping list'],
		],
	},
	{
		kind: 'family',
		name: GROUPS_BASE,
		first: 'Families',
		columns: [[PROP.category, 'Category']],
		views: [{ name: 'Categories', kind: 'category', sort: [['file.name', 'ASC']], columns: [] }],
	},
	{
		kind: 'bottle',
		name: 'Bottles',
		columns: [
			[PROP.type, 'Ingredient type'],
			[PROP.volume, 'Bottle volume (mL)'],
			[PROP.abv, 'ABV (fraction)'],
			[PROP.stockTracking, 'Stock tracking'],
			[PROP.open, 'Open bottle (mL)'],
			[PROP.unopened, 'Unopened bottles'],
			[PROP.availability, 'Availability (status mode)'],
			[PROP.lastUsed, 'Last used'],
			...purchasingColumns,
		],
		views: [
			// A bottle you own without an ABV is a gap its label fills; see docs/alcohol-estimate.md#missing-values.
			{
				name: 'Missing ABV',
				sort: [['file.name', 'ASC']],
				filter: `note[${q(PROP.abv)}] == null`,
				columns: [
					[PROP.type, 'Ingredient type'],
					[PROP.abv, 'ABV (fraction)'],
					[PROP.volume, 'Bottle volume (mL)'],
				],
				groupBy: 'formula.inStock',
			},
		],
	},
	{
		kind: 'ingredient',
		name: 'Other stock',
		columns: [
			[PROP.provides, 'Provides'],
			[PROP.form, 'Form'],
			[PROP.stockTracking, 'Stock tracking'],
			[PROP.remaining, 'Remaining volume (mL)'],
			[PROP.availability, 'Availability (status mode)'],
			[PROP.lastUsed, 'Last used'],
			...purchasingColumns,
		],
	},
	{
		kind: 'recipe',
		name: 'Recipes',
		columns: [
			['formula.rating', 'Rating'],
			['formula.drinks', 'Drinks'],
			// The stored mL, not a formula: a view sorts only on properties it shows.
			['cc-est-alcohol-ml', 'Alcohol (mL)'],
			['formula.abv', 'ABV'],
			['cc-est-basis', 'Estimate'],
			[PROP.lastMade, 'Last made'],
			[PROP.timesMade, 'Times made'],
			['created', 'Created'],
			['source', 'Source'],
		],
		views: [
			{ name: 'Latest', sort: [['note.created', 'DESC']] },
			{ name: 'Recently made', sort: [[`note.${PROP.lastMade}`, 'DESC']] },
			// Partial estimates are lower bounds, so they'd sort misleadingly low; they're left out.
			{
				name: 'Lower alcohol',
				sort: [['note.cc-est-alcohol-ml', 'ASC']],
				filter: `${ALCOHOL} != null && ${BASIS} != "partial" && ${BASIS} != "none"`,
			},
			// What keeps each estimate partial: notes without an ABV, and lines to link or fix.
			{
				name: 'Partial estimates',
				sort: [['file.name', 'ASC']],
				filter: `${BASIS} == "partial"`,
				columns: [
					['cc-est-missing', 'Missing'],
					['formula.drinks', 'Drinks'],
					['formula.rating', 'Rating'],
					[PROP.lastMade, 'Last made'],
				],
			},
		],
	},
];

export function basePath(root: string, name: string): string {
	return `${cabinetFolder(root)}/Views/${name}.base`;
}

/** The linked name, then `list` with plain properties written as `note.` ones. */
const withName = (list: readonly Column[]): Column[] => [
	['formula.name', 'Name'],
	...list.map(([property, label]): Column => [
		property.startsWith('formula.') ? property : `note.${property}`,
		label,
	]),
];

function renderBase(root: string, resource: ResourceBase, drinkGrams: number): string {
	const FORMULAS = formulas(drinkGrams);
	const columns = withName(resource.columns);
	const first: ResourceView = { name: resource.first ?? resource.name, sort: [['file.name', 'ASC']] };
	const kindOf = (kind: NoteKind) => `note[${JSON.stringify(PROP.kind)}] == ${JSON.stringify(kind)}`;
	const perView = resource.views?.some((view) => view.kind) ?? false;
	const views = [first, ...(resource.views ?? [])].map((view) => ({
		...view,
		order: view.columns ? withName(view.columns) : columns,
	}));
	// Labels belong to the whole Base, so every view's columns are listed once. A blank label on a
	// grouped formula leaves only the group's value in each heading; an empty one shows the formula's name.
	const labelled = new Map([
		...views.flatMap((view) => view.order),
		...views.flatMap((view): Column[] => (view.groupBy ? [[view.groupBy, ' ']] : [])),
	]);
	const used = Object.entries(FORMULAS).filter(([name]) =>
		views.some(
			(view) =>
				view.groupBy === `formula.${name}` || view.order.some(([property]) => property === `formula.${name}`),
		),
	);
	if (resource.kind === 'type' || resource.kind === 'ingredient') {
		const defaultView: FormulaView = {
			name: resource.name,
			type: 'table',
			filter: kindIs(resource.kind),
			columns,
		};
		const extra: FormulaView =
			resource.kind === 'type'
				? {
						name: 'Browse',
						type: 'table',
						filter: `(${kindIs('type')}) || ${kitchenStaple}`,
						columns: [
							['formula.name', 'Name'],
							['formula.have', 'Have'],
							[`note.${PROP.shoppingList}`, 'Shopping list'],
						],
						// A blank label leaves only the group name in each heading; an empty one shows the formula's name.
						groupBy: { property: 'formula.group', direction: 'ASC', label: ' ' },
					}
				: {
						name: 'Kitchen staples',
						type: 'table',
						filter: kitchenStaple,
						// Availability keeps the default view's label: labels belong to the whole Base.
						columns: [
							['formula.name', 'Name'],
							[`note.${PROP.availability}`, 'Availability (status mode)'],
							[`note.${PROP.lastUsed}`, 'Last used'],
							[`note.${PROP.shoppingList}`, 'Shopping list'],
						],
					};
		return renderFormulaBase(
			root,
			{
				...Object.fromEntries(used),
				...(resource.kind === 'type' ? browseFormulas : {}),
			},
			[defaultView, extra],
		);
	}
	return serializeBase({
		filters: {
			and: [
				`file.inFolder(${JSON.stringify(root)})`,
				'file.ext == "md"',
				...(perView ? [] : [kindOf(resource.kind)]),
			],
		},
		formulas: Object.fromEntries(used),
		properties: Object.fromEntries([...labelled].map(([property, label]) => [property, { displayName: label }])),
		views: views.map((view) => ({
			type: 'table',
			name: view.name,
			...(perView || view.filter
				? {
						filters: {
							and: [
								...(perView ? [kindOf(view.kind ?? resource.kind)] : []),
								...(view.filter ? [view.filter] : []),
							],
						},
					}
				: {}),
			// Obsidian saves groupBy between filters and order.
			...(view.groupBy ? { groupBy: { property: view.groupBy, direction: 'ASC' } } : {}),
			order: view.order.map(([property]) => viewProperty(property)),
			sort: sortEntries(view.sort),
		})),
	});
}

/** Standalone core Bases configuration, with no plugin functions or generated data. */
export function resourceBases(root: string, drinkGrams = 14): PlannedFile[] {
	root = cabinetFolder(root);
	return RESOURCE_BASES.map((resource) => ({
		path: basePath(root, resource.name),
		kind: 'base',
		content: renderBase(root, resource, drinkGrams),
	}));
}

/** Link traversal uses proper names, with filenames as a fallback for user notes. */
const displayName = (file: string) =>
	`if(${file}.properties[${q(PROP.name)}], ${file}.properties[${q(PROP.name)}], ${file}.name)`;
const browseFormulas = {
	// A subtype is grouped under its type's family.
	family: `[list(note[${q(PROP.family)}]), list(note[${q(PROP.type)}]).filter(value).map(link(value).asFile()).filter(value).map(list(value.properties[${q(PROP.family)}])).flat()].flat().filter(value).map(link(value).asFile()).filter(value)`,
	category: `formula.family.map(list(value.properties[${q(PROP.category)}])).flat().filter(value).map(link(value).asFile()).filter(value)`,
	group: `if(${kitchenStaple}, "Kitchen staples", if(formula.family.length > 0, if(formula.category.length > 0, formula.category.map(${displayName('value')}).join(", ") + " › ", "") + formula.family.map(${displayName('value')}).join(", "), "Standalone types"))`,
	sources: typeSources,
	have: `if(${kitchenStaple}, if(${stockedExpression((key) => `note[${q(key)}]`)}, [${COMMON_FORMULAS.name}], []), formula.sources.filter(${sourceStocked}).map(${linkWithName}))`,
};
