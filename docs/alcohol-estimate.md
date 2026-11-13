# Alcohol estimate design

Drafted on 2026-11-13 from the [roadmap item](roadmap.md#4-everyday-polish-less-command-hunting) and the [decision against a method category](cabinet-design.md#recipe-tags-rating-and-duplicates). This is a proposal for review, not agreed scope. Each section ends with what is recommended; the [open decisions](#open-decisions) collect the questions that need an answer before building.

## Goal

Find lower-alcohol drinks, and see roughly how strong any recipe is, without tagging. A number replaces `#lowerabv`. The estimate has to be honest about guesses: most recipe lines name a type, not a bottle, so most figures rest on typical values.

## What the `knowledge` vault looks like

Measured on 2026-11-13 through the running vault:

- 509 recipes with 2,584 ingredient lines. About three quarters have a volume the plugin already reads (oz, ounces, mL, cL, barspoons, teaspoons); 256 are dashes or drops, 26 are ranges, 14 are “top” or “fill”, and the rest are garnishes, peel oils, rinses, and other wording.
- Ingredient links: 1,312 to types, 668 to bottles, 45 to families, 13 to other stock. Two thirds of links therefore need an ABV from somewhere other than a bottle.
- 133 of 166 bottles have `cc-abv`. 86 of 155 types have at least one bottle with an ABV.
- Types carry no ABV today, and the starter catalog has none.

## Outputs

Three figures per recipe, for one serving:

- **Alcohol**: mL of ethanol, shown as standard drinks. A US standard drink is 14 g of ethanol, about 17.7 mL; a UK unit is 8 g, 10 mL. The unit should be a setting, default US.
- **ABV as served**: ethanol over the final volume after dilution. Strength per sip.
- **Volume as served**: the pour plus dilution, useful to explain why a spritz is low in ABV yet not low in alcohol.

Both alcohol and ABV are needed. A Bamboo is low on both; a large spritz is low in ABV but can carry as much alcohol as a Daiquiri. A “lower alcohol” view sorts by alcohol, with ABV beside it.

## Reading each line

The logging parser already turns a line into a volume. The estimate reuses it and adds:

| Line                                     | Volume                                                      | Notes                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Measured (oz, mL, cL, barspoon, …)       | As parsed                                                   | The stated mL wins in `2 oz (60 ml)`, as in logging.                                  |
| Dash or drop                             | A dash is assumed at about 0.9 mL (1/32 oz); a drop 0.05 mL | Negligible alcohol, but bitters are 35–45%, so they're counted rather than dropped.   |
| Range (`1–2 oz`)                         | Midpoint                                                    | Marks the estimate approximate.                                                       |
| Top or fill                              | Unknown                                                     | See [unknown volumes](#unknown-volumes).                                              |
| Rinse, spritz, mist, peel oil, garnish   | 0                                                           | Too small to matter; not counted as unknown.                                          |
| Several links on one line (alternatives) | First link's ABV                                            | Alternatives are usually close; flagged when their ABVs differ by more than 5 points. |

### Unknown volumes

A top of soda adds no alcohol, so total alcohol stays exact and the ABV becomes an upper bound (“at most 12%”). A top of sparkling wine adds unknown alcohol, so alcohol becomes a lower bound (“at least 1.2 drinks”). An unknown line whose ABV is also unknown leaves the estimate partial.

Recommended: no assumed volume for tops. Bounds say what is known without inventing a pour.

## Where each line's ABV comes from

In order, stopping at the first that applies:

1. **The named bottle's `cc-abv`.** Exact.
2. **The linked type's typical ABV**, a new optional type property, `cc-abv-typical`, written the same way as `cc-abv` (a fraction). The starter catalog would supply it for every type: 0 for juices, syrups, mixers, and staples; a representative value for spirits (gin 0.42, London Dry 0.43, Navy Strength 0.57), liqueurs, and wines. Users override it on a type note, through **Edit cabinet note**.
3. **The median ABV of your bottles of that type**, when the type has no typical value. Useful for local types the catalog doesn't know.
4. **The family's typical ABV**, for family links (`[[Rum|rum]]`) and types with nothing above. Families get the same optional property.
5. **Other stock** uses the ABV of the first type it provides; House syrups and fresh juice come out at 0.
6. Otherwise **unknown**.

The catalog values are where the work is: about 130 types and 26 families. Each needs a sourced, representative ABV, reviewed like the classification was.

Recommended: steps 1, 2, 4, 5, and 6 first. Step 3 makes a recipe's estimate change when a bottle is bought or used up; leave it out unless local types turn out to need it.

## Dilution

Chilling with ice adds water, which lowers ABV without changing alcohol. The best-known model is Dave Arnold's, from measured drinks in _Liquid Intelligence_ (2014). With initial ABV `A` as a fraction, the water added as a fraction of the starting volume is about:

- stirred: `−1.21·A² + 1.246·A + 0.145`
- shaken: `1.567·A² + 1.742·A + 0.203`

These formulas, and how well they match drinks made at home, should be checked against the book before building.

There is no method property, so the estimate picks a model:

- A recipe with juice, dairy, or egg uses the **shaken** model; others use **stirred**.
- The Method text can override: the first of “shake” or “stir” it mentions picks that model.
- Blended or crushed-ice drinks, and drinks built over ice, have no reliable model. They use the nearest one, and the basis says “rough”.
- Tops add their own volume (when known) after dilution.

Recommended as above. Whether to show the dilution assumption is a display question: the basis line below covers it.

## Saying how sure it is

Each recipe gets a basis label alongside the numbers:

- **Exact**: every alcoholic line names a bottle with an ABV, and every amount is measured.
- **Typical ABVs**: some lines use a type or family value.
- **Rough**: blended, crushed ice, or built over ice, on top of either of the above.
- **Partial**: an alcoholic line has an unknown amount or ABV; alcohol is a lower bound.
- **No estimate**: nothing alcoholic could be read.

The basis travels with the numbers in every view, so a guess never reads as a measurement.

## Storing and updating

Bases formulas can't read ingredient lines or follow them to other notes' ABVs, so the figures are stored on the recipe, like [`cc-ingredients`](cabinet-design.md#navigation-in-notes):

- `cc-est-alcohol-ml`, `cc-est-abv` (a fraction), `cc-est-volume-ml`, and `cc-est-basis`. The `est` makes clear they are derived. Standard drinks are a Base formula over alcohol, so the unit setting doesn't rewrite every recipe.
- The same background sync that keeps `cc-ingredients` updates them: when a recipe has been quiet for two seconds, and for every recipe shortly after startup.
- They also depend on other notes. When a bottle's `cc-abv` or a type's or family's typical ABV changes, the recipes linking it are recalculated (found through Obsidian's resolved links).
- Values are rounded (alcohol to 0.1 mL, ABV to 0.1 point) and written only when they change, so recalculation doesn't churn notes or sync.

Recommended as above. The alternative, computing on the fly in a plugin view, would render nothing without the plugin and couldn't sort in a Base.

## Ingredient facts in the same pass

The [design decision](cabinet-design.md#recipe-tags-rating-and-duplicates) replaced “stirred and boozy vs shaken with juice” with facts read from ingredients. The estimate needs the same facts to pick a dilution model, so it can store them too:

- `cc-contains`: any of `citrus`, `juice`, `dairy`, `egg`, `sparkling`. A Base groups “spirit-forward” as none of them.
- Each fact comes from the hierarchy: citrus and other juice from the Juice category's families, sparkling from the Sparkling Wine and Carbonated Mixer families, egg and dairy from those types and staples. Local types get them through their family; a type with no family needs a way to say it, likely the same optional property on the type.

Recommended: build facts with the estimate, since dilution needs them, but they can ship separately if the property shape needs more thought.

## Where it shows

- **Recipes Base**: alcohol (as standard drinks), ABV, and basis columns, and a **Lower alcohol** view sorted by alcohol, then ABV.
- **Recipe note**: the properties panel shows the stored values; no extra view.
- **Logging dialog**: one line under the servings, “≈ 1.6 drinks, 18% ABV (typical ABVs)”, scaled by servings.
- Not in each ingredient note's Recipes sections at first, to keep them short.

## Open decisions

1. **Typical ABVs in the catalog.** Supply representative values for every starter type and family, sourced and reviewed? Recommended yes; without them most estimates are partial.
2. **Owned bottles as a fallback** (step 3). Leave out at first? Recommended yes.
3. **Standard drink unit.** A setting with US (14 g) as the default, UK units as the other choice?
4. **Tops.** Bounds rather than an assumed pour? Recommended bounds.
5. **Stored properties.** The four `cc-est-` properties, plus `cc-contains`, kept by background sync?
6. **Dilution model.** Arnold's stirred and shaken formulas, chosen by ingredients with Method text as override, after checking them against the book?
7. **`#lowerabv`.** Retire it in `knowledge` once the Lower alcohol view exists, as part of the tagging session?

## Suggested slices

1. Typical ABVs for starter types and families, `cc-abv-typical` on type and family notes (and in **Edit cabinet note**), and the `knowledge` migration adding them.
2. The calculator as pure code, with tests for each line shape, bounds, and basis.
3. Stored properties and sync, including recalculation when an ABV changes.
4. Recipes Base columns and the Lower alcohol view; the logging dialog line.
5. `cc-contains`, if not folded into slice 2.
