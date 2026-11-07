# Cocktail Cabinet

Language for cocktail recipes, ingredients, and cabinet inventory.

## Language

**Bottle**:
A named spirit, liqueur, or other bottled cocktail ingredient, with characteristics such as bottle volume and alcohol strength; referencing a bottle does not imply it is owned. For example, Angostura Bitters is a bottle whose ingredient type is Aromatic Bitters.
_Avoid_: Product

**Ingredient category**:
An optional broad classification of ingredient families, such as Spirit or Juice.

**Ingredient family**:
An optional grouping of ingredient types, such as Rum, Bitters, or Citrus juice. A family may belong to a category or stand on its own.
_Avoid_: Subcategory

**Ingredient type**:
A specific kind of ingredient, such as rye whiskey, lime juice, or 2:1 demerara syrup. Differences that would change the cocktail recipe can distinguish ingredient types; differences in how an ingredient is sourced do not inherently do so.

**Catch-all type**:
An ingredient type grouping products without close substitutes, such as Amaro or Specialty Bitters. Its bottles are likely substitutes for each other, offered but not assumed.

**Unlinked line**:
A measured recipe ingredient line without a cabinet link, so logging can't subtract it. Linking keeps the recipe's wording as the link's display text.

**Kept as text**:
An ingredient wording deliberately left unlinked, such as water, which the unlinked review leaves out.

**Recipe ingredient**:
An ingredient requirement in a cocktail recipe, which may name a bottle, an ingredient type, or a broader classification such as rum.

**Stock tracking**:
The method chosen for a bottle or ingredient source to describe how much is available: volume tracking or status tracking.

**Volume tracking**:
Stock recorded as milliliters remaining, with measured consumption deducted from that quantity. Bottles can additionally have unopened stock.

**Status tracking**:
Stock described by a manually maintained Unknown, Have, Low, or Out status, without asserting an exact quantity.

**Shopping list item**:
An ingredient type, bottle, or other ingredient source explicitly marked for purchase or replenishment, independently of its stock level.

**Brandy**:
French-style grape brandy in this cabinet's colloquial vocabulary, including Cognac and Armagnac. Apple brandy has a separate family.

**Apple Brandy Family**:
The broader grouping of apple brandy and applejack styles, including Bonded Apple Brandy, Applejack, and Calvados.

**Apple Brandy**:
Regular apple brandy as an ingredient type, alongside Bonded Apple Brandy, Applejack, and Calvados in Apple Brandy Family.

**Amaro Family**:
A grouping of bitter liqueur types, including the general Amaro type and specialized styles such as Fernet and Artichoke Amaro.

**Amaro**:
A general bitter herbal liqueur ingredient type for bottles such as Averna, Montenegro, Meletti, Lucano, and Nonino. Their flavors, sweetness, and strengths vary.

**Red Bitter Liqueur**:
The Campari-style bitter-liqueur recipe role, separate from the Aperol-style role. Color alone does not determine membership.

**Orange Bitter Liqueur**:
The Aperol-style bitter-liqueur recipe role, including Mari Gold, separate from Red Bitter Liqueur and Orange Liqueur.

**Gentian Liqueur**:
The gentian bitter-liqueur recipe role, including Salers, Suze, Avèze, and, in this cabinet, Bitter Bianco.

**Orange Liqueur**:
A broad ingredient type encompassing triple sec, curaçao, and brandy- or rum-based orange liqueurs, without ranking bottles as closer alternatives to one another.

**Contemporary Gin**:
A gin ingredient type emphasizing distinctive citrus, floral, herbal, or other botanical profiles outside the London Dry recipe role.

**Crème de Menthe**:
A sweet mint liqueur, including clear expressions such as Menthe-Pastille, with a distinct recipe role from Green Herbal Liqueur.

**Vermouth Amaro**:
A bitter-vermouth ingredient type represented by Punt e Mes and Cocchi Dopo Teatro, distinct from ordinary Sweet Vermouth.

**Vanilla Syrup**:
A vanilla-flavored sugar syrup whose preparation and concentration can vary.
