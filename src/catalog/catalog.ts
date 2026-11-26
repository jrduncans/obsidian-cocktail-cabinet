import type { NoteDraft, Properties } from '../core/schema';
import { PROP, fileName, notePath, wikiLink } from '../core/schema';
import { stapleProperties } from '../core/stock';

export interface CatalogEntry extends NoteDraft {
	id: string;
	parent?: string;
	/** A subtype's parent is a type, linked through `cc-type`, in place of a family. */
	parentIsType?: true;
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
/** Narrower kinds of a type: their bottles also fill recipes calling for the type. */
function subtypes(parent: string, types: TypeDefinition[]) {
	for (const [name, description, properties] of types) {
		entries.push({
			id: `type/${fileName(name)}`,
			kind: 'type',
			name,
			parent,
			parentIsType: true,
			description,
			properties,
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
	[
		'Canadian Whisky',
		'Light Canadian whisky, usually a corn-based blend, such as Canadian Club; Canadians often call it rye. Rye Whiskey is a separate type.',
	],
	[
		'Japanese Whisky',
		'Japanese whisky, most often a light blend for highballs, such as Suntory Toki. Not a substitute for Scotch in recipes that name it.',
	],
]);
family('Rum', 'Spirit', 'Rum styles. These are starting distinctions; refine them to fit your recipes.', [
	[
		'Light Rum',
		'Light, clean rum, usually lightly aged and filtered clear, such as Don Q Cristal. A clear blend with more character is White Blended Rum.',
	],
	[
		'White Blended Rum',
		'Clear rum blended for more character than Light Rum, from several regions or from pot and column stills, such as Probitas and Chairman’s Reserve White. Its components may be aged or unaged.',
	],
	[
		'Aged Barbados Rum',
		'Moderately aged Barbados-style blends of pot- and column-still rum, such as Real McCoy 5, Planteray Barbados 5 Year, and Mount Gay Eclipse. Older expressions generally fit too; Barbados white rums do not.',
	],
	[
		'Aged Column Still Rum',
		'Aged rum made only in column stills, lighter-bodied than Barbados-style blends, such as Ron Abuelo Añejo and Don Q Gold. Older expressions generally fit too.',
	],
	[
		'Aged Blended Rum',
		'Aged rum blended from several regions or from pot and column stills, such as Planteray Original Dark and Diplomático Reserva Exclusiva. A blend from one island with its own style is Aged Barbados Rum or Aged Jamaican Rum.',
	],
	[
		'Aged Jamaican Rum',
		'Barrel-aged Jamaican rum at ordinary strength, such as Appleton Estate 8 Year. Aged overproof Jamaican rum is its subtype.',
	],
	[
		'Unaged Overproof Jamaican Rum',
		'High-strength unaged Jamaican rum, such as Wray & Nephew White Overproof. Not a substitute for Aged Overproof Jamaican Rum.',
		{ aliases: ['White Overproof Jamaican Rum'] },
	],
	['Demerara Rum', 'Demerara rum; choose a bottle and strength to suit the recipe.'],
	[
		'Demerara 151 Rum',
		'Demerara rum bottled at 151 US proof (75.5% ABV), such as Hamilton 151. Standard-strength Demerara Rum and overproof blends are separate types.',
	],
	[
		'Column Still Overproof Rum',
		'High-strength, light-bodied rum from column stills, such as Bacardi 151, Don Q 151, Cruzan 151, and Denros Strong. For floating, flaming, or adding proof without heavy flavor. Not a stand-in for Demerara 151 Rum.',
	],
	[
		'Blended Overproof Rum',
		'High-strength rum blends, including O.F.T.D., Hamilton Zombie Blend, and Planteray Mister Fogg. Their strengths and flavor profiles differ; recipes often specify a particular bottle.',
	],
	[
		'Unaged Rhum Agricole',
		'Unaged rhum agricole (rhum agricole blanc), distilled from fresh sugarcane juice.',
		{ aliases: ['Rhum Agricole Blanc'] },
	],
	[
		'Aged Rhum Agricole',
		'Barrel-aged rhum agricole (rhum agricole vieux), distilled from fresh sugarcane juice.',
		{ aliases: ['Rhum Agricole Vieux'] },
	],
	[
		'Black Jamaican Rum',
		'Dark, molasses-rich Jamaican rum, such as Coruba or Myers’s, for recipes that want its weight rather than an aged rum. A dark color alone doesn’t make a rum this type.',
	],
	[
		'Blackstrap Rum',
		'Very dark rum with blackstrap molasses added after distilling, bitter and burnt-sugar rich with little aging, such as Cruzan Black Strap. A disputed category, kept because recipes such as the modern Jungle Bird call for it. Not Black Jamaican Rum, whose weight is Jamaican character and caramel.',
	],
	[
		'Pineapple Rum',
		'Pineapple-flavored rum, including Stiggins’ Fancy. Other pineapple rums can differ substantially in flavor; recipes often name the intended bottle.',
	],
	[
		'Spiced Rum',
		'Rum flavored with vanilla, cinnamon, clove, and other spices, such as Sailor Jerry or Kraken. Sweetness and strength vary, but recipes calling for spiced rum treat bottles as interchangeable.',
	],
	[
		'Flavored Rum',
		'Catch-all for flavored rums without close substitutes, such as coconut rums. Bottles in this type are rarely interchangeable, so recipes usually name the bottle. Pineapple Rum and Spiced Rum have their own types.',
		{ [PROP.catchAll]: true },
	],
]);
family('Cachaça', 'Spirit', 'Brazilian sugarcane spirits, kept separate from the Rum family.', [
	['Unaged Cachaça', 'Unaged Brazilian sugarcane spirit for recipes calling for cachaça.'],
	['Aged Cachaça', 'Barrel-aged cachaça, for recipes that ask for an aged style.'],
]);
family('Gin', 'Spirit', 'Gin and related styles; a broad Gin reference does not select a particular style.', [
	['London Dry Gin', 'Juniper-led dry gin for recipes that specify London dry.'],
	['Old Tom Gin', 'Gin in the Old Tom style, typically sweeter than dry gin; bottles vary.'],
	[
		'Contemporary Gin',
		'Gin led by citrus, floral, herbal, or other botanicals rather than juniper, such as Hendrick’s or Aviation. These gins differ a lot, so keep a recipe’s named bottle.',
	],
	['Plymouth Gin', 'Gin from Plymouth, England: softer and earthier than London dry.'],
	['Genever', 'Malty Dutch and Belgian juniper spirit, the ancestor of gin.'],
]);
family('Vodka Family', 'Spirit', 'Vodka, plain or flavored. Add a type here for each flavored vodka you buy.', [
	[
		'Vodka',
		'Neutral, unflavored vodka, what a recipe means by plain vodka. Flavored vodkas are their own types in this family and don’t fill these recipes.',
	],
	[
		'Citron Vodka',
		'Lemon-flavored vodka, such as Absolut Citron, the vodka of the Cosmopolitan.',
		{ aliases: ['Lemon Vodka', 'Citrus Vodka'] },
	],
	['Vanilla Vodka', 'Vanilla-flavored vodka, the vodka of the Porn Star Martini.'],
	[
		'Flavored Vodka',
		'Catch-all for flavored vodkas without close substitutes, such as pepper or berry vodkas. Bottles in this type are rarely interchangeable, so recipes usually name the bottle. Citron Vodka and Vanilla Vodka have their own types.',
		{ [PROP.catchAll]: true },
	],
]);
family('Agave Spirit', 'Spirit', 'Tequila, mezcal, and related agave spirits.', [
	['Blanco Tequila', 'Unaged or briefly rested tequila, also called plata.'],
	['Reposado Tequila', 'Tequila rested two to twelve months in oak.'],
	['Añejo Tequila', 'Tequila aged one to three years in oak.'],
	['Mezcal', 'Mezcal; agave variety and bottle can change the result.'],
]);
family(
	'Brandy Family',
	'Spirit',
	'Spirits distilled from fruit: grape brandy, apple brandy, and unaged fruit brandies such as kirsch and pisco.',
	[
		[
			'Brandy',
			'Aged grape brandy, what a recipe means by plain brandy. Cognac and Armagnac are its subtypes, so their bottles fill these recipes too. Other French, Spanish, and American grape brandies go here. Unaged grape brandy such as pisco is not this type.',
		],
		[
			'Apple Brandy',
			'Apple brandy for recipes calling for it without naming a style. Plain apple brandy bottles go here; Bonded Apple Brandy, Applejack, and Calvados are its subtypes, so their bottles fill these recipes too.',
		],
		[
			'Kirsch',
			'Unsweetened cherry eau de vie (kirschwasser), distinct from cherry liqueur and Maraschino Liqueur.',
		],
		[
			'Pear Brandy',
			'Unsweetened pear eau de vie, usually from Williams (Bartlett) pears, such as Clear Creek Pear Brandy; distinct from Pear Liqueur.',
			{ aliases: ['Poire Williams', 'Poire William', 'Pear Eau de Vie'] },
		],
	],
);
family('Aquavit', 'Spirit', 'Aquavit styles.', [
	['Unaged Aquavit', 'Unaged aquavit led by caraway or dill.'],
	['Aged Aquavit', 'Barrel-aged aquavit, such as Linie.'],
]);
family('Anise Spirit', 'Spirit', 'Anise-flavored spirits used for pours and rinses.', [
	['Absinthe', 'Absinthe; follow the recipe amount, including when used as a rinse.'],
	['Pastis', 'Sweeter French anise spirit, such as Ricard, lower in strength than absinthe.'],
]);
family('Fruit Liqueur', 'Liqueur', 'Fruit-flavored liqueurs.', [
	[
		'Orange Liqueur',
		'Orange liqueur of any style, for recipes that just say orange liqueur. Its subtypes Curaçao, Triple Sec, and Blue Curaçao are for recipes that name one; link a specific bottle when a recipe names one.',
	],
	['Maraschino Liqueur', 'Maraschino liqueur, distinct from cherry brandy and cherry syrup.'],
	['Cherry Liqueur', 'Sweet cherry liqueur, such as Cherry Heering, distinct from Maraschino Liqueur and kirsch.'],
	[
		'Apricot Liqueur',
		'Sweet apricot liqueur, such as Marie Brizard Apry or Giffard Abricot du Roussillon. Classic recipes call it apricot brandy; an unsweetened apricot eau de vie such as barack pálinka is something else.',
		{ aliases: ['Apricot Brandy'] },
	],
	[
		'Pear Liqueur',
		'Sweet pear liqueur, on a neutral, brandy, or cognac base, such as Mathilde Poire, Rothman & Winter Orchard Pear, and Belle de Brillet. Spiced pear liqueur is its own type: the spice changes too much to fill these recipes. Distinct from unsweetened Pear Brandy.',
	],
	[
		'Peach Liqueur',
		'Sweet peach-flavored liqueur, also called crème de pêche; distinguish from unsweetened peach brandy.',
		{ aliases: ['Crème de Pêche'] },
	],
	[
		'Crème de Cassis',
		'Sweet blackcurrant liqueur, the liqueur of the Kir and El Diablo.',
		{ aliases: ['Blackcurrant Liqueur', 'Cassis'] },
	],
	[
		'Blackberry Liqueur',
		'Sweet blackberry liqueur, such as crème de mûre, the liqueur of the Bramble. Liqueurs from blackberry cultivars such as marionberry fit here too.',
		{ aliases: ['Crème de Mûre'] },
	],
	[
		'Banana Liqueur',
		'Sweet banana-flavored liqueur used as a cocktail modifier, such as crème de banane.',
		{ aliases: ['Crème de Banane'] },
	],
	['Pineapple Liqueur', 'Sweet pineapple liqueur, distinct from pineapple-flavored rum.'],
	['Melon Liqueur', 'Sweet melon liqueur, such as Midori.'],
	['Bergamot Liqueur', 'Bergamot-orange liqueur, such as Italicus; more floral and bitter than Orange Liqueur.'],
]);
family(
	'Herbal & Spice Liqueur',
	'Liqueur',
	'Herbal and spice-led liqueurs, in one family because many products sit on the boundary between the two. Select a type or bottle when the recipe specifies a particular profile.',
	[
		[
			'Crème de Menthe',
			'Sweet mint liqueur, green or clear, such as Tempus Fugit or Menthe-Pastille. Green herbal liqueurs are a separate type.',
		],
		[
			'Green Herbal Liqueur',
			'Strong, intensely herbal green liqueur in the style of Green Chartreuse. Link a specific bottle when a recipe names one.',
		],
		[
			'Yellow Herbal Liqueur',
			'Sweeter, milder yellow herbal liqueur in the style of Yellow Chartreuse. Link a specific bottle when a recipe names one.',
		],
		[
			'Herbal Liqueur',
			'Catch-all for herbal liqueurs without close substitutes, such as Bénédictine, Becherovka, and Chareau. Bottles in this type are rarely interchangeable, so recipes usually name the bottle.',
			{ [PROP.catchAll]: true },
		],
		['Allspice Dram', 'Allspice liqueur, also called pimento dram.'],
		[
			'Génépy',
			'Alpine liqueur of génépi artemisia from Savoie and the Aosta Valley, herbal, floral, and lightly bitter, such as Dolin Génépy le Chamois. Lighter and less sweet than Green Herbal Liqueur, and without absinthe’s anise.',
			{ aliases: ['Genepi', 'Génépi'] },
		],
		[
			'Falernum',
			'Falernum liqueur, distinct from non-alcoholic Falernum Syrup. Sweetness and strength vary by bottle.',
		],
		[
			'Vanilla Liqueur',
			'Vanilla liqueurs such as Giffard Vanille de Madagascar and Drillaud, as well as richer vanilla-led liqueurs such as Galliano and Licor 43 that add citrus, herbal, or spice notes. Close enough to substitute in many recipes.',
		],
		[
			'Spice Liqueur',
			'Catch-all for spice-led liqueurs without close substitutes, such as chai liqueurs, Ancho Reyes chile liqueur, or ginger liqueurs like Domaine de Canton. Bottles in this type are rarely interchangeable, so recipes usually name the bottle.',
			{ [PROP.catchAll]: true },
		],
	],
);
family('Floral Liqueur', 'Liqueur', 'Flower-flavored liqueurs used as cocktail modifiers.', [
	['Elderflower Liqueur', 'Sweet floral liqueur flavored with elderflower.'],
	[
		'Crème de Violette',
		'Sweet violet-flavored floral liqueur, the liqueur of the Aviation. Crème Yvette, with berries and vanilla, is a bottle of its own.',
		{ aliases: ['Violet Liqueur'] },
	],
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
			'Bitter red aperitivo liqueur in the style of Campari. Lighter, sweeter aperitivos like Aperol are Orange Bitter Liqueur.',
		],
		[
			'Orange Bitter Liqueur',
			'Lighter, sweeter bitter aperitivo in the style of Aperol, at about half Campari’s strength. Not an Orange Liqueur.',
		],
		[
			'Gentian Liqueur',
			'Bitter gentian-root liqueurs, such as Salers, Suze, and Avèze. Formulations and strengths vary; link a bottle when a recipe names one.',
		],
		['Fernet', 'Intensely bitter, minty herbal liqueur, such as Fernet-Branca.'],
		['Artichoke Amaro', 'Bitter herbal amaro made with artichoke, such as Cynar.'],
	],
);
family(
	'Nut Liqueur',
	'Liqueur',
	'Liqueurs that taste nutty, such as amaretto, crème de noyaux, Frangelico (hazelnut), and nocino (walnut). Go by taste: amaretto and crème de noyaux taste of almond even when made from apricot pits.',
	[['Amaretto', 'Sweet almond-flavored liqueur in the amaretto style.']],
);
family(
	'Cream Liqueur',
	'Liqueur',
	'Liqueurs made with cream or egg, such as Irish cream, RumChata, Amarula, and advocaat. They curdle with citrus and keep best refrigerated once opened.',
	[['Irish Cream', 'Irish whiskey and cream liqueur, such as Baileys.']],
);
family(
	'Other Liqueur',
	'Liqueur',
	'Liqueurs that aren’t fruit, herbal or spice, floral, nut, bitter, or cream: coffee, chocolate, and other flavors such as corn (Nixta), honey, maple, butterscotch, or tea.',
	[
		['Coffee Liqueur', 'Sweet coffee-flavored liqueur; sugar content and strength vary by bottle.'],
		['Crème de Cacao', 'Chocolate liqueur; specify light or dark when the recipe needs that distinction.'],
	],
);
family('Still Wine', 'Wine', 'Non-sparkling wine ingredients.', [
	['Dry White Wine', 'Still white wine in a dry style, used as a cocktail ingredient.'],
	['Red Wine', 'Red wine, including when used as a float.'],
]);
family('Sparkling Wine', 'Wine', 'Sparkling wines used to lengthen cocktails.', [
	[
		'Dry Sparkling Wine',
		'Dry sparkling wine when no narrower style is specified. Champagne, Cava, and Crémant are its subtypes, so their bottles fill these recipes too.',
	],
	['Prosecco', 'Prosecco; sweetness varies by bottle.'],
]);
family('Vermouth', 'Fortified Wine', 'Vermouth styles: sweet, dry, blanc, and bitter.', [
	['Sweet Vermouth', 'Sweet aromatized fortified wine for recipes calling for sweet vermouth.'],
	['Dry Vermouth', 'Dry aromatized fortified wine for recipes calling for dry vermouth.'],
	['Blanc Vermouth', 'Sweet white vermouth, also called bianco or blanc.'],
	[
		'Vermouth Amaro',
		'Sweet vermouth with a pronounced bitter edge, such as Punt e Mes and Cocchi Dopo Teatro. Keep a recipe’s named bottle.',
	],
]);
family('Sherry', 'Fortified Wine', 'Sherry styles.', [
	['Fino Sherry', 'Dry sherry in the fino style.'],
	['Amontillado Sherry', 'Dry sherry in the amontillado style.'],
	['Oloroso Sherry', 'Sherry in the oloroso style; use the sweetness specified by your recipe.'],
	['Pedro Ximénez Sherry', 'Sweet Pedro Ximénez sherry.'],
]);
family('Port', 'Fortified Wine', 'Port styles. A recipe calling for plain port accepts any of them.', [
	['Ruby Port', 'Young, fruity red port, aged briefly in large vats.'],
	['Tawny Port', 'Red port aged longer in small casks, nutty and caramel-toned.'],
	['White Port', 'Port from white grapes, dry to sweet, as in a Portonic with tonic water.'],
]);
family('Aperitif Wine', 'Fortified Wine', 'Aromatized wine aperitifs outside the vermouth styles.', [
	[
		'Bitter Aperitif Wine',
		'Quinquina-style aromatized wine with quinine or other bitter notes, such as Cocchi Americano and Lillet Blanc.',
	],
	[
		'Red Aperitif Wine',
		'Red quinquina-style aromatized wine, such as Lillet Rouge, Cocchi Americano Rosso, Dubonnet Rouge, and Byrrh. Not a stand-in for the white Bitter Aperitif Wine; sweet vermouth is a common substitute.',
	],
]);
family('Bitters', undefined, 'Concentrated bitters used in small cocktail seasoning quantities.', [
	['Aromatic Bitters', 'Concentrated aromatic bitters used in dashes or other small seasoning amounts.'],
	['Orange Bitters', 'Concentrated orange-flavored bitters used as cocktail seasoning.'],
	['Creole Bitters', 'Bright red, anise-forward aromatic bitters in the style of Peychaud’s.'],
	['Chocolate Bitters', 'Concentrated chocolate-flavored bitters used as cocktail seasoning.'],
	['Grapefruit Bitters', 'Concentrated grapefruit-flavored bitters used as cocktail seasoning.'],
	['Tiki Bitters', 'Spiced bitters in the tiki style, such as Bittermens ‘Elemakule; profiles vary by brand.'],
	[
		'Specialty Bitters',
		'Catch-all for one-of-a-kind bitters without close substitutes. Recipes usually name the bottle; use a flavor type such as Aromatic or Orange Bitters when one fits.',
		{ [PROP.catchAll]: true },
	],
]);
// Reference bottles: brands so standard that recipes name them, at Unknown so they assert nothing about stock.
function referenceBottle(name: string, type: string, description: string, aliases: string[]) {
	entries.push({
		id: `bottle/${fileName(name)}`,
		kind: 'bottle',
		name,
		parent: type,
		description,
		properties: {
			aliases,
			[PROP.stockTracking]: 'status',
			[PROP.availability]: 'Unknown',
			[PROP.shoppingList]: false,
		},
	});
}
referenceBottle(
	'Angostura Bitters',
	'Aromatic Bitters',
	'Angostura aromatic bitters. Recipes can name this bottle specifically or call for its Aromatic Bitters type. Set availability or quantities to record your stock.',
	['Angostura Aromatic Bitters', 'Ango'],
);
referenceBottle(
	'Lillet Blanc',
	'Bitter Aperitif Wine',
	'Lillet Blanc, the aperitif wine of the Vesper, Corpse Reviver No. 2, and Twentieth Century. Since 1986 it has been less bitter than the Kina Lillet older recipes were written for, which is why many bartenders use Cocchi Americano instead: link the type when any bottle of it will do. Set availability or quantities to record your stock.',
	['Lillet'],
);
referenceBottle(
	"Peychaud's Bitters",
	'Creole Bitters',
	'Peychaud’s bitters, the anise-forward bitters of the Sazerac. Recipes can name this bottle specifically or call for its Creole Bitters type. Set availability or quantities to record your stock.',
	["Peychaud's", 'Peychaud’s Bitters'],
);
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
	[
		'Passion Fruit Juice',
		'Passion fruit juice; distinguish sweetened preparations when they affect a recipe. Passion Fruit Purée is its own type.',
		{ aliases: ['Passionfruit Juice'] },
	],
	[
		'Passion Fruit Purée',
		'Thick passion fruit purée, such as Boiron, as in the Porn Star Martini. Thicker and more concentrated than juice; some recipes thin it with water. Distinct from sweetened Passion Fruit Syrup.',
		{ aliases: ['Passionfruit Purée'] },
	],
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
			'Non-alcoholic spiced falernum syrup, distinct from Falernum liqueur. Record the preparation or purchased source you use.',
		],
		['Ginger Syrup', 'A sweet ginger preparation; record the concentration and preparation you use.'],
		['Cinnamon Syrup', 'A sweet cinnamon preparation; record the concentration and preparation you use.'],
		[
			'Passion Fruit Syrup',
			'Sweetened passion fruit syrup, distinct from unsweetened juice.',
			{ aliases: ['Passionfruit Syrup'] },
		],
		['Raspberry Syrup', 'Sweetened raspberry syrup, homemade or bottled, as in the Clover Club.'],
		['Strawberry Syrup', 'Sweetened strawberry syrup, homemade or bottled.'],
		[
			'Lime Cordial',
			'Sweetened, preserved lime, homemade or bottled such as Rose’s, the original Gimlet ingredient. Not a stand-in for fresh Lime Juice, nor the other way round.',
		],
		[
			'Pineapple Syrup',
			'Sweetened pineapple syrup, homemade or bottled. Gum (gomme) syrup, thickened with gum arabic for a silkier texture, counts too: recipes treat them as interchangeable.',
			{ aliases: ['Pineapple Gum Syrup', 'Pineapple Gomme Syrup'] },
		],
		[
			"Don's Mix",
			'Donn Beach’s blend of two parts white grapefruit juice to one part cinnamon syrup, as in his 1934 Zombie. Many recipes list the two separately instead.',
			{ aliases: ["Donn's Mix"] },
		],
		[
			"Don's Spices #2",
			'Donn Beach’s blend of equal parts vanilla syrup and allspice dram, about 11% ABV mixed at home; B.G. Reynolds bottles a non-alcoholic version. Many recipes list the two separately instead.',
			{ aliases: ["Donn's Spices #2", "Don's Spices No. 2"] },
		],
		[
			'Fassionola',
			'Red tropical-fruit syrup, usually passion fruit with others such as strawberry and pineapple, from early tiki drinks like the Cobra’s Fang and Hurricane. Brands differ widely, such as Cocktail & Sons and Jonathan English, which also makes a gold version.',
		],
	],
);
family('Carbonated Mixer', undefined, 'Carbonated cocktail mixers.', [
	[
		'Soda Water',
		'Unflavored carbonated water, also sold as seltzer or sparkling water. Club soda, with added minerals, is its subtype.',
		{ aliases: ['Seltzer', 'Sparkling Water'] },
	],
	['Tonic Water', 'Carbonated bitter-sweet mixer; sweetness and flavor vary by brand.'],
	['Ginger Beer', 'Ginger-flavored mixer used for a more pronounced ginger profile; brands vary.'],
	['Ginger Ale', 'Ginger soft drink, milder and sweeter than ginger beer.'],
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
	['Lime Peel', 'Lime peel for garnish or expressed oils.', { aliases: ['Lime Twist'] }],
	['Lemon Peel', 'Lemon peel for garnish or expressed oils.', { aliases: ['Lemon Twist'] }],
	['Orange Peel', 'Orange peel for garnish or expressed oils.', { aliases: ['Orange Twist'] }],
	['Grapefruit Peel', 'Grapefruit peel for garnish or expressed oils.', { aliases: ['Grapefruit Twist'] }],
	['Cocktail Cherry', 'A prepared cherry used as a cocktail garnish.'],
]);
staples([
	['Salt', 'Salt for rims and seasoning. Saline Solution is its own note.'],
	[
		'Sugar',
		'White granulated sugar, for rims and for recipes that call for sugar itself rather than a syrup.',
		['Granulated Sugar', 'White Sugar'],
	],
	['Sugar Cubes', 'White sugar cubes, for an Old Fashioned or Champagne Cocktail built on a cube.', ['Sugar Cube']],
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
	['Espresso', 'Freshly pulled espresso; cold brew concentrate is a different staple.', ['Espresso Coffee']],
	['Worcestershire Sauce', 'Worcestershire sauce, for savory drinks such as the Bloody Mary.', ['Worcestershire']],
	[
		'Hot Sauce',
		'Vinegar-based hot sauce, such as Tabasco. Recipes naming a specific sauce can link it as its own staple.',
	],
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

subtypes('Simple Syrup (2:1)', [
	[
		'Cane Syrup (2:1)',
		'Rich syrup of less-refined cane sugar, rounder and a little grassier than white-sugar rich simple, such as Petite Canne. Its bottles also fill recipes calling for Simple Syrup (2:1). Louisiana cane syrup, such as Steen’s, is boiled cane juice, dark like molasses, and not this.',
	],
]);
// Ratio names are unambiguous; the everyday names are aliases so pickers find them too.
const sugar = [
	['Simple Syrup (1:1)', '1:1', 'white sugar', ['Simple Syrup']],
	['Simple Syrup (2:1)', '2:1', 'white sugar', ['Rich Simple Syrup', 'Rock Candy Syrup']],
	['Demerara Syrup (2:1)', '2:1', 'demerara sugar', ['Demerara Syrup', 'Rich Demerara Syrup']],
	['Cane Syrup (2:1)', '2:1', 'cane sugar', ['Cane Syrup', 'Rich Cane Syrup']],
] as const;
for (const [name, ratio, ingredient, aliases] of sugar) {
	const entry = entries.find((item) => item.name === name);
	if (!entry) throw new Error(`Missing starter syrup: ${name}`);
	entry.properties = { [PROP.sugarWaterRatio]: `${ratio} by weight`, aliases: [...aliases] };
	entry.method = `Combine ${ratio === '1:1' ? 'equal weights of' : 'two parts by weight of'} ${ingredient} and ${ratio === '1:1' ? '' : 'one part by weight of '}water. This ratio is by weight. Stir until dissolved. Concentration figures are nominal, not measurements of a prepared batch.\n\nReference: [Simple syrup ratios and Brix](https://www.cocktailarium.com/lessons/sweetness-i-simple-syrup).`;
}
for (const [name, method] of [
	["Don's Mix", 'Combine two parts white grapefruit juice with one part cinnamon syrup, and refrigerate.'],
	["Don's Spices #2", 'Combine equal parts vanilla syrup and allspice dram.'],
] as const) {
	const entry = entries.find((item) => item.name === name);
	if (!entry) throw new Error(`Missing starter syrup: ${name}`);
	entry.method = method;
}

subtypes('Bourbon', [
	[
		'Bonded Bourbon',
		'Bottled-in-bond bourbon, at 100 US proof (50% ABV), for recipes calling for bonded bourbon. Its bottles also fill recipes calling for Bourbon.',
	],
]);
subtypes('Rye Whiskey', [
	[
		'Bonded Rye',
		'Bottled-in-bond rye whiskey, at 100 US proof (50% ABV), for recipes calling for bonded rye. Its bottles also fill recipes calling for Rye Whiskey.',
	],
]);
subtypes('Orange Liqueur', [
	[
		'Curaçao',
		'Orange liqueur on a brandy or rum base, richer than triple sec, such as Pierre Ferrand Dry Curaçao, Senior Curaçao of Curaçao, Grand Marnier, and Clément Créole Shrubb. Its bottles also fill recipes calling for Orange Liqueur.',
		{ aliases: ['Dry Curaçao', 'Orange Curaçao'] },
	],
	[
		'Triple Sec',
		'Orange liqueur on a neutral spirit base, clean and dry, such as Cointreau and Combier. Its bottles also fill recipes calling for Orange Liqueur.',
	],
	[
		'Blue Curaçao',
		'Orange liqueur colored blue, usually on a neutral base and sweeter than triple sec, such as Bols and Giffard. Its bottles also fill recipes calling for Orange Liqueur.',
	],
]);
subtypes('Dry Sparkling Wine', [
	[
		'Champagne',
		'Sparkling wine from Champagne; record the specific bottle when its style matters. Its bottles also fill recipes calling for Dry Sparkling Wine.',
	],
	[
		'Cava',
		'Spanish traditional-method sparkling wine, usually dry. Its bottles also fill recipes calling for Dry Sparkling Wine.',
	],
	[
		'Crémant',
		'French traditional-method sparkling wine from outside Champagne, such as crémant de Loire, d’Alsace, or de Bourgogne; usually dry. Its bottles also fill recipes calling for Dry Sparkling Wine.',
	],
]);
subtypes('Soda Water', [
	[
		'Club Soda',
		'Soda water with added minerals, such as sodium bicarbonate, for a slightly salty taste. Its bottles also fill recipes calling for Soda Water; plain soda water is offered as a substitute for it.',
	],
]);
subtypes('Aged Jamaican Rum', [
	[
		'Aged Overproof Jamaican Rum',
		'High-strength, lightly aged, pot-still-heavy Jamaican rum, such as Smith & Cross. 100-proof bottles in the same role, such as Doctor Bird, belong here too, though not strictly overproof. Its bottles also fill recipes calling for Aged Jamaican Rum.',
		{ aliases: ['Navy Strength Jamaican Rum'] },
	],
]);
subtypes('London Dry Gin', [
	[
		'Navy Strength Gin',
		'Gin at around 57% ABV, such as Hayman’s Royal Dock. Its bottles also fill recipes calling for London Dry Gin.',
	],
]);
subtypes('Brandy', [
	['Cognac', 'French grape brandy from the Cognac region, used in brandy cocktails.'],
	['Armagnac', 'French grape brandy from Gascony, usually more rustic than cognac.'],
]);
subtypes('Apple Brandy', [
	[
		'Bonded Apple Brandy',
		'Bottled-in-bond apple brandy at 100 US proof (50% ABV), such as Laird’s Bonded. Not every 100-proof apple brandy is bonded.',
	],
	[
		'Applejack',
		'American apple brandy blended with neutral spirit, such as Laird’s Applejack. Older recipes that say applejack often mean any American apple brandy.',
	],
	['Calvados', 'Oak-aged apple brandy from Normandy, sometimes with pear.'],
]);
for (const entry of entries) {
	if (!entry.parentIsType) continue;
	const parent = entries.find((item) => item.kind === 'type' && item.name === entry.parent && !item.parentIsType);
	if (!parent) throw new Error(`Missing parent type for subtype ${entry.name}: ${entry.parent ?? 'none'}`);
	parent.hasSubtypes = true;
}

// Non-alcoholic types have a typical ABV of 0, so alcohol estimates count them as known; a family of
// them counts as 0 through its types.
const NON_ALCOHOLIC_FAMILIES = [
	'Citrus Juice',
	'Other Fruit Juice',
	'Vegetable Juice',
	'Sugar Syrup',
	'Flavored Syrup',
	'Carbonated Mixer',
];
const NON_ALCOHOLIC_TYPES = [
	'Cream of Coconut',
	'Egg White',
	'Whole Egg',
	'Lime Peel',
	'Lemon Peel',
	'Orange Peel',
	'Grapefruit Peel',
	'Cocktail Cherry',
	'Club Soda',
	'Cane Syrup (2:1)',
];
for (const entry of entries) {
	const zero =
		entry.kind === 'type' &&
		(NON_ALCOHOLIC_TYPES.includes(entry.name) || NON_ALCOHOLIC_FAMILIES.includes(entry.parent ?? ''));
	if (zero) entry.properties = { ...entry.properties, [PROP.abvTypical]: 0 };
}
for (const name of [...NON_ALCOHOLIC_FAMILIES, ...NON_ALCOHOLIC_TYPES])
	if (!entries.some((entry) => entry.name === name)) throw new Error(`Missing non-alcoholic entry: ${name}`);

// Alcoholic types get a representative ABV, in percent, so a new cabinet can estimate drinks before any
// bottle is bought. Values follow the type's prototype bottle or BevNap's and Mixel's defaults; the
// user's in-stock bottles still come first. Types whose bottles vary too much stay blank, catch-alls among them.
const TYPICAL_ABV_PERCENT: Record<string, number> = {
	Bourbon: 43,
	'Rye Whiskey': 43,
	'Blended Scotch': 40,
	'Single Malt Scotch': 40,
	'Irish Whiskey': 40,
	'Canadian Whisky': 40,
	'Japanese Whisky': 43,
	'Spiced Rum': 40,
	'Light Rum': 40,
	'White Blended Rum': 40,
	'Aged Barbados Rum': 40,
	'Aged Column Still Rum': 40,
	'Aged Blended Rum': 40,
	'Aged Jamaican Rum': 40,
	'Aged Overproof Jamaican Rum': 57,
	'Unaged Overproof Jamaican Rum': 63,
	'Demerara 151 Rum': 75.5,
	'Column Still Overproof Rum': 75.5,
	'Unaged Rhum Agricole': 50,
	'Aged Rhum Agricole': 40,
	'Black Jamaican Rum': 40,
	'Blackstrap Rum': 40,
	'Pineapple Rum': 40,
	'Unaged Cachaça': 40,
	'Aged Cachaça': 40,
	'London Dry Gin': 47,
	'Old Tom Gin': 45,
	Vodka: 40,
	'Blanco Tequila': 40,
	'Reposado Tequila': 40,
	'Añejo Tequila': 40,
	Mezcal: 40,
	Brandy: 40,
	Cognac: 40,
	'Apple Brandy': 40,
	'Bonded Apple Brandy': 50,
	'Bonded Bourbon': 50,
	'Bonded Rye': 50,
	Applejack: 40,
	Calvados: 40,
	Kirsch: 40,
	'Citron Vodka': 40,
	'Vanilla Vodka': 35,
	'Pear Brandy': 40,
	'Pear Liqueur': 25,
	'Unaged Aquavit': 40,
	'Aged Aquavit': 40,
	Absinthe: 68,
	Pastis: 40,
	'Orange Liqueur': 40,
	Curaçao: 40,
	'Triple Sec': 40,
	'Blue Curaçao': 24,
	'Maraschino Liqueur': 32,
	'Cherry Liqueur': 24,
	'Apricot Liqueur': 24,
	'Peach Liqueur': 16,
	'Crème de Cassis': 15,
	'Blackberry Liqueur': 18,
	'Crème de Menthe': 27,
	'Green Herbal Liqueur': 55,
	Génépy: 40,
	'Yellow Herbal Liqueur': 43,
	'Allspice Dram': 22.5,
	Falernum: 11,
	'Elderflower Liqueur': 20,
	'Crème de Violette': 16,
	'Red Bitter Liqueur': 24,
	'Orange Bitter Liqueur': 11,
	Fernet: 39,
	'Artichoke Amaro': 16.5,
	Amaretto: 28,
	'Coffee Liqueur': 20,
	'Crème de Cacao': 27,
	'Irish Cream': 17,
	'Dry Sparkling Wine': 12,
	Champagne: 12,
	Cava: 12,
	Crémant: 12,
	'Sweet Vermouth': 16,
	'Dry Vermouth': 17.5,
	'Blanc Vermouth': 16,
	'Vermouth Amaro': 16,
	'Amontillado Sherry': 18.5,
	'Bitter Aperitif Wine': 17,
	'Red Aperitif Wine': 17,
	"Don's Spices #2": 11,
	'Aromatic Bitters': 45,
	'Orange Bitters': 45,
	'Creole Bitters': 35,
	'Chocolate Bitters': 48,
	'Grapefruit Bitters': 40,
	'Tiki Bitters': 44,
	'Demerara Rum': 40,
	'Blended Overproof Rum': 69,
	'Contemporary Gin': 44,
	'Plymouth Gin': 41.2,
	'Navy Strength Gin': 57,
	Genever: 42,
	Armagnac: 40,
	'Banana Liqueur': 25,
	'Pineapple Liqueur': 20,
	'Melon Liqueur': 20,
	'Bergamot Liqueur': 20,
	'Vanilla Liqueur': 20,
	'Gentian Liqueur': 16,
	'Dry White Wine': 12,
	'Red Wine': 13,
	Prosecco: 11,
	'Fino Sherry': 15,
	'Oloroso Sherry': 19,
	'Pedro Ximénez Sherry': 17,
	'Ruby Port': 19.5,
	'Tawny Port': 20,
	'White Port': 19,
};
for (const [name, percent] of Object.entries(TYPICAL_ABV_PERCENT)) {
	const entry = entries.find((item) => item.kind === 'type' && item.name === name);
	if (!entry) throw new Error(`Missing typical-ABV type: ${name}`);
	entry.properties = { ...entry.properties, [PROP.abvTypical]: Math.round(percent * 10) / 1000 };
}

export const STARTER_CATALOG: readonly CatalogEntry[] = entries;

export function catalogDraft(
	root: string,
	entry: CatalogEntry,
	paths: ReadonlyMap<string, string> = new Map(),
): NoteDraft {
	const properties: Properties = { ...entry.properties, [PROP.catalogId]: entry.id };
	if (entry.parent) {
		const kind =
			entry.kind === 'family' ? 'category' : entry.kind === 'bottle' || entry.parentIsType ? 'type' : 'family';
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
