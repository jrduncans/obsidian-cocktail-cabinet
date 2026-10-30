import type { NoteDraft, Properties } from '../core/schema';
import { PROP, fileName, notePath, wikiLink } from '../core/schema';

export interface CatalogEntry extends NoteDraft {
	id: string;
	parent?: string;
}

const entries: CatalogEntry[] = [];
function category(name: string, description: string) {
	entries.push({ id: `category:${fileName(name)}`, kind: 'category', name, description });
}
function ingredientTypes(parent: string | undefined, types: [string, string][]) {
	for (const [name, description] of types) {
		entries.push({ id: `type:${fileName(name)}`, kind: 'type', name, parent, description });
	}
}
function family(name: string, parent: string | undefined, description: string, types: [string, string][]) {
	entries.push({ id: `family:${fileName(name)}`, kind: 'family', name, parent, description });
	ingredientTypes(name, types);
}

category('Spirit', 'Distilled spirits used as cocktail bases and modifiers.');
category('Liqueur', 'Sweetened spirits and liqueurs used for flavor and sweetness.');
category('Wine', 'Still and sparkling wines used in cocktails.');
category('Fortified Wine', 'Vermouth, sherry, and other fortified wine ingredients.');
category('Juice', 'Fruit and vegetable juices. Fruit juice means fresh juice unless the ingredient specifies another preparation.');
category('Syrup', 'Liquid sweeteners and flavored syrups. Concentration is part of an ingredient when it affects a recipe.');

