import { linkTarget } from './ingredient-links';
import { recipeVolumeMl, splitIngredient } from './recipe-amount';

/**
 * The alcohol estimate for one serving of a recipe, from its ingredient lines. Pure: the vault
 * layer resolves each link to the ABV facts it needs. See docs/alcohol-estimate.md.
 */

export type Preparation = 'built' | 'stirred' | 'shaken' | 'blended';
/** Water added by chilling, as a share of the pour before dilution (BevNap's defaults). */
export const DEFAULT_DILUTION: Readonly<Record<Preparation, number>> = {
	built: 0.1,
	stirred: 0.18,
	shaken: 0.25,
	blended: 0.3,
};
/** A dash is about 1/32 oz; a drop far less. Bitters are strong, so dashes are counted. */
export const DASH_ML = 0.92;
export const DROP_ML = 0.05;
/** A “top” or “fill” with no amount is assumed to be this much (a setting). */
export const DEFAULT_TOP_ML = 60;

export type Fact = 'citrus' | 'juice' | 'dairy' | 'egg' | 'sparkling';
/** Where a line's ABV came from: a bottle, a type's or family's typical value, or your bottles of the type. */
export type AbvSource = 'bottle' | 'typical' | 'bottles' | 'unknown';
export type Basis = 'exact' | 'typical' | 'bottles' | 'rough' | 'partial' | 'none';

/** What the vault knows about a linked note, enough to choose its ABV. */
export interface AbvNote {
	kind: string;
	/** A bottle's `cc-abv`. */
	abv?: unknown;
	/** A type's `cc-abv-typical`. */
	abvTypical?: unknown;
	/** The `cc-abv` of your bottles of a type, or of every type in a family. */
	bottleAbvs?: readonly number[];
	/** A family: its types' typical ABVs, so a family of non-alcoholic types counts as 0. */
	typeAbvs?: readonly unknown[];
	/** A bottle's type, or a type's family. */
	parent?: AbvNote | null;
	/** Other stock: the types it provides, first first. */
	provides?: readonly AbvNote[];
	/** Other stock tracked as itself (salt, mint): never alcoholic. */
	staple?: boolean;
}

const fraction = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

function median(values: readonly number[]): number | null {
	const sorted = values.filter((value) => fraction(value) !== null).sort((a, b) => a - b);
	if (!sorted.length) return null;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * A note's ABV, stopping at the first that applies: a bottle's own ABV; a type's typical ABV;
 * the median of your bottles of the type; then the family. A family has no ABV of its own, since
 * most span too wide a range: it uses the median of your bottles anywhere in it, or 0 when all its
 * types are non-alcoholic. Other stock uses its first provided type, and a staple is 0. A bottle
 * without an ABV falls back to its type.
 */
export function noteAbv(note: AbvNote | null | undefined): { abv: number | null; source: AbvSource } {
	if (!note) return { abv: null, source: 'unknown' };
	if (note.kind === 'bottle') {
		const own = fraction(note.abv);
		return own !== null ? { abv: own, source: 'bottle' } : noteAbv(note.parent);
	}
	if (note.kind === 'type') {
		const typical = fraction(note.abvTypical);
		if (typical !== null) return { abv: typical, source: 'typical' };
		const mine = median(note.bottleAbvs ?? []);
		if (mine !== null) return { abv: mine, source: 'bottles' };
		return noteAbv(note.parent);
	}
	if (note.kind === 'family') {
		const mine = median(note.bottleAbvs ?? []);
		if (mine !== null) return { abv: mine, source: 'bottles' };
		const types = note.typeAbvs ?? [];
		return types.length && types.every((value) => fraction(value) === 0)
			? { abv: 0, source: 'typical' }
			: { abv: null, source: 'unknown' };
	}
	if (note.kind === 'ingredient') {
		if (note.staple) return { abv: 0, source: 'typical' };
		return noteAbv(note.provides?.[0]);
	}
	return { abv: null, source: 'unknown' };
}

/** A resolved link: its ABV and the ingredient facts it contributes. */
export interface LinkInfo {
	abv: number | null;
	source: AbvSource;
	facts: readonly Fact[];
}

export type LineShape = 'measured' | 'dash' | 'range' | 'top' | 'unmeasured' | 'ignored';
export interface LineEstimate {
	line: string;
	shape: LineShape;
	/** Volume per serving; null when unknown. */
	ml: number | null;
	abv: number | null;
	source: AbvSource;
	/** The line's links name alternatives whose ABVs differ by more than five points. */
	alternativesDiffer?: boolean;
}
export interface Estimate {
	/** mL of ethanol per serving; a lower bound when the basis is partial. */
	alcoholMl: number;
	/** ABV as served, a fraction; null with nothing to pour. */
	abv: number | null;
	/** Volume as served, after dilution. */
	volumeMl: number;
	basis: Basis;
	preparation: Preparation;
	/** How the preparation was chosen. */
	preparationFrom: 'method' | 'ingredients' | 'override';
	dilution: number;
	facts: Fact[];
	lines: LineEstimate[];
}
export interface EstimateSettings {
	dilution: Readonly<Record<Preparation, number>>;
	topMl: number;
}
export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = { dilution: DEFAULT_DILUTION, topMl: DEFAULT_TOP_ML };

const IGNORED =
	/\b(?:rinse|rinsed|spritz|mist|garnish|garnished|peel|twist|wheel|wedge|sprig|leaf|leaves|oils?|zest|swath)\b/i;
const TOP = /\b(?:top|topped|fill|filled)\b/i;
const VOLUME_IN_TEXT = /(\d+(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+|[.,]\d+)?|\d*[¼½¾⅓⅔⅛⅜⅝⅞])\s*(ml|cl|oz|ounces?)\b/i;

/** The volume a line pours, and its shape. */
function lineVolume(line: string, settings: EstimateSettings): { shape: LineShape; ml: number | null } {
	const { amount, text } = splitIngredient(line);
	const measured = amount ? recipeVolumeMl(amount) : null;
	if (measured !== null) return { shape: 'measured', ml: measured };
	const dashes = amount.match(/^(.+?)\s*(dash(?:es)?|drops?)$/i);
	if (dashes) {
		const count = recipeVolumeMl(`${dashes[1]} ml`);
		if (count !== null) return { shape: 'dash', ml: count * (/^d(?:ash)/i.test(dashes[2]!) ? DASH_ML : DROP_ML) };
	}
	const range = amount.match(/^(.+?)\s*[-–—]\s*(.+?)\s*([a-z.]+)$/i);
	if (range) {
		const low = recipeVolumeMl(`${range[1]} ${range[3]}`);
		const high = recipeVolumeMl(`${range[2]} ${range[3]}`);
		if (low !== null && high !== null) return { shape: 'range', ml: (low + high) / 2 };
	}
	const whole = `${amount} ${text}`;
	if (TOP.test(whole)) {
		const stated = whole.match(VOLUME_IN_TEXT);
		const ml = stated ? recipeVolumeMl(`${stated[1]} ${stated[2]}`) : null;
		return ml !== null ? { shape: 'measured', ml } : { shape: 'top', ml: settings.topMl };
	}
	if (IGNORED.test(whole)) return { shape: 'ignored', ml: 0 };
	return { shape: 'unmeasured', ml: null };
}

const LINK = /\[\[([^\]]+)\]\]/g;

