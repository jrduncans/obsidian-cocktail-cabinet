import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import { basePath, resourceBases } from './bases';
import type { PlannedFile } from './schema';

export function starterPlan(folder: string, paths: ReadonlyMap<string, string> = new Map()): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map(entry => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name),
		catalogId: entry.id,
	}));
	return [...files, ...resourceBases(root), cabinetHome(root)];
}

function cabinetHome(root: string): PlannedFile {
	const viewLink = (name: string) => wikiLink(basePath(root, name), name);
	const properties = {
		[PROP.kind]: 'cabinet',
		[PROP.name]: 'Cocktail Cabinet',
		[PROP.schemaVersion]: 1,
	};
	return {
		path: `${root}/Cocktail Cabinet.md`,
		kind: 'cabinet',
		content: markdown(properties, `# Cocktail Cabinet

Your bottles, ingredients, and cocktail recipes in one place. Start with one bottle or a favorite recipe and build your cabinet gradually.

Open Obsidian’s command palette and search for **Cocktail Cabinet** to find the commands below.

## Your collection

### Bottles

${viewLink('Bottles')} records your bottles and their stock. Use **Cocktail Cabinet: Add a bottle**, enter its name, and select its ingredient type, if known.

### Other stock

${viewLink('Other stock')} records fresh ingredients, juice, syrups, and other sources. Use **Cocktail Cabinet: Add other stock** and select the ingredient types the source provides.

An ingredient type describes what a recipe calls for, such as lime juice. Stock records your source of it, such as fresh limes or prepared juice. Ingredient definitions alone don’t mean you have anything in stock.

### Recipes

${viewLink('Recipes')} holds the cocktails you want to keep. Use **Cocktail Cabinet: Create a cocktail recipe** to save amounts and a method. Ingredients can name a type, a broader family such as rum, or a specific bottle.

To find recipes related to an ingredient or bottle, open that note and run **Cocktail Cabinet: Browse related recipes**.

## Ingredient catalog

### Types

${viewLink('Ingredient types')} contains ingredient definitions and preparation notes. Every type appears here, including those without a family. Use **Cocktail Cabinet: Add ingredient type** if something you need is missing, or **New type** while creating a recipe.

### Families

${viewLink('Ingredient families')} groups types when a shared recipe reference or grouping is useful, such as Rum. Types can stand alone. Use **Cocktail Cabinet: Add ingredient family** to create a grouping.

### Categories

${viewLink('Ingredient categories')} groups families into broader classifications, such as Spirit. Families can stand alone too. Use **Cocktail Cabinet: Add ingredient category** when a broader grouping helps.

## Make it yours

Open a linked view to browse your current notes, edit properties, or customize filters, sorting, and columns. Enable **Bases** in **Settings → Core plugins** to use these views.

Edit this page, ingredient notes, and views to suit your cabinet. Setup preserves existing files when you run it again.

Your notes, links, and properties remain usable with Cocktail Cabinet disabled. The views need only Obsidian’s core Bases plugin.`),
	};
}

export interface SetupPreview {
	root: string;
	create: PlannedFile[];
	keep: string[];
	conflicts: string[];
}
