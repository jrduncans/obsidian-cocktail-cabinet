# Resource schemas

Schemas for Cocktail Cabinet resources. The `cc-` prefix means Cocktail Cabinet; it namespaces properties without implying that every resource is a cocktail recipe. Obsidian's standard `aliases` property and the existing recipe properties `created`, `source`, and `rating` keep their unprefixed names.

Creation forms implement per-record volume or status tracking, mL remaining, last purchase price, and shopping-list flags. Consumption operations and the combined shopping-list view remain future work. The plugin validates creation inputs, not every manually edited property; existing notes are preserved rather than automatically migrated.

## Reading the schemas

Each resource below lists its own frontmatter properties with a **Type**, a boolean **Required** flag, and a description of its use.

- `Required: true` means the property is required by the resource schema. `false` means omission is supported. For stock resources, the selected mode is required for stock behavior; general resource browsing only checks the root scope and kind marker. Creation forms can require additional input, and generated notes can include optional properties; those rules are described explicitly.
- `string` is YAML text. `number` is a YAML number. `integer` is a whole number. `date` is a local calendar date stored as `YYYY-MM-DD`.
- `T[]` is a list of values of type `T`. `link<Resource>` is a quoted wiki-link string pointing to a cabinet resource of that type. For example: `"[[Cocktails/Families/Rum|Rum]]"`. Bottle classification uses a single link string. Other generated relationships are lists; their reader also accepts one link string.
- `null` is an explicit unknown value, distinct from zero. Optional properties may be absent; a type containing `null` additionally permits an explicit null value.
- `unknown` identifies a field whose value type has not yet been defined. It is not a claim that a value has been validated.

Ordinary resources must be Markdown files inside the selected cabinet root, which defaults to `Cocktails`. The plugin uses `cc-kind` to recognize each resource; subfolders organize new files but do not determine their type. Relationship targets must resolve to recognized resources of the expected kind inside the cabinet. Invalid or unresolved relationships are ignored. Bottles may have one ingredient-type link or none; lists in `cc-type` are ignored. Other relationships support empty lists and multiple links.

Creation forms validate their inputs. The plugin does not currently validate every property of manually edited resources. Setup preserves existing resources rather than synchronizing their content with the starter catalog.

## Ingredient category

A broad classification of ingredient families, such as Spirit or Juice. New notes are placed in `<root>/Categories/`.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"category"` | `true` | Identifies an ingredient category for browsing, classification, and related-recipe discovery. |
| `cc-name` | `string` | `false` | Proper display name used in plugin lists, pickers, detail titles, and new link display text. Generated from the required Name input. Falls back to the filename without its extension if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names for Obsidian links and plugin picker search. Creation adds the proper name when it differs from the plain Latin filename. |
| `cc-catalog-id` | `string` | `false` | Starter identity, such as `category/Spirit`. Needed on starter resources for setup to preserve identity across file renames and use the current path for new links. Omitted on user-created resources. Duplicate IDs stop setup. |

Categories have no broader classification property. Their description lives in the note body and is not interpreted by the plugin.

## Ingredient family

An optional grouping of ingredient types, such as Rum or Bitters. A family may belong to categories or stand alone. New notes are placed in `<root>/Families/`.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"family"` | `true` | Identifies an ingredient family for browsing and related-recipe discovery. |
| `cc-name` | `string` | `false` | Proper display name for plugin UI and new links. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in picker search and available to Obsidian links. |
| `cc-catalog-id` | `string` | `false` | Starter identity, such as `family/Aquavit`. Setup uses it to recognize renamed starter resources and reject duplicates. User-created families do not need one. |
| `cc-category` | `link<Ingredient category>[]` | `false` | Broader classifications. Read for linked-resource browsing and related-recipe traversal. No category is inferred from the family name. |

The description lives in the body. Missing categories do not make a family incomplete or invalid.

## Ingredient type

