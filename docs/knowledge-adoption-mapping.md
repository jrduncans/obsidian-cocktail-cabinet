# Knowledge adoption mapping

Agreed on 2026-11-03 with the user, question by question, from the `knowledge` vault and the starter catalog at `c261d8d`. This is step 1 of [roadmap](roadmap.md) Phase 1 and the input to the one-off migration script. Nothing has been written to either vault, and the starter catalog changes below are not implemented yet.

Policy, from [adoption decisions](cabinet-design.md#adoption-and-logging-decisions): match the starter wherever the two overlap, with local types for the rest. Scope: 7 categories, 26 subcategories, 107 types, 165 bottles, 3 ingredient sources, and 502 recipes.

## Classification principles

These came out of the review and decide most cases; they are also recorded in [the cabinet design](cabinet-design.md#classification-principles).

1. **A type exists so its bottles can be swapped.** A narrower type is worth creating only when several real near-substitutes exist (Red Bitter Liqueur for Campari and its peers).
2. **Products without near-substitutes go in their family's catch-all type**, as amari do in Amaro. Bottles always have a type; catch-alls keep them browsable.
3. **Never create a type only one product could belong to.** A recipe that wants that product links the bottle directly, creating a bottle note with unknown stock if needed. Types for a kind of product, such as Yuzu Liqueur or Peach Bitters, are fine even with one bottle owned.
4. **Families are navigation.** Pick a reasonable home; only types need careful thought. Merge families whose boundary would be arbitrary.
5. **Classify by recipe role, not production detail.** Hamilton Gold is Aged Jamaican Rum and Doctor Bird Pineapple Rum is Aged Overproof Jamaican Rum because that is how they are used.
6. **Catch-all names must not read as "any".** A generic recipe "bitters" means aromatic, so the bitters catch-all is Specialty Bitters; a generic "rum" means any rum, so the rum catch-all is Flavored Rum.
7. **Recipe links keep the source's meaning.** Change a link only where the wording says something specific (2:1, Velvet, bonded); otherwise preserve what the vault means today.

Directional substitutions (rich simple → Demerara 2:1, O.F.T.D. → Demerara 151) are not expressible as types. In Phase 1 they use the logging picker's **Other bottle…**; they are the motivating cases for a future substitution feature.

## Starter catalog changes

- **Merge** the Herbal Liqueur and Spice Liqueur families into **Herbal & Spice Liqueur** (category Liqueur).
- **Remove** the Bénédictine type; Bénédictine is a bottle of the Herbal Liqueur catch-all.
- **Add catch-alls:** Herbal Liqueur and Spice Liqueur (Herbal & Spice Liqueur), Specialty Bitters (Bitters), Flavored Rum (Rum).
- **Add types:** Vanilla Liqueur (Herbal & Spice Liqueur; Licor 43, Galliano); Bitter Aperitif Wine in a new **Aperitif Wine** family under Fortified Wine; Melon, Pineapple, and Bergamot Liqueur (Fruit Liqueur); Tiki and Grapefruit Bitters (Bitters).

## Recipe link changes

Renamed types are rewritten automatically (see the types table). These depend on the recipe:

- **Simple Syrup (78):** Bourbon Renewal, Old Fashioned, Wibble, Lion's Tail, Whiskey Sour, and Amaro Daiquiri say 2:1 or rich → Simple Syrup (2 to 1); the rest → Simple Syrup (1 to 1).
- **Demerara Syrup (12):** all → Demerara Syrup (2 to 1).
- **Falernum (21):** keeps its syrup meaning → Falernum Syrup, except Certain Ratio and Drunken Helmsman ("Velvet") and Drunk in the August Sun ("Maggie's Farm") → Falernum. The old `Falernum` note becomes Falernum Syrup and the old `Falernum Liqueur` note becomes Falernum.
- **Apple Brandy (12):** generic lines → Apple Brandy Family, displayed "Apple Brandy"; Kingston Black, New English Negroni, and Star Daisy say bonded or 100-proof → Bonded Apple Brandy. Calvados links stay Calvados.
- **Falernum Liqueur (2):** → Falernum.
- **Navy Strength Rum (FALSE IDOL):** → the Smith & Cross bottle, displayed "Navy Strength Rum".
- **Coconut Rum (After Hours):** → the Planteray Cut & Dry bottle.
- **Krupnik Herbal Honey Bitters (Orchard & Rye):** → the Bittermens Krupnik bottle. **Whiskey Barrel-Aged Bitters (Dub Treo):** → a new Fee Brothers Whiskey Barrel-Aged Bitters bottle note.
- **Brandy subcategory (6):** → Brandy family, except High Horse's "kirsch" → a new local **Kirsch** type.
- **Other subcategory links** → their families: Sparkling Wine (10), Sherry (8), Aquavit (7), Vermouth (5), Gin (1), Rum (1). The Aromatic Bitters subcategory link (The Bachelor) → the Aromatic Bitters type.
- **Missing notes:** Macerated Strawberry Juice (9) → new local type; Mr Black (2) and Don Q Gold (1) → new bottle notes with unknown stock.
- **All links** are rewritten to the plugin style, keeping each recipe's displayed wording.

## Mechanical changes

- **Categories:** Fruit Juice → Juice. Bitters is retired as a category; the Bitters family has none.
- **Subcategories → families:** same-named ones map directly. Herbal Liqueur and Spice Liqueur → Herbal & Spice Liqueur. All bitters subcategories → Bitters. Fruit Syrup, Infused Syrup, and Orgeat → Flavored Syrup. Aperitif Wine → the new Aperitif Wine family. Fruit Brandy and Other Liqueur are retired.
- **Parent links** are written as single link strings (`cc-type`, `cc-family`, `cc-category`); only `cc-provides` is a list.
- **Parents** follow the starter where it differs (for example Pastis → Anise Spirit, Coffee Liqueur → none). See [the hierarchy review](knowledge-hierarchy-adoption-review.md#same-name-types-whose-parent-changes).
- **Substitutes For** is dropped. Every declared pair now shares a type, so the logging picker lists them first.
- **Bottle stock:** `Volume` "750 mL" → `cc-volume-ml` 750; `Remaining in Open Bottle` × volume → `cc-open-ml`; `Unopened Bottles` → `cc-unopened`; `ABV`, `Last Purchase Price`, and `Shopping List` carry over; all bottles use volume tracking. An empty open amount stays unknown rather than zero.
- **Recipe ratings:** ⭐️ strings → `rating` 1–5 by star count; blank stays blank.
- **Fresh Lemons, Limes, and Oranges** become other-stock sources providing their juices, with status tracking and availability carried over.
- **DataviewJS related-recipe blocks** on bottle, type, and subcategory notes are replaced with the plugin's navigation embeds for the note's kind (see [navigation in notes](cabinet-design.md#navigation-in-notes)), and `Related.base` is added to Views.
- **Other old-schema views and notes** (the `.base` files, `Shopping.md`, templates) are handled at cutover, not here.

## Ingredient types

Every current type note. **Starter**: ships today. **Starter addition**: added to the catalog by this mapping. **Local**: created in this cabinet only. **Retired**: the note is removed once its bottles and links move. Recipes counts recipes whose Ingredients section links the type.

| Current type | New type | Family | Status | Recipes |
| --- | --- | --- | --- | --- |
| Aged Aquavit | same | Aquavit | Starter | 0 |
| Aged Blended Rum | same | Rum | Starter | 16 |
| Aged Column Still Rum | same | Rum | Starter | 8 |
| Aged Jamaican Rum | same | Rum | Starter | 25 |
| Aged Overproof Jamaican Rum | same | Rum | Starter | 10 |
| Allspice Dram | same | Herbal & Spice Liqueur | Starter | 17 |
| Aloe Liqueur | Herbal Liqueur | Herbal & Spice Liqueur | Starter addition | 3 |
| Alpine Liqueur | — | — | Retired: Braulio → Amaro, Bluebird → Spice Liqueur | 0 |
| Amaro | same | Amaro Family | Starter | 5 |
| Amontillado Sherry | same | Sherry | Starter | 8 |
| Apple Brandy | same | Apple Brandy Family | Starter | 12 |
| Apricot Liqueur | same | Fruit Liqueur | Starter | 6 |
| Banana Liqueur | same | Fruit Liqueur | Starter | 14 |
| Barbados Rum | Aged Barbados Rum | Rum | Starter (renamed) | 11 |
| Bergamot Liqueur | same | Fruit Liqueur | Starter addition | 3 |
| Bitter Aperitif Wine | same | Aperitif Wine | Starter addition | 0 |
| Black Jamaican Rum | same | Rum | Starter | 5 |
| Blackberry Liqueur | same | Fruit Liqueur | Local | 3 |
| Blackstrap Bitters | — | — | Retired: one product; bottle → Aromatic Bitters | 0 |
| Blanc Vermouth | same | Vermouth | Starter | 29 |
| Blended Overproof Rum | same | Rum | Starter | 4 |
| Bolivar Bitters | — | — | Retired: one product; bottle → Specialty Bitters | 0 |
| Bourbon | same | Whiskey | Starter | 25 |
| Calvados | same | Apple Brandy Family | Starter | 7 |
| Cardamom Bitters | same | Bitters | Local | 2 |
| Cassis Liqueur | Blackcurrant Liqueur | Fruit Liqueur | Starter (renamed) | 3 |
| Celery Bitters | same | Bitters | Local | 0 |
| Chai Spice Liqueur | Spice Liqueur | Herbal & Spice Liqueur | Starter addition | 1 |
| Cherry Bark Vanilla Bitters | — | — | Retired: one product; bottle → Specialty Bitters | 0 |
| Cherry Blossom Liqueur | same | Floral Liqueur | Local | 0 |
| Cherry Liqueur | same | Fruit Liqueur | Starter | 1 |
| Chinese Bitters | — | — | Retired: one product; bottle → Specialty Bitters | 0 |
| Chocolate Bitters | same | Bitters | Starter | 7 |
| Cinnamon Syrup | same | Flavored Syrup | Starter | 23 |
| Classic Aromatic Bitters | Aromatic Bitters | Bitters | Starter (renamed) | 7 |
| Coconut Rum | Flavored Rum | Rum | Starter addition | 1 |
| Coffee Liqueur | same | — | Starter | 8 |
| Cognac | same | Brandy | Starter | 46 |
| Contemporary Gin | same | Gin | Starter | 3 |
| Crème de Cacao (dark) | Crème de Cacao | — | Starter (renamed) | 6 |
| Crème de Cacao (white) | Crème de Cacao | — | Starter (renamed) | 0 |
| Crème de Menthe | same | Herbal & Spice Liqueur | Starter | 9 |
| Demerara 151 Rum | same | Rum | Starter | 5 |
| Demerara Rum | same | Rum | Starter | 9 |
| Demerara Syrup | Demerara Syrup (2 to 1) | Sugar Syrup | Starter (renamed) | 12 |
| Dill Aquavit | same | Aquavit | Local | 0 |
| Dry Vermouth | same | Vermouth | Starter | 23 |
| Falernum | Falernum Syrup | Flavored Syrup | Starter (renamed) | 21 |
| Falernum Liqueur | Falernum | Herbal & Spice Liqueur | Starter (renamed) | 2 |
| Gentian Liqueur | same | Amaro Family | Starter | 1 |
| Grapefruit Bitters | same | Bitters | Starter addition | 5 |
| Grapefruit Juice | same | Citrus Juice | Starter | 25 |
| Grapefruit Liqueur | same | Fruit Liqueur | Local | 1 |
| Grenadine | same | Flavored Syrup | Starter | 5 |
| Haitian Rum | Aged Haitian Rum | Rum | Starter (renamed) | 1 |
| Honey Liqueur | same | — | Local | 0 |
| Honey Syrup | same | Sugar Syrup | Starter | 27 |
| Jamaican No. 2 Bitters | — | — | Retired: one product; bottle → Specialty Bitters | 0 |
| Krupnik Herbal Honey Bitters | — | — | Retired: one product; bottle → Specialty Bitters, recipe links the bottle | 1 |
| Lavender Bitters | same | Bitters | Local | 0 |
| Lemon Bitters | same | Bitters | Local | 1 |
| Lemon Juice | same | Citrus Juice | Starter | 117 |
| Lime Bitters | same | Bitters | Local | 2 |
| Lime Juice | same | Citrus Juice | Starter | 138 |
| London Dry Gin | same | Gin | Starter | 92 |
| Maple Syrup | same | Sugar Syrup | Local | 2 |
| Maraschino Liqueur | same | Fruit Liqueur | Starter | 25 |
| Melon Liqueur | same | Fruit Liqueur | Starter addition | 1 |
| Mole Bitters | same | Bitters | Local | 3 |
| Navy Strength Gin | same | Gin | Starter | 5 |
| Navy Strength Rum | — | — | Retired: FALSE IDOL links Smith & Cross; Mister Fogg → Blended Overproof Rum | 1 |
| New Orleans-Style Bitters | Creole Bitters | Bitters | Starter (renamed) | 0 |
| Oaxacan Rum | Unaged Mexican Rum | Rum | Starter (renamed) | 0 |
| Old Tom Gin | same | Gin | Starter | 11 |
| Orange Bitters | same | Bitters | Starter | 40 |
| Orange Juice | same | Citrus Juice | Starter | 18 |
| Orange Liqueur | same | Fruit Liqueur | Starter | 17 |
| Orgeat | same | Flavored Syrup | Starter | 25 |
| Other Herbal Liqueur | — | — | Retired: catch-all; bottles reassigned individually | 0 |
| Other Liqueur | — | — | Retired: catch-all; bottles reassigned individually | 0 |
| Passionfruit Syrup | Passion Fruit Syrup | Flavored Syrup | Starter (renamed) | 11 |
| Pastis | same | Anise Spirit | Starter | 3 |
| Peach Bitters | same | Bitters | Local | 1 |
| Pineapple Liqueur | same | Fruit Liqueur | Starter addition | 4 |
| Pineapple Rum | same | Rum | Starter | 11 |
| Pisco | same | — | Local | 4 |
| Prosecco | same | Sparkling Wine | Starter | 7 |
| PX Sherry | Pedro Ximénez Sherry | Sherry | Starter (renamed) | 4 |
| Quince Liqueur | same | Fruit Liqueur | Local | 0 |
| Rhum Agricole Blanc | Unaged Rhum Agricole | Rum | Starter (renamed) | 1 |
| Rye Whiskey | same | Whiskey | Starter | 20 |
| Sea Buckthorn Liqueur | same | Fruit Liqueur | Local | 1 |
| Simple Syrup | Simple Syrup (1 to 1) | Sugar Syrup | Starter (renamed) | 78 |
| Sloe Gin | same | Fruit Liqueur | Local | 4 |
| Spiced Pear Liqueur | same | Fruit Liqueur | Local | 1 |
| Strawberry Liqueur | same | Fruit Liqueur | Local | 1 |
| Swedish Punsch | same | — | Local | 11 |
| Sweet Vermouth | same | Vermouth | Starter | 59 |
| Tiki Bitters | same | Bitters | Starter addition | 5 |
| Unaged Column Still Rum | Light Rum | Rum | Starter (renamed) | 3 |
| Unaged Overproof Jamaican Rum | same | Rum | Starter | 3 |
| Vanilla Syrup | same | Flavored Syrup | Starter | 10 |
| Vermouth Amaro | same | Vermouth | Starter | 0 |
| Whiskey Barrel-Aged Bitters | — | — | Retired: one product; recipe links a new Fee Brothers bottle note | 1 |
| White Blended Rum | same | Rum | Starter | 14 |
| Winter Melon Bitters | same | Bitters | Local | 1 |
| Yuzu Liqueur | same | Fruit Liqueur | Local | 0 |

Types with no current note, created by migration: **Vanilla Liqueur** (Herbal & Spice Liqueur, starter addition), **Specialty Bitters** (Bitters, starter addition), **French Brandy** (Brandy, local), **Macerated Strawberry Juice** (Other Fruit Juice, local), **Kirsch** (—, local).

## Bottles whose type changes

Other bottles keep a type with the same name as today. Each bottle gets exactly one type.

| Bottle | Current type | New type | Family | Recipes naming it |
| --- | --- | --- | --- | --- |
| Mount Gay Eclipse | Barbados Rum | Aged Barbados Rum | Rum | 1 |
| Real McCoy 5 | Barbados Rum | Aged Barbados Rum | Rum | 1 |
| Rhum Barbancourt 3 Star | Haitian Rum | Aged Haitian Rum | Rum | 2 |
| Braulio | Alpine Liqueur | Amaro | Amaro Family | 14 |
| Angostura Bitters | Classic Aromatic Bitters | Aromatic Bitters | Bitters | 105 |
| Bitter Truth Aromatic Bitters | Classic Aromatic Bitters | Aromatic Bitters | Bitters | 0 |
| Bittercube Blackstrap Bitters | Blackstrap Bitters | Aromatic Bitters | Bitters | 0 |
| Cynar | Amaro | Artichoke Amaro | Amaro Family | 27 |
| Clear Creek Cassis Liqueur (375 mL) | Cassis Liqueur | Blackcurrant Liqueur | Fruit Liqueur | 0 |
| Planteray Mister Fogg | Navy Strength Rum | Blended Overproof Rum | Rum | 0 |
| Laird's Straight Apple Brandy (Bottled in Bond) | Apple Brandy | Bonded Apple Brandy | Apple Brandy Family | 1 |
| Giffard Cacao | Crème de Cacao (white) | Crème de Cacao | — | 1 |
| Tempus Fugit Crème de Cacao a la Vinelle | Crème de Cacao (dark) | Crème de Cacao | — | 1 |
| Peychaud's Bitters | New Orleans-Style Bitters | Creole Bitters | Bitters | 15 |
| Scrappy's Orleans Bitters | New Orleans-Style Bitters | Creole Bitters | Bitters | 0 |
| Demerara Syrup, 2 to 1 | Demerara Syrup | Demerara Syrup (2 to 1) | Sugar Syrup | 6 |
| Avuá Falernum | Falernum Liqueur | Falernum | Herbal & Spice Liqueur | 2 |
| Velvet Falernum | Falernum Liqueur | Falernum | Herbal & Spice Liqueur | 3 |
| Latitude 29 Falernum | Falernum | Falernum Syrup | Flavored Syrup | 0 |
| Portland Syrups Falernum | Falernum | Falernum Syrup | Flavored Syrup | 1 |
| Fernet Branca | Amaro | Fernet | Amaro Family | 11 |
| Doctor Bird Coco Atoll | Coconut Rum | Flavored Rum | Rum | 1 |
| Planteray Cut & Dry | Coconut Rum | Flavored Rum | Rum | 2 |
| St-Remy VSOP | Cognac | French Brandy | Brandy | 0 |
| Cascadia Liqueur | Other Herbal Liqueur | Gentian Liqueur | Amaro Family | 0 |
| Luxardo Bitter Bianco | Other Herbal Liqueur | Gentian Liqueur | Amaro Family | 7 |
| Flora Green | Other Herbal Liqueur | Green Herbal Liqueur | Herbal & Spice Liqueur | 0 |
| Green Chartreuse | Other Herbal Liqueur | Green Herbal Liqueur | Herbal & Spice Liqueur | 29 |
| Luxardo Del Santo | Other Herbal Liqueur | Green Herbal Liqueur | Herbal & Spice Liqueur | 1 |
| Becherovka | Other Herbal Liqueur | Herbal Liqueur | Herbal & Spice Liqueur | 1 |
| Bénédictine | Other Herbal Liqueur | Herbal Liqueur | Herbal & Spice Liqueur | 27 |
| Chareau | Aloe Liqueur | Herbal Liqueur | Herbal & Spice Liqueur | 2 |
| Don Q Cristal | Unaged Column Still Rum | Light Rum | Rum | 2 |
| Flor de Caña Extra Seco | Unaged Column Still Rum | Light Rum | Rum | 0 |
| Accompani Mari Gold | Amaro | Orange Bitter Liqueur | Amaro Family | 0 |
| Aperol | Amaro | Orange Bitter Liqueur | Amaro Family | 30 |
| Lustau Pedro Ximénez San Emilio | PX Sherry | Pedro Ximénez Sherry | Sherry | 0 |
| Campari | Amaro | Red Bitter Liqueur | Amaro Family | 19 |
| Crimson Snap | Amaro | Red Bitter Liqueur | Amaro Family | 2 |
| Simple Syrup, 1 to 1 | Simple Syrup | Simple Syrup (1 to 1) | Sugar Syrup | 3 |
| Bar Keep Chinese Bitters | Chinese Bitters | Specialty Bitters | Bitters | 1 |
| Bittercube Bolivar Bitters | Bolivar Bitters | Specialty Bitters | Bitters | 1 |
| Bittercube Cherry Bark Vanilla Bitters | Cherry Bark Vanilla Bitters | Specialty Bitters | Bitters | 0 |
| Bittercube Jamaican No. 2 Bitters | Jamaican No. 2 Bitters | Specialty Bitters | Bitters | 0 |
| Bittermens Krupnik Herbal Honey Bitters | Krupnik Herbal Honey Bitters | Specialty Bitters | Bitters | 0 |
| Freeland Spirits Chai Spice Liqueur | Chai Spice Liqueur | Spice Liqueur | Herbal & Spice Liqueur | 1 |
| Townshend's Bluebird Alpine Liqueur | Alpine Liqueur | Spice Liqueur | Herbal & Spice Liqueur | 0 |
| Paranubes | Oaxacan Rum | Unaged Mexican Rum | Rum | 1 |
| Clément Canne Bleue | Rhum Agricole Blanc | Unaged Rhum Agricole | Rum | 0 |
| Licor 43 | Other Liqueur | Vanilla Liqueur | Herbal & Spice Liqueur | 4 |
| Liquore Strega | Other Herbal Liqueur | Yellow Herbal Liqueur | Herbal & Spice Liqueur | 5 |
| Yellow Chartreuse | Other Herbal Liqueur | Yellow Herbal Liqueur | Herbal & Spice Liqueur | 20 |

113 bottles keep a same-named type and are not listed. Three bottle notes are added with unknown stock, for recipes that link products you do not own: **Mr Black** (Coffee Liqueur), **Don Q Gold** (Aged Column Still Rum), and **Fee Brothers Whiskey Barrel-Aged Bitters** (Aromatic Bitters, unconfirmed).
