import { PROP } from '../core/schema';
import type { NoteKind, Properties } from '../core/schema';

/**
 * The parts of a starter note the catalog keeps current (docs/ownership.md). Each is compared by value:
 * a note whose value matches any value the catalog has ever had is untouched and updated silently;
 * anything else is the user's and offered for review. Stock, prices, and other user data never count.
 */
export const CATALOG_FIELDS = [
	'description',
	'preparation',
	'parent',
	'provides',
	'abvTypical',
	'catchAll',
	'sugarWaterRatio',
] as const;
export type CatalogField = (typeof CATALOG_FIELDS)[number];
export type FieldValue = string | number | boolean | string[] | null;
export type CatalogFields = Record<CatalogField, FieldValue>;

export const FIELD_LABELS: Record<CatalogField, string> = {
	description: 'Description',
	preparation: 'Preparation',
	parent: 'Parent',
	provides: 'Provides',
	abvTypical: 'Typical ABV',
	catchAll: 'Catch-all',
	sugarWaterRatio: 'Sugar to water ratio',
};

/** The properties each field is written to; parents depend on the note's kind and the catalog's choice. */
export const FIELD_PROPERTIES: Partial<Record<CatalogField, readonly string[]>> = {
	parent: [PROP.category, PROP.family, PROP.type],
	provides: [PROP.provides],
	abvTypical: [PROP.abvTypical],
	catchAll: [PROP.catchAll],
	sugarWaterRatio: [PROP.sugarWaterRatio],
};

/** Old catalog versions spelled IDs `type:Bourbon`. */
export function catalogKey(id: string): string {
	return id.replace(':', '/');
}

const text = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.replace(/\r\n?/g, '\n').trim();
	return trimmed || null;
};
const names = (value: unknown): string[] | null => {
	const list = (Array.isArray(value) ? value : [value]).flatMap((item) => text(item) ?? []);
	return list.length ? [...new Set(list)].sort() : null;
};
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * A type's parent is compared with its level, so moving Cognac from the Brandy family to the Brandy
 * type is a change: a subtype's parent reads `Subtype of Brandy`.
 */
const subtypeOf = (name: string | null) => (name ? `Subtype of ${name}` : null);

/** A catalog entry's fields, from any catalog version's entry shape. */
export function entryFields(entry: {
	description?: string;
	method?: string;
	parent?: string;
	parentIsType?: boolean;
	provides?: readonly string[];
	properties?: Properties;
}): CatalogFields {
	const properties = entry.properties ?? {};
	return {
		description: text(entry.description),
		preparation: text(entry.method),
		parent: entry.parentIsType ? subtypeOf(text(entry.parent)) : text(entry.parent),
		provides: names(entry.provides),
		abvTypical: number(properties[PROP.abvTypical]),
		catchAll: properties[PROP.catchAll] === true ? true : null,
		sugarWaterRatio: text(properties[PROP.sugarWaterRatio]),
	};
}

/** A link's display name: `[[Cocktails/Families/Rum|Rum]]` → Rum, `[[Rum]]` → Rum. */
function linkName(value: unknown): string | null {
	const inner = text(value)?.replace(/^\[\[/, '').replace(/\]\]$/, '');
	if (!inner) return null;
	const [target, display] = inner.split('|');
	return text(display) ?? text(target?.split('#')[0]?.split('/').at(-1));
}

/** A note's fields, read as the catalog writes them. */
export function noteFields(kind: NoteKind, properties: Properties, content: string): CatalogFields {
	const parentKeys = kind === 'family' ? [PROP.category] : kind === 'type' ? [PROP.type, PROP.family] : [PROP.type];
	const key = parentKeys.find((item) => linkName(properties[item]));
	const name = key ? linkName(properties[key]) : null;
	const parent = kind === 'type' && key === PROP.type ? subtypeOf(name) : name;
	const provides = Array.isArray(properties[PROP.provides])
		? names((properties[PROP.provides] as unknown[]).map(linkName))
		: names(linkName(properties[PROP.provides]));
	return {
		description: noteDescription(content),
		preparation: notePreparation(content),
		parent: kind === 'category' ? null : parent,
		provides,
		abvTypical: number(properties[PROP.abvTypical]),
		catchAll: properties[PROP.catchAll] === true ? true : null,
		sugarWaterRatio: text(properties[PROP.sugarWaterRatio]),
	};
}

export function sameValue(left: FieldValue, right: FieldValue): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

// Body layout, as `renderNote` writes it: `# Name`, the description, `### Preparation`, then embeds.

interface Lines {
	lines: string[];
	/** First body line, after the properties. */
	start: number;
}

function bodyLines(content: string): Lines {
	const lines = content.replace(/\r\n?/g, '\n').split('\n');
	let start = 0;
	if (lines[0] === '---') {
		const close = lines.indexOf('---', 1);
		if (close > 0) start = close + 1;
	}
	return { lines, start };
}

const isEmbed = (line: string) => line.trim().startsWith('![[');
const isHeading = (line: string) => /^#{1,6}\s/.test(line);

/** The description's line range: after the `# Name` heading, up to the next heading or embed. */
function descriptionRange({ lines, start }: Lines): [number, number] {
	let from = start;
	const title = lines.findIndex((line, index) => index >= start && /^#\s/.test(line));
	if (title >= 0) from = title + 1;
	let to = from;
	while (to < lines.length && !isHeading(lines[to]!) && !isEmbed(lines[to]!)) to++;
	return [from, to];
}

/** The `### Preparation` section's content range, or null; `heading` is the heading's line. */
function preparationRange({ lines, start }: Lines): { heading: number; from: number; to: number } | null {
	const heading = lines.findIndex((line, index) => index >= start && /^###\s+Preparation\s*$/.test(line));
	if (heading < 0) return null;
	let to = heading + 1;
	while (to < lines.length && !isHeading(lines[to]!) && !isEmbed(lines[to]!)) to++;
	return { heading, from: heading + 1, to };
}

export function noteDescription(content: string): string | null {
	const body = bodyLines(content);
	const [from, to] = descriptionRange(body);
	return text(body.lines.slice(from, to).join('\n'));
}

export function notePreparation(content: string): string | null {
	const body = bodyLines(content);
	const range = preparationRange(body);
	return range ? text(body.lines.slice(range.from, range.to).join('\n')) : null;
}

/** Blank-line padded block, or nothing for an empty value. */
const block = (value: string | null) => (value ? ['', value, ''] : ['']);

export function withDescription(content: string, description: string | null): string {
	const body = bodyLines(content);
	const [from, to] = descriptionRange(body);
	body.lines.splice(from, to - from, ...block(description));
	return body.lines.join('\n');
}

export function withPreparation(content: string, preparation: string | null): string {
	const body = bodyLines(content);
	const range = preparationRange(body);
	if (range) {
		if (preparation) body.lines.splice(range.from, range.to - range.from, ...block(preparation));
		else body.lines.splice(range.heading, range.to - range.heading);
	} else if (preparation) {
		const [, end] = descriptionRange(body);
		body.lines.splice(end, 0, '### Preparation', ...block(preparation));
	}
	return body.lines.join('\n');
}
