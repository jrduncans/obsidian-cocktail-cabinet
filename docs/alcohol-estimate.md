# Alcohol estimate design

Drafted on 2026-11-13 from the [roadmap item](roadmap.md#4-everyday-polish-less-command-hunting) and the [decision against a method category](cabinet-design.md#recipe-tags-rating-and-duplicates). Reviewed the same day: the [decisions](#decisions) record what was agreed. Not yet built.

## Goal

Find lower-alcohol drinks, and see roughly how strong any recipe is, without tagging. A number replaces `#lowerabv`. Total alcohol matters most; ABV is shown because people expect it. The estimate has to be honest about guesses: most recipe lines name a type, not a bottle, so most figures rest on typical values. BevNap and Mixel both have such a calculator and are reasonable references for values and behavior.

## What the `knowledge` vault looks like

Measured on 2026-11-13 through the running vault:

- 509 recipes with 2,584 ingredient lines. About three quarters have a volume the plugin already reads (oz, ounces, mL, cL, barspoons, teaspoons); 256 are dashes or drops, 26 are ranges, 14 are “top” or “fill”, and the rest are garnishes, peel oils, rinses, and other wording.
- Ingredient links: 1,312 to types, 668 to bottles, 45 to families, 13 to other stock. Two thirds of links therefore need an ABV from somewhere other than a bottle.
- 133 of 166 bottles have `cc-abv`. 86 of 155 types have at least one bottle with an ABV.
- Types carry no ABV today, and the starter catalog has none.

## Outputs

Three figures per recipe, for one serving:

- **Alcohol**: shown both as mL of ethanol and as standard drinks. The standard drink is a setting: US (14 g of ethanol, about 17.7 mL) by default, or UK units (8 g, 10 mL). Standard drinks are a Base formula over the stored mL, so changing the setting rewrites nothing.
- **ABV as served**: ethanol over the final volume after dilution.
- **Volume as served**: the pour plus dilution, which explains why a spritz is low in ABV yet not low in alcohol.

A **Lower alcohol** view sorts by alcohol first, with ABV beside it. Dilution changes ABV and volume but never alcohol, so the figure that matters most doesn't depend on the dilution model.

## Reading each line

The logging parser already turns a line into a volume. The estimate reuses it and adds:

| Line                                     | Volume                                                      | Notes                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Measured (oz, mL, cL, barspoon, …)       | As parsed                                                   | In `2 oz (60 ml)` or `2 oz / 60 ml`, the `volumeUnit` setting picks the amount (ounces by default), as in logging. |
| Dash or drop                             | A dash is assumed at about 0.9 mL (1/32 oz); a drop 0.05 mL | Negligible alcohol, but bitters are 35–45%, so they're counted rather than dropped.                                |
| Range (`1–2 oz`)                         | Midpoint                                                    | Marks the estimate Rough.                                                                                          |
| Top or fill                              | An assumed pour, a setting (60 mL to start)                 | Marks the estimate Rough. Decided over bounds, which were harder to read.                                          |
| Rinse, spritz, mist, peel oil, garnish   | 0                                                           | Too small to matter.                                                                                               |
| Several links on one line (alternatives) | First link's ABV                                            | Alternatives are usually close; flagged when their ABVs differ by more than 5 points.                              |

## Where each line's ABV comes from

Revised 2026-11-13 so bottles drive the estimate and reference values fill gaps. In order, stopping at the first that applies:

1. **The named bottle's `cc-abv`.** Exact. A bottle without one falls back to its type.
2. **The median of your in-stock bottles of the type**: what you'd pour today. In stock is the In stock view's test: Have or Low, or a positive amount.
3. **The type's typical ABV**, `cc-abv-typical`, a fraction like `cc-abv`, editable in **Edit cabinet note**: a reference value for types you don't have on hand, from BevNap, Mixel, or later the starter catalog. The starter supplies 0 for non-alcoholic types and a representative value for most alcoholic types, leaving blank those whose bottles vary too much. Optional for types users add ([decided 2026-11-24](#missing-values)): it's only used when you have no bottle of the type in stock, and bottles you've had or the family fill in without it.
4. **The median of every bottle of the type you've had**, out of stock included, labeled “from bottles you've had”: better than unknown, and only reached with no bottle in stock and no typical value.
5. **The family**, for family links (`[[Rum|rum]]`) and types with nothing above: the median of your in-stock bottles in the family, then of every bottle in it, then ([built 2026-11-24](#missing-values)) the median of its alcoholic types' typical ABVs, labeled typical, or 0 when every type in it is 0. Families have no typical ABV of their own: decided 2026-11-13, since most span too wide a range for one value (Sherry 15–20%, Apple Brandy 40–50%, Rum 37.5–75%) and a generic line is usually better linked to a type.
6. **Other stock** uses its first provided type; kitchen staples are 0.
7. Otherwise **unknown**, and the estimate is Partial.

A typical value never overrides your shelf: with an atypical shelf (only navy-strength gin), gin recipes read strong, and choosing the bottle in the logging dialog gives the precise figure. This lets the catalog ship reference values later without fighting a user's own bottles.

## Choosing bottles: what if I use this one?

A type line's estimate is a stand-in until a bottle is chosen. The logging dialog already chooses a bottle for each line, so it shows the estimate for the bottles selected, updating as they change: pick a bottle, see the alcohol and ABV, and cancel to log nothing. These figures are calculated live and never stored. A separate **Estimate with bottles** command, the same picker without logging, can follow if the logging dialog turns out to be the wrong place to ask.

## Dilution

Chilling with ice adds water, which lowers ABV and adds volume but leaves alcohol unchanged.

**Decided:** fixed percentages per preparation, as settings, with BevNap's defaults: built 10%, stirred 18%, shaken 25%, blended 30%. BevNap's calculator comes from Jeffrey Morgenthaler's [cocktail ABV calculator](https://jeffreymorgenthaler.com/cocktail-abv-calculator/) (2022). Its example confirms what the percentage is a share of: a 4.5 oz Mai Tai at 25% dilution becomes 5.63 oz, so the water added is a share of the pour before dilution:

- volume as served = pour × (1 + dilution)
- ABV as served = alcohol ÷ volume as served

The first draft proposed Dave Arnold's formulas from _Liquid Intelligence_, where dilution grows with the starting ABV. They were dropped: the coefficients recalled for the draft weren't verified and gave much higher dilution than BevNap's figures, and fixed percentages are easier to understand and match a calculator already trusted. Dilution never changes total alcohol, the figure that matters most.

There is no method property, so the estimate picks the preparation:

- The Method text decides when it says: the first of shake, stir, blend, or build it mentions. A “flash blend” counts as shaken, since it's a quick spin with a little crushed ice, not a frozen drink.
- Otherwise a recipe with juice, dairy, or egg counts as shaken, and others as stirred.
- An optional `cc-dilution` on a recipe (a fraction, set in **Edit cabinet note**) replaces the assumed percentage, as BevNap allows.
- An assumed top adds its own volume after dilution.

## Saying how sure it is

Each recipe gets a basis label alongside the numbers:

- **Exact**: every alcoholic line names a bottle with an ABV, and every amount is measured.
- **From your bottles** (`bottles`): some lines use the median of your in-stock bottles of a type or family; linking a bottle is more precise.
- **Typical ABVs** (`typical`): some lines use a type's typical value.
- **From bottles you've had** (`past`): some lines use the median of bottles you've had, out of stock included.
- **Rough**: a range or an assumed top, on top of any of the above.
- **Partial**: an alcoholic line has an unknown ABV; alcohol is a lower bound. `cc-est-missing` names the lines responsible ([decided 2026-11-24](#missing-values)).
- **No estimate**: nothing alcoholic could be read.

The basis travels with the numbers in every view, so a guess never reads as a measurement.

## Storing and updating

Bases formulas can't read ingredient lines or follow them to other notes' ABVs, so the figures are stored on the recipe, like [`cc-ingredients`](cabinet-design.md#navigation-in-notes):

- `cc-est-alcohol-ml`, `cc-est-abv` (a fraction), `cc-est-volume-ml`, and `cc-est-basis`, plus `cc-contains` (below). The `est` makes clear they are derived. `cc-est-missing` ([built 2026-11-24](#missing-values)) names what keeps a partial estimate partial.
- The same background sync that keeps `cc-ingredients` updates them: when a recipe has been quiet for two seconds, and for every recipe shortly after startup.
- They also depend on other notes. When a bottle's `cc-abv`, a type's typical ABV, a bottle going in or out of stock (not each pour), or the bottles used for a median change, the recipes linking them are recalculated (found through Obsidian's resolved links). A dilution setting change recalculates every recipe.
- Values are rounded (alcohol to 0.1 mL, ABV to 0.1 point) and written only when they change, so recalculation doesn't churn notes or sync.

## Missing values

Decided 2026-11-24 from a review of **Review missing ABV values**: a modal mixing rows with a field, family rows with advice and no field, and a section linking to **Review unlinked ingredients**, which asked users for typical ABVs they often have no way to know.

- **What the cabinet asks for.** Bottles, not types. A bottle you own without `cc-abv` is a gap you can fill from its label; a bottle with none still falls back to its type, so a non-alcoholic bottle whose type is 0 needs nothing. A type without a typical ABV usually means you haven't owned one yet, and buying a bottle completes the estimate.
- **Typical ABVs stay optional.** Nothing lists types missing one. **Edit cabinet note** says beside the field when it's used, and to leave it blank when unsure (built 2026-11-24: "Used for recipes that name this type when you have no bottle of it in stock. Leave it blank if you're unsure: bottles of it you've had, or its family, fill in."). Corrected while building: the agreed "only used until you've owned a bottle" was wrong, since a typical ABV wins over bottles you've had once they're out of stock. **Add ingredient type** has no ABV field, so there's nothing to word there. The starter keeps a value on every alcoholic type it ships, apart from catch-alls, which vary too much (since 2026-11-25 none of them has one: Amaro, Herbal Liqueur, and Specialty Bitters lost theirs, and Rye Whiskey went from 40% to 43%, with bonded rye its own subtype); types it leaves out, such as Pisco, are left for users, and extending the starter is separate work. A list of types with bottles but no typical ABV, with a way to set it from those bottles, was rejected: the bottles already supply the value, and a copy would go stale.
- **Families fall back to their types.** A family with no bottles uses the median of its types' typical ABVs before giving up, labeled typical. Built 2026-11-24, with one choice made while building: only alcoholic types count, so a non-alcoholic type in a family (a zero-proof sparkling wine) doesn't pull the median down; a family whose types are all 0 still counts as 0. This is not a family typical ABV, which stays dropped (2026-11-13): it comes from values set on the types. A new type under a family you own bottles in, or whose types have values, already gets an estimate, so a blank type rarely causes a partial one.
- **`cc-est-missing`.** The sync stores, on each recipe whose basis is `partial`, what made it partial: links to the types and families whose ABV couldn't be resolved, and the wording of unlinked measured lines as plain text (`¾ oz falernum`). It's removed once the estimate is complete, so finished recipes carry no extra frontmatter. It shows on the recipe itself, which is where most people will first see why an estimate is partial. The name keeps the `cc-est-` family; `cc-missing-for-abv` was considered.
- **Base views replace the modal.** **Missing ABV** in the Bottles Base: bottles with no `cc-abv`, in stock first, then those you've had. **Partial estimates** in the Recipes Base, with a Missing column from `cc-est-missing`, so the ABV gaps can be seen apart from unlinked lines. **Review missing ABV values** and its command are removed. The Cocktail Cabinet note mentions both views.
- **Plain-text entries.** Built 2026-11-24, a choice made while building: a line with an amount that can't be read and a possibly alcoholic link (`Splash of Overproof`) is listed as plain text too, so a link always means "this note needs an ABV" and plain text "this line needs fixing". Plain-text entries show links as their text, so they can't be taken for links.
- **Partial stays partial.** Recipes keep ≥ for a lower bound and stay out of Lower alcohol; a separate state for types you've never owned was rejected as a distinction few would act on.

## Ingredient facts in the same pass

The [design decision](cabinet-design.md#recipe-tags-rating-and-duplicates) replaced “stirred and boozy vs shaken with juice” with facts read from ingredients. The estimate needs them to pick a preparation, so it stores them too:

- `cc-contains`: any of `citrus`, `juice`, `dairy`, `egg`, `sparkling`. A Base groups “spirit-forward” as none of them.
- Each fact comes from the hierarchy: citrus and other juice from the Juice category's families, sparkling from the Sparkling Wine and Carbonated Mixer families, egg and dairy from those types and staples. Local types get them through their family; a type with no family needs a way to say it, likely an optional property on the type. The exact shape is settled when this slice is built.

## Where it shows

- **Recipes Base**: alcohol (standard drinks and mL), ABV, and basis columns, and a **Lower alcohol** view sorted by alcohol, then ABV.
- **Recipe note**: the properties panel shows the stored values; no extra view.
- **Logging dialog**: one line under the servings, for the bottles selected, scaled by servings: “≈ 1.6 drinks (28 mL alcohol), 18% ABV · typical ABVs”.
- Not in each ingredient note's Recipes sections at first, to keep them short.
- **Daily note** (the `dailyAlcohol` setting, off by default; added 2026-11-20): the logged estimate is otherwise lost once the dialog closes, though it's the most specific one, for the bottles actually poured. A recipe's “Made …” line ends with the standard drinks (“(≈ 1.6 drinks)”), and the mL goes into the daily note's `cc-alcohol-ml`, a running total a Base can sum. mL is stored rather than standard drinks, which depend on the unit setting. A one-off's header ends the same way, before its colon; **Save one-off as recipe** reads the drinks back and keeps them on the saved line. Off by default because a drink count in someone's journal shouldn't arrive unasked.

## Decisions

Reviewed with the user on 2026-11-13:

1. **Typical ABVs.** The catalog supplies 0 for non-alcoholic types and values for some starter types, not all; blanks are fine. Users set or override values per type.
2. **Your bottles as a fallback.** Yes, when a type has no typical ABV, as long as the estimate says so and points to linking a bottle.
3. **Units.** Standard drinks as a setting, US by default, always shown with mL of ethanol.
4. **Tops.** Assume a pour (a setting) and label the estimate Rough.
5. **Storage.** The four `cc-est-` properties plus `cc-contains`, kept by background sync. What-if figures for chosen bottles are live only.
6. **Dilution.** Fixed percentages per preparation, as settings defaulting to BevNap's (built 10%, stirred 18%, shaken 25%, blended 30%), applied to the pour; an optional per-recipe `cc-dilution` overrides them.
7. **`#lowerabv`.** Retired in `knowledge` once the Lower alcohol view exists, during the tagging session.
8. **Sugar** (Mixel shows it): not needed.

## Suggested slices

1. Built 2026-11-13: `cc-abv-typical` on type and family notes, in **Edit cabinet note** and the Ingredient types and families Bases, with the starter setting 0 on non-alcoholic types and families. Alcoholic values are left for the user to fill in from BevNap or Mixel. Existing cabinets don't get the zeros from setup; `knowledge` gets them in a one-time pass by catalog ID.
2. Built 2026-11-13: the calculator as pure code (`src/core/alcohol-estimate.ts`), with tests for each line shape, the ABV sources, dilution, and basis. It takes each link's ABV and facts from the vault layer, which slice 3 adds. Kitchen staples count as 0. A dash range (`1–2 dashes`) wasn't read at first and counted as unmeasured, making the estimate partial; since 2026-11-20 it counts as its midpoint, as dashes, not rough, since the range spans about a mL.
3. Built 2026-11-13: stored properties and sync. One background sync (`src/vault/recipe-sync.ts`) now keeps both `cc-ingredients` and the estimate, writing each recipe once. A change to another note's estimate inputs (ABV, typical ABV, hierarchy links, form, catalog ID, name) recalculates every recipe five seconds later, writing only those that differ; so does an estimate setting. Settings: dilution by preparation, assumed top, and the standard drink. `cc-contains` is computed here too, by catalog ID with the starter name as fallback: Juice category, Citrus Juice family, Sparkling Wine and Carbonated Mixer families, egg white and whole egg, Heavy Cream and Milk. Two choices made while building: dashes with an unknown ABV count as no alcohol without making the estimate partial, since they hold well under a mL; and an unlinked measured line makes it partial, which **Review unlinked ingredients** fixes. In a copy of `knowledge` with the non-alcoholic zeros, 24 recipes came out exact, 207 from your bottles, 2 rough, 266 partial (mostly unlinked lines and types without a value), and 8 with no estimate.
4. Built 2026-11-13: Recipes Base columns (Drinks and ABV as formulas with ≥ for partial, Alcohol (mL) as the stored property, Estimate) and the Lower alcohol view, sorted by alcohol and leaving out partial and none, since a lower bound would sort misleadingly low. A view sorts only on a property it shows, so alcohol is a stored-property column rather than a formula, and ABV isn't a second sort. The standard drink setting rewrites the Recipes Base. The logging dialog shows the estimate for the bottles selected, scaled by servings, above the stock table.
5. ~~`cc-contains`~~ Folded into slice 3.

## After the slices

- Built 2026-11-13: **Review missing ABV values**, listing the bottles, types, and families whose ABV would complete partial estimates, most recipes first, each with a percent field that writes `cc-abv` (bottle) or `cc-abv-typical` (type or family). A line linking other stock counts against its first provided type. It also counts recipes partial because a measured line links nothing, with a button to **Review unlinked ingredients**. In the dev copy of `knowledge`, unlinked lines held back 226 recipes and 15 notes the rest, led by Sparkling Wine, Apple Brandy Family, Prosecco, and Sherry. The lint rule's acronym list gained ABV, and the plural is avoided because the rule can't keep it uppercase.
- Changed 2026-11-13: families lost their typical ABV (in **Edit cabinet note**, the Ingredient families Base, and the starter's six non-alcoholic families) in favor of the median of your bottles in the family, or 0 when all its types are 0. **Review missing ABV values** lists a family only when you own no bottle in it, naming the recipes and suggesting relinking those lines to a type; it has no field. In the dev copy this resolved six families from bottles and cut partial estimates from 266 to 248.
- Changed 2026-11-13: in-stock bottles first, then the type's typical ABV, then bottles you've had (a new `past` basis), as described above. The basis now ranks, least sure first: partial, rough, past, typical, bottles, exact. Other notes' stock is watched as in or out of stock, so logging doesn't recalculate every recipe on each pour. In the dev copy: 21 exact, 159 from your bottles, 69 from bottles you've had, 2 rough, 248 partial, 8 none.
- Built 2026-11-24: `cc-est-missing`, the **Missing ABV** view in Bottles, and the **Partial estimates** view in Recipes; **Review missing ABV values** and its command are removed, and the Alcohol estimates guide page names both views. Built the same day: families falling back to their alcoholic types' typical ABVs, and the typical ABV field's wording. See [missing values](#missing-values).
