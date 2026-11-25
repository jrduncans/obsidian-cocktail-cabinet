import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import { STARTER_EXAMPLES, examplePlan } from '../catalog/examples';
import { localDate, markdown, renderNote } from './notes';
import { cabinetFolder, notePath, PROP, wikiLink } from './schema';
import { IN_STOCK_BASE, inStockBase } from './in-stock';
import { basePath, GROUPS_BASE, resourceBases } from './bases';
import { navigationBase } from './navigation';
import { SHOPPING_NOTE, shoppingBase, shoppingNote, shoppingNotePath } from './shopping';
import { DEFAULT_RESTOCK, RESTOCK_BASE, restockBase } from './restock';
import type { RestockThresholds } from './restock';
import type { PlannedFile } from './schema';
import { asManaged } from './managed';
import { viewOpenLink } from './view-links';
import { AGENT_REFERENCE, GUIDE_PAGES, guideLink, guideNotes } from './guide';

/** Where users keep their own Bases; the plugin never writes there. */
export const CUSTOM_VIEWS_FOLDER = 'Custom views';

export function customViewsPath(root: string): string {
	return `${cabinetFolder(root)}/${CUSTOM_VIEWS_FOLDER}`;
}

/**
 * The Bases the plugin owns, in `<root>/Views/`. Setup and **Refresh cabinet notes** write them,
 * and the plugin rewrites one when a release or a setting changes it. Copies in Custom views are the user's.
 */
/** `drinkGrams`: the standard drink the Recipes Base shows, 14 g (US) by default. */
export function cabinetViews(
	folder: string,
	restock: RestockThresholds = DEFAULT_RESTOCK,
	drinkGrams = 14,
): PlannedFile[] {
	const root = cabinetFolder(folder);
	return [
		...resourceBases(root, drinkGrams),
		navigationBase(root),
		shoppingBase(root),
		restockBase(root, restock),
		inStockBase(root),
	];
}

/**
 * The notes the plugin writes and keeps current (docs/ownership.md). `examples` maps each worked
 * example still in the cabinet, by catalog ID, to its path, for the Cocktail Cabinet note's example section.
 */
export function managedNotes(folder: string, examples: ReadonlyMap<string, string> = new Map()): PlannedFile[] {
	const root = cabinetFolder(folder);
	return [cabinetNote(root, examples), shoppingNote(root), ...guideNotes(root)].map((file) => asManaged(file, root));
}

/** Every file setup writes. `examples` adds the worked example, for a cabinet without a Cocktail Cabinet note yet. */
export function starterPlan(
	folder: string,
	paths: ReadonlyMap<string, string> = new Map(),
	examples = false,
	restock: RestockThresholds = DEFAULT_RESTOCK,
	drinkGrams = 14,
): PlannedFile[] {
	const root = cabinetFolder(folder);
	const files = STARTER_CATALOG.map((entry) => ({
		...renderNote(root, catalogDraft(root, entry, paths), localDate()),
		path: paths.get(entry.id) || notePath(root, entry.kind, entry.name),
		catalogId: entry.id,
	}));
	const example = examples ? examplePlan(root, localDate(), paths) : [];
	return [
		...files,
		...example,
		...cabinetViews(root, restock, drinkGrams),
		...managedNotes(
			root,
			new Map(example.flatMap((file) => (file.catalogId ? [[file.catalogId, file.path]] : []))),
		),
	];
}

export function cabinetNotePath(root: string): string {
	return `${root}/Cocktail Cabinet.md`;
}

function exampleSection(examples: ReadonlyMap<string, string>): string {
	const present = (kind: string) => STARTER_EXAMPLES.some((item) => item.kind === kind && examples.has(item.id));
	if (!present('ingredient') || !present('recipe')) return '';
	const links = (kind: string) => {
		const items = STARTER_EXAMPLES.filter((item) => item.kind === kind).flatMap((item) => {
			const path = examples.get(item.id);
			return path ? [wikiLink(path, item.name)] : [];
		});
		return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
	};
	return `\n\n## Try an example

Setup added example stock, ${links('ingredient')}, and two recipes it completes: ${links('recipe')}. The fruit starts as Unknown and the syrup as empty. Set the syrup’s amount, then open a recipe and run **Cocktail Cabinet: Log this cocktail**. Change or delete the examples as you like; setup won’t add them back.`;
}

function cabinetNote(root: string, examples: ReadonlyMap<string, string>): PlannedFile {
	const viewLink = (name: string) => wikiLink(basePath(root, name), name);
	const properties = {
		[PROP.kind]: 'cabinet',
		[PROP.name]: 'Cocktail Cabinet',
		[PROP.schemaVersion]: 1,
	};
	return {
		path: cabinetNotePath(root),
		kind: 'cabinet',
		content: markdown(
			properties,
			`# Cocktail Cabinet

Your bottles, ingredients, and cocktail recipes. New here? Start with ${guideLink(root, 'Getting Started')}. Every command, including the views linked below, is in the command palette under **Cocktail Cabinet**.${exampleSection(examples)}

## Make a drink

- ${viewOpenLink('can-make')}: every recipe by what you have on hand.
- ${viewLink('Recipes')}: your recipes, with **Latest** and **Recently made** views.
- On a recipe, the glass button in the header logs the cocktail.

## Stock

- ${viewLink(IN_STOCK_BASE)}: everything on hand.
- ${viewLink('Bottles')} · ${viewLink('Other stock')} · ${wikiLink(basePath(root, 'Other stock') + '#Kitchen staples', 'Kitchen staples')}
- On a bottle or other stock, the gauge button in the header edits its stock.

## Shopping

- ${wikiLink(shoppingNotePath(root), SHOPPING_NOTE)}: what you've marked to buy; the cart button in its header records purchases.
- ${viewLink(RESTOCK_BASE)}: stock running low, out, or not filled in.
- ${viewOpenLink('buy')}: what would unlock the most recipes.

## Ingredients

- ${viewLink('Ingredient types')}, grouped by family in its **Browse** view · ${viewLink(GROUPS_BASE)}
- ${viewOpenLink('unlinked')}: recipe lines not yet linked to an ingredient, linked across recipes at once.

## Guide

${GUIDE_PAGES.map((page) => `- ${guideLink(root, page)}`).join('\n')}

AI agents working in your vault can follow ${guideLink(root, AGENT_REFERENCE)}; link it from your vault’s \`AGENTS.md\`.

The plugin keeps this page current. To change it or the views, see ${guideLink(root, 'Views and Customizing')}.`,
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
