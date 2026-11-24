const FRACTIONS: Record<string, string> = {
	'¼': '1/4',
	'½': '1/2',
	'¾': '3/4',
	'⅓': '1/3',
	'⅔': '2/3',
	'⅛': '1/8',
	'⅜': '3/8',
	'⅝': '5/8',
	'⅞': '7/8',
};
/** A barspoon is treated as one US teaspoon; a tablespoon is three. */
const US_TEASPOON_ML = 4.92892159375;
// A fraction may use the fraction slash (⁄, U+2044), as some recipe sites write 2⁄3.
const NUMBER = '(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|\\d*[¼½¾⅓⅔⅛⅜⅝⅞]|(?:\\d+(?:[.,]\\d+)?|[.,]\\d+))';
const UNIT =
	'(?:fl\\.?\\s*oz\\.?|oz\\.?|ounces?|ml|millilit(?:er|re)s?|cl|centilit(?:er|re)s?|dash(?:es)?|drops?|barspoons?|teaspoons?|tablespoons?|tsp\\.?|tbsp\\.?|parts?|sprigs?|leaf|leaves|slices?|wedges?|pieces?)';
const PREFIX = new RegExp(`^(${NUMBER}(?:\\s*[-–—]\\s*${NUMBER})?\\s*${UNIT}(?:\\s*\\([^)]*\\))?)\\s+(.+)$`, 'i');

/** An echoed volume some sources add after the amount, as in "1 oz. / 30 ml." or "1 oz · 30 ml". */
const ECHO = /^([/·]\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|oz)\.?)\s+(.+)$/i;

/** Split an echoed volume off the start of an ingredient's text: `· 30 ml pineapple rum` → its lead and wording. */
export function splitEcho(text: string): { lead: string; wording: string } {
	const match = text.trim().match(ECHO);
	return match ? { lead: match[1]!, wording: match[2]!.trim() } : { lead: '', wording: text.trim() };
}

/** Separate familiar leading amounts without rewriting the source text. */
export function splitIngredient(line: string): { amount: string; text: string } {
	const match = line.trim().match(PREFIX) ?? line.trim().match(/^(pinch of)\s+(.+)$/i);
	return match ? { amount: match[1]!, text: match[2]! } : { amount: '', text: line.trim() };
}

/** A saved line's amount and wording, with an echoed volume ("· 45 ml") kept with the amount. */
export function splitSavedLine(line: string): { amount: string; text: string } {
	const { amount, text } = splitIngredient(line);
	if (!amount) return { amount, text };
	const { lead, wording } = splitEcho(text);
	return lead ? { amount: `${amount} ${lead}`, text: wording } : { amount, text };
}

/** Which stated amount wins when a recipe gives both US fluid ounces and mL. */
export type VolumeUnit = 'oz' | 'ml';
export const DEFAULT_VOLUME_UNIT: VolumeUnit = 'oz';

/**
 * The mL an ingredient line pours, from its amount and any echoed volume after it: `1 oz (30 ml) gin`,
 * `30 ml (1 oz) gin`, `1 oz. / 30 ml. gin`, and `1 oz · 30 ml gin` all read the same, by `prefer`.
 */
export function lineVolumeMl(line: string, prefer: VolumeUnit = DEFAULT_VOLUME_UNIT): number | null {
	const { amount, text } = splitIngredient(line);
	if (!amount) return null;
	const stated = recipeVolumeMl(amount, prefer);
	const { lead } = splitEcho(text);
	if (!lead || /[()]/.test(amount)) return stated;
	const echoed = lead.replace(/^[/·]\s*/, '').replace(/\.$/, '');
	return recipeVolumeMl(`${amount} (${echoed})`, prefer) ?? stated;
}

/**
 * Interpret a precise volume (barspoons and teaspoons count as 1 US teaspoon, tablespoons as 3). For a
 * parenthetical pair of US fluid ounces and mL, `prefer` picks which stated amount wins, in either order.
 */
