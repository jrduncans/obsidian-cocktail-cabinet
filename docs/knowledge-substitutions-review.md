# Substitutes For review

Reviewed the live `knowledge` vault on 2026-10-29, with classification decisions added on 2026-10-30. This inventories the declared relationships and assesses whether shared ingredient types could replace them. The starter catalog and design notes reflect the decisions below; no knowledge-vault classifications or substitution fields were changed.

## Finding

**Every declared relationship now has a plausible shared-type home.** The follow-up decisions separate Aperol-style Orange Bitter Liqueur from Campari-style Red Bitter Liqueur, include Bitter Bianco in Gentian Liqueur, and accept a broad Orange Liqueur type. Bitter Bianco → Salers therefore no longer establishes a need for a directional exception. The green-herbal group's additional pairing and the general implications of symmetric type matching remain worth reviewing.

The scan found 166 indexed frontmatter occurrences of `Substitutes For`: 156 empty and 10 populated. The populated fields contain **11 directed links involving 13 bottles**, grouped below. Every target resolves. Empty template fields and display references do not add substitution rules.

`A → B` means **A is recorded as usable in place of B**. `↔` means both directions are explicitly recorded. A missing reverse link is not evidence that the reverse is unacceptable; it means that intent is not recorded.

## Every declared relationship

| Declared directions | Current types in knowledge | Shared-type assessment |
| --- | --- | --- |
| Üla Orange Liqueur ↔ Cointreau | Both Orange Liqueur | Keep the broad common type, including Pierre Ferrand Orange Curaçao. The additional candidate is accepted without ranking closeness. |
| Yellow Chartreuse ↔ Liquore Strega | Both Other Herbal Liqueur | Good candidate for the starter's more specific Yellow Herbal Liqueur type. The current shared type is much broader than this pair. |
| Green Chartreuse ↔ Flora Green; Green Chartreuse ↔ Luxardo Del Santo | All Other Herbal Liqueur | Candidate for Green Herbal Liqueur. A shared type would additionally make Flora Green and Luxardo Del Santo alternatives to each other; those two directions are not currently declared. |
| Crimson Snap → Campari | Both Amaro | Red Bitter Liqueur is the agreed Campari-style role, separate from the Aperol group. No reverse link is recorded in the legacy data. |
| Accompani Mari Gold → Aperol | Both Amaro | Orange Bitter Liqueur is the agreed Aperol-style role, separate from the Campari group. No reverse link is recorded in the legacy data; recorded strengths differ substantially. |
| Luxardo Bitter Bianco → Salers | Other Herbal Liqueur → Gentian Liqueur | Gentian Liqueur is the agreed shared role, also covering Suze and Avèze. The initial recommendation to preserve this pair as an exception is superseded. |

The table covers all 11 links: two orange, two yellow, four green, and the three single-direction links.

## Where a common type changes the meaning

### 1. Existing broad types are not sufficient evidence

Ten of the eleven links already connect bottles sharing a type. That does not make all ten links redundant under the current vault workflows, and it does not make their present types appropriately narrow for automatic alternatives.

- **Orange Liqueur** also contains Pierre Ferrand Orange Curacao. Using the whole type adds that bottle as a candidate beyond the explicit Cointreau/Üla pair. That breadth is now accepted; the model need not encode Üla as a closer Cointreau substitute.
- **Other Herbal Liqueur** currently contains nine bottles, including both Chartreuse colors, their declared alternatives, Luxardo Bitter Bianco, Cascadia Liqueur, Bénédictine, and Becherovka. Treating them all as interchangeable would be a much larger step than any declared substitution.
- **Amaro** currently contains fourteen bottles. It cannot by itself express the specific Mari Gold/Aperol and Crimson Snap/Campari pairings without making many additional bottles candidates.

The narrower Green Herbal Liqueur and Yellow Herbal Liqueur types therefore have a clear role. For red bitters, the starter now separates **Red Bitter Liqueur** (Campari and Crimson Snap) from **Orange Bitter Liqueur** (Aperol and Mari Gold). Both belong to Amaro, but that family relationship must not make them same-type alternatives. Color alone does not define membership, and Orange Bitter Liqueur is separate from the fruit-liqueur type Orange Liqueur.

**Gentian Liqueur** covers Salers, Suze, Avèze, and Bitter Bianco as a practical recipe role. Salers, Suze, and Avèze identify their gentian basis in their producers' descriptions. Bitter Bianco is less conventionally classified this way, but its importer describes gentian alongside wormwood and rhubarb among its flavors. Including it is a cabinet modeling judgment, rather than a claim that every producer uses this classification. Sources: [Salers](https://vedrenne.com/en/salers), [Suze](https://www.suze.com/), [Avèze](https://www.aveze.com/en/produits/aveze-15-2/), [Bitter Bianco importer](https://www.hotalingandco.com/portfolio/luxardo/luxardo-bitter-bianco/).

