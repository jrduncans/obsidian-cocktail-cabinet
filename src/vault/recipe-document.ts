import { parseYaml, stringifyYaml } from 'obsidian';
import { localDate, recipeBody } from '../core/notes';
import { noteName, parseRating, PROP } from '../core/schema';
import type { NoteDraft } from '../core/schema';

export function readRecipeDocument(content: string): { body: string; metadata: Record<string, unknown> } {
	const frontmatter = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!frontmatter) return { body: content, metadata: {} };
	const parsed: unknown = parseYaml(frontmatter[1]!);
	if (parsed !== null && parsed !== undefined && (typeof parsed !== 'object' || Array.isArray(parsed))) {
		throw new Error('Recipe frontmatter must contain named properties.');
	}
	return { body: content.slice(frontmatter[0].length), metadata: (parsed || {}) as Record<string, unknown> };
}

/** Keep existing metadata, including nested properties, aliases, and creation date. A readable rating becomes a number; anything else is kept as written. */
export function enhancedRecipeContent(original: string, draft: NoteDraft): string {
	if (draft.kind !== 'recipe' || !draft.ingredients?.length) throw new Error('Add at least one ingredient before saving the recipe.');
	const { metadata } = readRecipeDocument(original);
	if (metadata[PROP.kind] && metadata[PROP.kind] !== 'recipe') throw new Error('This note already represents another cabinet resource. Select a recipe or an unclassified note.');
	const name = noteName(draft.name).normalize('NFC');
	const properties = {
		...metadata, [PROP.kind]: 'recipe', [PROP.name]: name,
		source: draft.properties?.source ?? null,
		created: metadata.created ?? localDate(), rating: parseRating(metadata.rating) ?? metadata.rating ?? null,
	};
	return `---\n${stringifyYaml(properties).trimEnd()}\n---\n# ${name}\n\n${recipeBody(draft)}\n`;
}
