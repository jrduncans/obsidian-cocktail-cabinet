export const KINDS = ['category', 'family', 'type', 'bottle', 'ingredient', 'recipe'] as const;
export type NoteKind = typeof KINDS[number];
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
	stockTracking: 'cc-stock-tracking',
	open: 'cc-open-ml',
	unopened: 'cc-unopened',
	remaining: 'cc-remaining-ml',
	availability: 'cc-availability',
	form: 'cc-form',
	lastPurchasePrice: 'cc-last-purchase-price',
	shoppingList: 'cc-shopping-list',
	sugarWaterRatio: 'cc-sugar-water-ratio',
	schemaVersion: 'cc-schema-version',
} as const;

export interface CabinetNote {
	path: string;
	name: string;
	kind: NoteKind;
	parents: string[];
	aliases?: string[];
}

export interface NoteDraft {
	kind: NoteKind;
	name: string;
	description: string;
	properties?: Properties;
	method?: string;
	ingredients?: string[];
	tastingNotes?: string;
}

export interface PlannedFile {
	path: string;
	content: string;
	kind: NoteKind | 'cabinet' | 'shopping' | 'base';
	catalogId?: string;
	/**
	 * Plugin-managed file: fingerprints of earlier generated versions (see `managedFingerprint`).
	 * Setup replaces a file that still matches one; any other content is the user's and is kept.
	 */
	managed?: readonly string[];
}

/** Root-independent FNV-1a fingerprint of generated content, so versions match across cabinet folders. */
export function managedFingerprint(content: string, root: string): string {
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
	if (!path || path.startsWith('/') || path.split('/').some(part => !part || part.startsWith('.'))) {
		throw new Error('Choose a folder inside the vault, without hidden folders or special characters.');
	}
	for (const part of path.split('/')) noteName(part);
	return path;
}

export function noteName(value: string): string {
	const name = value.trim();
	if (!name || name.startsWith('.') || name.endsWith('.') || /[/\\:*?"<>|#[\]^]/.test(name)
		|| Array.from(name).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
		throw new Error('Enter a name without slashes, colons, brackets, or other special characters.');
	}
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
		throw new Error('Choose a name that is valid on all supported platforms.');
	}
	return name;
}

export function notePath(root: string, kind: NoteKind, name: string): string {
	return `${cabinetFolder(root)}/${FOLDERS[kind]}/${fileName(name)}.md`;
}

/** Fold Latin diacritics for filenames while retaining the entered name separately. */
export function fileName(value: string): string {
	const replacements: Record<string, string> = {
		Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', Ø: 'O', ø: 'o', Ð: 'D', ð: 'd',
		Þ: 'Th', þ: 'th', Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ß: 'ss', ı: 'i',
		'‘': "'", '’': "'", '–': '-', '—': '-',
	};
	const name = noteName(value).normalize('NFKD').replace(/\p{M}/gu, '')
		.replace(/[ÆæŒœØøÐðÞþŁłĐđßı‘’–—]/g, character => replacements[character] || character);
	if (Array.from(name).some(character => character.charCodeAt(0) > 126)) {
		throw new Error('Use a name that can be written with plain Latin characters for the filename.');
	}
	return noteName(name);
}

export function wikiLink(path: string, displayName?: string): string {
	if (displayName !== undefined && (!displayName.trim() || /[|[\]\r\n]/.test(displayName))) {
		throw new Error('The displayed name must be a single line without brackets or a vertical bar.');
	}
	return `[[${path.replace(/\.md$/, '')}${displayName === undefined ? '' : `|${displayName.trim()}`}]]`;
}

export function optionalNumber(value: string, label: string, min: number, max = Infinity, integer = false): number | null {
	if (!value.trim()) return null;
	const number = Number(value);
	if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
		throw new Error(`${label} must be ${integer ? 'a whole number' : 'a number'} ${max === Infinity ? `of at least ${min}` : `between ${min} and ${max}`}.`);
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
