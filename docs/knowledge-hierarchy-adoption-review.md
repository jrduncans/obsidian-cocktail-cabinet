# Hierarchy adoption review: knowledge → Cocktail Cabinet

Compared the live `knowledge` hierarchy with the plugin catalog committed as `6e51eca` on 2026-10-29. This focuses on choices that could change your existing classifications, ingredient meanings, or links when adopting the plugin. It does not list ingredients absent from the starter catalog. Properties and UI are for the next review.

For the current bottle-by-bottle comparison, see the [knowledge bottle coverage review](knowledge-bottle-coverage-review.md), audited on 2026-10-31. It accounts for all 165 bottle notes, proposes types and families for uncovered bottles, distinguishes existing omissions from new starter/local-extension proposals, and flags ambiguous assignments. The snapshot tables below retain their original scope.

Follow-up decisions on 2026-10-30: split the bitter-liqueur recipe roles into Red Bitter Liqueur (Campari/Crimson Snap) and Orange Bitter Liqueur (Aperol/Mari Gold), include Bitter Bianco alongside Salers in Gentian Liqueur, and retain the broad Orange Liqueur type. See the [substitution review](knowledge-substitutions-review.md) for the recorded relationships and adoption implications. The tables below otherwise describe the original comparison snapshot.

Further starter review on 2026-10-30 resolves the Falernum naming question: the starter uses **Falernum Syrup** for the nonalcoholic syrup and **Falernum** for the liqueur. Existing knowledge links to Falernum therefore correspond to Falernum Syrup; existing Falernum Liqueur links correspond to Falernum. This is an agreed naming distinction, not an automatic migration. Honey Syrup now retains its Sugar Syrup family, joined by Agave Syrup. Coconut Rum is no longer a starter entry, and Cream of Coconut has been added as a standalone type. The snapshot rows below predate these changes.

The important distinction: **the starter catalog is a set of defaults, not a required taxonomy.** The reader accepts custom categories, families, and types. Most reclassifications below are choices to revisit before migration, rather than changes your vault must accept. The fixed relationship levels, optional parents, and naming policy are the broader design commitments.

Follow-up on 2026-10-31: the starter now includes a general **Amaro** type within **Amaro Family** for Averna, Montenegro, Meletti, Lucano, Nonino, and similar bottles. The specialized types remain. The general type is not intended to be assigned to every family member; existing broad Amaro bottle classifications still need deliberate review during adoption. The two families are now named **Amaro Family** and **Apple Brandy Family** to avoid duplicate page names with their types. **Apple Brandy** means regular apple brandy; the family permits any of its included styles. Other family names remain unchanged. Catalog IDs match the revised family names; the development vault is updated directly, without compatibility mappings for earlier starter versions.

## Give these the most attention

| Area                     | What exists in knowledge                                                                 | What the starter currently assumes                                                                         | Adoption consequence to review                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Falernum**             | `Falernum` is under Infused Syrup; `Falernum Liqueur` is separately under Spice Liqueur. | `Falernum` is under Spice Liqueur. Its description acknowledges variation in alcohol content.              | **The same name now points to a different kind of ingredient.** Preserve your syrup/liqueur distinction; do not automatically map the existing Falernum links to the starter entry. This is a substantive mismatch still needing a decision.                       |
| **Amaro**                | An ingredient type under Herbal Liqueur.                                                 | A family containing Red Bitter Liqueur, Gentian Liqueur, Fernet, and Artichoke Amaro.                      | A recipe may reference the new family, but bottles currently select types. Replacing your Amaro type with the family would require reclassifying affected bottles. Keeping a generic Amaro type inside that family is another supported option, like Apple Brandy. |
| **Crème de Cacao**       | Separate dark and white ingredient types.                                                | One generic Crème de Cacao type without a family.                                                          | Adopting the generic type would collapse a distinction you already preserve. You can retain both existing types; this should not become an automatic merge.                                                                                                        |
| **Rum specificity**      | Labels distinguish age, strength, production style, and sometimes origin.                | Several default labels are broader or use a different scheme.                                              | Treat the candidate correspondences below as review questions, not approved renames. Your existing types can remain.                                                                                                                                               |
| **Sugar syrup strength** | `Simple Syrup` and `Demerara Syrup`, both under Sugar Syrup.                             | Simple Syrup (1 to 1), Simple Syrup (2 to 1), and Demerara Syrup (2 to 1), with explicit ratios by weight. | Link migration needs a deliberate concentration choice. The existing type pages have no explanatory body identifying a ratio. Do not infer that a name-only match establishes the same recipe ingredient.                                                          |

