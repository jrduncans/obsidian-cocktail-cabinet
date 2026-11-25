import { linkTarget } from './ingredient-links';
import { DEFAULT_VOLUME_UNIT, lineVolumeMl, recipeVolumeMl, splitIngredient } from './recipe-amount';
import type { VolumeUnit } from './recipe-amount';

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
/**
 * Where a line's ABV came from: the named bottle; your in-stock bottles of the type or family; the
 * type's typical value; or bottles you've had, out of stock included.
 */
export type AbvSource = 'bottle' | 'stocked' | 'typical' | 'past' | 'unknown';
/** `bottles` is your in-stock bottles, `past` any bottles you've had; stored in `cc-est-basis`. */
export type Basis = 'exact' | 'bottles' | 'typical' | 'past' | 'rough' | 'partial' | 'none';

/** What the vault knows about a linked note, enough to choose its ABV. */
export interface AbvNote {
	kind: string;
	/** A bottle's `cc-abv`. */
	abv?: unknown;
	/** A type's `cc-abv-typical`. */
	abvTypical?: unknown;
	/** The `cc-abv` of your bottles of a type, or of every type in a family, in stock or not. */
	bottleAbvs?: readonly number[];
	/** The same, for bottles in stock. */
	stockedAbvs?: readonly number[];
	/** A type's subtypes' bottles in stock, used after its own: a plain bourbon line reads a plain bottle first. */
	subtypeStockedAbvs?: readonly number[];
	/** A family: its types' typical ABVs, so a family of non-alcoholic types counts as 0. */
	typeAbvs?: readonly unknown[];
	/** A bottle's type, a subtype's type, or a type's family. */
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
 * A note's ABV, stopping at the first that applies: a bottle's own ABV; for a type, the median of
 * your in-stock bottles of it (what you'd pour), then of its subtypes' in-stock bottles, its typical
 * ABV (a reference value), then the median of every bottle of it or its subtypes you've had; then the
 * subtype's type, or the family. A family has no ABV of its own, since most span
 * too wide a range: it uses the median of your in-stock bottles in it, then of every bottle in it, or
 * 0 when all its types are non-alcoholic. Other stock uses its first provided type, and a staple is 0.
 * A bottle without an ABV falls back to its type.
 */
export function noteAbv(note: AbvNote | null | undefined): { abv: number | null; source: AbvSource } {
	if (!note) return { abv: null, source: 'unknown' };
	if (note.kind === 'bottle') {
		const own = fraction(note.abv);
		return own !== null ? { abv: own, source: 'bottle' } : noteAbv(note.parent);
	}
	if (note.kind === 'type') {
		const stocked = median(note.stockedAbvs ?? []) ?? median(note.subtypeStockedAbvs ?? []);
		if (stocked !== null) return { abv: stocked, source: 'stocked' };
		const typical = fraction(note.abvTypical);
		if (typical !== null) return { abv: typical, source: 'typical' };
		const past = median(note.bottleAbvs ?? []);
		if (past !== null) return { abv: past, source: 'past' };
		return noteAbv(note.parent);
	}
	if (note.kind === 'family') {
		const stocked = median(note.stockedAbvs ?? []);
		if (stocked !== null) return { abv: stocked, source: 'stocked' };
		const past = median(note.bottleAbvs ?? []);
		if (past !== null) return { abv: past, source: 'past' };
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
/**
 * What keeps a partial estimate partial: a linked note without an ABV (its target as written), or a
 * line to fix, unlinked or with an amount that can't be read, as plain text with links shown as their text.
 */
export type Missing = { link: string } | { line: string };
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
	/** Each once, in recipe order; empty unless the basis is partial. */
	missing: Missing[];
}
export interface EstimateSettings {
	dilution: Readonly<Record<Preparation, number>>;
	topMl: number;
	/** Which stated amount wins when a line gives both oz and mL. */
	volumeUnit?: VolumeUnit;
}
export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = {
	dilution: DEFAULT_DILUTION,
	topMl: DEFAULT_TOP_ML,
	volumeUnit: DEFAULT_VOLUME_UNIT,
};

const IGNORED =
	/\b(?:rinse|rinsed|spritz|mist|garnish|garnished|peel|twist|wheel|wedge|sprig|leaf|leaves|oils?|zest|swath)\b/i;
const TOP = /\b(?:top|topped|fill|filled)\b/i;
const VOLUME_IN_TEXT = /(\d+(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+|[.,]\d+)?|\d*[¼½¾⅓⅔⅛⅜⅝⅞])\s*(ml|cl|oz|ounces?)\b/i;

/**
 * How many dashes or drops: a number, or the midpoint of a range (“2–4”). A range of dashes
 * spans about a mL, too little to call the estimate rough.
 */
function dashCount(text: string): number | null {
	const single = recipeVolumeMl(`${text} ml`);
	if (single !== null) return single;
	const range = text.match(/^(.+?)\s*[-–—]\s*(.+)$/i);
	if (!range) return null;
	const low = recipeVolumeMl(`${range[1]} ml`);
	const high = recipeVolumeMl(`${range[2]} ml`);
	return low !== null && high !== null ? (low + high) / 2 : null;
}

/** The volume a line pours, and its shape. */
function lineVolume(line: string, settings: EstimateSettings): { shape: LineShape; ml: number | null } {
	const { amount, text } = splitIngredient(line);
	const measured = amount ? lineVolumeMl(line, settings.volumeUnit) : null;
	if (measured !== null) return { shape: 'measured', ml: measured };
	const dashes = amount.match(/^(.+?)\s*(dash(?:es)?|drops?)$/i);
	if (dashes) {
		const count = dashCount(dashes[1]!);
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

/** A line as plain text: each link as its shown text, or the target's last segment. */
function plainLine(line: string): string {
	return line.replace(LINK, (_, inner: string) => {
		const bar = inner.indexOf('|');
		return bar >= 0 ? inner.slice(bar + 1) : linkTarget(inner).split('/').at(-1)!;
	});
}

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
	let past = false;
	const missing = new Map<string, Missing>();
	const miss = (item: Missing) => missing.set('link' in item ? `link:${item.link}` : `line:${item.line}`, item);
	for (const line of input.lines) {
		const targets = [...line.matchAll(LINK)].map((match) => linkTarget(match[1]!));
		const links = targets.map((target) => input.link(target));
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
			if (first && abv !== 0) {
				partial = true;
				miss({ line: plainLine(line) });
			}
			continue;
		}
		if (shape === 'top') tops += ml!;
		else pour += ml!;
		if (shape === 'range' || shape === 'top') rough = true;
		if (abv === null) {
			// A few dashes of unknown strength hold well under a mL of alcohol: too little to make the estimate partial.
			if (shape !== 'dash') {
				partial = true;
				// A link that resolves names the note to complete; otherwise the line itself needs linking.
				miss(first ? { link: targets[0]! } : { line: plainLine(line) });
			}
			continue;
		}
		alcohol += ml! * abv;
		// Non-alcoholic lines don't make an estimate less certain.
		if (abv > 0 && source === 'typical') typical = true;
		if (abv > 0 && source === 'stocked') mine = true;
		if (abv > 0 && source === 'past') past = true;
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
					: past
						? 'past'
						: typical
							? 'typical'
							: mine
								? 'bottles'
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
		missing: basis === 'partial' ? [...missing.values()] : [],
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
	past: 'from bottles you’ve had',
	rough: 'rough',
	partial: 'some ABVs or amounts unknown',
};

/** One line for the logging dialog: “≈ 1.6 drinks (28.4 mL alcohol), 18.0% ABV · typical ABVs”; empty with no estimate. */
export function estimateText(
	estimate: Estimate,
	servings: number,
	unit: keyof typeof STANDARD_DRINK_GRAMS = 'us',
): string {
	const drinks = drinksText(estimate, servings, unit);
	if (!drinks || estimate.basis === 'none' || estimate.abv === null) return '';
	const bound = estimate.basis === 'partial' ? '≥ ' : '';
	const alcohol = estimate.alcoholMl * servings;
	return `${drinks} (${alcohol.toFixed(1)} mL alcohol), ${bound}${(estimate.abv * 100).toFixed(1)}% ABV · ${BASIS_TEXT[estimate.basis]}`;
}

/** Standard drinks for the servings: “≈ 1.6 drinks”, or “≥ 1.6 drinks” for a lower bound; empty with no estimate. */
export function drinksText(
	estimate: Estimate,
	servings: number,
	unit: keyof typeof STANDARD_DRINK_GRAMS = 'us',
): string {
	if (estimate.basis === 'none' || estimate.abv === null || !(servings > 0)) return '';
	const lead = estimate.basis === 'partial' ? '≥ ' : '≈ ';
	const drinks = standardDrinks(estimate.alcoholMl * servings, unit).toFixed(1);
	const noun = unit === 'uk' ? (drinks === '1.0' ? 'unit' : 'units') : drinks === '1.0' ? 'drink' : 'drinks';
	return `${lead}${drinks} ${noun}`;
}
