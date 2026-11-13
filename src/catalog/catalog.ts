import type { NoteDraft, Properties } from '../core/schema';
import { PROP, fileName, notePath, wikiLink } from '../core/schema';
import { stapleProperties } from '../core/stock';

export interface CatalogEntry extends NoteDraft {
	id: string;
	parent?: string;
	/** For other stock: the catalog types it supplies. */
	provides?: readonly string[];
}

type TypeDefinition = [name: string, description: string, properties?: Properties];

const entries: CatalogEntry[] = [];
function category(name: string, description: string) {
	entries.push({ id: `category/${fileName(name)}`, kind: 'category', name, description });
}
function ingredientTypes(parent: string | undefined, types: TypeDefinition[]) {
	for (const [name, description, properties] of types) {
		entries.push({ id: `type/${fileName(name)}`, kind: 'type', name, parent, description, properties });
	}
}
function staples(items: [name: string, description: string, aliases?: string[]][]) {
	for (const [name, description, aliases] of items) {
		entries.push({
			id: `ingredient/${fileName(name)}`,
			kind: 'ingredient',
			name,
			description,
			properties: { ...stapleProperties('Unknown'), ...(aliases ? { aliases } : {}) },
		});
	}
}
function family(name: string, parent: string | undefined, description: string, types: TypeDefinition[]) {
	entries.push({ id: `family/${fileName(name)}`, kind: 'family', name, parent, description });
	ingredientTypes(name, types);
}

category('Spirit', 'Distilled spirits used as cocktail bases and modifiers.');
category('Liqueur', 'Sweetened spirits and liqueurs used for flavor and sweetness.');
category('Wine', 'Still and sparkling wines used in cocktails.');
category('Fortified Wine', 'Vermouth, sherry, and other fortified wine ingredients.');
category(
	'Juice',
	'Fruit and vegetable juices. Fruit juice means fresh juice unless the ingredient specifies another preparation.',
);
category(
	'Syrup',
	'Liquid sweeteners and flavored syrups. Concentration is part of an ingredient when it affects a recipe.',
);