export function recipeVolumeMl(amount: string, prefer: VolumeUnit = DEFAULT_VOLUME_UNIT): number | null {
	const normalized = amount
		.replace(/⁄/g, '/')
		.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (character) => ` ${FRACTIONS[character]}`)
		.trim();
	const explicit = normalized.match(
		new RegExp(
			`^(${NUMBER})\\s*(?:barspoons?|teaspoons?|tablespoons?|tsp\\.?|tbsp\\.?|dash(?:es)?|drops?)\\s*\\(([^()]+)\\)$`,
			'i',
		),
	);
	if (explicit) return recipeVolumeMl(`${explicit[1]} ml`) === null ? null : recipeVolumeMl(explicit[2]!);
	const equivalent = normalized.match(/^([^()]+)\s*\(([^()]+)\)$/);
	if (equivalent) {
		const primary = recipeVolumeMl(equivalent[1]!.trim());
		const secondary = recipeVolumeMl(equivalent[2]!.trim());
		const isMl = (value: string) => /(?:ml|millilit(?:er|re)s?)$/i.test(value.trim());
		const isOz = (value: string) => /(?:oz\.?|ounces?)$/i.test(value.trim());
		const [first, second] = [equivalent[1]!, equivalent[2]!];
		if (primary !== null && secondary !== null && isMl(first) !== isMl(second)) {
			if (isOz(first) || isOz(second)) return isMl(first) === (prefer === 'ml') ? primary : secondary;
			return isMl(first) ? primary : secondary;
		}
	}
	const match = normalized.match(
		/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[.,]\d+)\s*(ml|millilit(?:er|re)s?|cl|centilit(?:er|re)s?|(?:fl\.?\s*)?oz\.?|ounces?|barspoons?|teaspoons?|tsp\.?|tablespoons?|tbsp\.?)$/i,
	);
	if (!match) return null;
	const parts = match[1]!.replace(',', '.').split(/\s*\/\s*/);
	const numerator = parts[0]!.trim().split(/\s+/).map(Number);
	const quantity =
		parts.length === 1
			? numerator[0]!
			: (numerator.length === 2 ? numerator[0]! : 0) + numerator.at(-1)! / Number(parts[1]);
	const unit = match[2]!.toLowerCase();
	const ml =
		quantity *
		(unit.startsWith('m')
			? 1
			: unit.startsWith('c')
				? 10
				: /^t(?:b|abl)/.test(unit)
					? 3 * US_TEASPOON_ML
					: /^(?:b|t)/.test(unit)
						? US_TEASPOON_ML
						: 29.5735295625);
	return Number.isFinite(ml) && ml > 0 ? ml : null;
}

/** The fraction characters amounts are written with: ⅛, ¼, ⅓, ½, ⅔, and ¾. */
const FRACTION_CHARACTERS: Record<string, string> = {
	'1/8': '⅛',
	'1/4': '¼',
	'1/3': '⅓',
	'1/2': '½',
	'2/3': '⅔',
	'3/4': '¾',
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A quantity as a whole number and a fraction character, or null when it has no exact one. */
function fractionText(numerator: number, denominator: number): string | null {
	if (!denominator || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null;
	const whole = Math.floor(numerator / denominator);
	const rest = numerator - whole * denominator;
	if (!rest) return String(whole);
	const divisor = gcd(rest, denominator);
	const character = FRACTION_CHARACTERS[`${rest / divisor}/${denominator / divisor}`];
	return character ? `${whole || ''}${character}` : null;
}

/** The quantity a written number stands for, as a fraction; null when it isn't one this rewrites. */
function writtenQuantity(number: string): [number, number] | null {
	const text = number.replace(/⁄/g, '/').trim();
	const character = text.match(/^(\d*)\s*([¼½¾⅓⅔⅛])$/);
	if (character) {
		const [top, bottom] = FRACTIONS[character[2]!]!.split('/').map(Number) as [number, number];
		return [Number(character[1] || 0) * bottom + top, bottom];
	}
	const mixed = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
	if (mixed) {
		const bottom = Number(mixed[3]);
		return [Number(mixed[1] || 0) * bottom + Number(mixed[2]), bottom];
	}
	const decimal = text.match(/^(\d*)\.(\d{1,3})$/);
	if (decimal) {
		const bottom = 10 ** decimal[2]!.length;
		return [Number(decimal[1] || 0) * bottom + Number(decimal[2]), bottom];
	}
	return null;
}

const OUNCE_AMOUNT = new RegExp(
	`^(\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|\\d*\\s*[¼½¾⅓⅔⅛]|\\d*\\.\\d+)(\\s*)((?:fl\\.?\\s*)?oz\\.?|ounces?)(?![\\p{L}])(.*)$`,
	'iu',
);

/**
 * A fluid-ounce amount with its number written in fraction characters (docs/link-text.md#fractions):
 * `1 1/2 oz`, `1 ½ oz`, and `1.5 oz` become `1½ oz`, and `.75 oz` becomes `¾ oz`. The unit's spelling and
 * anything after it, such as an echoed volume, stay as written. Ranges, other units, and numbers with no
 * exact fraction character (`1.3 oz`, `3/8 oz`) are returned unchanged.
 */
export function fractionAmount(amount: string): string {
	const match = amount.match(OUNCE_AMOUNT);
	if (!match) return amount;
	const [, number, space, unit, rest] = match as unknown as [string, string, string, string, string];
	if (/^\s*[-–—]|^\s*to\b/i.test(rest)) return amount;
	const quantity = writtenQuantity(number);
	const text = quantity && fractionText(...quantity);
	if (!text || text === '0') return amount;
	return `${text}${space || ' '}${unit}${rest}`;
}
