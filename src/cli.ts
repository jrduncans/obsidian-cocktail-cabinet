import { TFile } from 'obsidian';
import type { CliData } from 'obsidian';
import type CocktailCabinetPlugin from './main';
import { canMakeReport, makeableReport, parseListFlags, toBuyReport } from './core/availability-report';
import { RECIPE_STATUSES } from './core/availability';
import { AvailabilityStore } from './vault/availability-store';

/**
 * Read-only availability commands for agents, through the official `obsidian` CLI (Obsidian 1.12.2).
 * Mobile has no CLI, so they never run there.
 */
export function registerCli(plugin: CocktailCabinetPlugin) {
	const register = plugin.registerCliHandler.bind(plugin);
	const store = new AvailabilityStore(plugin.app, plugin.store, () => ({
		percent: plugin.settings.lowStockPercent,
		ml: plugin.settings.lowStockMl,
	}));
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
}
