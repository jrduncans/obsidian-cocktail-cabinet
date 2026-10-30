# Starting cabinet design

Working design notes from the initial plugin discussions. Confirmed direction is separate from questions that still need decisions.

## Confirmed direction

- Start with cabinet setup and ingredient, inventory, and recipe creation. Availability queries are not the first feature milestone.
- Preserve bottles as a first-class concept with bottle-specific properties. Do not replace them with a generic product model solely to accommodate other ingredients.
- Design deliberately for homemade syrups, fresh juice, and other non-bottle ingredients; their representation is still open.
- Supply a curated starting hierarchy with fixed levels and names. Arbitrary hierarchy depth and arbitrary level names are outside the intended scope.
- Use three levels: ingredient category, ingredient family, and ingredient type. Family replaces the previous term subcategory. Exact stored property names and any longer names used to avoid vault conflicts remain undecided.
- Build the default hierarchy from concrete ingredient types upward. Add families and categories where a comprehensible grouping provides useful recipe references or navigation. A complete chain is not the recommended default for every ingredient.
- Parent relationships are optional: a type may have no family, and a family may have no category. Fixed relationship roles keep the schema consistent without requiring every level to be populated.
- All ingredient types must remain equally findable, whether or not they have parents. Missing parents are not an incomplete or invalid state.
- The starting cabinet should be thorough enough to include the base spirits, several common liqueurs, the most common juices, and the most common syrups.
- Preserve the ability to reference a particular bottle in a recipe, support other bottles of the same ingredient type, and find that recipe through its ingredient type and broader classifications.
- Prefer useful opinions while allowing flexibility where it is inexpensive and understandable.

## Ingredient identity and starter content

- The guiding principle for distinguishing ingredients is whether the difference would change the cocktail recipe. This is a practical guideline; recipes vary in specificity, and users need room to customize their own distinctions.
- Default syrup types should distinguish 1:1 simple syrup, 2:1 simple syrup, and probably 2:1 demerara syrup. Do not collapse the defaults to match only the syrups the project owner personally stocks.
- Fruit juice means fresh juice by default. Bottled juice should be possible to track and use without requiring a separate recipe-facing ingredient type solely because it is bottled.
- Preparations such as superjuice or acid-adjusted juice can warrant distinct ingredient types. Their exact representation and default inclusion are still open.
- Included ingredient pages need a basic description and appropriate properties, such as Brix for sugar syrups. Preparation instructions may be included; they are not a commitment to batch tracking or a separate preparation-recipe system.
- The starter catalog should cover common needs with useful content while remaining bounded. The plugin helps people maintain and use their own recipe database; it is not intended to supply a comprehensive recipe database.

## Recipe specificity and hierarchy

- A recipe may reference any supported hierarchy level, including a broad entry such as Rum, as well as a specific bottle. It does not have to select a leaf ingredient type.
- A broad reference permits candidates classified beneath that entry. A narrow reference must not silently broaden to everything sharing a parent: a Rum requirement and an Aged Jamaican Rum requirement have different scopes.
- A broad classification's recipe view includes direct references and recipes referencing its descendant types or their bottles.
- A named bottle remains the recipe's named choice while the existing same-type alternative behavior is preserved. Sharing a broader group alone does not establish a same-type alternative.
- Imports should preserve the specificity supplied by their source. A recipe saying only rum can be created without forcing a narrower selection or inventing one.
- Users may subsequently refine broad requirements to specific ingredient types, as the project owner commonly does for rum recipes. Refinement is optional.

## Review of the default hierarchy

The optional-parent direction is agreed; individual ingredient classifications remain open to review. The current [starter hierarchy](starter-hierarchy.md) lists the default types and their proposed groupings.

The optional-parent review established these default groupings:

- Remove the Mixer and Pantry catch-all categories.
- Replace the Bitters category plus Cocktail Bitters family with a single parentless Bitters family.
- Keep Carbonated Mixer as a useful family without creating a broader Mixer category.
- Remove the Dairy and Egg and Garnish and Seasoning families; their types stand on their own in this pass.

The remaining branches retain their previous draft classifications for later focused review. This round does not approve all those classifications or change the ingredient identities.

### Ingredient review feedback

- Use separate Herbal Liqueur and Floral Liqueur families. Allspice Dram and Falernum belong to Spice Liqueur rather than the old combined family.
- Replace Nut and Dessert Liqueur with Nut Liqueur for Amaretto. Coffee Liqueur and Crème de Cacao stand alone rather than being forced into a dessert grouping.
- Use Vodka as the default ingredient type; flavored vodka is a distinction users can add. Remove the redundant Vodka family containing only Unflavored Vodka.
- Use Amaro as the family for the starter bitter liqueurs. Its boundaries remain open to review; current members are Red Bitter Liqueur, Gentian Liqueur, Fernet, and Artichoke Amaro. Prefer ingredient-oriented names over aperitif/digestif terminology.
- Filenames use plain Latin characters. Preserve the proper name in a property and on the page, and use it as the displayed text of plugin-generated links, for example `[[Cachaca|Cachaça]]`. Accented and unaccented spellings should both be findable.
- Prefer a useful shared ingredient type when it can represent local alternatives to named bottles. Explicit bottle-to-bottle substitution remains a candidate for exceptions; whether to include it has not been decided. Classification and substitution should remain distinguishable.
- Apple Brandy is a family containing Apple Brandy, Bonded Apple Brandy, Applejack, and Calvados types. Users decide which types their bottles fit. Broad recipe references can use the family; the Apple Brandy type also remains available as requested.
- Use Brandy colloquially for French-style grape brandy, with Cognac and Armagnac as types. Remove the residual Grape Brandy type from the starter catalog.
- Omit Pisco from the starter cabinet. Users can add a type or family and choose their own scheme; no demonstration recipe or default subdivisions are supplied.