A recipe-facing kind of ingredient, such as Rye Whiskey, Lime Juice, or Simple Syrup (2 to 1). A type may have families or stand alone. New notes are placed in `<root>/Types/`.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"type"` | `true` | Identifies an ingredient type. Every type appears in All ingredient types, including those with no family. |
| `cc-name` | `string` | `false` | Proper display name for plugin UI and new links; for example, `Bénédictine` can be stored separately from `Benedictine.md`. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Synonyms included in picker search, such as `Rhum Agricole Blanc` for Unaged Rhum Agricole. Aliases identify the same ingredient rather than declaring substitutions. |
| `cc-catalog-id` | `string` | `false` | Starter identity based on the current catalog name, such as `type/Apple Brandy` or `family/Apple Brandy Family`. Setup reads IDs for recognition across renames, missing-page recovery, and duplicate detection. Omitted on user-created types. |
| `cc-family` | `link<Ingredient family>[]` | `false` | Broader groupings read for linked-resource browsing and related-recipe traversal. Missing families are valid. A narrow type does not gain sibling types as alternatives merely by sharing a family. |
| `cc-sugar-water-ratio` | `string` | `false` | Authored on the three starter simple/demerara syrup types, such as `2:1 by weight`. Records the ratio and its weight basis. No dedicated form input, runtime parser, or calculation currently uses it. |
| `cc-shopping-list` | `boolean` | `false` | Marks a generic need for this ingredient type when `true`, without selecting a bottle or source. Missing means `false`. Included in the planned combined shopping-list view; independent of flags and stock levels on linked bottles or sources. |

Descriptions, optional concentration details, and Preparation instructions live in the body. They are not parsed as frontmatter properties or preparation batches. Brix is not a built-in property or default Base column. Earlier notes may retain `cc-brix` as a custom property; the plugin does not remove it. Existing Bases are preserved too, so remove their Brix column manually if desired.

## Bottle

A named bottle, together with its recorded stock. One note tracks the open amount and any unopened bottles of the same size and strength. New notes are placed in `<root>/Bottles/`. The creation form writes the selected stock mode and its applicable fields.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"bottle"` | `true` | Identifies a bottle for cabinet browsing and recipe ingredient selection. |
| `cc-name` | `string` | `false` | Proper display name for plugin UI and new links. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in picker search and available to Obsidian links. |
| `cc-type` | `link<Ingredient type>` | `false` | The bottle's single recipe-facing ingredient type, used for linked-resource browsing and related-recipe discovery. Omitted when unclassified. Bottles sharing this type can appear as same-type alternatives; sharing a family alone is insufficient. Lists are ignored rather than selecting or combining types. |
| `cc-stock-tracking` | `StockTracking` | `true` | Selects `volume` or `status` for this bottle record. This choice determines the applicable stock fields below. The creation default is `volume`, saved explicitly rather than inferred from a missing property. |
| `cc-volume-ml` | `number \| null` | `false` | Full volume of one bottle in milliliters, greater than zero when known, such as `750`. A missing or null value is unknown. Reserved for future bottle rollover; remains useful descriptive metadata in status mode. |
| `cc-abv` | `number \| null` | `false` | Alcohol strength as a fraction from 0 to 1. The existing form accepts 0–100 percent, so `40` stores `0.4`; blank stores `null`. Stock tracking changes do not change the representation of ABV. |
| `cc-open-ml` | `number \| null` | `false` | **Volume mode only.** Nonnegative mL remaining in the open bottle, excluding unopened bottles. Must not exceed the known full bottle volume. Missing or null means unknown; zero explicitly means no open stock. The form defaults to 100% full once bottle volume is entered, supports percent-full estimates or direct mL, and displays the converted quantity. Clearing the amount saves unknown stock. Planned consumption deducts mL directly. |
| `cc-unopened` | `integer \| null` | `false` | **Volume mode only.** Nonnegative count of unopened bottles. Missing or null means unknown. Planned rollover uses this count and full bottle volume when another bottle must be opened. |
| `cc-availability` | `Availability` | `false` | **Status mode only.** Manual `Unknown`, `Have`, `Low`, or `Out`; missing means `Unknown`. Creation writes the chosen status explicitly. Pours do not automatically decrement or change this status. |
| `cc-last-purchase-price` | `number \| null` | `false` | Nonnegative numeric amount last paid for one bottle, with zero valid and missing or null meaning unknown. Purchasing metadata, independent of stock mode. No price history, currency conversion, or cost calculations are defined. |
| `cc-shopping-list` | `boolean` | `false` | Explicitly marks this bottle for purchase when `true`. Missing means `false`. Independent of current stock level and of any flag on its ingredient type; eligible for the planned combined shopping-list view. |

