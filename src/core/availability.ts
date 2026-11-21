import { fitsLine, lesserType } from './logging-lines';
import type { StockSource } from './logging-stock';
import { recipeVolumeMl, splitIngredient } from './recipe-amount';
import type { RestockThresholds } from './restock';
import { PROP } from './schema';
import type { CabinetNote } from './schema';
import { ingredientLines, isGarnish } from './unlinked-lines';

/**
 * One Ingredients line's availability, best first. See docs/availability.md.
 * `short`: volume-tracked sources hold less than one serving's pour. `substitute`: only a likely
 * substitute (a catch-all sibling or a subtype's parent bottle) is stocked, never counted as Have.
 */
export const LINE_STATES = ['have', 'low', 'substitute', 'unknown', 'short', 'missing', 'unlinked'] as const;
export type LineState = (typeof LINE_STATES)[number];

/** A recipe takes its worst non-garnish line. Short, Missing, and Not linked lines count as missing. */
export const RECIPE_STATUSES = ['can-make', 'substitute', 'check-stock', 'missing-one', 'missing-more'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export interface LineAvailability {
	text: string;
	/** Marked "Garnish:" or "to garnish": shown, but never lowers the recipe's status. */
	garnish: boolean;
	state: LineState;
	/** The line's mL for one serving, or null when unmeasured. */
	ml: number | null;
	/** Linked notes found in the cabinet. */
	targets: string[];
	/** Stocked sources that fit. */
	sources: string[];
	/** Stocked likely substitutes, when nothing that fits is stocked. */
	substitutes: string[];
	/** Fitting sources whose stock is Unknown or untracked. */
	unknown: string[];
	/** Fitting sources that are out or empty: what you'd rebuy. */
	out: string[];
	/** For `short`: the mL the fitting sources hold together. */
	heldMl?: number;
}

export interface RecipeAvailability {
	status: RecipeStatus;
	/** Non-garnish lines that are Short, Missing, or Not linked. */
	missing: number;
	lines: LineAvailability[];
}

export interface AvailabilityContext {
	notes: readonly CabinetNote[];
	/** Every bottle and other-stock note, tracked or not. */
	sources: readonly StockSource[];
	resolve: (link: string) => string | null;
	thresholds: RestockThresholds;
}

const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

type StockLevel = 'stocked' | 'low' | 'out' | 'unknown';

/** The In stock rule (Have or Low, or a positive amount), with Restock's running-low rule for Low. */
export function stockLevel(source: StockSource, thresholds: RestockThresholds): StockLevel {
	const fields = source.fields;
	if (fields[PROP.stockTracking] === 'status') {
		const availability = fields[PROP.availability];
		return availability === 'Have'
			? 'stocked'
			: availability === 'Low'
				? 'low'
				: availability === 'Out'
					? 'out'
					: 'unknown';
	}
	if (fields[PROP.stockTracking] !== 'volume') return 'unknown';
	if (source.note.kind === 'bottle') {
		const open = amount(fields[PROP.open]),
			unopened = amount(fields[PROP.unopened]),
			volume = amount(fields[PROP.volume]);
		if (!open && !unopened) return 'out';
		if (unopened) return 'stocked';
		return (volume ? open / volume <= thresholds.percent / 100 : open <= thresholds.ml) ? 'low' : 'stocked';
	}
	const remaining = amount(fields[PROP.remaining]);
	return !remaining ? 'out' : remaining <= thresholds.ml ? 'low' : 'stocked';
}

/** mL a volume-tracked source holds; Infinity when unknowable (sealed bottles of unknown size, status tracking). */
function heldMl(source: StockSource): number {
	const fields = source.fields;
	if (fields[PROP.stockTracking] !== 'volume') return Infinity;
	if (source.note.kind !== 'bottle') return amount(fields[PROP.remaining]);
	const unopened = amount(fields[PROP.unopened]),
		volume = amount(fields[PROP.volume]);
	if (unopened && !volume) return Infinity;
	return amount(fields[PROP.open]) + unopened * volume;
}

/**
 * Per-target answers for one pass over the cabinet, keyed by the sources list: a type is linked from many
 * recipes, and `fitsLine` and `lesserType` each walk the whole hierarchy.
 */
type TargetAnswer = { fits: Set<StockSource>; lesser: Set<StockSource> };
const passes = new WeakMap<readonly StockSource[], Map<string, TargetAnswer>>();

function forTarget(target: CabinetNote, context: AvailabilityContext) {
	let pass = passes.get(context.sources);
	if (!pass) passes.set(context.sources, (pass = new Map<string, TargetAnswer>()));
	let answer = pass.get(target.path);
	if (!answer) {
		const { notes, sources } = context;
		const fits = new Set(sources.filter((source) => fitsLine(notes, source.note, target)));
		const lesser = new Set(sources.filter((source) => !fits.has(source) && lesserType(notes, source.note, target)));
		pass.set(target.path, (answer = { fits, lesser }));
	}
	return answer;
}

export function resolveLine(text: string, context: AvailabilityContext): LineAvailability {
	const { notes, sources, resolve, thresholds } = context;
	const ml = recipeVolumeMl(splitIngredient(text).amount);
	const targets = [
		...new Set(
			[...text.matchAll(/\[\[([^\]]+)\]\]/g)].flatMap((match) => {
				const path = resolve(match[1]!);
				const note = notes.find((item) => item.path === path && item.kind !== 'recipe');
				return note ? [note.path] : [];
			}),
		),
	];
	const line: LineAvailability = {
		text,
		garnish: isGarnish(text),
		state: 'unlinked',
		ml,
		targets,
		sources: [],
		substitutes: [],
		unknown: [],
		out: [],
	};
	if (!targets.length) return line;
	const linked = targets.map((path) => notes.find((note) => note.path === path)!);
	const answers = linked.map((target) => forTarget(target, context));
	const fitting = sources.filter((source) => answers.some((answer) => answer.fits.has(source)));
	const levels = new Map(fitting.map((source) => [source, stockLevel(source, thresholds)]));
	const stocked = fitting.filter((source) => ['stocked', 'low'].includes(levels.get(source)!));
	line.sources = stocked.map((source) => source.note.path);
	line.unknown = fitting.filter((source) => levels.get(source) === 'unknown').map((source) => source.note.path);
	line.out = fitting.filter((source) => levels.get(source) === 'out').map((source) => source.note.path);
	if (stocked.length) {
		const held = stocked.reduce((sum, source) => sum + heldMl(source), 0);
		if (ml !== null && held < ml) return { ...line, state: 'short', heldMl: held };
		return { ...line, state: stocked.every((source) => levels.get(source) === 'low') ? 'low' : 'have' };
	}
	line.substitutes = sources
		.filter(
			(source) =>
				!fitting.includes(source) &&
				['stocked', 'low'].includes(stockLevel(source, thresholds)) &&
				answers.some((answer) => answer.lesser.has(source)),
		)
		.map((source) => source.note.path);
	return { ...line, state: line.substitutes.length ? 'substitute' : line.unknown.length ? 'unknown' : 'missing' };
}

const MISSING: readonly LineState[] = ['short', 'missing', 'unlinked'];

export function resolveRecipe(content: string, context: AvailabilityContext): RecipeAvailability {
	const lines = ingredientLines(content).map(({ text }) => resolveLine(text, context));
	const counted = lines.filter((line) => !line.garnish);
	const missing = counted.filter((line) => MISSING.includes(line.state)).length;
	const has = (state: LineState) => counted.some((line) => line.state === state);
	const status: RecipeStatus =
		missing > 1
			? 'missing-more'
			: missing === 1
				? 'missing-one'
				: // Nothing to check against: never claim it can be made.
					has('unknown') || !counted.length
					? 'check-stock'
					: has('substitute')
						? 'substitute'
						: 'can-make';
	return { status, missing, lines };
}
