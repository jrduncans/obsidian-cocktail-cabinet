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
const NUMBER = '(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*[¼½¾⅓⅔⅛⅜⅝⅞]|(?:\\d+(?:[.,]\\d+)?|[.,]\\d+))';
const UNIT =
	'(?:fl\\.?\\s*oz\\.?|oz\\.?|ounces?|ml|millilit(?:er|re)s?|cl|centilit(?:er|re)s?|dash(?:es)?|drops?|barspoons?|teaspoons?|tablespoons?|tsp\\.?|tbsp\\.?|parts?|sprigs?|leaf|leaves|slices?|wedges?|pieces?)';
const PREFIX = new RegExp(`^(${NUMBER}(?:\\s*[-–—]\\s*${NUMBER})?\\s*${UNIT}(?:\\s*\\([^)]*\\))?)\\s+(.+)$`, 'i');

/** Separate familiar leading amounts without rewriting the source text. */
export function splitIngredient(line: string): { amount: string; text: string } {
	const match = line.trim().match(PREFIX) ?? line.trim().match(/^(pinch of)\s+(.+)$/i);
	return match ? { amount: match[1]!, text: match[2]! } : { amount: '', text: line.trim() };
}

/** Interpret a precise volume (barspoons and teaspoons count as 1 US teaspoon, tablespoons as 3); for parenthetical volume equivalents prefer the stated mL. */
export function recipeVolumeMl(amount: string): number | null {
	const normalized = amount.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (character) => ` ${FRACTIONS[character]}`).trim();
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
		if (primary !== null && secondary !== null && isMl(equivalent[1]!) !== isMl(equivalent[2]!)) {
			return isMl(equivalent[1]!) ? primary : secondary;
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
