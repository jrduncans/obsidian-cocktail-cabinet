import { STARTER_CATALOG } from '../../src/catalog/catalog';
import { renderNote } from '../../src/core/notes';
import { starterPlan } from '../../src/core/setup';
import { cabinetFolder, notePath, parseRating, PROP, wikiLink } from '../../src/core/schema';
import type { NoteKind } from '../../src/core/schema';
import { bottleStock, cleanNavigation, readDocument, singleLegacyLink, withNavigation, writeDocument } from './document';
import type { Document } from './document';
import { destinationPath, familyName } from './mapping';
import type { AdoptionMapping, Destination } from './mapping';
import { rewriteBody, rewriteLinks } from './links';

export interface Change { category: string; action: 'create' | 'rewrite' | 'rename' | 'retire'; path: string; from?: string; }
export interface Issue { category: 'Unmapped notes' | 'Unmapped links' | 'Unmapped properties' | 'Conversion errors' | 'Confirmation' | 'Deferred cutover'; path: string; detail: string; }
export interface MigrationPlan {
	root: string;
	files: Map<string, string>;
	remove: string[];
	changes: Change[];
	issues: Issue[];
	counts: Record<string, number>;
}

const LEGACY_KEYS: Record<NoteKind, string[]> = {
	category: ['base'], family: ['base', 'Category'], type: ['base', 'Subcategory', 'Shopping List'],
	bottle: ['base', 'Type', 'Substitutes For', 'Volume', 'Remaining in Open Bottle', 'Unopened Bottles', 'ABV', 'Last Purchase Price', 'Shopping List'],
	ingredient: ['base', 'Provides', 'Form', 'Availability', 'Shopping List'], recipe: [],
};
const RETAINED_KEYS = ['aliases', 'created', 'source', 'rating'];
/** The description in a generated note body, without its heading or navigation embeds. */
function starterDescription(body: string): string {
	return body.replace(/^# [^\n]*(?:\n|$)/, '').replace(/^!\[\[[^\]]*\.base#[^\]]*\]\][^\S\n]*$/gm, '').trim();
}

/** Homemade syrups kept as bottle notes become House other stock (see the mapping's mechanical changes). */
const HOUSE: Record<string, string> = { 'Simple Syrup, 1 to 1': 'Simple Syrup (1:1)', 'Demerara Syrup, 2 to 1': 'Demerara Syrup (2:1)' };

const FRUIT: Record<string, string> = { 'Fresh Lemons': 'Lemon Juice', 'Fresh Limes': 'Lime Juice', 'Fresh Oranges': 'Orange Juice' };

/** Pure plan: no filesystem access, dates, or personal source content embedded in code. */
export function migrationPlan(source: ReadonlyMap<string, string>, folder: string, mapping: AdoptionMapping): MigrationPlan {
	const root = cabinetFolder(folder);
	const plan: MigrationPlan = { root, files: new Map(), remove: [], changes: [], issues: [], counts: { create: 0, rewrite: 0, rename: 0, retire: 0, 'Conversion errors': 0 } };
	const count = (key: string) => { plan.counts[key] = (plan.counts[key] ?? 0) + 1; };
	const issue = (category: Issue['category'], path: string, detail: string) => { plan.issues.push({ category, path, detail }); };
	const documents = new Map<string, Document>();
	const destinations = new Map<string, Destination | null>();
	const definitions = starterPlan(root);
	for (const rule of [...mapping.types.values(), ...mapping.additionalTypes]) {
		if (!rule || definitions.some(file => file.path === notePath(root, 'type', rule.name))) continue;
		definitions.push(renderNote(root, { kind: 'type', name: rule.name, description: '', properties: rule.family ? { [PROP.family]: wikiLink(notePath(root, 'family', rule.family), rule.family) } : {} }, ''));
	}
	for (const bottle of mapping.additionalBottles) {
		definitions.push(renderNote(root, { kind: 'bottle', name: bottle.name, description: '', properties: {
			[PROP.type]: wikiLink(notePath(root, 'type', bottle.type), bottle.type),
			[PROP.stockTracking]: 'volume', [PROP.volume]: null, [PROP.open]: null, [PROP.unopened]: null,
		} }, ''));
	}
	for (const [path, content] of source) {
		if (!path.endsWith('.md')) {
			if (path.endsWith('.base') || path.startsWith('Cocktails/Views/')) issue('Deferred cutover', path, 'Legacy view retained in rehearsal; generated Views are separate.');
			else issue('Unmapped notes', path, 'No migration rule; preserved.');
			continue;
		}
		try {
			const document = readDocument(content);
			if (Object.keys(document.metadata).some(key => key.startsWith('cc-'))) throw new Error('Source already contains plugin schema properties.');
			documents.set(path, document);
			const parts = path.split('/');
			const name = parts.at(-1)!.replace(/\.md$/, '');
			let destination: Destination | null | undefined;
			if (parts.length === 3 && parts[1] === 'Categories') {
				if (name === 'Bitters') destination = null;
				else {
					const category = name === 'Fruit Juice' ? 'Juice' : name;
					if (STARTER_CATALOG.some(entry => entry.kind === 'category' && entry.name === category)) destination = { kind: 'category', name: category };
				}
			} else if (parts.length === 3 && parts[1] === 'Subcategories') {
				const family = familyName(name);
				destination = family === null ? null : family ? { kind: 'family', name: family } : undefined;
			} else if (parts.length === 3 && parts[1] === 'Types') {
				const type = mapping.types.get(name);
				destination = type === null ? null : type ? { kind: 'type', name: type.name } : undefined;
			} else if (parts.length === 3 && parts[1] === 'Bottles' && HOUSE[name]) {
				destination = { kind: 'ingredient', name: `House ${HOUSE[name]}` };
			} else if (parts.length === 3 && parts[1] === 'Bottles') {
				const previous = singleLegacyLink(document.metadata.Type);
				const rule = mapping.bottles.get(name);
				const type = previous ? rule?.type ?? mapping.types.get(previous)?.name : undefined;
				if (!previous || !type || (rule ? previous !== rule.previous : type !== previous)) throw new Error('Bottle classification is not covered by the approved mapping.');
				destination = { kind: 'bottle', name };
			} else if (parts.length === 3 && parts[1] === 'Ingredients' && FRUIT[name]) destination = { kind: 'ingredient', name };
			else if (parts.length === 3 && parts[1] === 'Recipes') destination = { kind: 'recipe', name };
			else if (path === 'Cocktails/Shopping.md') {
				destinations.set(path, null);
				issue('Deferred cutover', path, 'Replaced in rehearsal by generated Shopping list.md.');
				continue;
			}
			if (destination === undefined) issue('Unmapped notes', path, 'No migration rule; preserved.');
			else {
				if (destination) destinationPath(root, destination);
				destinations.set(path, destination);
			}
		} catch (error) { issue('Conversion errors', path, String(error)); }
	}
	const available = new Set([...definitions.map(file => file.path), ...[...destinations.values()].filter((value): value is Destination => !!value).map(value => destinationPath(root, value))]);
	const merged = new Map<string, { document: Document; kind: NoteKind; bodies: string[]; starter: string }>();
	for (const [path, destination] of destinations) {
		const document = documents.get(path)!;
		const from = `${root}/${path.slice('Cocktails/'.length)}`;
		plan.remove.push(from);
		if (!destination) {
			plan.changes.push({ category: 'Retired and merged notes', action: 'retire', path: from });
			if (path !== 'Cocktails/Shopping.md' && cleanNavigation(document.body)) issue('Conversion errors', path, 'Retired note contains authored content; review before removing.');
			const known = ['base', 'Category', 'Subcategory', 'Shopping List'];
			if (Object.keys(document.metadata).some(key => !known.includes(key)) || document.metadata['Shopping List'] === true) issue('Conversion errors', path, 'Retired note contains additional metadata or purchase intent; review before removing.');
			continue;
		}
		const { kind, name } = destination;
		const sourceName = path.split('/').at(-1)!.replace(/\.md$/, '');
		const house = kind === 'ingredient' ? HOUSE[sourceName] : undefined;
		const legacy = house ? LEGACY_KEYS.bottle : LEGACY_KEYS[kind];
		const to = destinationPath(root, destination);
		const seed = definitions.find(file => file.path === to) ?? renderNote(root, { kind, name, description: '' }, '');
		const generated = readDocument(seed.content);
		const metadata = { ...document.metadata };
		const context = { root, mapping, sources: destinations, available,
			unmapped: (link: string) => issue('Unmapped links', path, link), changed: () => count('Links rewritten') };
		try {
			const authoredAliases = metadata.aliases;
			if (authoredAliases != null && typeof authoredAliases !== 'string' && (!Array.isArray(authoredAliases) || (authoredAliases as unknown[]).some(value => typeof value !== 'string'))) throw new Error('Aliases must be text or a list of text.');
			for (const key of Object.keys(metadata)) {
				if (!legacy.includes(key) && !RETAINED_KEYS.includes(key) && !key.startsWith('cc-')) issue('Unmapped properties', path, `${key}: preserved without conversion.`);
			}
			if (kind === 'bottle') {
				const type = mapping.bottles.get(name)?.type ?? mapping.types.get(singleLegacyLink(metadata.Type)!)!.name;
				Object.assign(generated.metadata, bottleStock(metadata), { [PROP.type]: wikiLink(notePath(root, 'type', type), type) });
				delete generated.metadata[PROP.availability];
				count('Bottle stock converted');
			}
			if (house) {
				const stock = bottleStock(metadata);
				const volume = stock[PROP.volume] as number | null, open = stock[PROP.open] as number | null;
				const unopened = (stock[PROP.unopened] as number | null) ?? 0;
				if (unopened > 0 && volume === null) throw new Error('Unopened homemade syrup needs a known volume.');
				const remaining = open === null && unopened === 0 ? null : (open ?? 0) + unopened * (volume ?? 0);
				Object.assign(generated.metadata, {
					[PROP.provides]: [wikiLink(notePath(root, 'type', house), house)], [PROP.form]: 'Homemade syrup',
					[PROP.stockTracking]: 'volume', [PROP.remaining]: remaining, [PROP.lastPurchasePrice]: stock[PROP.lastPurchasePrice],
				});
				delete generated.metadata[PROP.availability];
				count('Homemade syrups converted');
			} else if (kind === 'ingredient') {
				const juice = FRUIT[name]!;
				if (metadata.Form !== 'Whole fruit' || JSON.stringify(metadata.Provides) !== JSON.stringify([`[[${juice}]]`])) throw new Error('Fresh fruit form or provided juice differs from mapping.');
				if (metadata.Availability != null && (typeof metadata.Availability !== 'string' || !['Unknown', 'Have', 'Low', 'Out'].includes(metadata.Availability))) throw new Error('Invalid availability.');
				Object.assign(generated.metadata, { [PROP.provides]: [wikiLink(notePath(root, 'type', juice), juice)], [PROP.stockTracking]: 'status', [PROP.availability]: metadata.Availability ?? 'Unknown', [PROP.form]: 'Fresh ingredient' });
				count('Fresh fruit converted');
			}
			if (['bottle', 'type', 'ingredient'].includes(kind) && metadata['Shopping List'] != null) {
				if (typeof metadata['Shopping List'] !== 'boolean') throw new Error('Shopping List must be true or false.');
				generated.metadata[PROP.shoppingList] = metadata['Shopping List'];
			}
			if (kind === 'recipe' && 'rating' in metadata) {
				const rating = parseRating(metadata.rating);
				if (rating === undefined) throw new Error(`Unconvertible rating: ${JSON.stringify(metadata.rating)}`);
				if (rating !== metadata.rating) count('Ratings converted');
				metadata.rating = rating;
			}
			for (const key of legacy) delete metadata[key];
			// Recursively rewrite links in retained custom metadata without losing nested values.
			const rewriteValue = (value: unknown): unknown => typeof value === 'string' ? rewriteLinks(value, path, false, context)
				: Array.isArray(value) ? value.map(rewriteValue)
					: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteValue(child)])) : value;
			for (const key of Object.keys(metadata)) metadata[key] = rewriteValue(metadata[key]);
			const properties: Record<string, unknown> = { ...generated.metadata, ...metadata, [PROP.kind]: kind, [PROP.name]: name };
			// Renderer's automatic aliases are combined with authored aliases.
			const aliasValues: unknown[] = [generated.metadata.aliases, metadata.aliases, house ? sourceName : undefined];
			const aliases = aliasValues.flatMap((value): string[] => Array.isArray(value) ? (value as unknown[]).filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : []);
			if (aliases.length) properties.aliases = [...new Set(aliases)];
			// renderNote's creation-only recipe defaults must not invent historical metadata.
			if (kind === 'recipe') for (const key of ['created', 'source', 'rating']) if (!(key in metadata)) delete properties[key];
			let body = cleanNavigation(document.body);
			if (/```dataviewjs/.test(body)) issue('Unmapped properties', path, 'Unrecognized DataviewJS block preserved.');
			body = rewriteBody(body, path, context).replace(/^# [^\n]*(?:\n|$)/, '').trim();
			const existing = merged.get(to);
			if (existing) {
				if (kind !== 'type' && kind !== 'family') throw new Error(`Destination collision: ${to}`);
				for (const [key, value] of Object.entries(properties)) {
					if (key === 'aliases' || key === PROP.shoppingList) continue;
					if (!(key in existing.document.metadata)) existing.document.metadata[key] = value;
					else if (JSON.stringify(existing.document.metadata[key]) !== JSON.stringify(value)) throw new Error(`Merged notes have conflicting ${key} values.`);
				}
				if (properties[PROP.shoppingList] === true) existing.document.metadata[PROP.shoppingList] = true;
				const priorAliases: unknown = existing.document.metadata.aliases;
				if (aliases.length) existing.document.metadata.aliases = [...new Set([...(Array.isArray(priorAliases) ? (priorAliases as unknown[]).filter((value): value is string => typeof value === 'string') : []), ...aliases])];
				if (body && !existing.bodies.includes(body)) existing.bodies.push(body);
				count('Notes merged');
			} else merged.set(to, { document: { metadata: properties, body: '' }, kind, bodies: body ? [body] : [], starter: starterDescription(generated.body) });
			plan.changes.push({ category: `${kind} notes`, action: from === to ? 'rewrite' : 'rename', path: to, from });
			count(`${kind} notes converted`);
			if (kind !== 'recipe') count('Navigation installed');
		} catch (error) { issue('Conversion errors', path, `${String(error)}; values: ${JSON.stringify(document.metadata)}`); }
	}
	for (const [path, entry] of merged) {
		// Authored prose wins; a note with none keeps the starter's description.
		const bodies = entry.bodies.length ? entry.bodies : [entry.starter].filter(Boolean);
		entry.document.body = withNavigation(`# ${String(entry.document.metadata[PROP.name])}\n\n${bodies.join('\n\n')}`, root, entry.kind);
		plan.files.set(path, writeDocument(entry.document));
	}
	for (const path of documents.keys()) if (!destinations.has(path)) {
		for (const link of source.get(path)!.matchAll(/\[\[([^\]\n]+)\]\]/g)) issue('Unmapped links', path, `Preserved in unmapped note: ${link[1]}`);
	}
	for (const file of definitions) if (!plan.files.has(file.path)) {
		plan.files.set(file.path, file.content);
		plan.changes.push({ category: file.kind === 'base' ? 'Generated Bases' : 'New cabinet notes', action: 'create', path: file.path });
	}
	const foldedPaths = new Map<string, string>();
	for (const path of plan.files.keys()) {
		const folded = path.toLocaleLowerCase('en');
		if (foldedPaths.has(folded)) issue('Conversion errors', path, `Case-insensitive path collision: ${foldedPaths.get(folded)}`);
		foldedPaths.set(folded, path);
		const original = `Cocktails/${path.slice(`${root}/`.length)}`;
		if (source.has(original) && !plan.remove.includes(path)) issue('Conversion errors', path, 'Generated output conflicts with a preserved source file.');
	}
	issue('Confirmation', notePath(root, 'bottle', 'Fee Brothers Whiskey Barrel-Aged Bitters'), 'Aromatic Bitters is provisional; needs confirmation.');
	for (const change of plan.changes) count(change.action);
	for (const entry of plan.issues) count(entry.category);
	return plan;
}
