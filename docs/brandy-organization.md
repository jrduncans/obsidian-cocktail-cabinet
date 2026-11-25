# Brandy organization

Agreed in conversation on 2026-11-25. Not built. It revises how the starter models grape brandy and how the `knowledge` vault fits Pisco, Kirsch, and St-Rémy into it, ahead of the starter's typical-ABV pass.

## Problem

The starter's Brandy family holds Cognac, Armagnac, and Apple Brandy (with its subtypes) side by side. Two things go wrong:

- **Plain "brandy" has no type.** Recipes that just say brandy link the family, and a family line accepts every type in it, so a Calvados or pisco bottle fills a Sidecar. In `knowledge`, 5 recipes link the family this way: Backroom Brauler ("Brandy (Courvoisier VS Cognac)"), Everyone's Gone Ape, Ginger Snap, Pineapple Amaro Sidecar, and Turkey Legs.
- **Non-Cognac grape brandy has no home.** St-Rémy VSOP sits on a local French Brandy type that no recipe links, so it isn't even offered as a substitute for the 47 recipes linking Cognac. Korbel, Spanish brandy, and other American brandy would have the same problem.

Grape Brandy as a type name was considered and rejected: nobody writes it in a recipe, so lines saying "Brandy" would link to it with mismatched text, and **Tidy ingredient lines** would keep offering to change them to "Grape Brandy".

## Decisions

The plain name goes to the type recipes link; the family takes the suffixed name, Brandy Family, and recipes almost never link it. Grape brandy is built the way Apple Brandy already is.

| Note                                                        | Kind                         | Parent        | Holds                                                                                          |
| ----------------------------------------------------------- | ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| **Brandy Family**                                           | family (renamed from Brandy) | Spirit        | Spirits distilled from fruit                                                                   |
| **Brandy**                                                  | type (new)                   | Brandy Family | Aged grape brandy as recipes mean plain "brandy": St-Rémy, Korbel, Spanish and American brandy |
| Cognac                                                      | subtype (was a type)         | Brandy        | Unchanged meaning                                                                              |
| Armagnac                                                    | subtype (was a type)         | Brandy        | Unchanged meaning                                                                              |
| Apple Brandy, with Bonded Apple Brandy, Applejack, Calvados | type and subtypes            | Brandy Family | Unchanged                                                                                      |
| **Kirsch**                                                  | type (new in the starter)    | Brandy Family | Unsweetened cherry eau de vie, distinct from cherry liqueur and Maraschino                     |
| Pisco                                                       | type, `knowledge` only       | Brandy Family | Unaged grape brandy; not under Brandy                                                          |