family('Whiskey', 'Spirit', 'Whiskey styles used in cocktail recipes.', [
	['Bourbon', 'Bourbon whiskey; choose the bottling and strength appropriate to your recipe.'],
	['Rye Whiskey', 'Rye whiskey used when a recipe calls for rye.'],
	['Blended Scotch', 'Scotch whisky in a blended style; choose the smoke profile and strength to suit your recipe.'],
	['Single Malt Scotch', 'Single malt Scotch whisky; smoke and strength vary by bottling.'],
	['Irish Whiskey', 'Irish whiskey; select a bottling to suit the recipe.'],
]);
family('Rum', 'Spirit', 'Rum styles. These are starting distinctions; refine them to fit your recipes.', [
	['Lightly Aged Blended Rum', 'Lightly aged blended rum for recipes calling for a light-bodied rum.'],
	['Aged Blended Rum', 'Aged blended rum; flavor and strength vary by bottling.'],
	['Unaged Jamaican Rum', 'Unaged Jamaican rum; check the bottle strength when using a recipe.'],
	['Aged Jamaican Rum', 'Barrel-aged Jamaican rum, kept distinct from unaged and explicitly overproof styles.'],
	['Overproof Jamaican Rum', 'High-strength Jamaican rum, distinct from standard-strength rum in a recipe.'],
	['Demerara Rum', 'Demerara rum; choose a bottling and strength to suit the recipe.'],
	['Overproof Demerara Rum', 'High-strength Demerara rum for recipes that specify it.'],
	['Rhum Agricole Blanc', 'Unaged sugarcane-juice rhum in the agricole style.'],
	['Aged Rhum Agricole', 'Barrel-aged sugarcane-juice rhum in the agricole style.'],
	['Black Rum', 'Dark rum for recipes explicitly calling for black rum; bottlings differ substantially.'],
	['Coconut Rum', 'Coconut-flavored rum; sweetness and strength vary by bottling.'],
]);
family('Cachaça', 'Spirit', 'Brazilian sugarcane spirits, kept separate from the Rum family.', [
	['Unaged Cachaça', 'Unaged Brazilian sugarcane spirit for recipes calling for cachaça.'],
	['Aged Cachaça', 'Barrel-aged cachaça, kept distinct when the recipe specifies an aged style.'],
]);
family('Gin', 'Spirit', 'Gin and related styles; a broad Gin reference does not select a particular style.', [
	['London Dry Gin', 'Juniper-led dry gin for recipes that specify London dry.'], ['Old Tom Gin', 'Gin in the Old Tom style, typically sweeter than dry gin; bottlings vary.'],
	['Plymouth Gin', 'Plymouth gin for recipes that specify it.'],
	['Navy Strength Gin', 'High-strength gin; strength affects the cocktail recipe.'],
	['Genever', 'Genever for recipes that specify this style.'],
]);
ingredientTypes(undefined, [['Vodka', 'A neutral, unflavored spirit for recipes calling for vodka. Flavored vodkas can be added as distinct ingredients.']]);
family('Agave Spirit', 'Spirit', 'Tequila, mezcal, and related agave spirits.', [
	['Blanco Tequila', 'Tequila in the blanco style, distinct from barrel-aged tequila in recipes.'], ['Reposado Tequila', 'Barrel-rested tequila in the reposado style.'],
	['Añejo Tequila', 'Aged tequila in the añejo style, kept distinct from blanco and reposado.'], ['Mezcal', 'Mezcal; agave variety and bottling can change the result.'],
]);
family('Brandy', 'Spirit', 'French-style grape brandy in common cocktail usage, including Cognac and Armagnac. Apple brandy has a separate family.', [
	['Cognac', 'French grape brandy from the Cognac region, used in brandy cocktails.'], ['Armagnac', 'French grape brandy from the Armagnac region; keep distinct when a recipe specifies it.'],
]);
family('Apple Brandy', 'Spirit', 'Apple brandy and applejack styles used in recipes. Decide which types describe your bottles; a broad family reference can use any of these types.', [
	['Apple Brandy', 'Apple brandy for recipes specifying an apple-based spirit without a narrower style. Classify bottles to suit your recipes.'],
	['Bonded Apple Brandy', 'Apple brandy for recipes specifying bonded apple brandy, typically at 100 US proof (50% ABV). Assign bottles deliberately; proof alone does not establish bonded status.'],
	['Applejack', 'Applejack as named in recipes. Bottlings vary; decide which bottles fit the recipe style you intend.'],
	['Calvados', 'Calvados for recipes specifying this apple brandy style. Decide which of your bottles fit the recipe requirement.'],
]);
family('Aquavit', 'Spirit', 'Aquavit styles.', [
	['Unaged Aquavit', 'Caraway- or dill-led aquavit without an aged style designation.'], ['Aged Aquavit', 'Barrel-aged aquavit, kept distinct from unaged aquavit in recipes.'],
]);
family('Anise Spirit', 'Spirit', 'Anise-flavored spirits used for pours and rinses.', [
	['Absinthe', 'Absinthe; follow the recipe amount, including when used as a rinse.'],
	['Pastis', 'Pastis for recipes that specify it.'],
]);
family('Fruit Liqueur', 'Liqueur', 'Fruit-flavored liqueurs.', [
	['Orange Liqueur', 'Orange liqueur; refine to a specific style or bottle when the recipe needs it.'],
	['Maraschino Liqueur', 'Maraschino liqueur, distinct from cherry brandy and cherry syrup.'],
	['Cherry Liqueur', 'Cherry liqueur for recipes that specify it.'],
	['Apricot Liqueur', 'Apricot liqueur, distinct from dry apricot brandy.'],
	['Peach Liqueur', 'Sweet peach-flavored liqueur; distinguish from unsweetened peach brandy.'], ['Blackcurrant Liqueur', 'Blackcurrant liqueur, including creme de cassis.'],
	['Banana Liqueur', 'Sweet banana-flavored liqueur used as a cocktail modifier.'],
]);
family('Herbal Liqueur', 'Liqueur', 'Herbal liqueurs; select a type or bottle when the recipe specifies a particular profile.', [
	['Green Herbal Liqueur', 'Green herbal liqueur; use a specific bottle reference when a particular bottling is intended.'],
	['Yellow Herbal Liqueur', 'Yellow herbal liqueur; use a specific bottle reference when needed.'],
	['Bénédictine', 'A sweet herbal and spiced liqueur; link a bottle for the specific bottling you own.'],
]);
family('Floral Liqueur', 'Liqueur', 'Flower-flavored liqueurs used as cocktail modifiers.', [
	['Elderflower Liqueur', 'Sweet floral liqueur flavored with elderflower.'],
	['Violet Liqueur', 'Sweet violet-flavored floral liqueur, also called creme de violette.'],
]);
family('Spice Liqueur', 'Liqueur', 'Spice-led liqueurs; each type retains its distinct recipe role.', [
	['Allspice Dram', 'Allspice liqueur, also called pimento dram.'],
	['Falernum', 'Falernum; sweetness and alcohol content vary between preparations and bottlings.'],
]);
family('Amaro', 'Liqueur', 'Bitter liqueurs grouped as amaro for cocktail browsing. Styles vary in sweetness, strength, and bitterness; choose a type or bottle when it matters.', [
	['Red Bitter Liqueur', 'Red bitter liqueur; specify a bottle where bitterness and sweetness matter.'],
	['Gentian Liqueur', 'Bitter liqueur with gentian character; select a bottle to capture the specific formulation.'], ['Fernet', 'A strongly bitter herbal liqueur in the fernet style.'],
	['Artichoke Amaro', 'A bitter herbal liqueur in an artichoke-based style.'],
]);
family('Nut Liqueur', 'Liqueur', 'Nut-flavored liqueurs. Add other nut styles when useful to your recipes.', [
	['Amaretto', 'Sweet almond-flavored liqueur in the amaretto style.'],
]);
ingredientTypes(undefined, [
	['Coffee Liqueur', 'Sweet coffee-flavored liqueur; sugar content and strength vary by bottling.'],
	['Crème de Cacao', 'Chocolate liqueur; specify light or dark when the recipe needs that distinction.'],
]);
family('Still Wine', 'Wine', 'Non-sparkling wine ingredients.', [
	['Dry White Wine', 'Still white wine in a dry style, used as a cocktail ingredient.'], ['Red Wine', 'Red wine, including when used as a float.'],
]);
family('Sparkling Wine', 'Wine', 'Sparkling wines used to lengthen cocktails.', [
	['Dry Sparkling Wine', 'Dry sparkling wine when no narrower style is specified.'],
	['Champagne', 'Sparkling wine from Champagne; record the specific bottling when its style matters.'], ['Prosecco', 'Prosecco; sweetness varies by bottling.'],
]);
family('Vermouth', 'Fortified Wine', 'Vermouth styles distinguished by their recipe roles.', [
	['Sweet Vermouth', 'Sweet aromatized fortified wine for recipes calling for sweet vermouth.'], ['Dry Vermouth', 'Dry aromatized fortified wine for recipes calling for dry vermouth.'],
	['Blanc Vermouth', 'Sweet white vermouth, also called bianco or blanc.'],
]);
family('Sherry', 'Fortified Wine', 'Sherry styles.', [
	['Fino Sherry', 'Dry sherry in the fino style.'], ['Amontillado Sherry', 'Dry sherry in the amontillado style.'],
	['Oloroso Sherry', 'Sherry in the oloroso style; use the sweetness specified by your recipe.'], ['Pedro Ximénez Sherry', 'Sweet Pedro Ximénez sherry.'],
]);
family('Other Fortified Wine', 'Fortified Wine', 'Other fortified wine ingredients.', [
	['Ruby Port', 'Fortified wine in the ruby port style.'], ['Tawny Port', 'Fortified wine in the tawny port style.'],
	['Quinquina', 'Quinine-flavored aperitif wine; use a bottle reference for a particular formulation.'],
]);
family('Bitters', undefined, 'Concentrated bitters used in small cocktail seasoning quantities.', [
	['Aromatic Bitters', 'Concentrated aromatic bitters used in dashes or other small seasoning amounts.'], ['Orange Bitters', 'Concentrated orange-flavored bitters used as cocktail seasoning.'],
	['Creole Bitters', 'Creole-style aromatic bitters for recipes that specify that profile.'], ['Chocolate Bitters', 'Concentrated chocolate-flavored bitters used as cocktail seasoning.'],
]);
family('Citrus Juice', 'Juice', 'Fresh citrus juices by default. Bottled juice can be recorded as a source of the same ingredient.', [
	['Lime Juice', 'Fresh lime juice by default. A bottled source can be recorded without changing recipe links.'],
	['Lemon Juice', 'Lemon juice, assumed freshly squeezed; purchased juice can supply the same ingredient.'], ['Orange Juice', 'Orange juice, assumed freshly squeezed unless a different preparation is specified.'],
	['Grapefruit Juice', 'Grapefruit juice, assumed freshly squeezed; refine the fruit variety when your recipes need it.'],
]);
family('Other Fruit Juice', 'Juice', 'Other fruit juices; track purchased juice as a source where appropriate.', [
	['Pineapple Juice', 'Pineapple juice, fresh by default.'], ['Cranberry Juice', 'Cranberry juice; sweetened blends can require a different recipe amount.'],
	['Apple Juice', 'Juice from apples; specify a preparation when it changes your recipe.'], ['Passion Fruit Juice', 'Passion fruit juice; distinguish sweetened preparations when they affect a recipe.'],
]);
family('Vegetable Juice', 'Juice', 'Vegetable juices.', [['Tomato Juice', 'Juice from tomatoes used in savory cocktails; seasoned mixes should be distinguished when needed.']]);
family('Sugar Syrup', 'Syrup', 'Sugar and water syrups with a defined ratio by weight.', [
	['Simple Syrup (1 to 1)', 'White sugar and water at 1:1 by weight. Nominal Brix: 50.'],
	['Simple Syrup (2 to 1)', 'White sugar and water at 2:1 by weight. Nominal Brix: approximately 66.7.'],
	['Demerara Syrup (2 to 1)', 'Demerara sugar and water at 2:1 by weight. Nominal sugar concentration: approximately 66.7 percent; actual Brix can vary.'],
]);
family('Flavored Syrup', 'Syrup', 'Flavored syrups; recipe details and concentration belong on the ingredient page.', [
	['Orgeat', 'Almond syrup; concentration and flavor vary by preparation.'],
	['Grenadine', 'Pomegranate syrup; document the preparation or purchased source you use.'],
	['Honey Syrup', 'Honey diluted with water. Specify the ratio for your recipes.'],
	['Agave Syrup', 'Agave-based sweetener. Document whether it is diluted.'],
	['Ginger Syrup', 'A sweet ginger preparation; record the concentration and preparation you use.'], ['Cinnamon Syrup', 'A sweet cinnamon preparation; record the concentration and preparation you use.'],
	['Passion Fruit Syrup', 'Sweetened passion fruit syrup, distinct from unsweetened juice.'],
]);
family('Carbonated Mixer', undefined, 'Carbonated cocktail mixers.', [
	['Soda Water', 'Unflavored carbonated water.'], ['Tonic Water', 'Carbonated bitter-sweet mixer; sweetness and flavor vary by brand.'],
	['Ginger Beer', 'Ginger-flavored mixer used for a more pronounced ginger profile; brands vary.'], ['Ginger Ale', 'Ginger-flavored soft drink, kept distinct from ginger beer in recipes.'], ['Cola', 'Cola-flavored soft drink used as a cocktail mixer.'],
]);
ingredientTypes(undefined, [
	['Heavy Cream', 'High-fat dairy cream for recipes that specify cream.'], ['Milk', 'Dairy milk for recipes calling for milk; use a separate ingredient where a substitution changes the recipe.'], ['Egg White', 'The white of an egg, used for texture and foam in cocktails.'], ['Whole Egg', 'A whole egg, including yolk, for flips and other cocktails that specify it.'],
]);
ingredientTypes(undefined, [
	['Mint', 'Fresh mint leaves or sprigs for flavor and garnish.'], ['Lime Peel', 'Lime peel for garnish or expressed oils.'],
	['Lemon Peel', 'Lemon peel for garnish or expressed oils.'], ['Orange Peel', 'Orange peel for garnish or expressed oils.'],
	['Cocktail Cherry', 'A prepared cherry used as a cocktail garnish.'], ['Salt', 'Salt; keep a saline solution separate when a recipe specifies one.'],
]);

