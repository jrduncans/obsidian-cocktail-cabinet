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

| Line                                     | Volume                                                      | Notes                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Measured (oz, mL, cL, barspoon, …)       | As parsed                                                   | The stated mL wins in `2 oz (60 ml)`, as in logging.                                  |
| Dash or drop                             | A dash is assumed at about 0.9 mL (1/32 oz); a drop 0.05 mL | Negligible alcohol, but bitters are 35–45%, so they're counted rather than dropped.   |
| Range (`1–2 oz`)                         | Midpoint                                                    | Marks the estimate Rough.                                                             |
| Top or fill                              | An assumed pour, a setting (60 mL to start)                 | Marks the estimate Rough. Decided over bounds, which were harder to read.             |
| Rinse, spritz, mist, peel oil, garnish   | 0                                                           | Too small to matter.                                                                  |
| Several links on one line (alternatives) | First link's ABV                                            | Alternatives are usually close; flagged when their ABVs differ by more than 5 points. |

## Where each line's ABV comes from

In order, stopping at the first that applies:

1. **The named bottle's `cc-abv`.** Exact.
2. **The linked type's typical ABV**, a new optional property on types, `cc-abv-typical`, a fraction like `cc-abv`, editable in **Edit cabinet note**. The starter catalog supplies 0 for non-alcoholic types (juices, syrups, mixers, staples) and a value for some spirit, liqueur, and wine types where one is representative; many stay blank. Values come from reviewed sources, BevNap and Mixel among them.
3. **The median ABV of your bottles of that type**, when the type has none. The estimate says so (basis “Your bottles”), and the recipe hints that linking a bottle gives a more precise answer. A recipe's figures shift as bottles are bought or finished; that is accepted because it's labeled.
4. **The family's typical ABV**, for family links (`[[Rum|rum]]`) and types with nothing above. Families get the same optional property; the catalog supplies few or none.
5. **Other stock** uses the ABV of the first type it provides; House syrups and fresh juice come out at 0.
6. Otherwise **unknown**, and the estimate is Partial.

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
- **Typical ABVs**: some lines use a type or family value.
- **Your bottles**: some lines use the median of your bottles of a type; linking a bottle is more precise.
- **Rough**: a range or an assumed top, on top of any of the above.
- **Partial**: an alcoholic line has an unknown ABV; alcohol is a lower bound.
- **No estimate**: nothing alcoholic could be read.

The basis travels with the numbers in every view, so a guess never reads as a measurement.

## Storing and updating

Bases formulas can't read ingredient lines or follow them to other notes' ABVs, so the figures are stored on the recipe, like [`cc-ingredients`](cabinet-design.md#navigation-in-notes):

- `cc-est-alcohol-ml`, `cc-est-abv` (a fraction), `cc-est-volume-ml`, and `cc-est-basis`, plus `cc-contains` (below). The `est` makes clear they are derived.
- The same background sync that keeps `cc-ingredients` updates them: when a recipe has been quiet for two seconds, and for every recipe shortly after startup.
- They also depend on other notes. When a bottle's `cc-abv`, a type's or family's typical ABV, or the bottles of a type used for a median change, the recipes linking them are recalculated (found through Obsidian's resolved links). A dilution setting change recalculates every recipe.
- Values are rounded (alcohol to 0.1 mL, ABV to 0.1 point) and written only when they change, so recalculation doesn't churn notes or sync.

## Ingredient facts in the same pass

The [design decision](cabinet-design.md#recipe-tags-rating-and-duplicates) replaced “stirred and boozy vs shaken with juice” with facts read from ingredients. The estimate needs them to pick a preparation, so it stores them too:

- `cc-contains`: any of `citrus`, `juice`, `dairy`, `egg`, `sparkling`. A Base groups “spirit-forward” as none of them.
- Each fact comes from the hierarchy: citrus and other juice from the Juice category's families, sparkling from the Sparkling Wine and Carbonated Mixer families, egg and dairy from those types and staples. Local types get them through their family; a type with no family needs a way to say it, likely an optional property on the type. The exact shape is settled when this slice is built.

## Where it shows

- **Recipes Base**: alcohol (standard drinks and mL), ABV, and basis columns, and a **Lower alcohol** view sorted by alcohol, then ABV.
- **Recipe note**: the properties panel shows the stored values; no extra view.
- **Logging dialog**: one line under the servings, for the bottles selected, scaled by servings: “≈ 1.6 drinks (28 mL alcohol), 18% ABV · typical ABVs”.
- Not in each ingredient note's Recipes sections at first, to keep them short.

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
2. Built 2026-11-13: the calculator as pure code (`src/core/alcohol-estimate.ts`), with tests for each line shape, the ABV sources, dilution, and basis. It takes each link's ABV and facts from the vault layer, which slice 3 adds. Kitchen staples count as 0. A dash range (`1–2 dashes`) isn't read yet and counts as unmeasured.
3. Stored properties and sync, including recalculation when an ABV changes.
4. Recipes Base columns and the Lower alcohol view; the logging dialog line for selected bottles.
5. `cc-contains`, if not folded into slice 2.
