import { ButtonComponent, DropdownComponent, ExtraButtonComponent, ItemView, debounce } from 'obsidian';
import { openView, toolbarItem, viewLink } from './view-leaves';
import type { WorkspaceLeaf } from 'obsidian';
import { lineStatus, recipeSections, recipeTags, STATUS_LABELS } from '../core/availability-lists';
import type { RecipeEntry } from '../core/availability-lists';
import type { RecipeStatus } from '../core/availability';
import { RATING_MAX } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import type CocktailCabinetPlugin from '../main';
import type { CabinetAvailability } from '../vault/availability-store';
import { NotePicker } from './picker';

export const AVAILABILITY_VIEW = 'cocktail-cabinet-availability';

/** Sections open until toggled: the ones you can act on now. */
const OPEN_BY_DEFAULT: readonly RecipeStatus[] = ['can-make', 'substitute'];

/**
 * What the availability views share: the cabinet's availability, read when opened and again a second
 * after cabinet notes change, and links that open beside the view. See docs/availability.md.
 */
export abstract class AvailabilityBase extends ItemView {
	protected data?: CabinetAvailability;
	private error = '';

	constructor(
		leaf: WorkspaceLeaf,
		protected plugin: CocktailCabinetPlugin,
	) {
		super(leaf);
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

	private async refresh() {
		try {
			this.data = await this.plugin.availability.all();
			this.error = '';
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Couldn’t check the cabinet.';
		}
		this.render();
	}

	protected name = (path: string) => this.data?.notes.find((note) => note.path === path)?.name ?? path;

	protected render() {
		const el = this.contentEl;
		el.empty();
		if (this.error) el.createEl('p', { cls: 'cocktail-cabinet-error', text: this.error });
		else if (!this.data) el.createEl('p', { text: 'Checking…' });
		else this.renderData(el, this.data);
	}

	protected abstract renderData(el: HTMLElement, data: CabinetAvailability): void;

	/** A link that opens the note beside the view, or a new tab with Ctrl or Cmd. */
	protected noteLink(el: HTMLElement, path: string, text: string) {
		viewLink(this, el, path, text);
	}
}

/** What can I make? Recipes by availability, with filters, in a main-area tab. */
export class AvailabilityView extends AvailabilityBase {
	private uses?: string;
	private minRating = 0;
	private tag = '';
	private openSections = new Set<RecipeStatus>(OPEN_BY_DEFAULT);

	getViewType() {
		return AVAILABILITY_VIEW;
	}
	getDisplayText() {
		return 'What can I make?';
	}
	getIcon() {
		return 'list-checks';
	}

	/** Show recipes using a note (a bottle, type, family…), or every recipe. */
	setUses(path: string | undefined) {
		this.uses = path;
		this.render();
	}

	protected renderData(el: HTMLElement, data: CabinetAvailability) {
		// One compact row of filters, styled like the other cabinet views' toolbars.
		const bar = el.createDiv({ cls: 'cocktail-cabinet-pane-toolbar' });
		const uses = toolbarItem(bar, 'Uses');
		new ButtonComponent(uses)
			.setButtonText(this.uses ? this.name(this.uses) : 'Any ingredient…')
			.setTooltip(this.uses ? 'Choose another ingredient' : 'Only recipes that use an ingredient')
			.onClick(() => {
				const choices = data.notes.filter((note) => note.kind !== 'recipe');
				new NotePicker(this.app, choices, (note) => this.setUses(note.path)).open();
			});
		if (this.uses)
			new ExtraButtonComponent(uses)
				.setIcon('x')
				.setTooltip('Show every recipe')
				.onClick(() => this.setUses(undefined));
		const rating = new DropdownComponent(toolbarItem(bar, 'Rating'));
		rating.addOption('0', 'Any');
		for (let stars = 1; stars <= RATING_MAX; stars++)
			rating.addOption(String(stars), stars === RATING_MAX ? '★'.repeat(stars) : `${'★'.repeat(stars)} or more`);
		rating.setValue(String(this.minRating)).onChange((value) => {
			this.minRating = Number(value);
			this.render();
		});
		const tags = recipeTags(data.recipes);
		if (tags.length) {
			const tag = new DropdownComponent(toolbarItem(bar, 'Tag'));
			tag.addOption('', 'Any');
			for (const name of tags) tag.addOption(name, `#${name}`);
			tag.setValue(this.tag).onChange((value) => {
				this.tag = value;
				this.render();
			});
		}
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
}

/** Open the pane as a main-area tab, reusing one already open; optionally filtered to recipes using a note. */
export async function openAvailability(plugin: CocktailCabinetPlugin, uses?: CabinetNote): Promise<void> {
	const leaf = await openView(plugin, AVAILABILITY_VIEW);
	if (leaf.view instanceof AvailabilityView) leaf.view.setUses(uses?.path);
}