Earlier development notes using `cc-types` need manual conversion: select one ingredient type, store its quoted wiki link as the scalar `cc-type`, and remove `cc-types`. The reader does not fall back to the old property or choose between multiple types. Update preserved bottle Bases to use `note.cc-type` in their property configuration and column order; setup does not overwrite them.

Only the selected mode's stock fields apply: volume mode has open mL and unopened count; status mode has qualitative availability. Full bottle volume, ABV, price, and the shopping flag remain independent metadata in either mode. The description lives in the body.

When all quantities are known, total volume is `open mL + unopened count × bottle volume mL`; it is derived rather than stored separately. Unknown quantities must not silently become zero when claiming an exact total. Opening an unopened bottle requires a known bottle volume and a known positive unopened count. The model records one open-bottle amount rather than several separately measured open bottles.

## Other stock

A source that supplies ingredient types, such as fresh fruit, prepared juice, or homemade syrup. This resource uses the stored kind `ingredient`; it is distinct from an ingredient type. New notes are placed in `<root>/Ingredients/`. The creation form writes the selected stock mode and its applicable fields.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"ingredient"` | `true` | Identifies an other-stock source for cabinet browsing and relationship traversal. |
| `cc-name` | `string` | `false` | Proper source name for plugin UI and new links. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in cabinet picker search and available to Obsidian links. |
| `cc-provides` | `link<Ingredient type>[]` | `false` | Types supplied by this source. Read for linked-resource browsing and related-recipe traversal, allowing fresh and bottled juice to supply the same type. Empty lists are valid. This relationship does not itself establish that the source is stocked. |
| `cc-form` | `StockForm` | `false` | Describes how the ingredient is supplied. The existing form defaults to `Fresh ingredient`. Independent of tracking mode: homemade syrup, prepared juice, or purchased juice can each use volume or status tracking. |
| `cc-stock-tracking` | `StockTracking` | `true` | Selects `volume` or `status` for this source. The creation default is `status`, saved explicitly. The resource's form does not constrain its choice of mode. |
| `cc-remaining-ml` | `number \| null` | `false` | **Volume mode only.** Nonnegative total mL remaining in this source, such as `500` mL of homemade syrup or prepared juice. Missing or null means unknown; zero explicitly means empty. Planned consumption deducts measured mL from this value. |
| `cc-availability` | `Availability` | `false` | **Status mode only.** Manual `Unknown`, `Have`, `Low`, or `Out`; missing means `Unknown`. Creation writes the chosen status explicitly. It does not establish an exact quantity or automatically change after each use. |
| `cc-last-purchase-price` | `number \| null` | `false` | Nonnegative amount paid for the most recent purchase of this source, using the user's consistent currency convention. Zero is valid; missing or null means unknown. The purchased quantity is not modeled, so this field does not imply a per-mL price. Optional for homemade or otherwise unpurchased sources. |
| `cc-shopping-list` | `boolean` | `false` | Marks this source for purchase or replenishment when `true`. Missing means `false`. Eligible for the planned combined shopping-list view, independently of stock mode, status, and flags on the provided types. |

`StockForm` is one of `Fresh ingredient`, `Prepared juice`, `Bottled juice`, `Homemade syrup`, `Purchased syrup`, or `Other`. The source description lives in the body. Measured juice yields, individual preparation batches, and multiple container sizes are not defined by this schema.

## Stock tracking rules

`StockTracking` is the enum `volume` or `status`. `Availability` is the enum `Unknown`, `Have`, `Low`, or `Out`. The tracking mode is selected independently on each bottle or other-stock record. It does not belong on categories, families, or ingredient types: those describe recipe-facing ingredients, not owned quantities.

| Mode | Authoritative stock | Planned consumption and availability behavior |
| --- | --- | --- |
| `volume` | For bottles: `cc-open-ml`, `cc-unopened`, and bottle volume. For other stock: `cc-remaining-ml`. | Deduct measured pours in mL. Keep unknown quantities distinct from known zero. Compare a known quantity with a recipe's requirements when assessing whether it is sufficient. Report a shortfall or unknown quantity rather than inventing stock. |
| `status` | `cc-availability`: `Unknown`, `Have`, `Low`, or `Out`. | Preserve the user's status during drink logging. `Have` and `Low` can indicate qualitative availability, but do not prove enough for a given number of servings. `Out` means unavailable and `Unknown` makes no claim of availability. |

The mode is the sole authority for stock: inactive-mode fields must not be written by creation or a mode change, and must not influence future stock calculations if manually left behind. Changing modes must be an explicit user action that initializes the new mode; it must not infer a numerical amount from `Have`, or silently choose a qualitative status from the previous volume. A missing mode is incomplete stock configuration, not an invitation to guess from the resource kind. General note browsing may still recognize the resource through `cc-kind`.

Volume is stored as mL remaining. The mL used is an input to a consumption operation, not a cumulative stock field. Estimated starting quantities are allowed. The bottle creation form starts in percent-full entry and defaults to 100% when a valid bottle volume is entered. It also accepts mL directly and shows the resulting mL. A positive percentage requires a known full bottle volume; zero percent means zero mL even without it. Changing bottle volume preserves any explicitly entered percent or mL, including blank and zero; the untouched full-bottle default follows volume changes. Switching input units converts the current amount when possible and reports missing volume or invalid input without discarding the entry. Percentages are not persisted. The creation form resets stock inputs to unknown when switching modes. Existing notes are edited through Obsidian properties or Bases: explicitly initialize the new mode and remove inactive stock fields when changing modes; no dedicated mode-editing command is provided. A record may explicitly have unknown quantities.

Status tracking has no automatic Low threshold or depletion. Fresh fruit in status mode does not acquire an inferred juice yield. Replenishing an existing source updates its current stock; this schema does not require a batch record for each syrup preparation.

## Upgrading early stock notes

Setup preserves existing notes and views. It does not convert the initial fraction schema automatically. Before recording more stock in an early cabinet:

1. For each old bottle, set `cc-stock-tracking` to `volume`. Convert a known `cc-open-fraction` using `cc-open-ml = cc-open-fraction × cc-volume-ml` (for example, `0.5 × 750 = 375`). Keep `cc-unopened`, full bottle volume, and ABV unchanged. Remove `cc-open-fraction` after conversion.
2. Preserve unknown stock: a missing or null fraction remains unknown (`cc-open-ml: null`). A known zero fraction becomes zero mL. If the fraction is positive but full volume is unknown, find the full volume or enter a current mL estimate before replacing that quantity; do not invent a volume. Review invalid fractions or amounts exceeding full volume instead of converting them blindly.
3. For each old other-stock source using qualitative availability, set `cc-stock-tracking` to `status` and retain its status; missing availability means Unknown. Do not infer mL from Have or Low.
4. In existing Bases, replace the fraction column with `cc-open-ml` and add tracking mode, remaining mL, status, and purchasing columns as needed. Existing home notes are user-owned: remove obsolete stock-unit advice and link to the resource views. Rerunning setup only adds missing files.

Prices and shopping flags are optional; omitted prices stay unknown and omitted flags mean false.

## Purchasing and the shopping list

Types, bottles, and other-stock sources share `cc-shopping-list: boolean`, optional with an effective default of `false`. It records purchase intent, independently of tracking mode and stock state. Empty stock does not automatically set it, and positive stock does not automatically clear it.

The planned combined view includes recognized cabinet resources of kind `type`, `bottle`, or `ingredient` whose `cc-shopping-list` is exactly `true`. A type-level entry means a generic need, such as Lime Juice; a bottle-level entry names the particular bottle; an other-stock entry names that source. Flags do not propagate between linked resources. If both a type and its bottle are explicitly flagged, both entries remain visible rather than one being silently hidden or merged.

`cc-last-purchase-price` belongs to actual bottle or other-stock records. Ingredient types remain classifications and generic shopping needs rather than holders of a particular purchase's price. Prices are plain numeric amounts in the user's consistent currency convention, without currency symbols, inferred currency, or automatic conversion. Missing prices remain unknown, and shopping entries do not require a price. Mixed-currency accounting, purchase history, pack pricing, and automatic clearing of shopping flags on purchase are outside this schema change.

For example, these are two representations of the same source with different bookkeeping preferences:

```yaml
cc-kind: ingredient
cc-name: Homemade simple syrup
cc-provides:
  - "[[Cocktails/Types/Simple Syrup (2 to 1)|Simple Syrup (2 to 1)]]"
