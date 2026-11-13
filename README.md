# Cocktail Cabinet

An Obsidian plugin for building and maintaining your own cocktail recipes and ingredient cabinet. Early development; note schemas and the starter catalog are still being reviewed.

## Get started

1. Use Obsidian 1.9.10 or later. Enable **Bases** in **Settings → Core plugins** and **Cocktail Cabinet** in **Settings → Community plugins**.
2. Select the glass ribbon icon or run **Cocktail Cabinet: Open cabinet**.
3. Choose a folder and select **Preview** to inspect creation counts and conflicts, then **Create cabinet**.
4. Follow the links in the cabinet note to the live views. Add ingredients, bottles, other stock, and cocktail recipes from the command palette.

The starter catalog includes ingredient descriptions, with optional **Family** and **Category** groupings where they help. A type can stand alone, and a family can have no category. The three default sugar syrups record ratios by weight and include preparation instructions. It supplies ingredient definitions and an Angostura Bitters bottle reference classified as Aromatic Bitters, with unknown availability. A new cabinet also gets a worked example: Limes and Lemons (availability), House Simple Syrup (1:1) (mL), and a Daiquiri and Whiskey Sour they complete, all with stock unknown. Setup adds the example only when it creates the cabinet note, so deleted examples stay deleted. See the [draft starter hierarchy](docs/starter-hierarchy.md) for the complete list.

Setup creates ordinary Markdown notes and `.base` files (six resource views plus Related, Shopping list, and Restock) in a `Views` subfolder inside the chosen folder. The cabinet note explains your collection and the ingredient hierarchy, linking to each Base as it introduces the concept. Their tables reflect current notes rather than a snapshot of the starter catalog.

Existing starter notes are preserved, including custom descriptions and renamed pages that retain their catalog ID. Conflicting files or folders stop setup before any files are created. Setup is additive for notes and can finish an interrupted run; it does not overwrite or delete existing notes. The `.base` files in `<root>/Views/` belong to the plugin. Setup replaces any that differ from the current version, and on startup the plugin rewrites a view when a release or a setting changes it (it records the version it last wrote in its data, so column widths or sorting saved by Obsidian stay until then). **Refresh cabinet views** rewrites every changed or missing view. To keep a changed view, copy it into `<root>/Custom views/`, which setup creates and the plugin never touches. Keep catalog IDs on starter pages so later setup runs recognize them.

For a cabinet created before Bases support, rerun **Set up cabinet** to add missing views. Its existing home note is preserved: link or embed the new files from `<cabinet folder>/Views/` there, for example `![[Cocktails/Views/Ingredient types.base]]` for the default root.

## Create and browse

