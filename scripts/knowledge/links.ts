import { wikiLink } from '../../src/core/schema';
import { destinationPath } from './mapping';
import type { AdoptionMapping, Destination } from './mapping';

export interface LinkContext {
	root: string;
	mapping: AdoptionMapping;
	sources: ReadonlyMap<string, Destination | null>;
	available: ReadonlySet<string>;
	unmapped: (link: string) => void;
	changed: () => void;
}

const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase('en');

export function rewriteLinks(text: string, source: string, ingredients: boolean, context: LinkContext): string {
	const recipe = source.split('/').at(-1)!.replace(/\.md$/, '');
	return text.replace(/\[\[([^\]\n]+)\]\]/g, (original: string, link: string) => {
		const [targetWithHeading, ...alias] = link.split('|');
		const [target, ...heading] = targetWithHeading!.split('#');
		const path = target!.replace(/\.md$/, '');
		const name = path.split('/').at(-1)!;
		let destination: Destination | null | undefined;
		const explicit = path.includes('/');
		if (explicit) destination = context.sources.get(`${path}.md`);
		else {
			const candidates = [...context.sources].filter(
				([key]) => normalize(key.split('/').at(-1)!.replace(/\.md$/, '')) === normalize(name),
			);
			// A bare type link wins over its old same-named subcategory (notably Orgeat).
			const types = candidates.filter(([key]) => key.startsWith('Cocktails/Types/'));
			const choices = types.length ? types : candidates;
			if (choices.length === 1) destination = choices[0]![1];
		}
		if (!destination && !context.sources.has(`Cocktails/Types/${name}.md`)) {
			const added = context.mapping.additionalTypes.find((type) => type.name === name);
			const bottle = context.mapping.additionalBottles.find((bottle) => bottle.name === name);
			if (added) destination = { kind: 'type', name: added.name };
			if (bottle) destination = { kind: 'bottle', name: bottle.name };
		}
		if (ingredients) {
			const override = context.mapping.links.find((rule) => rule.recipe === recipe && rule.target === name);
			if (override) destination = override.destination;
			else if (name === 'Aromatic Bitters' && destination?.kind === 'family')
				destination = { kind: 'type', name: 'Aromatic Bitters' };
		}
		if (!destination || !context.available.has(destinationPath(context.root, destination))) {
			context.unmapped(link);
			return original;
		}
		const result = wikiLink(
			`${destinationPath(context.root, destination)}${heading.length ? `#${heading.join('#')}` : ''}`,
			alias.length ? alias.join('|') : name,
		);
		if (result !== original) context.changed();
		return result;
	});
}

export function rewriteBody(body: string, source: string, context: LinkContext): string {
	let ingredients = false;
	return body
		.split('\n')
		.map((line) => {
			const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
			if (heading) ingredients = heading[1]!.toLowerCase() === 'ingredients';
			return rewriteLinks(line, source, ingredients && source.startsWith('Cocktails/Recipes/'), context);
		})
		.join('\n');
}