### Rum labels that should not be treated as equivalent automatically

| knowledge label                                            | Nearby starter label     | Distinction potentially lost                                            |
| ---------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| White Blended Rum                                          | Lightly Aged Blended Rum | A color-oriented label does not establish the intended aging criterion. |
| Black Jamaican Rum                                         | Black Rum                | Jamaican origin/style is no longer explicit.                            |
| Demerara 151 Rum                                           | Overproof Demerara Rum   | A specified proof becomes a broader strength class.                     |
| Aged Overproof Jamaican Rum; Unaged Overproof Jamaican Rum | Overproof Jamaican Rum   | The age distinction is no longer expressed.                             |

These are nearby names in the two catalogs, not a proposed conversion map. Aged Blended Rum, Aged Jamaican Rum, Demerara Rum, Rhum Agricole Blanc, and Coconut Rum already retain their existing Rum parent.

## Hierarchy roles and navigation

| Choice                                      | Difference from knowledge                                                                                                    | What adoption would involve                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family replaces Subcategory**             | Same intermediate relationship role, with a clearer name.                                                                    | Recognize or migrate the existing Subcategory relationships and folder. This does not require changing their membership. The exact property migration belongs to the next review.                                                                                                                 |
| **Parents are optional**                    | The current vault generally supplies a complete chain.                                                                       | No need to remove existing parents merely to adopt the plugin. The new defaults simply stop requiring every type to have a family or every family to have a category.                                                                                                                             |
| **Fruit Juice → Juice**                     | The category is broader; existing citrus types still belong to Citrus Juice.                                                 | A category rename and reference update if you adopt the new label.                                                                                                                                                                                                                                |
| **Bitters changes level**                   | knowledge uses Bitters as a category with style subcategories. The starter uses one parentless Bitters family.               | Accepting the flatter defaults would change your browsing structure. You can instead retain Bitters as a category and keep the existing style groups as families.                                                                                                                                 |
| **Aromatic Bitters changes role**           | knowledge has an Aromatic Bitters subcategory and a Classic Aromatic Bitters type. The starter has an Aromatic Bitters type. | An old link to the group and a new link to the type would have different scope. A name-only migration could silently narrow a recipe requirement.                                                                                                                                                 |
| **Standalone types have no category route** | The current complete hierarchy gives types a path to their category.                                                         | A meaningful consequence of the new defaults: Coffee Liqueur is no longer reached through Liqueur, and Vodka has no path to Spirit. All ingredient types remain findable through the flat browser. Decide whether losing those category routes is acceptable or whether to retain useful parents. |

The last point follows from the current fixed adjacency rules: a type links to a family, and a family links to a category. A standalone type does not also link directly to a category. We have not designed a separate cross-cutting classification mechanism.

## Same-name types whose parent changes

These are observed parent changes for names present in both catalogs. They can be adopted individually; preserving your current parents is also supported.

| Type              | knowledge parent         | Starter family          |
| ----------------- | ------------------------ | ----------------------- |
| Apple Brandy      | Fruit Brandy             | Apple Brandy            |
| Calvados          | Fruit Brandy             | Apple Brandy            |
| Pastis            | Herbal Liqueur → Liqueur | Anise Spirit → Spirit   |
| Falernum          | Infused Syrup → Syrup    | Spice Liqueur → Liqueur |
| Gentian Liqueur   | Herbal Liqueur           | Amaro                   |
| Coffee Liqueur    | Other Liqueur            | No family               |
| Orange Bitters    | Fruit Bitters            | Bitters                 |
| Chocolate Bitters | Specialty Bitters        | Bitters                 |
| Orgeat            | Orgeat                   | Flavored Syrup          |
| Grenadine         | Fruit Syrup              | Flavored Syrup          |
| Honey Syrup       | Sugar Syrup              | Flavored Syrup          |
| Cinnamon Syrup    | Infused Syrup            | Flavored Syrup          |

