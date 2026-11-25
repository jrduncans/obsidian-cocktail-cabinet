import { ItemView, Notice, Setting, TFile, debounce, setIcon } from 'obsidian';
import { openView, viewLink } from './view-leaves';
import type { WorkspaceLeaf } from 'obsidian';
import { lineStatus, recipeSections, recipeTags, STATUS_LABELS, toBuy } from '../core/availability-lists';
import type { RecipeEntry } from '../core/availability-lists';
import type { RecipeStatus } from '../core/availability';
import { PROP, RATING_MAX } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import type CocktailCabinetPlugin from '../main';
import type { CabinetAvailability } from '../vault/availability-store';
import { NotePicker } from './picker';

export const AVAILABILITY_VIEW = 'cocktail-cabinet-availability';

/** Sections open until toggled: the ones you can act on now. */
const OPEN_BY_DEFAULT: readonly RecipeStatus[] = ['can-make', 'substitute'];

/**
 * What can I make? A side pane of recipes by availability, with filters, and what to buy. Recipes open
 * in the main area beside it. It refreshes when cabinet notes change, a second after the last change.
 */
export class AvailabilityView extends ItemView {
	private data?: CabinetAvailability;
	private tab: 'recipes' | 'buy' = 'recipes';
	private uses?: string;
	private minRating = 0;
	private tag = '';
	private openSections = new Set<RecipeStatus>(OPEN_BY_DEFAULT);
	private error = '';

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CocktailCabinetPlugin,
	) {
		super(leaf);
	}

	getViewType() {
		return AVAILABILITY_VIEW;
	}
	getDisplayText() {
		return 'What can I make?';
	}
	getIcon() {
		return 'list-checks';
	}

	async onOpen() {
		this.contentEl.addClass('cocktail-cabinet-pane');
		const refresh = debounce(() => void this.refresh(), 1000, true);
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (file.path.startsWith(`${this.plugin.store.root}/`)) refresh();
			}),
		);
		this.registerEvent(this.app.vault.on('rename', () => refresh()));
		this.registerEvent(this.app.vault.on('delete', () => refresh()));
		await this.refresh();
	}

	/** Show recipes using a note (a bottle, type, family…), or every recipe. */
	setUses(path: string | undefined) {
		this.uses = path;
		this.tab = 'recipes';
		this.render();
	}

	private async refresh() {
		try {
			this.data = await this.plugin.availability.all();
			this.error = '';
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Couldn’t check the cabinet.';
		}
		this.render();
	}

	private name = (path: string) => this.data?.notes.find((note) => note.path === path)?.name ?? path;

	private render() {
		const el = this.contentEl;
		el.empty();
		if (this.error) {
			el.createEl('p', { cls: 'cocktail-cabinet-error', text: this.error });
			return;
		}
		if (!this.data) {
			el.createEl('p', { text: 'Checking…' });
			return;
		}
		const tabs = el.createDiv({ cls: 'cocktail-cabinet-pane-tabs', attr: { role: 'tablist' } });
		for (const [id, text] of [
			['recipes', 'Recipes'],
			['buy', 'To buy'],
		] as const) {
			const button = tabs.createEl('button', {
				text,
				attr: { role: 'tab', 'aria-selected': String(this.tab === id) },
			});
			button.toggleClass('is-active', this.tab === id);
			button.addEventListener('click', () => {
				this.tab = id;
				this.render();
			});
		}
		if (this.tab === 'recipes') this.renderRecipes(el, this.data);
		else this.renderBuy(el, this.data);
	}

	private renderRecipes(el: HTMLElement, data: CabinetAvailability) {
		const filters = el.createDiv({ cls: 'cocktail-cabinet-pane-filters' });
		new Setting(filters).setName('Uses').then((setting) => {
			if (this.uses) {
				setting.setDesc(this.name(this.uses));
				setting.addExtraButton((button) =>
					button
						.setIcon('x')
						.setTooltip('Show every recipe')
						.onClick(() => this.setUses(undefined)),
				);
			}
			setting.addButton((button) =>
				button.setButtonText(this.uses ? 'Change…' : 'Choose…').onClick(() => {
					const choices = data.notes.filter((note) => note.kind !== 'recipe');
					new NotePicker(this.app, choices, (note) => this.setUses(note.path)).open();
				}),
			);
		});
		new Setting(filters).setName('Rating').addDropdown((dropdown) => {
			dropdown.addOption('0', 'Any');
			for (let stars = 1; stars <= RATING_MAX; stars++)
				dropdown.addOption(
					String(stars),
					stars === RATING_MAX ? '★'.repeat(stars) : `${'★'.repeat(stars)} or more`,
				);
			dropdown.setValue(String(this.minRating)).onChange((value) => {
				this.minRating = Number(value);
				this.render();
			});
		});
		const tags = recipeTags(data.recipes);
		if (tags.length)
			new Setting(filters).setName('Tag').addDropdown((dropdown) => {
				dropdown.addOption('', 'Any');
				for (const tag of tags) dropdown.addOption(tag, `#${tag}`);
				dropdown.setValue(this.tag).onChange((value) => {
					this.tag = value;
					this.render();
				});
			});
		const sections = recipeSections(data.recipes, data.notes, {
			...(this.uses ? { uses: this.uses } : {}),
			...(this.minRating ? { minRating: this.minRating } : {}),
			...(this.tag ? { tag: this.tag } : {}),
		});
		for (const { status, recipes } of sections) {
			const details = el.createEl('details', { cls: 'cocktail-cabinet-pane-section' });
			details.open = this.openSections.has(status) && recipes.length > 0;
			details.createEl('summary', { text: `${STATUS_LABELS[status]} (${recipes.length})` });
			const list = details.createEl('ul');
			// Long sections render when first opened.
			const fill = () => {
				if (list.childElementCount) return;
				for (const recipe of recipes) this.recipeRow(list, recipe);
			};
			if (details.open) fill();
			details.addEventListener('toggle', () => {
				if (details.open) {
					this.openSections.add(status);
					fill();
				} else this.openSections.delete(status);
			});
		}
	}

	private recipeRow(list: HTMLElement, recipe: RecipeEntry) {
		const item = list.createEl('li');
		const head = item.createDiv({ cls: 'cocktail-cabinet-pane-row' });
		this.noteLink(head, recipe.path, recipe.name);
		if (recipe.rating) head.createSpan({ cls: 'cocktail-cabinet-pane-stars', text: '★'.repeat(recipe.rating) });
		// Unlinked garnishes are common and harmless; the recipe's own check still lists them.
		const caveats = recipe.availability.lines.filter(
			(line) => line.state !== 'have' && !(line.garnish && line.state === 'unlinked'),
		);
		if (caveats.length)
			item.createDiv({
				cls: 'cocktail-cabinet-pane-caveats',
				text: caveats.map((line) => lineStatus(line, this.name)).join(' · '),
			});
	}

	private renderBuy(el: HTMLElement, data: CabinetAvailability) {
		el.createEl('p', {
			cls: 'setting-item-description',
			text: 'What’s missing, by how many recipes buying it alone would let you make.',
		});
		const items = toBuy(data.recipes).filter((item) => item.unlocks.length || item.closer.length);
		const recipeNames = new Map(data.recipes.map((entry) => [entry.path, entry.name]));
		const list = el.createEl('ul', { cls: 'cocktail-cabinet-pane-buy' });
		for (const item of items.slice(0, 100)) {
			const row = list.createEl('li');
			const head = row.createDiv({ cls: 'cocktail-cabinet-pane-row' });
			item.targets.forEach((path, index) => {
				if (index) head.appendText(' or ');
				this.noteLink(head, path, this.name(path));
			});
			for (const path of item.targets) this.shoppingButton(head, path, item.targets.length > 1);
			const detail = row.createDiv({ cls: 'cocktail-cabinet-pane-caveats' });
			if (item.unlocks.length) {
				detail.appendText(`Unlocks ${item.unlocks.length}: `);
				item.unlocks.forEach((path, index) => {
					if (index) detail.appendText(', ');
					this.noteLink(detail, path, recipeNames.get(path) ?? path);
				});
			}
			if (item.closer.length)
				detail.appendText(`${item.unlocks.length ? '. ' : ''}${item.closer.length} more closer.`);
		}
		if (!items.length) el.createEl('p', { text: 'Nothing missing.' });
	}

	/** Mark a note for purchase; never removes a flag, since the shopping list is where that's done. */
	private shoppingButton(el: HTMLElement, path: string, named: boolean) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const flagged = this.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.shoppingList] === true;
		const label = flagged
			? 'On shopping list'
			: named
				? `Add ${this.name(path)} to shopping list`
				: 'Add to shopping list';
		const button = el.createEl('button', {
			cls: 'clickable-icon cocktail-cabinet-pane-shop',
			attr: { 'aria-label': label },
		});
		setIcon(button, flagged ? 'shopping-cart' : 'list-plus');
		button.disabled = flagged;
		button.addEventListener('click', () => {
			void this.app.fileManager
				.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
					frontmatter[PROP.shoppingList] = true;
				})
				.then(() => new Notice(`Added ${this.name(path)} to the shopping list.`))
				.catch(
					(error: unknown) =>
						new Notice(error instanceof Error ? error.message : 'Couldn’t update the shopping list.'),
				);
		});
	}

	/** A link that opens the note beside the pane, or a new tab with Ctrl or Cmd. */
	private noteLink(el: HTMLElement, path: string, text: string) {
		viewLink(this, el, path, text);
	}
}

/** Open the pane as a main-area tab, reusing one already open; optionally filtered to recipes using a note. */
export async function openAvailability(plugin: CocktailCabinetPlugin, uses?: CabinetNote): Promise<void> {
	const leaf = await openView(plugin, AVAILABILITY_VIEW);
	if (leaf.view instanceof AvailabilityView) leaf.view.setUses(uses?.path);
}