family('Whiskey', 'Spirit', 'Whiskey styles used in cocktail recipes.', [
	['Bourbon', 'Bourbon whiskey; choose the bottle and strength appropriate to your recipe.'],
	['Rye Whiskey', 'Rye whiskey used when a recipe calls for rye.'],
	['Blended Scotch', 'Scotch whisky in a blended style; choose the smoke profile and strength to suit your recipe.'],
	['Single Malt Scotch', 'Single malt Scotch whisky; smoke and strength vary by bottle.'],
	['Irish Whiskey', 'Irish whiskey; select a bottle to suit the recipe.'],
]);
family('Rum', 'Spirit', 'Rum styles. These are starting distinctions; refine them to fit your recipes.', [
	[
		'Light Rum',
		'Lightly aged rum filtered to remove color, with a relatively restrained flavor profile; Don Q Cristal is an example. Distinct from White Blended Rum.',
	],
	[
		'White Blended Rum',
		'Clear multi-region rum blends, such as Probitas, combining different flavor profiles. Components may be aged or unaged; kept distinct from the more restrained Light Rum role.',
	],
	[
		'Aged Barbados Rum',
		'Moderately aged Barbados-style blends of pot- and column-still rum, represented by Real McCoy 5, Planteray Barbados 5 Year, and Mount Gay Eclipse. Older expressions such as Real McCoy 12 generally fit; lighter white styles such as Real McCoy 3 and Mount Gay Silver do not.',
	],
	[
		'Aged Column Still Rum',
		'Aged column-still rum in the recipe role represented by Ron Abuelo Añejo and Don Q Gold, kept distinct from Aged Barbados Rum. Moderately aged expressions are typical; older expressions can generally fill the same role.',
	],
	[
		'Aged Blended Rum',
		'Aged blends of rum from multiple regions, in the recipe role represented by Planteray Original Dark. Keep distinct from Aged Barbados Rum and Aged Column Still Rum.',
	],
	['Aged Jamaican Rum', 'Barrel-aged Jamaican rum, kept distinct from unaged and explicitly overproof styles.'],
	[
		'Aged Overproof Jamaican Rum',
		'High-strength barrel-aged Jamaican rum for recipes specifying this role, distinct from Unaged Overproof Jamaican Rum and standard-strength Aged Jamaican Rum.',
	],
	[
		'Unaged Overproof Jamaican Rum',
		'High-strength unaged Jamaican rum for recipes specifying this role, distinct from Aged Overproof Jamaican Rum.',
	],
	['Demerara Rum', 'Demerara rum; choose a bottle and strength to suit the recipe.'],
	[
		'Demerara 151 Rum',
		'Demerara rum bottled at 151 US proof (75.5% ABV), for recipes specifying this strength and style. Distinct from standard-strength Demerara Rum and multi-region overproof blends.',
	],
	[
		'Blended Overproof Rum',
		'High-strength rum blends, including O.F.T.D., Hamilton Zombie Blend, and Planteray Mister Fogg. Their strengths and flavor profiles differ; recipes often specify a particular bottle.',
	],
	[
		'Unaged Rhum Agricole',
		'Unaged sugarcane-juice rhum in the agricole style, also called rhum agricole blanc. Kept distinct from Aged Rhum Agricole.',
		{ aliases: ['Rhum Agricole Blanc'] },
	],
	[
		'Aged Rhum Agricole',
		'Barrel-aged sugarcane-juice rhum in the agricole style, also called rhum agricole vieux in this cabinet. Kept distinct from Unaged Rhum Agricole.',
		{ aliases: ['Rhum Agricole Vieux'] },
	],
	[
		'Unaged Haitian Rum',
		'Traditional Barbancourt-style white rum without wood maturation; steel-tank resting is compatible with this type. Keep distinct from Aged Haitian Rum and Clairin. Preserve a recipe’s named bottle and strength.',
		{ aliases: ['White Haitian Rum'] },
	],
	[
		'Aged Haitian Rum',
		'Barrel-aged Haitian rum in the Barbancourt-style recipe role, represented by Barbancourt 3 Star and 5 Star. Keep distinct from Unaged Haitian Rum and Clairin.',
	],
	[
		'Unaged Mexican Rum',
		'Unaged Mexican cane-juice rum in the recipe role represented by Paranubes Blanco, with pronounced fermentation and savory character. Choose other bottles for their fit with this profile; recipes may specify a particular bottle or strength.',
		{ aliases: ['Oaxacan Rum'] },
	],
	[
		'Black Jamaican Rum',
		'Jamaican rum with pronounced caramel influence, distinct from the Aged Jamaican Rum recipe role. Color alone does not determine membership.',
	],
	[
		'Pineapple Rum',
		'Pineapple-flavored rum, including Stiggins’ Fancy. Other pineapple rums can differ substantially in flavor; recipes often name the intended bottle.',
	],
	[
		'Flavored Rum',
		'Catch-all for flavored rums without close substitutes, such as coconut rums. Bottles in this type are rarely interchangeable, so recipes usually name the bottle. Pineapple Rum has its own type.',
		{ [PROP.catchAll]: true },
	],
]);
family('Cachaça', 'Spirit', 'Brazilian sugarcane spirits, kept separate from the Rum family.', [
	['Unaged Cachaça', 'Unaged Brazilian sugarcane spirit for recipes calling for cachaça.'],
	['Aged Cachaça', 'Barrel-aged cachaça, kept distinct when the recipe specifies an aged style.'],
]);
family('Gin', 'Spirit', 'Gin and related styles; a broad Gin reference does not select a particular style.', [
	['London Dry Gin', 'Juniper-led dry gin for recipes that specify London dry.'],
	['Old Tom Gin', 'Gin in the Old Tom style, typically sweeter than dry gin; bottles vary.'],
	[
		'Contemporary Gin',
		'Gin with prominent citrus, floral, herbal, or other botanical notes, in a recipe role distinct from London Dry Gin. Individual gins can differ substantially; preserve a recipe’s named bottle when specified.',
	],
	['Plymouth Gin', 'Plymouth gin for recipes that specify it.'],
	['Navy Strength Gin', 'High-strength gin; strength affects the cocktail recipe.'],
	['Genever', 'Genever for recipes that specify this style.'],
]);
ingredientTypes(undefined, [
	[
		'Vodka',
		'A neutral, unflavored spirit for recipes calling for vodka. Flavored vodkas can be added as distinct ingredients.',
	],
]);
family('Agave Spirit', 'Spirit', 'Tequila, mezcal, and related agave spirits.', [
	['Blanco Tequila', 'Tequila in the blanco style, distinct from barrel-aged tequila in recipes.'],
	['Reposado Tequila', 'Barrel-rested tequila in the reposado style.'],
	['Añejo Tequila', 'Aged tequila in the añejo style, kept distinct from blanco and reposado.'],
	['Mezcal', 'Mezcal; agave variety and bottle can change the result.'],
]);
family(
	'Brandy',
	'Spirit',
	'French-style grape brandy in common cocktail usage, including Cognac and Armagnac. Apple brandy has a separate family.',
	[
		['Cognac', 'French grape brandy from the Cognac region, used in brandy cocktails.'],
		['Armagnac', 'French grape brandy from the Armagnac region; keep distinct when a recipe specifies it.'],
	],
);
family(
	'Apple Brandy Family',
	'Spirit',
	'Apple brandy and applejack styles used in recipes. A family reference can use any of these types; the Apple Brandy type means regular apple brandy.',
	[
		[
			'Apple Brandy',
			'Regular apple brandy as a recipe ingredient, alongside the separate Bonded Apple Brandy, Applejack, and Calvados types. Use Apple Brandy Family when a recipe permits any of the included styles.',
		],
		[
			'Bonded Apple Brandy',
			'Apple brandy for recipes specifying bonded apple brandy, typically at 100 US proof (50% ABV). Assign bottles deliberately; proof alone does not establish bonded status.',
		],
		[
			'Applejack',
			'Applejack as named in recipes. Bottles vary; decide which bottles fit the recipe style you intend.',
		],
		[
			'Calvados',
			'Calvados for recipes specifying this apple brandy style. Decide which of your bottles fit the recipe requirement.',
		],
	],
);
family('Aquavit', 'Spirit', 'Aquavit styles.', [
	['Unaged Aquavit', 'Caraway- or dill-led aquavit without an aged style designation.'],
	['Aged Aquavit', 'Barrel-aged aquavit, kept distinct from unaged aquavit in recipes.'],
]);
family('Anise Spirit', 'Spirit', 'Anise-flavored spirits used for pours and rinses.', [
	['Absinthe', 'Absinthe; follow the recipe amount, including when used as a rinse.'],
	['Pastis', 'Pastis for recipes that specify it.'],
]);
family('Fruit Liqueur', 'Liqueur', 'Fruit-flavored liqueurs.', [
	[
		'Orange Liqueur',
		'Orange liqueurs including triple sec, curaçao, and brandy- or rum-based styles. Bottles share this broad recipe role; link a specific bottle when needed.',
	],
	['Maraschino Liqueur', 'Maraschino liqueur, distinct from cherry brandy and cherry syrup.'],
	['Cherry Liqueur', 'Cherry liqueur for recipes that specify it.'],
	['Apricot Liqueur', 'Apricot liqueur, distinct from dry apricot brandy.'],
	['Peach Liqueur', 'Sweet peach-flavored liqueur; distinguish from unsweetened peach brandy.'],
	['Blackcurrant Liqueur', 'Blackcurrant liqueur, including creme de cassis.'],
	['Banana Liqueur', 'Sweet banana-flavored liqueur used as a cocktail modifier.'],
	['Pineapple Liqueur', 'Sweet pineapple liqueur, distinct from pineapple-flavored rum.'],
	['Melon Liqueur', 'Sweet melon liqueur, such as Midori.'],
	['Bergamot Liqueur', 'Bergamot-orange liqueur, such as Italicus, distinct from the broader Orange Liqueur role.'],
]);
family(
	'Herbal & Spice Liqueur',
	'Liqueur',
	'Herbal and spice-led liqueurs, in one family because many products sit on the boundary between the two. Select a type or bottle when the recipe specifies a particular profile.',
	[
		[
			'Crème de Menthe',
			'Sweet mint liqueur, including clear expressions such as Menthe-Pastille. Kept distinct from the Green Herbal Liqueur recipe role; color alone does not determine membership.',
		],
		['Green Herbal Liqueur', 'Green herbal liqueur; link a specific bottle when the recipe names one.'],
		['Yellow Herbal Liqueur', 'Yellow herbal liqueur; use a specific bottle reference when needed.'],
		[
			'Herbal Liqueur',
			'Catch-all for herbal liqueurs without close substitutes, such as Bénédictine, Becherovka, and Chareau. Bottles in this type are rarely interchangeable, so recipes usually name the bottle.',
			{ [PROP.catchAll]: true },
		],
		['Allspice Dram', 'Allspice liqueur, also called pimento dram.'],
		[
			'Falernum',
			'Falernum liqueur, distinct from nonalcoholic Falernum Syrup. Sweetness and strength vary by bottle.',
		],
		[
			'Vanilla Liqueur',
			'Vanilla-forward liqueurs such as Licor 43 and Galliano, often with citrus or other spice notes. Close enough to substitute in many recipes.',
		],
		[
			'Spice Liqueur',
			'Catch-all for spice-led liqueurs without close substitutes, such as chai spice liqueurs. Bottles in this type are rarely interchangeable, so recipes usually name the bottle.',
			{ [PROP.catchAll]: true },
		],
	],
);
family('Floral Liqueur', 'Liqueur', 'Flower-flavored liqueurs used as cocktail modifiers.', [
	['Elderflower Liqueur', 'Sweet floral liqueur flavored with elderflower.'],
	['Violet Liqueur', 'Sweet violet-flavored floral liqueur, also called creme de violette.'],
]);
family(
	'Amaro Family',
	'Liqueur',
	'Bitter liqueurs grouped as amaro for cocktail browsing. Includes the Amaro type and specialized styles; choose a type or bottle when the recipe requires one.',
	[
		[
			'Amaro',
			'Catch-all for amari without a more specific type, such as Averna, Montenegro, Meletti, Lucano, and Nonino. Their flavor, sweetness, and strength differ, so they are likely substitutes rather than interchangeable: recipes usually name the bottle. Use the specialized types for red or orange bitter liqueurs, gentian liqueurs, fernet, and artichoke amaro.',
			{ [PROP.catchAll]: true },
		],
		[
			'Red Bitter Liqueur',
			'Campari-style bitter liqueur, distinct from the Aperol-style Orange Bitter Liqueur recipe role. Color alone does not determine membership.',
		],
		[
			'Orange Bitter Liqueur',
			'Aperol-style bitter liqueur, distinct from the Campari-style Red Bitter Liqueur recipe role and from Orange Liqueur. Color alone does not determine membership.',
		],
		[
			'Gentian Liqueur',
			'Bitter liqueurs in the gentian recipe role, including Salers, Suze, Avèze, and, in this cabinet, Bitter Bianco. Formulations and strengths vary; select a bottle when needed.',
		],
		['Fernet', 'A strongly bitter herbal liqueur in the fernet style.'],
		['Artichoke Amaro', 'A bitter herbal liqueur in an artichoke-based style.'],
	],
);
family('Nut Liqueur', 'Liqueur', 'Nut-flavored liqueurs. Add other nut styles when useful to your recipes.', [
	['Amaretto', 'Sweet almond-flavored liqueur in the amaretto style.'],
]);
ingredientTypes(undefined, [
	['Coffee Liqueur', 'Sweet coffee-flavored liqueur; sugar content and strength vary by bottle.'],
	['Crème de Cacao', 'Chocolate liqueur; specify light or dark when the recipe needs that distinction.'],
]);
family('Still Wine', 'Wine', 'Non-sparkling wine ingredients.', [
	['Dry White Wine', 'Still white wine in a dry style, used as a cocktail ingredient.'],
	['Red Wine', 'Red wine, including when used as a float.'],
]);
family('Sparkling Wine', 'Wine', 'Sparkling wines used to lengthen cocktails.', [
	['Dry Sparkling Wine', 'Dry sparkling wine when no narrower style is specified.'],
	['Champagne', 'Sparkling wine from Champagne; record the specific bottle when its style matters.'],
	['Prosecco', 'Prosecco; sweetness varies by bottle.'],
]);
family('Vermouth', 'Fortified Wine', 'Vermouth styles distinguished by their recipe roles.', [
	['Sweet Vermouth', 'Sweet aromatized fortified wine for recipes calling for sweet vermouth.'],
	['Dry Vermouth', 'Dry aromatized fortified wine for recipes calling for dry vermouth.'],
	['Blanc Vermouth', 'Sweet white vermouth, also called bianco or blanc.'],
	[
		'Vermouth Amaro',
		'Bitter vermouth in the recipe role represented by Punt e Mes and Cocchi Dopo Teatro, kept distinct from ordinary Sweet Vermouth. Preserve a recipe’s named bottle when specified.',
	],
]);
family('Sherry', 'Fortified Wine', 'Sherry styles.', [
	['Fino Sherry', 'Dry sherry in the fino style.'],
	['Amontillado Sherry', 'Dry sherry in the amontillado style.'],
	['Oloroso Sherry', 'Sherry in the oloroso style; use the sweetness specified by your recipe.'],
	['Pedro Ximénez Sherry', 'Sweet Pedro Ximénez sherry.'],
]);
family('Aperitif Wine', 'Fortified Wine', 'Aromatized wine aperitifs outside the vermouth styles.', [
	[
		'Bitter Aperitif Wine',
		'Quinquina-style aromatized wine, such as Cocchi Americano and Lillet Blanc, with quinine or other bitter notes. Kept distinct from Blanc Vermouth.',
	],
]);
family('Bitters', undefined, 'Concentrated bitters used in small cocktail seasoning quantities.', [
	['Aromatic Bitters', 'Concentrated aromatic bitters used in dashes or other small seasoning amounts.'],
	['Orange Bitters', 'Concentrated orange-flavored bitters used as cocktail seasoning.'],
	['Creole Bitters', 'Creole-style aromatic bitters for recipes that specify that profile.'],
	['Chocolate Bitters', 'Concentrated chocolate-flavored bitters used as cocktail seasoning.'],
	['Grapefruit Bitters', 'Concentrated grapefruit-flavored bitters used as cocktail seasoning.'],
	['Tiki Bitters', 'Spiced bitters in the tiki style, such as Bittermens ‘Elemakule; profiles vary by brand.'],
	[
		'Specialty Bitters',
		'Catch-all for one-of-a-kind bitters without close substitutes. Recipes usually name the bottle; use a flavor type such as Aromatic or Orange Bitters when one fits.',
		{ [PROP.catchAll]: true },
	],
]);
entries.push({
	id: 'bottle/Angostura Bitters',
	kind: 'bottle',
	name: 'Angostura Bitters',
	parent: 'Aromatic Bitters',
	description:
		'Angostura aromatic bitters. Recipes can name this bottle specifically or call for its Aromatic Bitters type. Set availability or quantities to record your stock.',
	properties: {
		aliases: ['Angostura Aromatic Bitters'],
		[PROP.stockTracking]: 'status',
		[PROP.availability]: 'Unknown',
		[PROP.shoppingList]: false,
	},
});
family(
	'Citrus Juice',
	'Juice',
	'Fresh citrus juices by default. Bottled juice can be recorded as a source of the same ingredient.',
	[
		['Lime Juice', 'Fresh lime juice by default. A bottled source can be recorded without changing recipe links.'],
		['Lemon Juice', 'Lemon juice, assumed freshly squeezed; purchased juice can supply the same ingredient.'],
		['Orange Juice', 'Orange juice, assumed freshly squeezed unless a different preparation is specified.'],
		[
			'Grapefruit Juice',
			'Grapefruit juice, assumed freshly squeezed; refine the fruit variety when your recipes need it.',
		],
	],
);
family('Other Fruit Juice', 'Juice', 'Other fruit juices; track purchased juice as a source where appropriate.', [
	['Pineapple Juice', 'Pineapple juice, fresh by default.'],
	['Cranberry Juice', 'Cranberry juice; sweetened blends can require a different recipe amount.'],
	['Apple Juice', 'Juice from apples; specify a preparation when it changes your recipe.'],
	['Passion Fruit Juice', 'Passion fruit juice; distinguish sweetened preparations when they affect a recipe.'],
]);
family('Vegetable Juice', 'Juice', 'Vegetable juices.', [
	[
		'Tomato Juice',
		'Juice from tomatoes used in savory cocktails; seasoned mixes should be distinguished when needed.',
	],
]);
family(
	'Sugar Syrup',
	'Syrup',
	'Syrups made from sugar, honey, or agave without added flavorings. Record dilution and concentration on the ingredient page; flavor from the sweetener itself does not make a syrup flavored.',
	[
		['Simple Syrup (1:1)', 'White sugar and water at 1:1 by weight. Nominal Brix: 50.'],
		['Simple Syrup (2:1)', 'White sugar and water at 2:1 by weight. Nominal Brix: approximately 66.7.'],
		[
			'Demerara Syrup (2:1)',
			'Demerara sugar and water at 2:1 by weight. Nominal sugar concentration: approximately 66.7 percent; actual Brix can vary.',
		],
		['Honey Syrup', 'Honey diluted with water. Specify the ratio for your recipes.'],
		['Agave Syrup', 'Agave-based sweetener. Document whether it is diluted.'],
	],
);
family(
	'Flavored Syrup',
	'Syrup',
	'Syrups flavored with fruit, nuts, spices, or other added ingredients. Recipe details and concentration belong on the ingredient page.',
	[
		[
			'Vanilla Syrup',
			'Vanilla-flavored sugar syrup. Record the preparation and sugar concentration you use; vanilla extracts and liqueurs are different ingredients.',
		],
		['Orgeat', 'Almond syrup; concentration and flavor vary by preparation.'],
		['Grenadine', 'Pomegranate syrup; document the preparation or purchased source you use.'],
		[
			'Falernum Syrup',
			'Nonalcoholic spiced falernum syrup, distinct from Falernum liqueur. Record the preparation or purchased source you use.',
		],
		['Ginger Syrup', 'A sweet ginger preparation; record the concentration and preparation you use.'],
		['Cinnamon Syrup', 'A sweet cinnamon preparation; record the concentration and preparation you use.'],
		['Passion Fruit Syrup', 'Sweetened passion fruit syrup, distinct from unsweetened juice.'],
	],
);
family('Carbonated Mixer', undefined, 'Carbonated cocktail mixers.', [
	['Soda Water', 'Unflavored carbonated water.'],
	['Tonic Water', 'Carbonated bitter-sweet mixer; sweetness and flavor vary by brand.'],
	['Ginger Beer', 'Ginger-flavored mixer used for a more pronounced ginger profile; brands vary.'],
	['Ginger Ale', 'Ginger-flavored soft drink, kept distinct from ginger beer in recipes.'],
	['Cola', 'Cola-flavored soft drink used as a cocktail mixer.'],
]);
ingredientTypes(undefined, [
	[
		'Cream of Coconut',
		'Sweetened coconut cream used for sweetness and texture in cocktails, distinct from unsweetened coconut cream or coconut milk.',
	],
	['Egg White', 'The white of an egg, used for texture and foam in cocktails.'],
	['Whole Egg', 'A whole egg, including yolk, for flips and other cocktails that specify it.'],
]);
ingredientTypes(undefined, [
	['Lime Peel', 'Lime peel for garnish or expressed oils.'],
	['Lemon Peel', 'Lemon peel for garnish or expressed oils.'],
	['Orange Peel', 'Orange peel for garnish or expressed oils.'],
	['Cocktail Cherry', 'A prepared cherry used as a cocktail garnish.'],
]);
staples([
	['Salt', 'Salt for rims and seasoning. Saline Solution is its own note.'],
	[
		'Saline Solution',
		'20% saline: 20 g salt dissolved in 80 g water. Another strength is its own staple, such as Saline Solution (25%).',
		['Saline'],
	],
	['Mint', 'Fresh mint leaves or sprigs for flavor and garnish.', ['Mint Leaves']],
	['Water', 'Still water, for recipes that call for it.'],
	['Heavy Cream', 'High-fat dairy cream for recipes that specify cream.', ['Cream']],
	['Milk', 'Dairy milk for recipes calling for milk. Add a separate staple where a substitution changes the recipe.'],
	['Cinnamon Sticks', 'Whole cinnamon sticks for garnish and infusions.', ['Cinnamon Stick']],
	['Whole Nutmeg', 'Whole nutmeg to grate over a drink.', ['Nutmeg']],
]);
// Not a staple: a recipe calls for the egg white or the whole egg, and one carton supplies both.
entries.push({
	id: 'ingredient/Eggs',
	kind: 'ingredient',
	name: 'Eggs',
	provides: ['Egg White', 'Whole Egg'],
	description: 'Eggs for whites and whole-egg drinks. Set availability when you buy them.',
	properties: { ...stapleProperties('Unknown'), [PROP.form]: 'Fresh ingredient' },
});

