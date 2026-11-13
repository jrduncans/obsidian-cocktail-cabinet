import { Menu, SuggestModal, prepareFuzzySearch } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { IngredientModal } from './ingredient-modal';
import { pickerText } from './picker';
import { StockModal } from './stock-modal';

export const CREATE = [
	['type', 'Ingredient type'],
	['bottle', 'Bottle'],
	['ingredient', 'Other stock'],
	['family', 'Ingredient family'],
	['category', 'Ingredient category'],
] as const;

/** Open the form that creates a cabinet note of `kind`, named `name`, passing the new note to `choose`. */
export function createIngredient(
	plugin: CocktailCabinetPlugin,
	kind: (typeof CREATE)[number][0],
	name: string,
	choose: (note: CabinetNote) => void,
) {
	if (kind === 'bottle' || kind === 'ingredient')
		new StockModal(plugin, kind === 'bottle', { created: choose, name }).open();
	else new IngredientModal(plugin, kind, choose, name).open();
}

/** Menu items for each kind of cabinet note that can be created for an ingredient. */
export function addCreateItems(
	menu: Menu,
	plugin: CocktailCabinetPlugin,
	name: string,
	choose: (note: CabinetNote) => void,
	prefix = '',
) {
	for (const [kind, title] of CREATE)
		menu.addItem((item) =>
			item
				.setTitle(prefix ? `${prefix}${title.toLowerCase()}` : title)
				.onClick(() => createIngredient(plugin, kind, name, choose)),
		);
}

/** Search ingredient notes (anything a recipe can link to), with suggestions for `wording` first. */
export function pickIngredient(plugin: CocktailCabinetPlugin, choose: (note: CabinetNote) => void, wording = '') {
	new LinkPicker(plugin, wording, choose).open();
}

/** Choose what an ingredient's wording links to: name suggestions, any ingredient note, or a new one. */
export function showLinkMenu(
	plugin: CocktailCabinetPlugin,
	event: MouseEvent,
	wording: string,
	choose: (note: CabinetNote) => void,
) {
	const menu = new Menu();
	for (const note of suggestIngredient(wording, plugin.store.notes())) {
		menu.addItem((item) =>
			item
				.setTitle(`${note.name} · ${note.kind}`)
				.setIcon('link')
				.onClick(() => choose(note)),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle('Find an ingredient note…')
			.setIcon('search')
			.onClick(() => pickIngredient(plugin, choose)),
	);
	menu.addSeparator();
	addCreateItems(menu, plugin, wording, choose, 'New ');
	menu.showAtMouseEvent(event);
}

type Choice = { note: CabinetNote; suggested: boolean } | { create: (typeof CREATE)[number]; name: string };

/** Pick what to link to: suggestions for the wording first, any ingredient note by search, or a new one. */
class LinkPicker extends SuggestModal<Choice> {
	constructor(
		private plugin: CocktailCabinetPlugin,
		private wording: string,
		private choose: (note: CabinetNote) => void,
	) {
		super(plugin.app);
		this.setPlaceholder(wording ? `Link “${wording}” to…` : 'Find an ingredient note');
		this.emptyStateText = 'No matching ingredient notes.';
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to choose' },
			{ command: 'esc', purpose: 'to dismiss' },
		]);
	}

	getSuggestions(query: string): Choice[] {
		const q = query.trim();
		const all = this.plugin.store.notes();
		const notes = recipeIngredientNotes(all);
		const create = (name: string): Choice[] => (name ? CREATE.map((create) => ({ create, name })) : []);
		if (!q) {
			// Suggestions, then creating a note named from the wording, then every note to browse.
			const suggested = this.wording ? suggestIngredient(this.wording, all) : [];
			const rest = notes.filter((note) => !suggested.includes(note)).sort((a, b) => a.name.localeCompare(b.name));
			return [
				...suggested.map((note) => ({ note, suggested: true })),
				...create(this.wording),
				...rest.map((note) => ({ note, suggested: false })),
			];
		}
		const search = prepareFuzzySearch(q);
		const found = notes
			.map((note) => ({ note, match: search(pickerText(note)) }))
			.filter((item) => item.match)
			.sort((a, b) => b.match!.score - a.match!.score)
			.slice(0, 50);
		return [...found.map((item) => ({ note: item.note, suggested: false })), ...create(q)];
	}

	renderSuggestion(choice: Choice, el: HTMLElement) {
		if ('note' in choice) {
			const detail = pickerText(choice.note)
				.slice(choice.note.name.length)
				.replace(/^\s*·\s*/, '')
				.trim();
			el.addClass('mod-complex');
			const content = el.createDiv({ cls: 'suggestion-content' });
			content.createDiv({ cls: 'suggestion-title', text: choice.note.name });
			content.createDiv({ cls: 'suggestion-note', text: `${choice.suggested ? 'Suggested · ' : ''}${detail}` });
		} else {
			el.createDiv({ cls: 'suggestion-title', text: `New ${choice.create[1].toLowerCase()}: ${choice.name}` });
		}
	}

	onChooseSuggestion(choice: Choice) {
		if ('note' in choice) this.choose(choice.note);
		else createIngredient(this.plugin, choice.create[0], choice.name, this.choose);
	}
}