### 2. Pairwise alternatives add directions

A single shared type makes every member a candidate for every other member. For the orange and yellow pairs, both directions are already recorded. For the green group, the current graph is a hub:

```text
Flora Green ↔ Green Chartreuse ↔ Luxardo Del Santo
```

There is no explicit Flora Green ↔ Luxardo Del Santo link. Approving one shared Green Herbal Liqueur type means accepting that additional pairing, too.

The three one-way cases are Crimson Snap → Campari, Mari Gold → Aperol, and Bitter Bianco → Salers. Each would gain a reverse direction under a shared-type rule. The data alone cannot distinguish deliberate asymmetry from incomplete bookkeeping.

For an explicit substitution feature, the faithful default would be a direct, directional relationship: no automatic reverse edge and no inference that A substitutes for C merely because A substitutes for B and B substitutes for C. The existing query workflow uses a direct listed target; the related-recipes view also does not recursively traverse substitution links.

### 3. A valid substitute is not necessarily an equal-strength pour

Your notes record these ABVs:

| Pair | Recorded ABVs | Modeling implication |
| --- | --- | --- |
| Luxardo Del Santo / Green Chartreuse | 40% / 55% | A shared green-herbal role does not establish equal alcohol contribution. |
| Accompani Mari Gold / Aperol | 25% / 11% | Orange Bitter Liqueur cannot be defined solely as a low-ABV threshold. |
| Luxardo Bitter Bianco / Salers | 30% / 16% | Gentian Liqueur membership does not establish a calibrated replacement. |

These are values recorded in the vault, not an independent product-specification audit. Cointreau, Yellow Chartreuse, Flora Green, and Campari have no ABV recorded in the inspected notes. All thirteen involved bottle pages have no explanatory body beyond their existing view code, so they do not document flavor caveats, recipe-specific conditions, or quantity adjustments.

Type matching can offer a candidate without promising identical flavor or inventing an adjusted quantity. Any pour adjustment needs its own explicit decision; matching should preserve the original recipe requirement.

### 4. Adding a narrower type does not neutralize a broad one

The current plugin's bottle-discovery rule accepts **any shared type**. If bottles retain Other Herbal Liqueur while also receiving separate green/yellow types, that broad shared membership still makes them peers. The same issue applies to retaining a generic Amaro type across all the red-bitter groups.

When replacing explicit substitutions with types, broad browsing groupings should generally be families and the replacement cohorts should be types. Otherwise, adding precise types alongside the old broad types does not actually constrain matching. Multiple types remain useful when each assignment deliberately permits that bottle to fulfill the corresponding recipe role.

## Existing consumers to account for before removing fields

- `Templates/Cocktails/Bottle.md` supplies the empty field.
- `Cocktails/Bottles.base` displays it in the inventory views; it does not determine which substitutions are valid.
- `Cocktails/Views/RelatedRecipes/view.js` uses it to include the target bottle's recipes, plus recipes referencing that target's type and subcategory. Two bottles already sharing a type do not automatically acquire each other's bottle-specific recipes in that view. This is why the orange pair's explicit links still have a purpose today.
- The inventory-query skill accepts a direct listed substitution and reports it as such. It does not define the field as a symmetric equivalence relation.
- The logging skill requires an explicit actual-bottle choice for Green Chartreuse. Replacing substitution metadata with types should preserve that personal policy unless you choose to change it. Inventory must decrement the bottle actually selected.

The initial plugin currently implements same-type discovery, not an explicit `Substitutes For` feature or inventory logging. This review does not recommend deleting the existing vault fields before those consumers and behaviors are addressed.

## Decisions recorded and questions remaining

- Agreed: keep Orange Liqueur broad, without a closer-substitute ranking.
- Agreed: separate Red Bitter Liqueur and Orange Bitter Liqueur; Aperol and Campari must not be peers merely through Amaro.
- Agreed: Gentian Liqueur provides the shared home for Bitter Bianco and Salers, alongside Suze and Avèze.
- Still worth reviewing: Flora Green and Luxardo Del Santo become alternatives to each other through Green Herbal Liqueur.
- Modeling consequence: each shared type creates pairwise candidates, including reverse directions absent from the legacy fields. That is a consequence of adopting a type, not evidence that those directions were present in the old data.

Use types for the intended replacement groups. These cases no longer demonstrate a required directional exception, so an explicit substitution feature can remain an open option rather than a prerequisite established by this audit.

## Scope and evidence

The relationship inventory came from the live Obsidian metadata cache across indexed Markdown notes, without filtering to current stock. Each linked target and its Type/ABV properties was resolved, and the involved bottle bodies were inspected. Relevant template, Bases, view, and skill references were checked separately. No stock quantities, purchase data, or recipe contents were needed. Findings are saved locally alongside the hierarchy review; no knowledge-vault notes were changed.