// Ratio names are unambiguous; the everyday names are aliases so pickers find them too.
const sugar = [
	['Simple Syrup (1:1)', '1:1', 'white sugar', ['Simple Syrup']],
	['Simple Syrup (2:1)', '2:1', 'white sugar', ['Rich Simple Syrup']],
	['Demerara Syrup (2:1)', '2:1', 'demerara sugar', ['Demerara Syrup', 'Rich Demerara Syrup']],
] as const;
for (const [name, ratio, ingredient, aliases] of sugar) {
	const entry = entries.find((item) => item.name === name);
	if (!entry) throw new Error(`Missing starter syrup: ${name}`);
	entry.properties = { [PROP.sugarWaterRatio]: `${ratio} by weight`, aliases: [...aliases] };
	entry.method = `Combine ${ratio === '1:1' ? 'equal weights of' : 'two parts by weight of'} ${ingredient} and ${ratio === '1:1' ? '' : 'one part by weight of '}water. This ratio is by weight. Stir until dissolved. Concentration figures are nominal, not measurements of a prepared batch.\n\nReference: [Simple syrup ratios and Brix](https://www.cocktailarium.com/lessons/sweetness-i-simple-syrup).`;
}

export const STARTER_CATALOG: readonly CatalogEntry[] = entries;

export function catalogDraft(
	root: string,
	entry: CatalogEntry,
	paths: ReadonlyMap<string, string> = new Map(),
): NoteDraft {
	const properties: Properties = { ...entry.properties, [PROP.catalogId]: entry.id };
	if (entry.parent) {
		const kind = entry.kind === 'family' ? 'category' : entry.kind === 'bottle' ? 'type' : 'family';
		const property = kind === 'category' ? PROP.category : kind === 'type' ? PROP.type : PROP.family;
		const link = wikiLink(
			paths.get(`${kind}/${fileName(entry.parent)}`) || notePath(root, kind, entry.parent),
			entry.parent,
		);
		properties[property] = link;
	}
	if (entry.provides) {
		properties[PROP.provides] = entry.provides.map((name) =>
			wikiLink(paths.get(`type/${fileName(name)}`) || notePath(root, 'type', name), name),
		);
	}
	return { ...entry, properties };
}
