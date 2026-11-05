import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { STARTER_EXAMPLES, examplePlan } from '../catalog/examples';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import { basePath, resourceBases } from './bases';
import { NAVIGATION_BASE, navigationBase } from './navigation';
import { SHOPPING_NOTE, shoppingBase, shoppingNote, shoppingNotePath } from './shopping';
import type { PlannedFile } from './schema';

/** Every file setup writes. `examples` adds the worked example, for a cabinet without a home yet. */
export function starterPlan(folder: string, paths: ReadonlyMap<string, string> = new Map(), examples = false): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map(entry => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name),
		catalogId: entry.id,
	}));
	const example = examples ? examplePlan(root, localDate(), paths) : [];
	return [...files, ...example, ...resourceBases(root), navigationBase(root), shoppingBase(root), shoppingNote(root), cabinetHome(root, example)];
}

export function cabinetHomePath(root: string): string {
	return `${root}/Cocktail Cabinet.md`;
}

function exampleSection(example: readonly PlannedFile[]): string {
	if (!example.length) return '';
	const links = (kind: string) => {
		const items = STARTER_EXAMPLES.filter(item => item.kind === kind).flatMap(item => {
			const file = example.find(file => file.catalogId === item.id);
			return file ? [wikiLink(file.path, item.name)] : [];
		});
		return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
	};
	return `\n\n## Try an example

Setup added example stock, ${links('ingredient')}, and two recipes it completes: ${links('recipe')}. Their stock starts unknown. Set the syrup’s amount, then open a recipe and run **Cocktail Cabinet: Log this cocktail**. Change or delete the examples as you like; setup won’t add them back.`;
}

function cabinetHome(root: string, example: readonly PlannedFile[] = []): PlannedFile {
	const viewLink = (name: string) => wikiLink(basePath(root, name), name);
	const properties = {
		[PROP.kind]: 'cabinet',
		[PROP.name]: 'Cocktail Cabinet',
		[PROP.schemaVersion]: 1,
	};
	return {
		path: cabinetHomePath(root),
		kind: 'cabinet',
		content: markdown(properties, `# Cocktail Cabinet

Your bottles, ingredients, and cocktail recipes in one place. Start with one bottle or a favorite recipe and build your cabinet gradually.

Open Obsidian’s command palette and search for **Cocktail Cabinet** to find the commands below.${exampleSection(example)}

## Your collection

### Bottles

${viewLink('Bottles')} records named bottles and their stock. Starter bottle references have unknown availability; record your stock on the existing note when you have that bottle. Use **Cocktail Cabinet: Add a bottle** when a bottle is missing, enter its name, and select its ingredient type, if known.

### Other stock

${viewLink('Other stock')} records fresh ingredients, juice, syrups, and other sources. Use **Cocktail Cabinet: Add other stock** and select the ingredient types the source provides.

An ingredient type describes what a recipe calls for, such as lime juice. Stock records your source of it, such as fresh limes or prepared juice. Ingredient definitions alone don’t mean you have anything in stock.

### Shopping list

${wikiLink(shoppingNotePath(root), SHOPPING_NOTE)} lists every bottle, ingredient type, and other stock marked **Add to shopping list**.

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

${viewLink(NAVIGATION_BASE)} is the exception: it supplies the sections shown in each ingredient and bottle note, and setup keeps it current. Changes to it affect every note, and setup stops updating it once you change it.

Your notes, links, and properties remain usable with Cocktail Cabinet disabled. The views need only Obsidian’s core Bases plugin.`),
	};
}

export interface SetupPreview {
	root: string;
	create: PlannedFile[];
	/** Plugin-managed files still matching an earlier generated version. */
	update: PlannedFile[];
	keep: string[];
	/** Plugin-managed files the user has changed; kept as they are. */
	customized: string[];
	conflicts: string[];
}
