# Cocktail Cabinet

An Obsidian plugin for building and maintaining your own cocktail recipes and ingredient cabinet. Early development; note schemas and the starter catalog are still being reviewed.

## Get started

1. Enable **Cocktail Cabinet** in **Settings → Community plugins**.
2. Select the glass ribbon icon or run **Cocktail Cabinet: Open cabinet**.
3. Select **Set up cabinet**. Choose a folder and select **Preview** to inspect creation counts and conflicts, then **Create cabinet**.
4. Add bottles, other stock, and cocktail recipes from the cabinet or command palette.

The starter catalog includes ingredient descriptions, with optional **Family** and **Category** groupings where they help. A type can stand alone, and a family can have no category. The three default sugar syrups have nominal Brix and optional preparation instructions. It supplies ingredient definitions, with no owned inventory or cocktail recipes. See the [draft starter hierarchy](docs/starter-hierarchy.md) for the complete list.

Setup creates ordinary Markdown notes inside the chosen folder. Existing starter notes are preserved, including custom descriptions and renamed pages that retain their catalog ID. Conflicting unrelated notes stop setup before any notes are created. Setup is additive and can finish an interrupted run; it does not overwrite or delete existing content. Keep catalog IDs on starter pages so later setup runs recognize them.

## Create and browse

- **Open cabinet**: start with **All ingredient types**, which includes every type regardless of its parents. Families and categories provide additional browsing. A note's details let you open it, browse linked ingredients and stock, or find related recipes. Use **Refresh** after adding notes while the cabinet remains open.
- **Add ingredient type**: create an ingredient with an optional family, description, Brix, and preparation instructions. Add categories and families through **Open cabinet**.
- **Add a bottle**: enter its ingredient types, volume in milliliters, ABV, remaining open percentage, and unopened count. Blank amounts stay unknown. A bottle record describes a bottling and its stock, rather than creating one note per physical bottle.
- **Add other stock**: record fresh ingredients, prepared or bottled juice, homemade or purchased syrup, and other sources. Select the ingredient types they provide and an availability of Unknown, Have, Low, or Out. One source can provide several ingredients.
- **Create a cocktail recipe**: enter ingredient amounts as written, select a bottle or any hierarchy level, or leave an ingredient as plain text. **New type** creates and selects a missing type without losing the recipe form. Source and rating remain on the recipe; the creation date is resolved locally.
- **Browse related recipes**: from an ingredient or bottle note, find recipe ingredient references beneath that classification, broadly specified recipes it can fulfill, and same-type bottle alternatives. References elsewhere in a recipe, such as tasting notes, do not count.

A recipe may reference **Rum**, **Aged Jamaican Rum**, or a particular bottle. Broad references stay broad. A narrow reference does not acquire every other type in the same family. Recipe text is not rewritten when browsing related recipes.

Edit notes and properties directly in Obsidian. Browsing uses current metadata when opened or refreshed and requires neither Dataview nor Bases. Ordinary links and notes remain usable with the plugin disabled.

New notes use plain Latin filenames and retain their proper name in `cocktail-name` and the page heading. Generated links display that proper name, for example `[[Cocktails/Families/Cachaca|Cachaça]]`. Accented names also become Obsidian aliases; the plugin's ingredient picker includes both spellings when they differ. Existing notes without `cocktail-name` use their filename as the displayed name.

The Apple Brandy family includes Apple Brandy, Bonded Apple Brandy, Applejack, and Calvados. Classify your bottles deliberately. The Brandy family uses the common French-style grape-brandy meaning and contains Cognac and Armagnac. Pisco is left to users to add and classify.

Herbal, floral, spice, and nut liqueurs have separate families. Coffee Liqueur, Crème de Cacao, and Vodka stand alone. The starter bitter liqueurs use the Amaro family and ingredient names such as Red Bitter Liqueur.

## Current limits

- Existing personal collections using the old `Subcategory`, `Type`, and `base` conventions need a future adoption/migration flow. Setup does not convert them. Choose a fresh cabinet folder to experiment.
- Stock is recorded and editable; consumption calculations, drink logging, imports, and agent integration are future work.
- Non-bottle stock currently uses availability and form, with no preparation batches, measured juice yields, or consumption tracking.
- Syrup filenames spell ratios as “1 to 1” and “2 to 1” for cross-platform filenames; their descriptions and ratio property use 1:1 and 2:1 by weight.
- The runtime declares Obsidian 1.4.0 as its minimum for the APIs used. Manual verification has been on desktop Obsidian 1.14.5; real iOS and Android testing remains outstanding.

## Storage and privacy

All runtime operations stay in the selected vault. The plugin makes no network requests and collects no telemetry. External reference links on ingredient pages open only when selected.

Notes use `cocktail-kind` to identify their role and cocktail-prefixed properties to avoid common vault property conflicts. Links include vault-relative folder paths. See [the current schema and design](docs/cabinet-design.md) and [domain glossary](GLOSSARY.md).

## Development

Use Node.js 20+ and npm:

```sh
npm install
npm run dev
```

Checks:

```sh
npm test
npm run build
npm run lint
```

After changing starter ingredients, run `npm run catalog:docs` to regenerate the hierarchy table. `npm test` also checks that the table matches the catalog.

The dev vault's plugin directory is a symlink to this repository. Builds supply `main.js` directly; Hot Reload is installed in that vault. Generated bundles and local `data.json` settings are ignored by Git.

For another test vault, copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/cocktail-cabinet/` and enable the plugin. Release assets belong at that same plugin root; do not commit generated bundles.

The development override pins Obsidian's transitive Moment dependency to `2.31.0`. The plugin bundle keeps `obsidian` external and does not import Moment.
