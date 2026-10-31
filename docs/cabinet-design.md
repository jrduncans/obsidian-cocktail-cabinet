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

## Approved stock and purchasing design

This direction is agreed for the next schema iteration. The [resource schemas](note-properties.md) specify the fields and constraints. The creation forms currently use the initial stock representation described under First implementation; the mode-based schema, purchasing fields, consumption behavior, and combined shopping-list view await implementation.

- Each bottle or other-stock source explicitly selects `cc-stock-tracking: volume` or `status`. The source's form does not determine its mode; homemade syrup, fresh or purchased juice, and bottles can use either. Creation defaults will be volume for bottles and status for other stock.
- Volume tracking stores mL remaining. Bottles use `cc-open-ml` for the open bottle and retain full bottle volume and unopened count; other stock uses `cc-remaining-ml`. Bottle fractions are replaced in the target schema. ABV continues to be stored as a fraction. Unknown quantities remain distinct from known zero.
- Status tracking uses manual Unknown, Have, Low, or Out availability. Logging a drink will not decrement or automatically change qualitative status, and no automatic Low threshold is selected. Qualitative availability does not prove a sufficient quantity for any number of servings.
- Only the selected mode's stock fields are authoritative. Mode changes explicitly initialize the newly selected representation. Percentage estimates can be an input convenience when a bottle's full volume is known; the stored stock quantity remains mL.
- `cc-shopping-list` is an optional boolean on ingredient types, bottles, and other-stock sources, defaulting to false. It expresses explicit purchase intent independently of availability. Flags do not propagate through classification links, and future combined shopping-list views include every explicitly marked resource.
- `cc-last-purchase-price` is an optional nonnegative number on bottles and other-stock sources. Missing or null means unknown; zero is valid. Preserve the existing numeric-price convention without currency symbols or inferred conversions. Price history and per-mL costing are not part of this change.

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
- Use Amaro as the family for the starter bitter liqueurs. Its boundaries remain open to review; current members are Red Bitter Liqueur, Orange Bitter Liqueur, Gentian Liqueur, Fernet, and Artichoke Amaro. Prefer ingredient-oriented names over aperitif/digestif terminology.
- Separate Campari-style Red Bitter Liqueur (including Crimson Snap) from Aperol-style Orange Bitter Liqueur (including Mari Gold). Sharing the Amaro family must not make those types same-type alternatives. These names identify recipe roles, not classification by color alone.
- Gentian Liqueur covers Salers, Suze, Avèze, and, as a practical recipe-role classification for this cabinet, Bitter Bianco. Different formulations and strengths remain bottle properties.
- Keep Orange Liqueur broad across triple sec, curaçao, and brandy- or rum-based styles. Accept Pierre Ferrand Orange Curaçao alongside Cointreau and Üla as candidates without encoding which is the closer substitute. Users can choose narrower types or bottle references when needed.
- Filenames use plain Latin characters. Preserve the proper name in a property and on the page, and use it as the displayed text of plugin-generated links, for example `[[Cachaca|Cachaça]]`. Accented and unaccented spellings should both be findable.
- Prefer a useful shared ingredient type when it can represent local alternatives to named bottles. Explicit bottle-to-bottle substitution remains a candidate for exceptions; whether to include it has not been decided. Classification and substitution should remain distinguishable.
- Before replacing the legacy substitution field, consult the [review of all populated knowledge-vault substitutions](knowledge-substitutions-review.md) for the agreed groupings and remaining questions. The Gentian Liqueur grouping now covers Bitter Bianco → Salers; the initial audit's suggestion that it needed an explicit exception is superseded. Whether to retain a directional exception feature remains open.
- Apple Brandy is a family containing Apple Brandy, Bonded Apple Brandy, Applejack, and Calvados types. Users decide which types their bottles fit. Broad recipe references can use the family; the Apple Brandy type also remains available as requested.
- Use Brandy colloquially for French-style grape brandy, with Cognac and Armagnac as types. Remove the residual Grape Brandy type from the starter catalog.
- Omit Pisco from the starter cabinet. Users can add a type or family and choose their own scheme; no demonstration recipe or default subdivisions are supplied.
- Sugar Syrup includes simple, demerara, honey, and agave syrups without added flavorings. The sweetener's own flavor does not put it in Flavored Syrup; that family groups fruit-, nut-, and spice-flavored preparations.
- Keep Falernum as the liqueur under Spice Liqueur and add a distinct nonalcoholic Falernum Syrup under Flavored Syrup. This deliberately reverses the knowledge vault's unadorned Falernum name for syrup; any future adoption must preserve ingredient meaning rather than match names alone.
- Omit Coconut Rum from the starter set. Add Cream of Coconut as a standalone type, explicitly distinguished from unsweetened coconut cream and coconut milk.
- Omit Quinquina, Ruby Port, Tawny Port, and the Other Fortified Wine family from the starter set. Vermouth and Sherry provide the initial Fortified Wine families; users can add further wine styles as needed.
- Use Black Jamaican Rum as the ingredient type name under Rum, replacing the broader Black Rum starter entry. Explain its pronounced caramel influence and Jamaican character in the description; color alone does not establish membership. Keep this recipe role distinct from Aged Jamaican Rum. See the recorded rum choices and remaining adoption questions in the [rum organization review](rum-organization-review.md).
- Keep Aged Overproof Jamaican Rum and Unaged Overproof Jamaican Rum as separate ingredient types under Rum, replacing the generic Overproof Jamaican Rum starter entry. Preserve the distinction between the Smith & Cross recipe role and the Wray & Nephew/Rum Fire role.
- Use Light Rum for the lightly aged, filtered, relatively restrained style represented by Don Q Cristal. Keep the production details in its description and preserve a separate clear multi-region blended rum role. Imported recipes may use light rum more broadly, so the name alone does not establish the intended style. Use White Blended Rum for the clear multi-region blended role represented by Probitas, replacing the starter's Lightly Aged Blended Rum. Keep the multi-region distinction in its description; components may be aged or unaged.
- Use Demerara 151 Rum rather than Overproof Demerara Rum to preserve the specific 151 US proof (75.5% ABV) recipe role. Record O.F.T.D. as a future substitution candidate for this requirement while keeping its multi-region blend identity distinct. This does not implement substitution matching or settle recipe-specific suitability and quantity adjustments.
- Include Blended Overproof Rum as a shared ingredient type covering O.F.T.D., Hamilton Zombie Blend, and Planteray Mister Fogg. Recipes generally specify these bottles directly; preserve the named bottle rather than generalizing its requirement to the type. Shared classification remains useful without implying identical flavor or strength.
- Use Aged Barbados Rum for the moderately aged Barbados-style blend of pot- and column-still rum represented by Real McCoy 5, Planteray Barbados 5 Year, and Mount Gay Eclipse. More aged expressions such as Real McCoy 12 generally fill the same recipe role; lighter white expressions such as Real McCoy 3 and Mount Gay Silver do not. Prefer Barbados over Barbadian or Bajan in the displayed type name. This defines a recipe role rather than a fixed age range.
- Include Aged Column Still Rum for the moderately aged recipe role represented by Ron Abuelo Añejo and Don Q Gold, with older expressions generally acceptable. Preserve its distinction from Aged Barbados Rum even though the styles can overlap. Retain the existing vault name for now; whether column-still or Spanish-style terminology is the best label remains open. Define the intended recipe role through descriptions and examples rather than classify every column-distilled rum into it.
- Define Aged Blended Rum as the aged multi-region blend recipe role represented by Planteray Original Dark. Keep it distinct from Aged Barbados Rum and Aged Column Still Rum; it is not a catch-all requirement for any aged rum or any pot-and-column blend.
- Include Pineapple Rum as a broad ingredient type. Most recipes should probably name Stiggins’ Fancy when that is the intended flavor, since other pineapple rums can differ substantially. Preserve specific bottle references and retain the generic type for genuinely generic requirements; the starter type does not authorize rewriting existing recipes or treating every pineapple rum as an equivalent replacement.
- Use Unaged Rhum Agricole and Aged Rhum Agricole as the displayed type names, with Rhum Agricole Blanc and Rhum Agricole Vieux respectively captured in Obsidian's standard aliases property and in the descriptions. Cabinet pickers include aliases alongside proper names and filenames so either naming convention finds the same page. A synonym identifies the same ingredient; it is separate from substitution. Setup continues to preserve existing notes.
- Separate the Barbancourt-style Haitian recipe roles into Unaged Haitian Rum and Aged Haitian Rum. The aged role includes Barbancourt 3 Star and 5 Star; the unaged role means no wood maturation and permits steel-tank resting, with White Haitian Rum as an alias. Clairin is a separate intended ingredient and is not included in either role. Preserve a named bottle and its strength: Slow Hands explicitly requests Barbancourt 110. Its white appearance alone does not establish unaged membership; the expression-specific maturation details remain unverified in the primary sources reviewed. See the [rum review](rum-organization-review.md) for the white-expression evidence.
- Use Unaged Mexican Rum for the Paranubes-style unaged fresh-cane-juice recipe role, with Oaxacan Rum retained as a search alias for the existing vault terminology. The short name is deliberately broader than its definition: country and age alone do not establish membership. Classify other Mexican bottles by their fit for this recipe role rather than automatically include every unaged Mexican rum. No alternative to Paranubes has been approved by this review. See the [Mexican rum evidence](rum-organization-review.md#mexican-rum-name-and-scope).
- Omit Navy Strength Rum as a separate starter type; the user considers it insufficiently useful beyond its current Mister Fogg assignment. Planteray Mister Fogg belongs to Blended Overproof Rum in the intended classification. Keep the existing knowledge-vault bottle/type/recipe links unchanged during this review: FALSE IDOL still references Navy Strength Rum, so future adoption must decide how to preserve that requirement before retiring the legacy type.
- Omit the separate non-overproof Unaged Jamaican Rum starter type. The user knows products such as Rum Bar Silver exist but has not encountered a recipe calling for that role. Keep Unaged Overproof Jamaican Rum; the bounded starter should reflect recipe needs rather than every existing rum style.

The hierarchy table is generated from the catalog with `npm run catalog:docs`; `npm test` checks it for drift. Tests also assert selected reviewed classifications so that a synchronized table cannot silently reintroduce those old defaults.

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

These are concrete implementation choices for trying the first cabinet flow, rather than a commitment to a final released schema: The [resource schemas](note-properties.md) document the fields and identify approved stock and purchasing changes that are not yet implemented.

- A chosen cabinet root (default `Cocktails`) contains Categories, Families, Types, Bottles, Ingredients, and Recipes folders, plus a home note. Notes require both the root scope and an explicit `cc-kind` marker to participate.
- Stored fields use the `cc-` prefix, short for Cocktail Cabinet; plugin UI uses short labels. The prefix namespaces properties without suggesting that each resource is a cocktail recipe. Cabinet property panels use a wider label column, capped at 45% of the available width, to accommodate longer property names without changing other notes' property panels. Wiki links include their vault-relative path and proper name as display text. No Dataview or Bases dependency is introduced.
- `cc-name` stores the proper name, also shown in the page heading. New note filenames fold Latin diacritics and ligatures into plain characters; names such as Cachaça, Añejo Tequila, and Bénédictine retain the existing plain filenames and catalog IDs. Accented names also become Obsidian aliases, and plugin pickers include the proper name, filename when it differs, and aliases. Older notes without the name property fall back to their filename.
- Family notes link to categories through `cc-category`; type notes link to families through `cc-family`. Both are optional lists. Links outside the supported adjacent levels are ignored by the hierarchy reader.
- The current bottle form links bottles to types through `cc-types` and stores bottle volume, ABV, remaining-open fraction, and unopened count. It still uses the initial fraction-based stock representation; implementing the approved stock schema above will replace that representation with mL and a selected tracking mode. Blank numeric values remain unknown.
- The current other-stock form links sources through `cc-provides`, with `cc-form` and qualitative availability. Fresh fruit and bottled juice can supply the same ingredient type. The approved schema above adds volume tracking as an independent per-source choice; preparation batches and measured yields remain outside the current scope.
- Ingredient types can have `cc-brix`. Default sugar syrups also state a sugar-to-water ratio by weight; values are nominal rather than measured batch properties. Ratio filenames use “1 to 1” and “2 to 1” for cross-platform validity.
- Recipes preserve `rating`, `source`, a resolved local `created` date, and the existing Ingredients, Method, Description, and Tasting Notes sections. Their ingredient references can target every hierarchy level or a bottle; plain-text ingredients remain possible.
- Setup is create-only and preflights conflicts. `cc-catalog-id` recognizes starter notes across renames within the root, preserving their content. IDs use a slash between the level and identity, such as `family/Aquavit`, to avoid Obsidian treating a colon as a URL scheme. The level distinguishes entries with the same name, such as the Apple Brandy family and type. Reruns fill missing pages without updating existing catalog descriptions or deleting retired entries. This is not an automatic migration flow.
- The catalog is an authored first draft for review, especially its rum and liqueur distinctions. It supplies definitions and no owned stock or cocktail recipes.

Verified in Cocktail Cabinet Dev on desktop Obsidian 1.14.5: setup, no-op retries, conflict preservation, renamed and customized family preservation, missing-page recovery using a renamed parent, bottle creation, fresh/bottled ingredient sources, broad recipe creation, and related recipe browsing. Source tests cover catalog integrity, hierarchy behavior, recipe rendering, and input validation. Real mobile-device testing remains pending.

The current vault hierarchy and templates are reference material, not a finalized plugin schema. Earlier architecture proposals remain proposals unless confirmed here or in a subsequent decision.
