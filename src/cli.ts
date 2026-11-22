import { TFile } from 'obsidian';
import type { CliData } from 'obsidian';
import type CocktailCabinetPlugin from './main';
import { canMakeReport, makeableReport, parseListFlags, toBuyReport } from './core/availability-report';
import { RECIPE_STATUSES } from './core/availability';
import { draftFromText } from './core/recipe-draft';
import { duplicateRecipes } from './core/recipe-tags';
import { ingredientLines, ingredientParts, linkTextError } from './core/unlinked-lines';
import { canRemember } from './core/written-as';
import type { CabinetNote } from './core/schema';
import { RecipeLinkStore } from './vault/recipe-links';

/**
 * Commands for agents, through the official `obsidian` CLI (Obsidian 1.12.2): read-only availability, and
 * creating and linking recipes (docs/import.md#agents). Mobile has no CLI, so they never run there.
 */
export function registerCli(plugin: CocktailCabinetPlugin) {
	const register = plugin.registerCliHandler.bind(plugin);
	const store = plugin.availability;
	/** A vault path, with or without `.md`, or a note name as a link would give it. */
	const notePath = (value: string | undefined, flag: string): string => {
		if (!value || value === 'true') throw new Error(`Give ${flag}=<path or name>.`);
		const file =
			plugin.app.vault.getAbstractFileByPath(value) ??
			plugin.app.metadataCache.getFirstLinkpathDest(value.replace(/\.md$/, ''), '');
		if (!(file instanceof TFile)) throw new Error(`Couldn’t find ${value}.`);
		return file.path;
	};
	const json = (run: (params: CliData) => Promise<unknown>) => async (params: CliData) => {
		try {
			return JSON.stringify(await run(params), null, 2);
		} catch (error) {
			return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
		}
	};
	const listFlags = {
		status: { value: '<status,…>', description: `Only these statuses: ${RECIPE_STATUSES.join(', ')}` },
		'min-rating': { value: '<1-5>', description: 'Only recipes rated at least this' },
		tag: { value: '<tag>', description: 'Only recipes with this tag' },
		limit: { value: '<n>', description: 'At most this many' },
	};

	register(
		'cocktail-cabinet:can-make',
		'Whether a recipe can be made, line by line',
		{ path: { value: '<path>', description: 'The recipe note', required: true } },
		json(async (params) => {
			const { notes, recipe } = await store.recipe(notePath(params.path, 'path'));
			return canMakeReport(recipe, notes);
		}),
	);
	register(
		'cocktail-cabinet:makeable',
		'Recipes by how close they are to makeable',
		{ uses: { value: '<path>', description: 'Only recipes using this bottle, type, or family' }, ...listFlags },
		json(async (params) => {
			const { filter, limit } = parseListFlags(params);
			const { notes, recipes } = await store.all();
			const uses = params.uses === undefined ? undefined : notePath(params.uses, 'uses');
			return makeableReport(recipes, notes, { ...filter, ...(uses ? { uses } : {}) }, limit);
		}),
	);
	register(
		'cocktail-cabinet:to-buy',
		'Missing ingredients by how many recipes they would unlock',
		{ limit: listFlags.limit },
		json(async (params) => {
			const { limit } = parseListFlags(params);
			const { notes, recipes } = await store.all();
			return toBuyReport(recipes, notes, limit);
		}),
	);

	const links = new RecipeLinkStore(plugin.app, plugin.store);
	/** A flag's text, or undefined when it's absent or given with no value. */
	const optional = (value: string | undefined) => (value === undefined || value === 'true' ? undefined : value);
	/** `\\n` and `\\t` as the CLI's own content values take them (`\\\\` for a backslash); real newlines work too. */
	const unescape = (value: string) =>
		value.replace(/\\([nt\\])/g, (_, code: string) => (code === 'n' ? '\n' : code === 't' ? '\t' : '\\'));
	const brief = (note: CabinetNote) => ({ path: note.path, name: note.name, kind: note.kind });

	register(
		'cocktail-cabinet:create-recipe',
		'Create a recipe note from recipe text, linking only remembered wordings',
		{
			text: {
				value: '<recipe text>',
				description: 'The recipe as written: name, ingredient lines, method. Use \\n for newlines',
				required: true,
			},
			name: { value: '<name>', description: 'The recipe name, when the text doesn’t start with it' },
			source: { value: '<url or label>', description: 'Where the recipe came from' },
			rating: { value: '<1-5>', description: 'A rating, only if the user gave one' },
		},
		json(async (params) => {
			const given = optional(params.text);
			const text = given === undefined ? undefined : unescape(given);
			if (!text?.trim()) throw new Error('Give text=<recipe text>.');
			const notes = plugin.store.notes();
			const { draft, lines, warnings } = draftFromText(text, notes, {
				name: optional(params.name),
				source: optional(params.source),
				rating: optional(params.rating),
			});
			const duplicates = duplicateRecipes(draft.name, notes).map((note) => note.path);
			const file = await plugin.store.create(draft);
			return {
				path: file.path,
				name: draft.name,
				...(duplicates.length ? { duplicates } : {}),
				...(warnings.length ? { warnings } : {}),
				lines: lines.map((line, index) => ({
					line: index + 1,
					text: line.text,
					...(line.link
						? { link: line.link.path, remembered: true }
						: { link: null, suggestions: line.suggestions.map(brief) }),
				})),
			};
		}),
	);
	register(
		'cocktail-cabinet:link-line',
		'Link an unlinked ingredient line in a recipe to an ingredient note',
		{
			path: { value: '<path>', description: 'The recipe note', required: true },
			line: {
				value: '<n>',
				description: 'The ingredient’s position in the Ingredients list, from 1, as create-recipe reports it',
				required: true,
			},
			target: { value: '<path or name>', description: 'The ingredient note to link', required: true },
			text: { value: '<text>', description: 'The link text; the recipe’s wording by default' },
			remember: { description: 'Also remember the wording for the note (cc-written-as)' },
		},
		json(async (params) => {
			const path = notePath(params.path, 'path');
			if (!plugin.store.notes().some((note) => note.path === path && note.kind === 'recipe'))
				throw new Error(`${path} isn’t a cabinet recipe.`);
			const number = Number(optional(params.line));
			if (!Number.isInteger(number) || number < 1)
				throw new Error('Give line=<n>, the ingredient’s position in the Ingredients list, from 1.');
			const targetPath = notePath(params.target, 'target');
			const target = plugin.store.notes().find((note) => note.path === targetPath && note.kind !== 'recipe');
			if (!target) throw new Error(`${targetPath} isn’t an ingredient note.`);
			const file = plugin.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error(`Couldn’t find ${path}.`);
			// By position in the list, which the plugin's own frontmatter updates don't shift.
			const entry = ingredientLines(await plugin.app.vault.read(file))[number - 1];
			if (!entry) throw new Error(`The Ingredients list has no line ${number}.`);
			if (/\[\[/.test(entry.raw)) throw new Error(`Line ${number} is already linked.`);
			const { wording } = ingredientParts(entry.text);
			const text = optional(params.text) ?? wording;
			const error = linkTextError(text);
			if (error) throw new Error(error);
			await links.linkLine({ path, line: entry.line, raw: entry.raw, text }, target.path);
			const remembered =
				params.remember === 'true' && canRemember(wording, target)
					? await plugin.store.rememberWording(target.path, wording)
					: false;
			const after = (await plugin.app.vault.read(file)).split('\n')[entry.line]?.trim() ?? '';
			return {
				path,
				line: number,
				text: after.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''),
				link: target.path,
				remembered,
			};
		}),
	);
}