- **Naming.** Brandy Family follows the [suffix rule](cabinet-design.md#classification-principles) for a family whose name would duplicate a type, as Amaro Family does; it's the only other live case, and the same shape: a general type plus siblings nobody would call by the family's name. A type and family both named Brandy was rejected: `uses=Brandy`, pickers, and the hierarchy views would read "Brandy → Brandy". Brandy & Eau de Vie was considered, as saying what the family adds beyond the type, but would solve the second collision differently from the first; the description says what belongs, as Amaro Family's does for Campari. Fruit Brandy was rejected because in the US it means sweetened, flavored brandy.
- **Matching** follows [subtypes](cabinet-design.md#subtypes) unchanged:
    - A Brandy line is filled by Cognac, Armagnac, and plain Brandy bottles.
    - A Cognac line is filled only by Cognac. A plain Brandy bottle (St-Rémy) is offered as a substitute, as Laird's is for a Calvados line.
    - An Armagnac bottle isn't offered for a Cognac line, though it's arguably the closer swap; siblings aren't substitutes. A recipe that doesn't care which links Brandy.
    - Calvados and pisco no longer fill a "brandy" line.
- **Pisco stays out of the starter.** The [earlier decision](cabinet-design.md#classification-principles) stands: users may reasonably model pisco differently. The family description mentions it so a user's own Pisco type has an obvious home.
- **Pisco in `knowledge`.** One Pisco type under the family, no subtypes. Two of the five pisco recipes ask for quebranta and the one bottle is Caravedo Torontel; a Quebranta Pisco subtype would honestly flag Torontel as a substitute there, but add it when a second pisco is bought. Pisco is not a subtype of Brandy: a Pisco Sour with Cognac is a different drink, and a "brandy" line shouldn't count pisco.
- **Other eaux de vie** (pear, framboise, slivovitz) are local types under the family when needed. No Eau de Vie parent type: recipes rarely ask for eau de vie in general.
- **Typical ABV.** Brandy 0.40, Kirsch 0.40. Cognac and Armagnac keep 0.40. Pisco in `knowledge` gets 0.40 too. Revisit in the typical-ABV pass.

### Descriptions

- **Brandy Family:** Spirits distilled from fruit: grape brandy, apple brandy, and unaged fruit brandies such as kirsch and pisco.
- **Brandy:** Aged grape brandy, what a recipe means by plain brandy. Cognac and Armagnac are its subtypes, so their bottles fill these recipes too. Other French, Spanish, and American grape brandies go here. Unaged grape brandy such as pisco is not this type.
- **Cognac** and **Armagnac:** keep their current descriptions.
- **Kirsch:** Unsweetened cherry eau de vie (kirschwasser), distinct from cherry liqueur and Maraschino Liqueur.

### What this supersedes

- [Cabinet design](cabinet-design.md#classification-principles): "Use Brandy colloquially for French-style grape brandy, with Cognac and Armagnac as types." The meaning survives as the Brandy type; Cognac and Armagnac become its subtypes. The removed Grape Brandy type stays removed.
- The French Brandy proposal in the [bottle coverage review](knowledge-bottle-coverage-review.md) and [product research](knowledge-bottle-product-research.md): St-Rémy goes on Brandy, which needs no Cognac/Armagnac carve-out in its definition.
- The [adoption mapping](knowledge-adoption-mapping.md)'s familyless local Kirsch: it becomes the starter type.

## Building it

1. **Catalog.** Rename the family to Brandy Family (ID `family/Brandy Family`, per the no-compatibility-mapping rule for development IDs), add the Brandy type and Kirsch, move Cognac and Armagnac under Brandy with `subtypes('Brandy', …)`, and set the descriptions and typical ABVs above. Update the glossary's Brandy entry. Run `npm run catalog:docs`. Add a test asserting Cognac's and Armagnac's parent and that no family is named Brandy.
2. **Sync sees a parent's level.** `noteFields` and `entryFields` compare a parent by display name only, so Cognac moving from the Brandy _family_ to the Brandy _type_ reads as no change and existing cabinets are never updated. Compare the parent with its level (family or type), so the move is offered, or applied silently where the note is untouched. Catalog history keeps working: an earlier "Brandy" parent was always a family.
3. **Existing cabinets** (the dev vault and `knowledge`). Names aren't a synced field, so the family rename is done by hand, in this order:
    1. Relink family-level "brandy" recipe lines to the Brandy type first, keeping their text. Renaming the family afterwards would otherwise rewrite their link text to "Brandy Family", since renames through Obsidian update link text showing the old name.
    2. Rename the family note in Obsidian to Brandy Family and set its `cc-catalog-id` to `family/Brandy Family`.
    3. Point any local note that the catalog now covers at its catalog ID (`knowledge`'s Kirsch: `type/Kirsch`), so **Review cabinet updates** updates it rather than offering a conflicting new note.
    4. Install the release and run **Review cabinet updates**: add Brandy (and Kirsch where missing), and accept the parent moves for Cognac and Armagnac.

## `knowledge` migration

After the release is installed, following the order above:

- Relink the five family-level lines (Backroom Brauler, Everyone's Gone Ape, Ginger Snap, Pineapple Amaro Sidecar, Turkey Legs) to the Brandy type, text "Brandy", through the plugin's link commands.
- Rename Families/Brandy to Brandy Family and update its catalog ID.
- Kirsch: add `cc-catalog-id: type/Kirsch`; the catalog sets its family and description. High Horse's "kirsch" line keeps its link.
- Pisco: set its family to Brandy Family (**Edit cabinet note**) and a typical ABV of 0.40.
- St-Rémy VSOP: change its type to Brandy; then move French Brandy to the trash (no recipe links it).
- Check afterward: `can-make` on a Cognac recipe lists St-Rémy as a substitute, and `makeable uses=Brandy` includes the five relinked recipes and the Cognac ones.