Pastis and Falernum also change category, not just their immediate grouping. The syrup defaults consolidate several existing grouping roles into Flavored Syrup; this is worth revisiting if Fruit Syrup, Infused Syrup, or the dedicated Orgeat grouping is useful to you.

## Apple Brandy and Brandy: the agreed scope change

- Your current Apple Brandy and Calvados types belong to Fruit Brandy. The starter moves them into an Apple Brandy family, alongside Bonded Apple Brandy and Applejack. The generic Apple Brandy type remains, so both a family link and a type link exist with that displayed name; their paths and scope differ.
- Brandy retains Cognac and takes the agreed colloquial French-style grape-brandy meaning. Its label stays the same while its intended scope is narrower than a general grouping of all brandies.
- Recipes can choose the broad Apple Brandy family, or a specific type. Assigning a bottle to that family’s generic Apple Brandy type does not automatically assign it to Bonded Apple Brandy, Calvados, or Applejack. Users make those classifications.

## Naming and link changes

The agreed policy uses plain Latin filenames, with the proper name stored separately, shown in the page heading, and used as the display text of generated links.

- Existing accented filenames such as `Crème de Cacao (dark).md` would get plain filenames if brought into that naming convention. Displayed names can remain accented. This would need coordinated link updates, rather than changing how the ingredient reads in recipes.
- New links include a vault-relative target plus display text, for example `[[Cocktails/Types/Creme de Cacao|Crème de Cacao]]`. This differs from the current vault workflow’s preference for bare ingredient links. Old bare links remain readable; they do not all need rewriting simply to be parsed.
- The current reader can still read an existing accented path once the note is otherwise adopted. The filename policy is enforced on new creation, not an automatic bulk rename of old files.

Potential label correspondences to review separately from parent changes:

| knowledge                 | Starter              | Caution                                                                                 |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| PX Sherry                 | Pedro Ximénez Sherry | Expanded name and accent policy; preserve the displayed wording you want.               |
| Cassis Liqueur            | Blackcurrant Liqueur | Candidate naming equivalent, not a required rename.                                     |
| Passionfruit Syrup        | Passion Fruit Syrup  | Spelling change; the family also changes from Fruit Syrup to Flavored Syrup.            |
| Classic Aromatic Bitters  | Aromatic Bitters     | Review alongside the group/type name collision above.                                   |
| New Orleans-Style Bitters | Creole Bitters       | Proposed style correspondence needs your judgment; no mapping is currently established. |

## Existing classifications that already align

Many familiar branches need no semantic reclassification: Bourbon and Rye Whiskey under Whiskey; London Dry, Old Tom, and Navy Strength Gin under Gin; the common fruit liqueurs under Fruit Liqueur; Sweet/Dry/Blanc Vermouth under Vermouth; Amontillado under Sherry; Prosecco under Sparkling Wine; and lime, lemon, orange, and grapefruit juice under Citrus Juice.

Allspice Dram already belongs to Spice Liqueur in knowledge, and Herbal Liqueur and Floral Liqueur already exist separately there. The corrected starter now agrees with those choices.

## What this does not decide

This is a review of hierarchy and ingredient identity, not a migration plan. Existing bottle-to-bottle substitutions have not been replaced with a settled shared-type policy. The new property names, legacy Bases/Dataview integration, and the adoption UI still need the next review. No changes were made to knowledge while preparing this comparison.

Source: live note names and parent links from `Cocktails/Categories/`, `Cocktails/Subcategories/`, and `Cocktails/Types/`; selected type-page bodies; the [committed plugin catalog](../src/catalog/catalog.ts) and [design decisions](cabinet-design.md). No inventory quantities or recipe contents were needed.