The hierarchy table is generated from the catalog with `npm run catalog:docs`; `npm test` checks it for drift. Tests also assert the reviewed classifications above so that a synchronized table cannot silently reintroduce the old defaults.

## Open decisions

- The classification rules within the category, family, and type levels.
- How cabinet folders, note identification, property names, and links prevent conflicts with unrelated vault content. Longer names such as Cocktail ingredient family and folder scoping are possibilities, not selected solutions.
- Which ingredient types and classifications ship in the starting cabinet.
- How homemade preparations, purchased ingredients, and fresh ingredient sources relate to ingredient types and stock.
- Where optional preparation instructions live and whether any separate preparation records are needed.
- How fresh, bottled, and homemade sources are represented and stocked without unnecessary duplicate ingredient types.
- How to initialize the catalog without implying that the user owns its ingredients.
- How to reuse an existing collection and handle later catalog additions without overwriting personal changes.

## Storage considerations

Folder scoping can limit which notes the plugin handles, but it does not isolate Obsidian property types: a property's assigned type applies to that name throughout the vault. This makes stored property names a separate decision from folder layout and short labels in the plugin UI. See [Obsidian's property documentation](https://obsidian.md/help/properties).

Obsidian links can include folder paths to identify a note when names overlap; choosing how the plugin generates links is still open. See [Obsidian's internal link documentation](https://obsidian.md/help/links).

## First implementation

These are concrete implementation choices for trying the first cabinet flow, rather than a commitment to a final released schema:

- A chosen cabinet root (default `Cocktails`) contains Categories, Families, Types, Bottles, Ingredients, and Recipes folders, plus a home note. Notes require both the root scope and an explicit `cocktail-kind` marker to participate.
- Stored fields use the `cocktail-` prefix; plugin UI uses short labels. Wiki links include their vault-relative path and proper name as display text. No Dataview or Bases dependency is introduced.
- `cocktail-name` stores the proper name, also shown in the page heading. New note filenames fold Latin diacritics and ligatures into plain characters; names such as Cachaça, Añejo Tequila, and Bénédictine retain the existing plain filenames and catalog IDs. Accented names also become Obsidian aliases, and plugin pickers include both the proper name and filename when they differ. Older notes without the name property fall back to their filename.
- Family notes link to categories through `cocktail-category`; type notes link to families through `cocktail-family`. Both are optional lists. Links outside the supported adjacent levels are ignored by the hierarchy reader.
- Bottles link to types through `cocktail-types` and store `cocktail-volume-ml`, `cocktail-abv`, `cocktail-open-fraction`, and `cocktail-unopened`. ABV and open stock are fractions in storage; creation forms accept percentages. Blank numeric values are unknown, not stock.
- Other stock links to types through `cocktail-provides`, with `cocktail-form` and `cocktail-availability` (Unknown, Have, Low, Out). Fresh fruit and bottled juice can supply the same ingredient type. Further non-bottle inventory design remains open.
- Ingredient types can have `cocktail-brix`. Default sugar syrups also state a sugar-to-water ratio by weight; values are nominal rather than measured batch properties. Ratio filenames use “1 to 1” and “2 to 1” for cross-platform validity.
- Recipes preserve `rating`, `source`, a resolved local `created` date, and the existing Ingredients, Method, Description, and Tasting Notes sections. Their ingredient references can target every hierarchy level or a bottle; plain-text ingredients remain possible.
- Setup is create-only and preflights conflicts. `cocktail-catalog-id` recognizes starter notes across renames within the root, preserving their content. Reruns fill missing pages without updating existing catalog descriptions or deleting retired entries. This is not an automatic migration flow.
- The catalog is an authored first draft for review, especially its rum and liqueur distinctions. It supplies definitions and no owned stock or cocktail recipes.

Verified in Cocktail Cabinet Dev on desktop Obsidian 1.14.5: setup, no-op retries, conflict preservation, renamed and customized family preservation, missing-page recovery using a renamed parent, bottle creation, fresh/bottled ingredient sources, broad recipe creation, and related recipe browsing. Source tests cover catalog integrity, hierarchy behavior, recipe rendering, and input validation. Real mobile-device testing remains pending.

The current vault hierarchy and templates are reference material, not a finalized plugin schema. Earlier architecture proposals remain proposals unless confirmed here or in a subsequent decision.
