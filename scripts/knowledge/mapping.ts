import { STARTER_CATALOG } from '../../src/catalog/catalog';
import { notePath } from '../../src/core/schema';
import type { NoteKind } from '../../src/core/schema';

export interface TypeRule {
	name: string;
	family?: string;
}
export interface BottleRule {
	previous: string;
	type: string;
}
export interface Destination {
	kind: NoteKind;
	name: string;
}
export function destinationPath(root: string, destination: Destination): string {
	return notePath(root, destination.kind, destination.name);
}
export interface LinkRule {
	recipe: string;
	target: string;
	destination: Destination;
}
export interface AdoptionMapping {
	types: Map<string, TypeRule | null>;
	bottles: Map<string, BottleRule>;
	links: LinkRule[];
	additionalTypes: TypeRule[];
	additionalBottles: { name: string; type: string }[];
}

/** Read the approved tables directly, so there is no second copy to keep synchronized. */
export function readMapping(document: string): AdoptionMapping {
	const rows = (heading: string): string[][] => {
		const section = document.split(`## ${heading}\n`)[1]?.split('\n## ')[0];
		if (!section) throw new Error(`Missing mapping section: ${heading}`);
		return section
			.split('\n')
			.filter((line) => line.startsWith('| ') && !/^\| (?:---|Current type|Bottle \|)/.test(line))
			.map((line) =>
				line
					.split('|')
					.slice(1, -1)
					.map((cell) => cell.trim()),
			);
	};
	const types = new Map<string, TypeRule | null>();
	for (const [old, next, family, status] of rows('Ingredient types')) {
		if (!old || !next || !family || !status || types.has(old))
			throw new Error('Invalid or duplicate type mapping row.');
		const rule =
			next === '—' ? null : { name: next === 'same' ? old : next, family: family === '—' ? undefined : family };
		if (rule && !status.startsWith('Local')) {
			const entry = STARTER_CATALOG.find((entry) => entry.kind === 'type' && entry.name === rule.name);
			if (!entry || entry.parent !== rule.family) throw new Error(`Starter disagrees with mapping: ${old}`);
		}
		types.set(old, rule);
	}
	const bottles = new Map<string, BottleRule>();
	for (const [name, previous, type] of rows('Bottles whose type changes')) {
		if (!name || !previous || !type || bottles.has(name))
			throw new Error('Invalid or duplicate bottle mapping row.');
		bottles.set(name, { previous, type });
	}
	const links: LinkRule[] = [];
	const add = (recipes: string[], target: string, kind: NoteKind, name: string) => {
		links.push(...recipes.map((recipe) => ({ recipe, target, destination: { kind, name } })));
	};
	add(
		['Bourbon Renewal', 'Old Fashioned', 'Wibble', "Lion's Tail", 'Whiskey Sour', 'Amaro Daiquiri'],
		'Simple Syrup',
		'type',
		'Simple Syrup (2:1)',
	);
	add(['Certain Ratio', 'Drunken Helmsman', 'Drunk in the August Sun'], 'Falernum', 'type', 'Falernum');
	add(['Kingston Black', 'New English Negroni', 'Star Daisy'], 'Apple Brandy', 'type', 'Bonded Apple Brandy');
	add(['FALSE IDOL'], 'Navy Strength Rum', 'bottle', 'Smith & Cross');
	add(['After Hours'], 'Coconut Rum', 'bottle', 'Planteray Cut & Dry');
	add(['Orchard & Rye'], 'Krupnik Herbal Honey Bitters', 'bottle', 'Bittermens Krupnik Herbal Honey Bitters');
	add(['Dub Treo'], 'Whiskey Barrel-Aged Bitters', 'bottle', 'Fee Brothers Whiskey Barrel-Aged Bitters');
	add(['High Horse'], 'Brandy', 'type', 'Kirsch');
	return {
		types,
		bottles,
		links,
		additionalTypes: [
			{ name: 'Vanilla Liqueur', family: 'Herbal & Spice Liqueur' },
			{ name: 'Specialty Bitters', family: 'Bitters' },
			{ name: 'French Brandy', family: 'Brandy' },
			{ name: 'Macerated Strawberry Juice', family: 'Other Fruit Juice' },
			{ name: 'Kirsch' },
		],
		additionalBottles: [
			{ name: 'Mr Black', type: 'Coffee Liqueur' },
			{ name: 'Don Q Gold', type: 'Aged Column Still Rum' },
			{ name: 'Fee Brothers Whiskey Barrel-Aged Bitters', type: 'Aromatic Bitters' },
		],
	};
}

export function familyName(name: string): string | null | undefined {
	if (['Fruit Brandy', 'Other Liqueur'].includes(name)) return null;
	if (['Herbal Liqueur', 'Spice Liqueur'].includes(name)) return 'Herbal & Spice Liqueur';
	if (
		[
			'Aromatic Bitters',
			'Floral Bitters',
			'Herbal Bitters',
			'Spice Bitters',
			'Specialty Bitters',
			'Fruit Bitters',
		].includes(name)
	)
		return 'Bitters';
	if (['Fruit Syrup', 'Infused Syrup', 'Orgeat'].includes(name)) return 'Flavored Syrup';
	return STARTER_CATALOG.some((entry) => entry.kind === 'family' && entry.name === name) ? name : undefined;
}
