import { parse, stringify } from 'yaml';
import { navigationEmbeds } from '../../src/core/navigation';
import { recipeVolumeMl } from '../../src/core/recipe-amount';
import { PROP } from '../../src/core/schema';
import type { NoteKind } from '../../src/core/schema';

export interface Document {
	metadata: Record<string, unknown>;
	body: string;
}
export function singleLegacyLink(value: unknown): string | undefined {
	if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') return undefined;
	return value[0]
		.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)?.[1]
		?.split('/')
		.at(-1)
		?.replace(/\.md$/, '');
}
export function readDocument(content: string): Document {
	const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return { metadata: {}, body: content };
	const metadata: unknown = parse(match[1]!);
	if (metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata)))
		throw new Error('Frontmatter must be a property map.');
	return { metadata: (metadata ?? {}) as Record<string, unknown>, body: content.slice(match[0].length) };
}

export function writeDocument(document: Document): string {
	return `---\n${stringify(document.metadata, { lineWidth: 0 }).trimEnd()}\n---\n${document.body.trimEnd()}\n`;
}

export function bottleVolume(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value !== 'string') throw new Error('Expected a volume with units.');
	const liters = value.trim().match(/^(\d+(?:\.\d+)?)\s*L$/i);
	const result = liters ? Number(liters[1]) * 1000 : recipeVolumeMl(value);
	if (result === null || !Number.isFinite(result) || result <= 0) throw new Error('Unrecognized bottle volume.');
	return result;
}

export function numberValue(value: unknown, max = Infinity, integer = false): number | null {
	if (value === null || value === undefined || value === '') return null;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > max ||
		(integer && !Number.isInteger(value))
	) {
		throw new Error('Expected a nonnegative number within the field limits.');
	}
	return value;
}

export function bottleStock(metadata: Record<string, unknown>): Record<string, unknown> {
	const volume = bottleVolume(metadata.Volume);
	const fraction = numberValue(metadata['Remaining in Open Bottle'], 1);
	if (fraction !== null && fraction > 0 && volume === null)
		throw new Error('Positive open fraction needs a known bottle volume.');
	return {
		[PROP.stockTracking]: 'volume',
		[PROP.volume]: volume,
		[PROP.open]: fraction === null ? null : fraction === 0 ? 0 : fraction * volume!,
		[PROP.unopened]: numberValue(metadata['Unopened Bottles'], Infinity, true),
		[PROP.abv]: numberValue(metadata.ABV, 1),
		[PROP.lastPurchasePrice]: numberValue(metadata['Last Purchase Price']),
	};
}

/** Remove only recognized legacy navigation, preserving authored prose and unknown code. */
export function cleanNavigation(body: string): string {
	return body
		.replace(/^```dataviewjs[^\n]*\n([\s\S]*?)^```[^\S\n]*$/gm, (block: string, code: string) => {
			return /^\s*await dv\.view\("Cocktails\/Views\/(?:RelatedRecipes|IngredientAvailability|ChildLinks)",\s*\{\s*page:\s*dv\.current\(\)\.file\.path\s*\}\);?\s*$/.test(
				code,
			)
				? ''
				: block;
		})
		.replace(
			/^!\[\[(?:Cocktails\/)?(?:Subcategories|Types|Bottles|Ingredients|Categories)\.base(?:#[^\]]+)?\]\][^\S\n]*$/gm,
			'',
		)
		.trim();
}

export function withNavigation(body: string, root: string, kind: NoteKind): string {
	return [body.trim(), navigationEmbeds(root, kind)].filter(Boolean).join('\n\n');
}