/** The preparation the Method text names first; a flash blend is a quick spin, so it counts as shaken. */
export function methodPreparation(method: string): Preparation | null {
	const found = (
		[
			['shaken', /\bflash[-\s]?blend\w*|\bshak(?:e|en|es|ing)\b|\bwhip\w*/i],
			['stirred', /\bstir(?:s|red|ring)?\b/i],
			['blended', /\bblend(?:s|ed|er|ing)?\b/i],
			['built', /\b(?:build|builds|built)\b/i],
		] as const
	)
		.map(([preparation, pattern]) => ({ preparation, at: method.search(pattern) }))
		.filter((item) => item.at >= 0)
		.sort((a, b) => a.at - b.at);
	return found[0]?.preparation ?? null;
}

export interface EstimateInput {
	/** Ingredient lines as written, without list markers. */
	lines: readonly string[];
	method: string;
	/** A recipe's `cc-dilution`, replacing the assumed percentage. */
	dilution?: unknown;
	/** The resolved link for a target; null when it doesn't resolve. */
	link: (target: string) => LinkInfo | null;
	settings?: EstimateSettings;
}

export function estimateAlcohol(input: EstimateInput): Estimate {
	const settings = input.settings ?? DEFAULT_ESTIMATE_SETTINGS;
	const facts = new Set<Fact>();
	const lines: LineEstimate[] = [];
	let pour = 0;
	let tops = 0;
	let alcohol = 0;
	let partial = false;
	let rough = false;
	let typical = false;
	let mine = false;
	for (const line of input.lines) {
		const links = [...line.matchAll(LINK)].map((match) => input.link(linkTarget(match[1]!)));
		for (const link of links) link?.facts.forEach((fact) => facts.add(fact));
		const first = links[0];
		const abv = first?.abv ?? null;
		const source = first?.source ?? 'unknown';
		const known = links.map((link) => link?.abv).filter((value): value is number => typeof value === 'number');
		const alternativesDiffer = known.length > 1 && Math.max(...known) - Math.min(...known) > 0.05;
		const { shape, ml } = lineVolume(line, settings);
		lines.push({ line, shape, ml, abv, source, ...(alternativesDiffer ? { alternativesDiffer } : {}) });
		if (shape === 'ignored') continue;
		if (shape === 'unmeasured') {
			// An amount that can't be read only matters when it may carry alcohol.
			if (first && abv !== 0) partial = true;
			continue;
		}
		if (shape === 'top') tops += ml!;
		else pour += ml!;
		if (shape === 'range' || shape === 'top') rough = true;
		if (abv === null) {
			// A few dashes of unknown strength hold well under a mL of alcohol: too little to make the estimate partial.
			if (shape !== 'dash') partial = true;
			continue;
		}
		alcohol += ml! * abv;
		// Non-alcoholic lines don't make an estimate less certain.
		if (abv > 0 && source === 'typical') typical = true;
		if (abv > 0 && source === 'bottles') mine = true;
	}
	const override = typeof input.dilution === 'number' && input.dilution >= 0 && input.dilution <= 2;
	const named = methodPreparation(input.method);
	const preparation: Preparation =
		named ?? (['citrus', 'juice', 'dairy', 'egg'].some((fact) => facts.has(fact as Fact)) ? 'shaken' : 'stirred');
	const dilution = override ? (input.dilution as number) : settings.dilution[preparation];
	const volume = pour * (1 + dilution) + tops;
	const basis: Basis =
		pour + tops === 0
			? 'none'
			: partial
				? 'partial'
				: rough
					? 'rough'
					: mine
						? 'bottles'
						: typical
							? 'typical'
							: 'exact';
	return {
		alcoholMl: alcohol,
		abv: volume > 0 ? alcohol / volume : null,
		volumeMl: volume,
		basis,
		preparation,
		preparationFrom: override ? 'override' : named ? 'method' : 'ingredients',
		dilution,
		facts: [...facts],
		lines,
	};
}

