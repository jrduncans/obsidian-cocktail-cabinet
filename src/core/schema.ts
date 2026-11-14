export const KINDS = ['category', 'family', 'type', 'bottle', 'ingredient', 'recipe'] as const;
export type NoteKind = (typeof KINDS)[number];
export type PropertyValue = string | number | boolean | null | string[];
export type Properties = Record<string, PropertyValue>;

export const FOLDERS: Record<NoteKind, string> = {
	category: 'Categories',
	family: 'Families',
	type: 'Types',
	bottle: 'Bottles',
	ingredient: 'Ingredients',
	recipe: 'Recipes',
};

export const PROP = {
	kind: 'cc-kind',
	name: 'cc-name',
	category: 'cc-category',
	family: 'cc-family',
	type: 'cc-type',
	provides: 'cc-provides',
	catalogId: 'cc-catalog-id',
	volume: 'cc-volume-ml',
	abv: 'cc-abv',
	/** Types: a representative ABV (a fraction) for recipes that name the type, not a bottle. */
	abvTypical: 'cc-abv-typical',
	stockTracking: 'cc-stock-tracking',
	open: 'cc-open-ml',
	unopened: 'cc-unopened',
	remaining: 'cc-remaining-ml',
	availability: 'cc-availability',
	form: 'cc-form',
	lastPurchasePrice: 'cc-last-purchase-price',
	shoppingList: 'cc-shopping-list',
	/** Types: a grouping whose bottles aren't assumed to replace each other (Amaro, Specialty Bitters). */
	catchAll: 'cc-catch-all',
	/** Bottles and other stock: date last recorded as bought (Record purchases, Bought more). */
	lastPurchased: 'cc-last-purchased',
	/** Bottles and other stock: date last selected when logging a cocktail. */
	lastUsed: 'cc-last-used',
	/** Recipes: date last logged, and how many times. */
	lastMade: 'cc-last-made',
	timesMade: 'cc-times-made',
	/** Recipes: the notes linked from the Ingredients section, kept in step by the plugin for the Recipes sections. */
	ingredients: 'cc-ingredients',
	sugarWaterRatio: 'cc-sugar-water-ratio',
	schemaVersion: 'cc-schema-version',
} as const;

export interface CabinetNote {
	path: string;
	name: string;
	kind: NoteKind;
	parents: string[];
	aliases?: string[];
	/** Types only: `cc-catch-all` is true. */
	catchAll?: boolean;
}

export interface NoteDraft {
	kind: NoteKind;
	name: string;
	description: string;
	properties?: Properties;
	method?: string;
	ingredients?: string[];
	tastingNotes?: string;
	/** A type with subtypes: its note lists them in a Subtypes section. */
	hasSubtypes?: boolean;
}

export interface PlannedFile {
	path: string;
	content: string;
	kind: NoteKind | 'cabinet' | 'shopping' | 'base';
	catalogId?: string;
	/** Starter example: created only with a new cabinet home, never restored once deleted. */
	example?: boolean;
}

/** Root-independent FNV-1a fingerprint of generated content, so versions match across cabinet folders. */
export function contentFingerprint(content: string, root: string): string {
	const text = content.replace(/\r\n/g, '\n').split(root).join('{root}');
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `${text.length}-${hash.toString(16).padStart(8, '0')}`;
}

export function cabinetFolder(value: string): string {
	const path = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
	if (!path || path.startsWith('/') || path.split('/').some((part) => !part || part.startsWith('.'))) {
		throw new Error('Choose a folder inside the vault, without hidden folders or special characters.');
	}
	for (const part of path.split('/')) safeSegment(noteName(part));
	return path;
}

/**
 * A proper name, shown in `cc-name`, headings, and link display text. It may contain `#`,
 * periods, and ratio colons (Tuxedo #2, Maison Rouge Cognac V.S., Simple Syrup (2:1));
 * `fileName` derives a safe filename from it.
 */
