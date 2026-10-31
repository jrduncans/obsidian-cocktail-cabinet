# Resource schemas

Schemas for Cocktail Cabinet resources, including approved stock-tracking and purchasing changes awaiting implementation. The `cc-` prefix means Cocktail Cabinet; it namespaces properties without implying that every resource is a cocktail recipe. Obsidian's standard `aliases` property and the existing recipe properties `created`, `source`, and `rating` keep their unprefixed names.

The stock schema is the agreed next design: per-record volume or status tracking, mL remaining, last purchase price, and shopping-list flags. The current creation UI still records bottle fractions and qualitative other-stock availability; it does not yet write the new mode, mL, purchasing, or shopping-list fields. Consumption operations and the combined shopping-list view also remain to be implemented. Other resource behavior below describes the existing implementation. No runtime schema validator or compatibility layer is introduced by this document.

## Reading the schemas

Each resource below lists its own frontmatter properties with a **Type**, a boolean **Required** flag, and a description of its use.

- `Required: true` means the property is required by the resource schema. `false` means omission is supported. For stock resources, the selected mode is required for stock behavior; the current lightweight browser only checks the kind marker. Creation forms can require additional input, and generated notes can include optional properties; those rules are described explicitly.
- `string` is YAML text. `number` is a YAML number. `integer` is a whole number. `date` is a local calendar date stored as `YYYY-MM-DD`.
- `T[]` is a list of values of type `T`. `link<Resource>` is a quoted wiki-link string pointing to a cabinet resource of that type. For example: `"[[Cocktails/Families/Rum|Rum]]"`. Generated relationships are lists; the reader also accepts one link string.
- `null` is an explicit unknown value, distinct from zero. Optional properties may be absent; a type containing `null` additionally permits an explicit null value.
- `unknown` identifies a field whose value type has not yet been defined. It is not a claim that a value has been validated.

Ordinary resources must be Markdown files inside the selected cabinet root, which defaults to `Cocktails`. The plugin uses `cc-kind` to recognize each resource; subfolders organize new files but do not determine their type. Relationship targets must resolve to recognized resources of the expected kind inside the cabinet. Invalid or unresolved relationships are ignored. Empty relationship lists are valid, and multiple links are supported.

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
| `cc-catalog-id` | `string` | `false` | Starter identity, such as `type/Apple Brandy`. The level distinguishes it from `family/Apple Brandy`. Setup reads it for recognition across renames, missing-page recovery, and duplicate detection. Omitted on user-created types. |
| `cc-family` | `link<Ingredient family>[]` | `false` | Broader groupings read for linked-resource browsing and related-recipe traversal. Missing families are valid. A narrow type does not gain sibling types as alternatives merely by sharing a family. |
| `cc-brix` | `number \| null` | `false` | Sugar concentration from 0 to 100; blank form input stores `null`. Starter syrup values are nominal definitions, not batch measurements. Recorded for viewing and editing; no current sweetness calculations use it. |
| `cc-sugar-water-ratio` | `string` | `false` | Authored on the three starter simple/demerara syrup types, such as `2:1 by weight`. Records the ratio and its weight basis. No dedicated form input, runtime parser, or calculation currently uses it. |
| `cc-shopping-list` | `boolean` | `false` | Approved planned field: marks a generic need for this ingredient type when `true`, without selecting a bottle or source. Missing means `false`. Included in the planned combined shopping-list view; independent of flags and stock levels on linked bottles or sources. |

Descriptions and optional Preparation instructions live in the body. They are not parsed as frontmatter properties or preparation batches.

## Bottle