/** Standard drinks for `alcoholMl` of ethanol: US 14 g, UK 8 g (ethanol is 0.789 g/mL). */
export const STANDARD_DRINK_GRAMS = { us: 14, uk: 8 } as const;
export function standardDrinks(alcoholMl: number, unit: keyof typeof STANDARD_DRINK_GRAMS = 'us'): number {
	return (alcoholMl * 0.789) / STANDARD_DRINK_GRAMS[unit];
}

/**
 * Ingredient facts by starter catalog ID, with the starter name as a fallback for notes without one.
 * A note's facts are those of every note in its chain: the note, its type, family, and category,
 * and for other stock the types it provides.
 */
const FACTS: Record<string, readonly Fact[]> = {
	'category/Juice': ['juice'],
	'family/Citrus Juice': ['citrus'],
	'family/Sparkling Wine': ['sparkling'],
	'family/Carbonated Mixer': ['sparkling'],
	'type/Egg White': ['egg'],
	'type/Whole Egg': ['egg'],
	'ingredient/Heavy Cream': ['dairy'],
	'ingredient/Milk': ['dairy'],
};
const FACTS_BY_NAME: Record<string, readonly Fact[]> = Object.fromEntries(
	Object.entries(FACTS).map(([id, facts]) => [
		`${id.split('/')[0]}/${id.slice(id.indexOf('/') + 1).toLowerCase()}`,
		facts,
	]),
);

/** Facts for one note in a chain, from its kind and catalog ID or name. */
export function factsOf(kind: string, catalogId: unknown, name: string): readonly Fact[] {
	if (typeof catalogId === 'string' && FACTS[catalogId]) return FACTS[catalogId];
	return FACTS_BY_NAME[`${kind}/${name.toLowerCase()}`] ?? [];
}

const BASIS_TEXT: Record<Exclude<Basis, 'none'>, string> = {
	exact: 'exact',
	typical: 'typical ABVs',
	bottles: 'from your bottles',
	rough: 'rough',
	partial: 'some ABVs or amounts unknown',
};

/** One line for the logging dialog: “≈ 1.6 drinks (28.4 mL alcohol), 18.0% ABV · typical ABVs”; empty with no estimate. */
export function estimateText(
	estimate: Estimate,
	servings: number,
	unit: keyof typeof STANDARD_DRINK_GRAMS = 'us',
): string {
	if (estimate.basis === 'none' || estimate.abv === null || !(servings > 0)) return '';
	const lead = estimate.basis === 'partial' ? '≥ ' : '≈ ';
	const bound = estimate.basis === 'partial' ? '≥ ' : '';
	const alcohol = estimate.alcoholMl * servings;
	const drinks = standardDrinks(alcohol, unit).toFixed(1);
	const noun = unit === 'uk' ? (drinks === '1.0' ? 'unit' : 'units') : drinks === '1.0' ? 'drink' : 'drinks';
	return `${lead}${drinks} ${noun} (${alcohol.toFixed(1)} mL alcohol), ${bound}${(estimate.abv * 100).toFixed(1)}% ABV · ${BASIS_TEXT[estimate.basis]}`;
}