cc-form: Homemade syrup
cc-stock-tracking: volume
cc-remaining-ml: 500
cc-shopping-list: false
```

```yaml
cc-kind: ingredient
cc-name: Homemade simple syrup
cc-provides:
  - "[[Cocktails/Types/Simple Syrup (2 to 1)|Simple Syrup (2 to 1)]]"
cc-form: Homemade syrup
cc-stock-tracking: status
cc-availability: Have
cc-shopping-list: false
```

## Cocktail recipe

A cocktail's requirements, method, description, and tasting notes. New notes are placed in `<root>/Recipes/`.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"recipe"` | `true` | Identifies a recipe for browsing and related-recipe discovery. |
| `cc-name` | `string` | `false` | Proper recipe name for plugin UI and new links. Generated from the required Recipe name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in cabinet picker search and available to Obsidian links. |
| `created` | `date` | `false` | Resolved to the local calendar date during creation, such as `2026-10-30`. Recorded metadata; no current date-based behavior reads it. Generated recipes always include it. |
| `source` | `string \| null` | `false` | Provenance such as a URL, book, or attribution. The form trims text and stores `null` when blank. Recorded only; no fetching or interpretation. |
| `rating` | `unknown` | `false` | Reserved rating metadata, initialized to `null`. The value type and scale have not been defined or validated. No rating form input, sorting, or filtering currently uses it. |

