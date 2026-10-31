# Cocktail Cabinet

An Obsidian plugin for building and maintaining your own cocktail recipes and ingredient cabinet. Early development; note schemas and the starter catalog are still being reviewed.

## Get started

1. Use Obsidian 1.9.10 or later. Enable **Bases** in **Settings → Core plugins** and **Cocktail Cabinet** in **Settings → Community plugins**.
2. Select the glass ribbon icon or run **Cocktail Cabinet: Open cabinet**.
3. Choose a folder and select **Preview** to inspect creation counts and conflicts, then **Create cabinet**.
4. Follow the links in the cabinet note to the live views. Add ingredients, bottles, other stock, and cocktail recipes from the command palette.

The starter catalog includes ingredient descriptions, with optional **Family** and **Category** groupings where they help. A type can stand alone, and a family can have no category. The three default sugar syrups have nominal Brix and optional preparation instructions. It supplies ingredient definitions, with no owned inventory or cocktail recipes. See the [draft starter hierarchy](docs/starter-hierarchy.md) for the complete list.

Setup creates ordinary Markdown notes and six `.base` files in a `Views` subfolder inside the chosen folder. The cabinet note explains your collection and the ingredient hierarchy, linking to each Base as it introduces the concept. Their tables reflect current notes rather than a snapshot of the starter catalog.

Existing starter notes are preserved, including custom descriptions and renamed pages that retain their catalog ID. Conflicting files or folders stop setup before any files are created. Existing `.base` files at the six view paths are treated as user-owned views and kept as they are. Setup is additive and can finish an interrupted run; it does not overwrite or delete existing content. Keep catalog IDs on starter pages so later setup runs recognize them.

For a cabinet created before Bases support, rerun **Set up cabinet** to add missing views. Its existing home note is preserved: link or embed the new files from `<cabinet folder>/Views/` there, for example `![[Cocktails/Views/Ingredient types.base]]` for the default root.

## Create and browse

- **Open cabinet**: open the cabinet home note, with guidance and links to all six resource Bases. Ingredient types appear whether or not they have a family. Select a note link to open it, follow its classification links, or edit properties directly in a Base. Customize filtering, sorting, and columns using Obsidian.
- **Add ingredient type**: create an ingredient with an optional family, description, Brix, and preparation instructions. Use **Add ingredient family** and **Add ingredient category** for optional groupings.
- **Add a bottle**: enter its ingredient types, full bottle volume, and ABV. Choose volume tracking (open mL and unopened count) or a manual status. Bottles default to volume; blank amounts stay unknown. A bottle record describes a bottling and its stock, rather than creating one note per physical bottle.
- **Add other stock**: record fresh ingredients, prepared or bottled juice, homemade or purchased syrup, and other sources. Select the ingredient types they provide. Choose status tracking (Unknown, Have, Low, or Out) or volume tracking (remaining mL). Other stock defaults to status. One source can provide several ingredients.
- **Create a cocktail recipe**: enter ingredient amounts as written, select a bottle or any hierarchy level, or leave an ingredient as plain text. **New type** creates and selects a missing type without losing the recipe form. Source and rating remain on the recipe; the creation date is resolved locally.
- **Browse related recipes**: from an ingredient or bottle note, find recipe ingredient references beneath that classification, broadly specified recipes it can fulfill, and same-type bottle alternatives. References elsewhere in a recipe, such as tasting notes, do not count.

A recipe may reference **Rum**, **Aged Jamaican Rum**, or a particular bottle. Broad references stay broad. A narrow reference does not acquire every other type in the same family. Recipe text is not rewritten when browsing related recipes.

Notes, properties, links, and Bases are the durable system. They remain usable with Cocktail Cabinet disabled; live tables need only Obsidian's core Bases plugin. With Bases disabled too, the Markdown notes and links are still editable and navigable. The plugin adds setup, validated creation forms with ingredient selection, and hierarchy-aware related-recipe discovery. Future custom UI should have a specific workflow benefit beyond Obsidian's built-in note editing and Bases.

Each Base includes Markdown notes anywhere under the selected cabinet root with the corresponding `cc-kind`, including custom and renamed notes. It does not require a catalog ID or a complete parent chain. Notes elsewhere in the vault and other resource kinds are excluded. The tables show tracking modes, stock quantities in mL, manual availability, and purchasing fields. Bottle ABV remains a fraction (0.4 means 40%). No Dataview or Cocktail Cabinet code is needed to render these views. See [Obsidian's Bases syntax](https://obsidian.md/help/bases/syntax) and [embedding instructions](https://obsidian.md/help/bases/create-base).

New notes use plain Latin filenames and retain their proper name in `cc-name` and the page heading. Generated links display that proper name, for example `[[Cocktails/Families/Cachaca|Cachaça]]`. Accented names also become Obsidian aliases; the plugin's ingredient picker includes both spellings when they differ. Existing notes without `cc-name` use their filename as the displayed name.

Types, bottles, and other stock can be marked **Add to shopping list** independently of stock level. Bottles and other stock also accept an optional nonnegative **Last purchase price**, without a currency symbol. These fields are editable in the resource Bases; the combined shopping-list view is future work.

## Current limits

- Existing personal collections using the old `Subcategory`, `Type`, and `base` conventions need a future adoption/migration flow. Setup does not convert them. Choose a fresh cabinet folder to experiment.
- Stock is recorded and editable; consumption calculations, drink logging, imports, and agent integration are future work.
- Preparation batches and measured juice yields are not modeled.
- Earlier plugin notes using `cc-open-fraction` need [manual conversion](docs/note-properties.md#upgrading-early-stock-notes); setup preserves them and their existing home note and Bases. New notes use the mL schema.
- Syrup filenames spell ratios as “1 to 1” and “2 to 1” for cross-platform filenames; their descriptions and ratio property use 1:1 and 2:1 by weight.
- The runtime declares Obsidian 1.9.10 as its minimum for [core Bases support](https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10/). Manual verification has been on desktop Obsidian 1.14.5; real iOS and Android testing remains outstanding.

## Storage and privacy

All runtime operations stay in the selected vault. The plugin makes no network requests and collects no telemetry. External reference links on ingredient pages open only when selected.

Notes use `cc-kind` to identify their role and `cc-`-prefixed properties to avoid common vault property conflicts. Links include vault-relative folder paths. See the [resource schemas](docs/note-properties.md) for each property's purpose, stored values, and current use, the [cabinet design](docs/cabinet-design.md) for design decisions, and the [domain glossary](GLOSSARY.md) for terminology.

The `cc-` property prefix stands for Cocktail Cabinet. Cabinet property panels allow modestly wider labels for longer fields, with a responsive width limit. New starter notes use catalog IDs such as `family/Aquavit` so they display as text rather than URL schemes.

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
