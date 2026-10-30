import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import type { PlannedFile } from './schema';

export function starterPlan(folder: string, paths: ReadonlyMap<string, string> = new Map()): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map(entry => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name), catalogId: entry.id,
	}));
	const sections = [
		{ heading: 'Categories', entries: STARTER_CATALOG.filter(entry => entry.kind === 'category') },
		{ heading: 'Families without a category', entries: STARTER_CATALOG.filter(entry => entry.kind === 'family' && !entry.parent) },
		{ heading: 'Types without a family', entries: STARTER_CATALOG.filter(entry => entry.kind === 'type' && !entry.parent) },
	].filter(section => section.entries.length).map(section =>
		`### ${section.heading}\n\n${section.entries.map(entry => `- ${wikiLink(paths.get(entry.id) || notePath(root, entry.kind, entry.name), entry.name)}`).join('\n')}`).join('\n\n');
	return [...files, {
		path: `${root}/Cocktail Cabinet.md`, kind: 'cabinet',
		content: markdown({ [PROP.kind]: 'cabinet', [PROP.name]: 'Cocktail Cabinet', 'cocktail-schema-version': 1 },
			`# Cocktail Cabinet\n\nUse **Cocktail Cabinet: Open cabinet** from the command palette or select the glass icon to browse and add notes.\n\n`
			+ `## Ingredients\n\nBrowse **All ingredient types** in **Open cabinet** to find every type, with or without a family. Families and categories are optional navigation shortcuts.\n\n${sections}\n\n`
			+ `## Your collection\n\nThe starter catalog describes ingredients. Add bottles and other stock to record what you have, and create your own cocktail recipes.\n\n`
			+ `Edit notes and their properties normally in Obsidian. From an ingredient note, use **Cocktail Cabinet: Browse related recipes** to find recipes that reference it or ingredients beneath it.\n\n`
			+ `Setup adds missing starter pages and preserves existing pages. No cocktail recipes or owned stock are supplied. Browsing works without Dataview or Bases.`),
	}];
}

export interface SetupPreview {
	root: string;
	create: PlannedFile[];
	keep: string[];
	conflicts: string[];
}
