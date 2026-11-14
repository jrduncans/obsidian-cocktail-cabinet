import { navigationEmbeds } from './navigation';
import { fileName, noteName, notePath, PROP } from './schema';
import type { NoteDraft, PlannedFile, Properties } from './schema';

// JSON scalar/array values are valid YAML and keep user text out of YAML syntax.
export function markdown(properties: Properties, body: string): string {
	return `---\n${Object.entries(properties)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join('\n')}\n---\n${body.trim()}\n`;
}

export function renderNote(root: string, draft: NoteDraft, date: string): PlannedFile {
	const name = noteName(draft.name).normalize('NFC');
	const properties: Properties = { ...draft.properties, [PROP.kind]: draft.kind, [PROP.name]: name };
	if (draft.kind === 'bottle' && properties[PROP.type] !== undefined && typeof properties[PROP.type] !== 'string') {
		throw new Error('Select one ingredient type for a bottle, or leave it unclassified.');
	}
	for (const [kind, key, label] of [
		['type', PROP.family, 'family'],
		['family', PROP.category, 'category'],
	] as const) {
		if (draft.kind === kind && properties[key] !== undefined && typeof properties[key] !== 'string') {
			throw new Error(`Select one ingredient ${label}, or leave it out.`);
		}
	}
	if (fileName(name) !== name) {
		const aliases = properties.aliases;
		properties.aliases = [
			...new Set([...(Array.isArray(aliases) ? aliases : typeof aliases === 'string' ? [aliases] : []), name]),
		];
	}
	let body = draft.description.trim();
	if (draft.kind === 'recipe') {
		properties.created = date;
		properties.rating ??= null;
		properties.source ??= null;
		if (properties.tags === null || (Array.isArray(properties.tags) && !properties.tags.length))
			delete properties.tags;
		body = recipeBody(draft);
	} else if (draft.method?.trim()) {
		body += `\n\n### Preparation\n\n${draft.method.trim()}`;
	}
	const embeds = navigationEmbeds(root, draft.kind, draft.hasSubtypes);
	if (embeds) body = `${body.trim()}\n\n${embeds}`;
	return {
		path: notePath(root, draft.kind, name),
		content: markdown(properties, `# ${name}\n\n${body}`),
		kind: draft.kind,
	};
}

export function recipeBody(draft: NoteDraft): string {
	return (
		`### Ingredients\n\n${draft.ingredients?.map((line) => `- ${line}`).join('\n') || '- '}` +
		`\n\n### Method\n\n${draft.method?.trim() || ''}` +
		`\n\n### Description\n\n${draft.description.trim()}` +
		// Tasting Notes aren't a form field; a section is written only to keep text a source or note had.
		(draft.tastingNotes?.trim() ? `\n\n### Tasting Notes\n\n${draft.tastingNotes.trim()}` : '')
	);
}

export function localDate(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ingredientSection(content: string): string {
	return content.match(/^#{1,6}\s+Ingredients\s*\r?\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im)?.[1] || '';
}