export function noteName(value: string): string {
	const name = value.trim();
	if (
		!name ||
		/[/\\*?"<>|[\]^]/.test(name) ||
		Array.from(name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	) {
		throw new Error('Enter a name without slashes, colons, brackets, or other special characters.');
	}
	return name;
}

export function notePath(root: string, kind: NoteKind, name: string): string {
	return `${cabinetFolder(root)}/${FOLDERS[kind]}/${fileName(name)}.md`;
}

/**
 * Plain Latin filename derived from a proper name, by rule rather than per-note exceptions:
 * diacritics are removed and ligatures transliterated (ø → oe, as in Scandinavian usage),
 * `#2` becomes `No 2`, a ratio is spelled out (2:1 → 2 to 1), and a trailing initialism
 * loses its periods (V.S. → VS).
 */
export function fileName(value: string): string {
	const replacements: Record<string, string> = {
		Æ: 'AE',
		æ: 'ae',
		Œ: 'OE',
		œ: 'oe',
		Ø: 'Oe',
		ø: 'oe',
		Ð: 'D',
		ð: 'd',
		Þ: 'Th',
		þ: 'th',
		Ł: 'L',
		ł: 'l',
		Đ: 'D',
		đ: 'd',
		ß: 'ss',
		ı: 'i',
		'‘': "'",
		'’': "'",
		'–': '-',
		'—': '-',
	};
	const name = noteName(value)
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[ÆæŒœØøÐðÞþŁłĐđßı‘’–—]/g, (character) => replacements[character] || character)
		.replace(/#\s*(?=\d)/g, 'No ')
		.replace(/(\d)\s*:\s*(\d)/g, '$1 to $2')
		.replace(/(?:\b[A-Za-z]\.){2,}$/, (initialism) => initialism.replace(/\./g, ''));
	if (Array.from(name).some((character) => character.charCodeAt(0) > 126)) {
		throw new Error('Use a name that can be written with plain Latin characters for the filename.');
	}
	return safeSegment(name);
}

/** A file or folder name that is valid on every platform and can't alter wiki-link syntax. */
function safeSegment(name: string): string {
	if (/[#:]/.test(name) || name.startsWith('.') || name.endsWith('.')) {
		throw new Error('Enter a name without slashes, colons, brackets, or other special characters.');
	}
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
		throw new Error('Choose a name that is valid on all supported platforms.');
	}
	return name;
}

export function wikiLink(path: string, displayName?: string): string {
	if (displayName !== undefined && (!displayName.trim() || /[|[\]\r\n]/.test(displayName))) {
		throw new Error('The displayed name must be a single line without brackets or a vertical bar.');
	}
	return `[[${path.replace(/\.md$/, '')}${displayName === undefined ? '' : `|${displayName.trim()}`}]]`;
}

export function optionalNumber(
	value: string,
	label: string,
	min: number,
	max = Infinity,
	integer = false,
): number | null {
	if (!value.trim()) return null;
	const number = Number(value);
	if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
		throw new Error(
			`${label} must be ${integer ? 'a whole number' : 'a number'} ${max === Infinity ? `of at least ${min}` : `between ${min} and ${max}`}.`,
		);
	}
	return number;
}

export const RATING_MAX = 5;

/**
 * Recipe ratings are whole numbers from 1 to 5. Accepts that number, a numeric string,
 * or a run of star emoji (the older vault convention). Returns undefined when the value
 * is present but cannot be read, so callers can decide whether to keep it.
 */
export function parseRating(value: unknown): number | null | undefined {
	if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
	let number: number | undefined;
	if (typeof value === 'number') number = value;
	else if (typeof value === 'string') {
		const text = value.trim();
		if (/^\d+$/.test(text)) number = Number(text);
		else if (/^(?:⭐️?\s*)+$/u.test(text)) number = [...text.matchAll(/⭐/gu)].length;
	}
	return number !== undefined && Number.isInteger(number) && number >= 1 && number <= RATING_MAX ? number : undefined;
}