A named bottling, together with its recorded stock. A resource represents a bottling rather than one physical bottle. New notes are placed in `<root>/Bottles/`. Stock tracking and purchasing fields in this section are the approved design; the creation UI has not yet implemented them.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"bottle"` | `true` | Identifies a bottle for cabinet browsing and recipe ingredient selection. |
| `cc-name` | `string` | `false` | Proper display name for plugin UI and new links. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in picker search and available to Obsidian links. |
| `cc-types` | `link<Ingredient type>[]` | `false` | Classifies the bottling for linked-resource browsing and related-recipe discovery. Bottles sharing an explicitly linked type can appear as same-type alternatives; sharing a family alone is insufficient. Empty lists are valid. |
| `cc-stock-tracking` | `StockTracking` | `true` | Selects `volume` or `status` for this bottle record. This choice determines the applicable stock fields below. The planned creation default is `volume`, saved explicitly rather than inferred from a missing property. |
| `cc-volume-ml` | `number \| null` | `false` | Full volume of one bottle in milliliters, greater than zero when known, such as `750`. A missing or null value is unknown. Used by planned bottle rollover and optional percentage-to-mL initialization; remains useful descriptive metadata in status mode. |
| `cc-abv` | `number \| null` | `false` | Alcohol strength as a fraction from 0 to 1. The existing form accepts 0–100 percent, so `40` stores `0.4`; blank stores `null`. Stock tracking changes do not change the representation of ABV. |
| `cc-open-ml` | `number \| null` | `false` | **Volume mode only.** Nonnegative mL remaining in the open bottle, excluding unopened bottles. Must not exceed the known full bottle volume. Missing or null means unknown; zero explicitly means no open stock. Planned consumption deducts mL directly. |
| `cc-unopened` | `integer \| null` | `false` | **Volume mode only.** Nonnegative count of unopened bottles. Missing or null means unknown. Planned rollover uses this count and full bottle volume when another bottle must be opened. |
| `cc-availability` | `Availability` | `false` | **Status mode only.** Manual `Unknown`, `Have`, `Low`, or `Out`; missing means `Unknown`. Planned creation writes the chosen status explicitly. Pours do not automatically decrement or change this status. |
| `cc-last-purchase-price` | `number \| null` | `false` | Nonnegative numeric amount last paid for one bottle of this bottling, with zero valid and missing or null meaning unknown. Purchasing metadata, independent of stock mode. No price history, currency conversion, or cost calculations are defined. |
| `cc-shopping-list` | `boolean` | `false` | Explicitly marks this particular bottling for purchase when `true`. Missing means `false`. Independent of current stock level and of any flag on its ingredient types; eligible for the planned combined shopping-list view. |

Only the selected mode's stock fields apply: volume mode has open mL and unopened count; status mode has qualitative availability. Full bottle volume, ABV, price, and the shopping flag remain independent metadata in either mode. The description lives in the body.

When all quantities are known, total volume is `open mL + unopened count × bottle volume mL`; it is derived rather than stored separately. Unknown quantities must not silently become zero when claiming an exact total. Opening an unopened bottle requires a known bottle volume and a known positive unopened count. The model records one open-bottle amount rather than several separately measured open bottles.

## Other stock

A source that supplies ingredient types, such as fresh fruit, prepared juice, or homemade syrup. This resource uses the stored kind `ingredient`; it is distinct from an ingredient type. New notes are placed in `<root>/Ingredients/`. Stock tracking and purchasing fields in this section are the approved design; the creation UI has not yet implemented them.

| Property | Type | Required | Description and use |
| --- | --- | --- | --- |
| `cc-kind` | `"ingredient"` | `true` | Identifies an other-stock source for cabinet browsing and relationship traversal. |
| `cc-name` | `string` | `false` | Proper source name for plugin UI and new links. Generated from the required Name input; falls back to the filename if absent or unusable. |
| `aliases` | `string[]` | `false` | Alternate names included in cabinet picker search and available to Obsidian links. |
| `cc-provides` | `link<Ingredient type>[]` | `false` | Types supplied by this source. Read for linked-resource browsing and related-recipe traversal, allowing fresh and bottled juice to supply the same type. Empty lists are valid. This relationship does not itself establish that the source is stocked. |
| `cc-form` | `StockForm` | `false` | Describes how the ingredient is supplied. The existing form defaults to `Fresh ingredient`. Independent of tracking mode: homemade syrup, prepared juice, or purchased juice can each use volume or status tracking. |
| `cc-stock-tracking` | `StockTracking` | `true` | Selects `volume` or `status` for this source. The planned creation default is `status`, saved explicitly. The resource's form does not constrain its choice of mode. |
| `cc-remaining-ml` | `number \| null` | `false` | **Volume mode only.** Nonnegative total mL remaining in this source, such as `500` mL of homemade syrup or prepared juice. Missing or null means unknown; zero explicitly means empty. Planned consumption deducts measured mL from this value. |
| `cc-availability` | `Availability` | `false` | **Status mode only.** Manual `Unknown`, `Have`, `Low`, or `Out`; missing means `Unknown`. Planned creation writes the chosen status explicitly. It does not establish an exact quantity or automatically change after each use. |
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

Volume is stored as mL remaining. The mL used is an input to a consumption operation, not a cumulative stock field. Estimated starting quantities are allowed; an optional bottle-percentage input can convert an estimate once using a known full bottle volume, without persisting a fraction. Switching an existing record to volume tracking requires entering its starting quantity; a new record may explicitly start with unknown quantities.

Status tracking has no automatic Low threshold or depletion. Fresh fruit in status mode does not acquire an inferred juice yield. Replenishing an existing source updates its current stock; this schema does not require a batch record for each syrup preparation.

## Purchasing and the shopping list

Types, bottles, and other-stock sources share `cc-shopping-list: boolean`, optional with an effective default of `false`. It records purchase intent, independently of tracking mode and stock state. Empty stock does not automatically set it, and positive stock does not automatically clear it.

The planned combined view includes recognized cabinet resources of kind `type`, `bottle`, or `ingredient` whose `cc-shopping-list` is exactly `true`. A type-level entry means a generic need, such as Lime Juice; a bottle-level entry names the particular bottling; an other-stock entry names that source. Flags do not propagate between linked resources. If both a type and its bottle are explicitly flagged, both entries remain visible rather than one being silently hidden or merged.

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

The body contains navigation links to starter categories and parentless families and types, plus usage instructions. Setup creates it when missing and preserves it when present; it does not refresh existing home-note links.

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
- [Starter setup and home-note metadata](../src/core/setup.ts).
- [Catalog IDs, relationships, syrup metadata, and authored aliases](../src/catalog/catalog.ts).
- [Runtime property readers and setup recognition](../src/vault/cabinet-store.ts).
- [Hierarchy traversal and same-type bottle discovery](../src/core/relationships.ts).
- [Bottle and other-stock inputs](../src/ui/stock-modal.ts), [ingredient inputs](../src/ui/ingredient-modal.ts), and [recipe inputs](../src/ui/recipe-modal.ts).