const sugar = [
	['Simple Syrup (1 to 1)', 50, '1:1', 'white sugar'],
	['Simple Syrup (2 to 1)', 66.7, '2:1', 'white sugar'],
	['Demerara Syrup (2 to 1)', 66.7, '2:1', 'demerara sugar'],
] as const;
for (const [name, brix, ratio, ingredient] of sugar) {
	const entry = entries.find(item => item.name === name);
	if (!entry) throw new Error(`Missing starter syrup: ${name}`);
	entry.properties = { [PROP.brix]: brix, 'cocktail-sugar-water-ratio': `${ratio} by weight` };
	entry.method = `Combine ${ratio === '1:1' ? 'equal weights of' : 'two parts by weight of'} ${ingredient} and ${ratio === '1:1' ? '' : 'one part by weight of '}water. This ratio is by weight. Stir until dissolved. The listed Brix is nominal, not a measurement of a prepared batch.\n\nReference: [Simple syrup ratios and Brix](https://www.cocktailarium.com/lessons/sweetness-i-simple-syrup).`;
}

export const STARTER_CATALOG: readonly CatalogEntry[] = entries;

export function catalogDraft(root: string, entry: CatalogEntry, paths: ReadonlyMap<string, string> = new Map()): NoteDraft {
	const properties: Properties = { ...entry.properties, [PROP.catalogId]: entry.id };
	if (entry.parent) {
		const kind = entry.kind === 'family' ? 'category' : 'family';
		properties[kind === 'category' ? PROP.category : PROP.family] = [wikiLink(paths.get(`${kind}:${fileName(entry.parent)}`) || notePath(root, kind, entry.parent), entry.parent)];
	}
	return { ...entry, properties };
}