- **Open cabinet**: open the cabinet home note, with guidance and links to all six resource Bases. Ingredient types appear whether or not they have a family. Select a note link to open it, follow its classification links, or edit properties directly in a Base. Customize filtering, sorting, and columns using Obsidian. **Recipes** has a second view, **Latest**, sorted by creation date, newest first.
- **Add ingredient type**: create an ingredient with an optional family, description, and preparation instructions. Use **Add ingredient family** and **Add ingredient category** for optional groupings.
- **Add a bottle**: select its optional ingredient type and enter full bottle volume and ABV. Choose **Amount (mL)** to record what is left, or **Availability** to mark whether you have it. Bottles default to volume tracking and 100% full once bottle volume is entered. Estimate an existing bottle as percent full or enter mL directly; the form shows the resulting mL. A blank amount means none open. Leave unopened bottles blank if you have none. One note tracks a named bottle and its stock, including unopened bottles of the same size and strength.
- **Add other stock**: record fresh ingredients, prepared or bottled juice, homemade or purchased syrup, and other sources. Select the ingredient types they provide. Choose **Availability** (Unknown, Have, Low, or Out) or **Amount (mL)**. Other stock starts with **Availability** selected. One source can provide several ingredients. For **Homemade syrup** and **Prepared juice**, the name defaults to “House <type>”, such as House Simple Syrup (1:1), until you type your own.
- **Add kitchen staple**: record an everyday ingredient, such as salt or mint, with only a name and availability. Recipes link it directly. In **Add other stock**, the **Kitchen staple** form does the same and hides **Provides ingredients**.
- **Add a bottle of this type** and **Add other stock for this type**: on a type note, open the matching form with the type already selected.
- **Create a cocktail recipe**: paste copied recipe text and select **Review recipe**, or select **Enter manually**. Review the name, source, ingredients, method, and notes before saving. Typing an ingredient drops down matching ingredient notes (fuzzy search of names, filenames, aliases, and kind); arrow keys and Enter link one, shown by the note's name, and anything not picked stays plain text. Suggestions under each row match names, filenames, and aliases and keep the recipe's wording as the link text; select a suggestion to link it, **Select link** to search ingredient notes, or **Leave unlinked** to dismiss the suggestions for that row. **Create ingredient** offers types, bottles, other stock, families, and categories without losing the recipe draft. New ingredient notes are saved when their own creation form is submitted, even if the recipe is later canceled. Source wording and amounts are preserved; the creation date is resolved locally. The review also has a **Rating** and **Tags**: a button for each prep tag (`#shaken`, `#stirred`, `#built`, `#blended`) and for each tag already on two or more of your recipes, plus a field to add another. A prep tag is picked from the method (the first of shake, stir, or blend it mentions) until you pick one yourself. Tags are saved on the last line of Tasting Notes. If the name matches a recipe you already have, ignoring accents, case, punctuation, “&”, and a leading “The”, or matches one of its aliases, a warning links to it.
- **Enhance as cocktail recipe**: open an existing Markdown page and run this command to review its ingredients, links, and method. Save to enhance that page, preserving existing properties (including tags, aliases, rating, and creation date). Pages outside the cabinet move into its Recipes folder, keeping their filename; the destination is shown before saving. Pages already inside the cabinet keep their location. Conflicting filenames or edits made since review opened stop the save.
- **Rename cabinet note**: from any cabinet note, give it a new proper name. The filename, heading, `cc-name`, and aliases follow, and links from other notes keep working; link text that showed the old name shows the new one, while other wording, such as a recipe's "lemon juice", stays.
- **Edit cabinet note**: from a recipe, bottle, other-stock, type, or family note, change what its creation form set, apart from the name and stock. Recipes: source, rating, ingredients and their links, method, description, tasting notes, and tags; other text in the note stays as it is. Bottles: type, size, and ABV. Other stock: the types it provides and its form. Types: family and shopping list. Families: category. Changes made to the note after the form opens stop the save.
- **Edit stock**: from a bottle or other-stock note, update what you have. **Bought more** adds a sealed bottle (or marks it Have) and takes it off the shopping list; **Finished** empties the open bottle (or marks it Out). You can also set the level as percent full or mL, the price, or switch between mL and availability tracking. Changes made to the note after the form opens stop the save.
- **Restock**: a view, linked from the cabinet home and the Shopping list, for picking what to buy. Running low means the last bottle at or under 10% full, or 70 mL without a bottle size and for other stock; both are settings. Its Running low, Out, and Unknown tables each have a **Shopping list** checkbox. Running low and Out list the most recently used first.
- **Record purchases**: after shopping, the cart button in the Shopping list note's header (or the command, from anywhere). Check what you bought, one line per item: bottles get sealed bottles added, other stock in mL gets the amount added, availability-tracked stock becomes Have. Update the price, or the bottle size when it changed (750 to 700 mL); a different size such as 375 mL or 1 L is a separate bottle. For a type, pick which bottle, or add a new one. **Add something else…** covers things that weren't on the list, including new bottles. Bought items leave the list; the rest stay. Each purchase records `cc-last-purchased`, as does **Bought more** in Edit stock.
- **Review unlinked ingredients**: measured recipe lines without a link, which logging can't subtract, grouped by wording ("gin: 16 recipes"). Pick what a wording links to, untick any recipes where it means something else, choose the link text (**Cabinet name**, each recipe's own wording, or your own) while seeing each line as it will read, and **Link** writes it into each recipe, keeping the amount. For things you don't buy, such as water, create a type tracked by availability and leave it at Have: logging passes over it, and the line counts as linked.
- **Insert ingredient link**: while editing, pick an ingredient note (a bottle, other stock, type, family, or category) to insert a link in the cabinet's style, `[[Cocktails/Types/Gin|Gin]]`. With text selected, it links the selection and lets you keep that text or use the cabinet name.
- **Link this ingredient line**: on an unlinked line in a recipe's Ingredients, link its wording. Pick an ingredient note, or create one named from the wording.
- **Edit this ingredient link**: with the cursor in a link in a recipe's Ingredients, change just that link (its note or its text); other links on the line stay. In Live Preview, clicking a link opens it, so click just after it and press ←.
- These commands are also in the editor's right-click menu in cabinet notes, each only where it applies.
- **Log this cocktail**: from a cabinet recipe, review servings, what you used, how much will be left, and the proposed daily entry, then select **Log**. See the logging details below.
- **Undo last log**: put back what the latest logged drink changed. See [undoing a log](#undoing-a-log).
- **Log a one-off**, **Riff on this cocktail**, and **Save one-off as recipe**: log a drink without a recipe note, and keep it as a recipe later. See [one-off drinks](#one-off-drinks).
- **Navigation in each note**: category, family, type, bottle, and other-stock notes embed sections from the shared `Views/Related.base`: a category's families; a family's types; the bottles and other stock under a family or type, with their stock; other stock of the same type on a bottle; and related recipes on all of them. Recipes count every link in the recipe note, followed up the hierarchy, so a family lists recipes that call for any of its types or bottles. They are grouped into recipes that call for the note (or something under it) and recipes it can fill through a broader requirement, each showing its rating as stars, highest first. These are core Bases, so they render with Cocktail Cabinet disabled. `Related.base` is managed by the plugin: rerunning setup updates it unless you've changed it. Sort or column changes made in an embed apply to every note.
- **Note actions**: commands about one note are also in that note's file menu: right-click it in the file explorer or its tab, or open the note's **More options** menu (⋯), which is the easiest way on mobile. Recipes also get a **Log this cocktail** button in the note's header, and bottles and other stock an **Edit stock** button.

A recipe may reference **Rum**, **Aged Jamaican Rum**, or a particular bottle. Broad references stay broad. A narrow reference does not acquire every other type in the same family. Recipe text is not rewritten by navigation.

Recipe review accepts plain ingredient lines copied from a website, with optional bullets or Markdown headings. It recognizes familiar leading amounts, parenthetical brands, and a following preparation paragraph starting with a verb such as Stir or Shake. Structured pages can use Ingredients, Method (or Directions/Instructions), Description (or Notes), and Tasting Notes headings. Unknown sections and ingredient continuations are kept in Description with a review message. Existing wiki links stay as written; accepted suggestions add path-qualified links that display the recipe's wording. A generic ingredient is never automatically changed to a stocked bottle or a narrower type.

Amounts remain ordinary Markdown text. Single volumes in mL, cL, and US fluid ounces, including decimal, fractional, and mixed-number amounts, show a volume interpretation during review. Parenthetical volume equivalents such as “2 oz (60 ml)” use the printed mL amount, including rounded conversions. Prefer these for measured pours, but retain dashes, garnishes, ranges, and other source wording when appropriate. An explicit source measurement such as “1 barspoon (1/8 oz)” uses the stated 1/8 oz; a bare barspoon or dash has no assumed volume. Unclear amounts remain text and appear under **Not subtracted** during logging. No stock is deducted during recipe creation.

Notes, properties, links, and Bases are the durable system. They remain usable with Cocktail Cabinet disabled; live tables need only Obsidian's core Bases plugin. With Bases disabled too, the Markdown notes and links are still editable and navigable. The plugin adds setup, validated creation forms with ingredient selection, and hierarchy-aware related-recipe discovery. Future custom UI should have a specific workflow benefit beyond Obsidian's built-in note editing and Bases.

Each Base includes Markdown notes anywhere under the selected cabinet root with the corresponding `cc-kind`, including custom and renamed notes. It does not require a catalog ID or a complete parent chain. Notes elsewhere in the vault and other resource kinds are excluded. The tables show tracking modes, stock quantities in mL, manual availability, and purchasing fields. Bottle ABV remains a fraction (0.4 means 40%). No Dataview or Cocktail Cabinet code is needed to render these views. See [Obsidian's Bases syntax](https://obsidian.md/help/bases/syntax) and [embedding instructions](https://obsidian.md/help/bases/create-base).

New notes use plain Latin filenames derived from their proper name (Tuxedo #2 → `Tuxedo No 2.md`, Last Wørd → `Last Woerd.md`) and retain the proper name in `cc-name` and the page heading. Generated links display that proper name, for example `[[Cocktails/Families/Cachaca|Cachaça]]`. Accented names also become Obsidian aliases; the plugin's ingredient picker includes both spellings when they differ. Existing notes without `cc-name` use their filename as the displayed name.

Types, bottles, and other stock can be marked **Add to shopping list** independently of stock level. Bottles and other stock also accept an optional nonnegative **Last purchase price**, without a currency symbol. These fields are editable in the resource Bases. The **Shopping list** note, linked from the cabinet home, has a section each for flagged bottles (type, stock, last price), types (which bottles of that type you have and which aren't in stock), and other stock. Its `Views/Shopping list.base` is yours to customize; setup only creates it when missing.

## Log a cocktail

Open a cabinet recipe and run **Cocktail Cabinet: Log this cocktail**.

- **Used:** each measured, linked ingredient gets a picker listing matching bottles and other stock you track in mL. A single match, or a named bottle you have, is selected for you; otherwise select one. A **catch-all type** (Amaro, Specialty Bitters; a checkbox on the type) lists its other bottles under the named one as likely substitutes, never selected for you. **Other bottle…** searches the whole cabinet. **Don’t subtract** skips the line; it is the default when nothing in your cabinet stocks that ingredient, such as fresh juice.
- **Stock:** what each bottle loses and has left. The open bottle is used first, then unopened bottles. A shortfall blocks logging; that bottle gets an **Edit stock** button, and every row has a gauge button, so you can fix stock that's out of date without leaving the log. Saving it refreshes the preview and keeps your choices.
- **Not subtracted:** lines that are unlinked, unmeasured, or not tracked in mL. A measured line without a link, or with a link to a missing note, gets a **Link…** button: pick a suggested ingredient note, search them, or create one. Choose the link text (the recipe's wording, the cabinet name, or your own) and the link is written into the recipe right away; the line moves up to **Used**; your other choices stay.
- **Usage:** logging records the log date (today unless you change it) as **Last used** on each bottle and other stock you used, including ones it doesn't subtract from (limes you track as Have, dashes of bitters), and **Last made** and **Times made** on the recipe.
- **Date:** defaults to today. If you forgot to log yesterday’s drink, pick that day; the daily entry goes in that day’s note, and **Last used** and **Last made** are only ever moved forward, so an older date never overwrites a later one. Future dates aren’t allowed.
- **Add to daily note:** appends “Made an Old Fashioned.” (or “Made 2 servings of …”) to the note for the chosen date, using the Daily notes core plugin’s folder, format, and template. Off by default if that day’s note already has this cocktail.

### Undoing a log

Logged the wrong servings or the wrong bottle? Select **Undo** in the notice after logging, or run **Cocktail Cabinet: Undo last log**. It lists what it will put back: each bottle's stock and **Last used**, the recipe's **Last made** and **Times made**, and the daily-note entry. Run it again to undo the log before that; the last 10 logs are kept. If a log stopped partway, undo puts back what it saved.

Undo won't touch stock that changed after the log, from another log or **Edit stock**: it refuses, and you fix that stock by hand. A date or count that changed since is left as it is. A daily note the log created stays, minus its entry.

### One-off drinks

For a drink with no recipe note, run **Cocktail Cabinet: Log a one-off**, or **Riff on this cocktail** on a recipe to start from its ingredients. Enter the ingredients per serving, linking what you poured as you type, then an optional name, and select **Review** for the same dialog as above (**Edit ingredients** goes back). No note is created: the daily note gets “Made a one-off (Name):” with the ingredients listed under it. If it's a keeper, open that daily note and run **Save one-off as recipe**: the recipe review opens with the name and ingredients filled in, and once saved the daily line links the new recipe, which counts as made that day.

If your stock or the recipe changed since the preview, nothing is saved and the preview refreshes. If saving fails partway, the message says what was already updated so the drink isn’t subtracted twice.

## Current limits

- Recipe ratings are whole numbers from 1 to 5 in the `rating` property.
- Setup adds `Related.base` to an existing cabinet but does not edit existing notes. Add the embeds by hand, for example `![[Cocktails/Views/Related.base#Recipes]]`.
- Existing personal collections using the old `Subcategory`, `Type`, and `base` conventions need a future adoption/migration flow. Setup does not convert them. Choose a fresh cabinet folder to experiment.
- Drink logging and stock editing are available on desktop and mobile; logging is untested on a phone. Web/CSV imports and agent integration are future work. Recipe review does not fetch URLs or extract recipes from web pages.
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

To install in a real vault, or update it, run from a clean `main`:

```sh
npm run install:vault -- --vault '/path/to/vault'
```

It builds, copies `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/cocktail-cabinet/`, keeps the vault's `data.json` settings, and asks Obsidian to reload the plugin. The first time, enable **Cocktail Cabinet** in **Settings → Community plugins** and check its cabinet folder. It refuses a branch other than `main`, uncommitted changes, and a symlinked plugin folder (a development vault). The copied files sync to other devices with the vault. Bump the version with `npm version patch` before an install you want to tell apart. Do not commit generated bundles to this repository.

The development override pins Obsidian's transitive Moment dependency to `2.31.0`. The plugin bundle keeps `obsidian` external and uses its bundled `moment` export for Daily notes; it does not bundle a separate Moment library.