Recipe requirements are Markdown body content rather than frontmatter properties:

| Body section | Type | Required | Description and use |
| --- | --- | --- | --- |
| Ingredients | `Markdown list` | `false` | Creation requires at least one ingredient and writes the entered amount plus a link or plain text. Related-recipe discovery reads wiki links only from this section. An existing recipe can still be recognized without it, but supplies no discoverable requirements. |
| Method | `Markdown` | `false` | Preparation steps; written by the recipe form and not interpreted. |
| Description | `Markdown` | `false` | Recipe description; written by the form and not interpreted. |
| Tasting Notes | `Markdown` | `false` | Personal tasting notes; written by the form and not interpreted. Links here do not count as ingredient requirements. |

Linked requirements can reference an ingredient category, family, type, or specific bottle. The recipe creation picker does not select other-stock sources. Amounts remain text and are not parsed into quantities. Plain-text ingredients cannot be resolved through the classification graph. Related-recipe discovery does not rewrite recipe requirements or consider recorded stock quantities and availability.

## Cabinet home

The cabinet landing note, written at exactly `<root>/Cocktail Cabinet.md`. Setup detection requires both this path and the kind marker. It is not included in ingredient, stock, or recipe browsing.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"cabinet"` | `true` | Identifies the home note when the plugin checks whether the selected cabinet is set up. |
| `cc-name` | `string` | `false` | Written as `Cocktail Cabinet`. No current runtime behavior reads the home note's display name. |
| `cc-schema-version` | `integer` | `false` | Written as `1`. No runtime reader checks it; it does not select a parser, run migrations, or enable compatibility handling. It has no current behavioral requirement. |

The body starts with command-palette guidance for adding stock and recipes, then introduces bottles, other stock, and recipes before the ingredient reference catalog. It links to all six resource Bases in `<root>/Views/` as it explains the concepts, with types, families, and categories in order. It explains that catalog membership does not imply owned stock, how to edit the tables, and how to find related recipes. It contains no embedded tables or stock-unit instructions; the linked views query current notes rather than enumerate the starter catalog. Setup creates the home when missing and preserves it when present; older home notes need their new Base links added manually.

## Resource Bases

Setup creates `Ingredient categories.base`, `Ingredient families.base`, `Ingredient types.base`, `Bottles.base`, `Other stock.base`, and `Recipes.base` in `<root>/Views/`. These files are core Obsidian Bases configuration, with no frontmatter resource marker and no plugin runtime dependency. Each filters Markdown files inside the cabinet root by the corresponding `cc-kind`; parent properties and catalog IDs are not required. The cabinet home is not a seventh resource Base.

Table columns show note links, proper names, and the resource's current creation fields. Missing optional values stay empty. Stock views show the selected mode, mL quantities, availability, price, and shopping flags. Ingredient types show their shopping flag too. ABV is labeled as a fraction; open stock is labeled in mL. New notes populate only the selected mode’s stock fields; Bases also display inactive fields if a user manually leaves them behind. Users can edit filters and columns in Obsidian; setup keeps existing `.base` files at these paths, even when their configuration has changed.

## Naming and starter identity

The display name, filename, catalog ID, and page heading have separate roles. Creation writes the name property and heading, generates a plain Latin filename, and supplies proper-name display text for new links. The reader uses a nonblank name suitable for link display; otherwise it falls back to the filename.

There is no ongoing synchronization between these representations. Editing `cc-name` affects subsequent plugin displays and newly generated links; it does not rename the file, rewrite the heading, or update existing links' display text.

`cc-catalog-id` is optional for custom resources but must be retained on starter categories, families, and types for setup to preserve their catalog identity across renames. IDs use a slash between the level and identity, such as `family/Aquavit`, to avoid URL-scheme rendering. Catalog identity is independent of the display name and path. Browsing and recipe discovery do not use it.

## Plugin settings

Settings are saved in the plugin's `data.json`, outside note frontmatter.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cabinetFolder` | `string` | `false` | Selects the cabinet root. Defaults to `Cocktails` if absent or invalid. Setup can select another folder; changing it does not move or convert resources. |

## Implementation references

- [Property constants and resource kinds](../src/core/schema.ts).
- [Note rendering, naming, aliases, and recipe sections](../src/core/notes.ts).
- [Core Bases definitions](../src/core/bases.ts).
- [Starter setup and home-note metadata](../src/core/setup.ts).
- [Catalog IDs, relationships, syrup metadata, and authored aliases](../src/catalog/catalog.ts).
- [Runtime property readers and setup recognition](../src/vault/cabinet-store.ts).
- [Hierarchy traversal and same-type bottle discovery](../src/core/relationships.ts).
- [Stock validation and mode-specific properties](../src/core/stock.ts).
- [Bottle and other-stock inputs](../src/ui/stock-modal.ts), [ingredient inputs](../src/ui/ingredient-modal.ts), and [recipe inputs](../src/ui/recipe-modal.ts).
