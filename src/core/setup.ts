import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import { basePath, resourceBases } from './bases';
import type { PlannedFile } from './schema';

export function starterPlan(folder: string, paths: ReadonlyMap<string, string> = new Map()): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map(entry => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name), catalogId: entry.id,
	}));
	const viewLink = (name: string) => wikiLink(basePath(root, name), name);
	const embed = (name: string) => `!${wikiLink(basePath(root, name))}`;
	return [...files, ...resourceBases(root), {
		path: `${root}/Cocktail Cabinet.md`, kind: 'cabinet',
		content: markdown({ [PROP.kind]: 'cabinet', [PROP.name]: 'Cocktail Cabinet', [PROP.schemaVersion]: 1 },
`# Cocktail Cabinet

Your bottles, ingredients, and cocktail recipes in one place. The ingredient catalog provides a starting reference; your collection grows as you add what you have and the recipes you want to keep.

## Start here

Open Obsidian’s command palette and search for **Cocktail Cabinet**. Start with one bottle or a favorite recipe—you can build the rest gradually.

- **Cocktail Cabinet: Add a bottle** — name a bottling you own and select its ingredient type, such as rye whiskey. Enter the stock you have; leave amounts blank when you don’t know them.
- **Cocktail Cabinet: Add other stock** — record fresh ingredients, juice, or homemade and purchased syrups. Select the ingredient types they provide and their availability.
- **Cocktail Cabinet: Create a cocktail recipe** — save a recipe with its amounts and method. Select ingredient links as you go; you can name a type, a broader family such as rum, or a specific bottle.

An ingredient type describes what a recipe calls for, such as lime juice. Other stock records your source of it, such as fresh limes or prepared juice.

## Your collection

These tables update as you add or edit notes. Select a note link to open it, or edit a property in a table. Open a full view to adjust its filters, sorting, and columns.

If the tables don’t display, enable **Bases** in **Settings → Core plugins**.

### Bottles

${viewLink('Bottles')}

Bottle sizes, strengths, and recorded stock. In the ABV and open-bottle columns, 0.5 means 50%; blank amounts mean unknown.

${embed('Bottles')}

### Other stock

${viewLink('Other stock')}

Fresh ingredients, juice, syrups, and other ingredient sources, with their recorded availability.

${embed('Other stock')}

### Recipes

${viewLink('Recipes')}

Your saved cocktail recipes. To find recipes related to an ingredient or bottle, open that note and run **Cocktail Cabinet: Browse related recipes**.

${embed('Recipes')}

## Ingredient catalog

${viewLink('Ingredient types')}

Ingredient definitions and preparation notes. Catalog entries don’t mean you have an ingredient in stock. Use **Cocktail Cabinet: Add ingredient type** if something you need is missing, or **New type** while creating a recipe.

${embed('Ingredient types')}

Browse broader groupings: ${viewLink('Ingredient families')} · ${viewLink('Ingredient categories')}. These groupings are optional; every ingredient type appears in the view above, including types without a family.

## Make it yours

Edit this page, the ingredient notes, and the views to suit your cabinet. Setup preserves existing files when you run it again.

Your notes, links, and properties remain usable with Cocktail Cabinet disabled. The live tables need only Obsidian’s core Bases plugin.`),
	}];
}

export interface SetupPreview {
	root: string;
	create: PlannedFile[];
	keep: string[];
	conflicts: string[];
}
