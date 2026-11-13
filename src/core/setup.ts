import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { STARTER_EXAMPLES, examplePlan } from '../catalog/examples';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import { IN_STOCK_BASE, inStockBase } from './in-stock';
import { basePath, resourceBases } from './bases';
import { NAVIGATION_BASE, navigationBase } from './navigation';
import { SHOPPING_NOTE, shoppingBase, shoppingNote, shoppingNotePath } from './shopping';
import { DEFAULT_RESTOCK, RESTOCK_BASE, restockBase } from './restock';
import type { RestockThresholds } from './restock';
import type { PlannedFile } from './schema';

/** Where users keep their own Bases; the plugin never writes there. */
export const CUSTOM_VIEWS_FOLDER = 'Custom views';

export function customViewsPath(root: string): string {
	return `${cabinetFolder(root)}/${CUSTOM_VIEWS_FOLDER}`;
}

/**
 * The Bases the plugin owns, in `<root>/Views/`. Setup and **Refresh cabinet views** write them,
 * and the plugin rewrites one when a release or a setting changes it. Copies in Custom views are the user's.
 */
export function cabinetViews(folder: string, restock: RestockThresholds = DEFAULT_RESTOCK): PlannedFile[] {
	const root = cabinetFolder(folder);
	return [
		...resourceBases(root),
		navigationBase(root),
		shoppingBase(root),
		restockBase(root, restock),
		inStockBase(root),
	];
}

/** Every file setup writes. `examples` adds the worked example, for a cabinet without a home yet. */
export function starterPlan(
	folder: string,
	paths: ReadonlyMap<string, string> = new Map(),
	examples = false,
	restock: RestockThresholds = DEFAULT_RESTOCK,
): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map((entry) => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name),
		catalogId: entry.id,
	}));
	const example = examples ? examplePlan(root, localDate(), paths) : [];
	return [...files, ...example, ...cabinetViews(root, restock), shoppingNote(root), cabinetHome(root, example)];
}

export function cabinetHomePath(root: string): string {
	return `${root}/Cocktail Cabinet.md`;
}

function exampleSection(example: readonly PlannedFile[]): string {
	if (!example.length) return '';
	const links = (kind: string) => {
		const items = STARTER_EXAMPLES.filter((item) => item.kind === kind).flatMap((item) => {
			const file = example.find((file) => file.catalogId === item.id);
			return file ? [wikiLink(file.path, item.name)] : [];
		});
		return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
	};
	return `\n\n## Try an example

Setup added example stock, ${links('ingredient')}, and two recipes it completes: ${links('recipe')}. The fruit starts as Unknown and the syrup as empty. Set the syrup’s amount, then open a recipe and run **Cocktail Cabinet: Log this cocktail**. Change or delete the examples as you like; setup won’t add them back.`;
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
		content: markdown(
			properties,
			`# Cocktail Cabinet

Your bottles, ingredients, and cocktail recipes in one place. Start with one bottle or a favorite recipe and build your cabinet gradually.

Open Obsidian’s command palette and search for **Cocktail Cabinet** to find the commands below.${exampleSection(example)}

## Start here

1. Open **Other stock → Kitchen staples**, walk through your kitchen, and set availability on the staples you have.
2. Set the stock on your bottles and other ingredients. **Ingredient types → Browse** shows what you have under each type.
3. Open a favorite recipe and log a cocktail. Use **In stock** to see everything on hand.

## Your collection

### Bottles

${viewLink('Bottles')} records named bottles and their stock. Starter bottle references have unknown availability; record your stock on the existing note when you have that bottle. Use **Cocktail Cabinet: Add a bottle** when a bottle is missing, enter its name, and select its ingredient type, if known.

${viewLink(IN_STOCK_BASE)} brings bottles and other stock together: Have or Low availability, or a positive amount. Unknown availability and blank amounts do not count as stock.

### Kitchen staples

Open ${wikiLink(basePath(root, 'Other stock') + '#Kitchen staples', 'Kitchen staples')} to mark everyday ingredients such as salt, mint, and saline solution Have, Low, or Out. Each is tracked as itself, with no ingredient type to select. Use **Cocktail Cabinet: Add kitchen staple** for one that is missing.

### Other stock

${viewLink('Other stock')} records fresh ingredients, juice, syrups, and other sources. Use **Cocktail Cabinet: Add other stock** and select the ingredient types the source provides.

An ingredient type describes what a recipe calls for, such as lime juice. Stock records your source of it, such as fresh limes or prepared juice. Ingredient definitions alone don’t mean you have anything in stock.

### Shopping list

${wikiLink(shoppingNotePath(root), SHOPPING_NOTE)} lists every bottle, ingredient type, and other stock marked **Add to shopping list**.

${wikiLink(basePath(root, RESTOCK_BASE), RESTOCK_BASE)} suggests what to add: stock running low, stock that's out, and stock you haven't filled in. Tick **Shopping list** on a row to add it.

### Recipes

${viewLink('Recipes')} holds the cocktails you want to keep; its **Latest** view lists the newest first. Use **Cocktail Cabinet: Create a cocktail recipe** to save amounts and a method. Ingredients can name a type, a broader family such as rum, or a specific bottle. Tags on a recipe are your own groupings, such as how you serve it or when you'd make it; the recipe form offers the tags you've already used.

Each ingredient and bottle note lists the recipes that use it. On a recipe, the glass button in the note's header logs the cocktail; on a bottle or other stock, the gauge button edits its stock. Other actions for a note are in its **More options** menu.

## Ingredient catalog

### Types

${viewLink('Ingredient types')} contains ingredient definitions and preparation notes. The **Browse** tab groups types by category and family, with standalone types and kitchen staples in their own groups; **Have** shows stock on hand. Every type appears in the default tab, including those without a family. Use **Cocktail Cabinet: Add ingredient type** if something you need is missing, or **New type** while creating a recipe.

### Families

${viewLink('Ingredient families')} groups types when a shared recipe reference or grouping is useful, such as Rum. Types can stand alone. Use **Cocktail Cabinet: Add ingredient family** to create a grouping.

### Categories

${viewLink('Ingredient categories')} groups families into broader classifications, such as Spirit. Families can stand alone too. Use **Cocktail Cabinet: Add ingredient category** when a broader grouping helps.

## Make it yours

Open a linked view to browse your current notes and edit properties. Enable **Bases** in **Settings → Core plugins** to use these views.

Edit this page and your notes to suit your cabinet; setup keeps existing notes when you run it again. The views in the **Views** folder belong to the plugin, which updates them in new releases; ${viewLink(NAVIGATION_BASE)} supplies the sections shown in each ingredient and bottle note. To change a view, copy it into the **${CUSTOM_VIEWS_FOLDER}** folder and edit the copy; the plugin never touches that folder. **Cocktail Cabinet: Refresh cabinet views** restores the originals.

Your notes, links, and properties remain usable with Cocktail Cabinet disabled. The views need only Obsidian’s core Bases plugin.`,
		),
	};
}

export interface SetupPreview {
	root: string;
	create: PlannedFile[];
	/** Plugin views whose content differs from the current version. */
	update: PlannedFile[];
	keep: string[];
	conflicts: string[];
}
