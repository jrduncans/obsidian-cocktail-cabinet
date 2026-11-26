import { parseYaml, stringifyYaml } from 'obsidian';
import { localDate, recipeBody } from '../core/notes';
import { noteName, parseRating, PROP } from '../core/schema';
import type { NoteDraft } from '../core/schema';

export function readRecipeDocument(content: string): { body: string; metadata: Record<string, unknown> } {
	const frontmatter = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!frontmatter) return { body: content, metadata: {} };
	let parsed: unknown;
	try {
		parsed = parseYaml(frontmatter[1]!);
	} catch {
		throw new Error('This note’s properties (YAML) can’t be read. Fix them in source mode, then try again.');
	}
	if (parsed !== null && parsed !== undefined && (typeof parsed !== 'object' || Array.isArray(parsed))) {
		throw new Error('Recipe frontmatter must contain named properties.');
	}
	return { body: content.slice(frontmatter[0].length), metadata: (parsed || {}) as Record<string, unknown> };
}

/**
 * Keep existing metadata, including nested properties, aliases, and creation date. The draft's rating
 * wins when it has one; otherwise a readable rating becomes a number, and anything else is kept as written.
 */
export function enhancedRecipeContent(original: string, draft: NoteDraft): string {
	if (draft.kind !== 'recipe' || !draft.ingredients?.length)
		throw new Error('Add at least one ingredient before saving the recipe.');
	const { metadata } = readRecipeDocument(original);
	if (metadata[PROP.kind] && metadata[PROP.kind] !== 'recipe')
		throw new Error(
			'This note already represents another cabinet resource. Select a recipe or an unclassified note.',
		);
	const name = noteName(draft.name).normalize('NFC');
	const properties: Record<string, unknown> = {
		...metadata,
		[PROP.kind]: 'recipe',
		[PROP.name]: name,
		source: draft.properties?.source ?? null,
		created: metadata.created ?? localDate(),
		rating:
			draft.properties && 'rating' in draft.properties
				? draft.properties.rating
				: (parseRating(metadata.rating) ?? metadata.rating ?? null),
	};
	// The review's tags replace saved ones; none removes the property.
	if (draft.properties && 'tags' in draft.properties) {
		const tags = draft.properties.tags;
		if (Array.isArray(tags) && tags.length) properties.tags = tags;
		else delete properties.tags;
	}
	return `---\n${stringifyYaml(properties).trimEnd()}\n---\n# ${name}\n\n${recipeBody(draft)}\n`;
}
