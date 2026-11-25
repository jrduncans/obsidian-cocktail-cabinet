import { ButtonComponent, ItemView, Menu, Notice, Setting } from 'obsidian';
import { openView, viewLink } from './view-leaves';
import type { WorkspaceLeaf } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { suggestIngredient } from '../core/recipe-import';
import { ingredientParts, linkedLinePreview, linkTextError } from '../core/unlinked-lines';
import type { UnlinkedGroup, UnlinkedUse } from '../core/unlinked-lines';
import { RecipeLinkStore } from '../vault/recipe-links';
import { addCreateItems, pickIngredient } from './link-choice';
import { rememberAfterLink, renderLinkText, renderPreview, renderRemember } from './link-text';
import { defaultLinkSource, wordingLink } from '../core/link-text';
import type { LinkTextSource } from '../core/link-text';
import { rememberedNote } from '../core/written-as';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const recipeCount = (group: UnlinkedGroup) => new Set(group.uses.map((use) => use.recipe.path)).size;

export const UNLINKED_VIEW = 'cocktail-cabinet-unlinked';

/**
 * Reviewable unlinked lines across recipes, linked in bulk by wording. A side pane, so each recipe opens
 * in the main area beside it. It reads the recipes when opened and on Refresh, not on every change, so
 * choices in progress aren't lost; linking checks each line against what was read.
 */
export class UnlinkedView extends ItemView {
	private links: RecipeLinkStore;
	private groups: UnlinkedGroup[] = [];
	private filter = '';
	private showGarnishes = false;
	private busy = false;
	private closed = false;
	private summaryEl!: HTMLElement;
	private listEl!: HTMLElement;
	/**
	 * The note chosen for a wording, the lines (by index into its uses) still ticked, and the link text:
	 * the cabinet name (keeping other words beside it, line by line), each line's own wording, or typed.
	 */
	private pending = new Map<
		string,
		{
			note: CabinetNote;
			ticked: Set<number>;
			source: LinkTextSource;
			text: string;
			remembered?: boolean;
			remember?: boolean;
		}
	>();

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CocktailCabinetPlugin,
	) {
		super(leaf);
		this.links = new RecipeLinkStore(plugin.app, plugin.store);
	}

	getViewType() {
		return UNLINKED_VIEW;
	}
	getDisplayText() {
		return 'Unlinked ingredients';
	}
	getIcon() {
		return 'unlink';
	}

	async onOpen() {
		this.contentEl.addClass('cocktail-cabinet-pane', 'cocktail-cabinet-form', 'cocktail-cabinet-unlinked-pane');
		this.contentEl.createEl('p', { text: 'Loading…' });
		// A pane restored with the workspace waits for the vault to be indexed.
		this.app.workspace.onLayoutReady(() => void this.read());
		return Promise.resolve();
	}

	async onClose() {
		this.closed = true;
		this.contentEl.empty();
		return Promise.resolve();
	}

	/** Read the recipes again, dropping choices not yet linked. */
	reload() {
		if (this.busy) return;
		this.pending.clear();
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: 'Loading…' });
		void this.read();
	}

	private async read() {
		try {
			if (!(await this.plugin.store.isSetUp())) {
				if (!this.closed) this.contentEl.setText('The cabinet isn’t set up yet.');
				return;
			}
			this.groups = await this.links.unlinked({ includeGarnishes: this.showGarnishes });
			if (this.closed) return;
			// A wording one note remembers starts chosen; nothing is written until Link.
			const notes = this.plugin.store.notes();
			for (const group of this.groups) {
				const note = rememberedNote(group.wording, notes);
				if (note && !this.pending.has(group.key))
					this.pending.set(group.key, {
						note,
						ticked: new Set(group.uses.map((_use, index) => index)),
						source: 'original',
						text: group.wording,
						remembered: true,
					});
			}
			this.render();
		} catch (error) {
			if (!this.closed)
				this.contentEl.setText(error instanceof Error ? error.message : 'Couldn’t read the recipes.');
		}
	}

	private render() {
		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: 'cocktail-cabinet-pane-row' });
		this.summaryEl = header.createEl('p');
		new ButtonComponent(header)
			.setIcon('refresh-cw')
			.setTooltip('Read the recipes again')
			.setClass('cocktail-cabinet-pane-shop')
			.onClick(() => this.reload());
		new Setting(this.contentEl).setName('Filter').addText((text) => {
			text.setPlaceholder('Wording, such as gin')
				.setValue(this.filter)
				.onChange((value) => {
					this.filter = value.trim().toLowerCase();
					this.renderList();
				});
			text.inputEl.setAttribute('aria-label', 'Filter wordings');
		});
		new Setting(this.contentEl)
			.setName('Show garnishes')
			.setDesc('Include marked garnishes that match an ingredient.')
			.addToggle((toggle) => {
				toggle.setValue(this.showGarnishes).onChange((value) => {
					if (this.busy) {
						toggle.setValue(this.showGarnishes);
						return;
					}
					this.showGarnishes = value;
					this.reload();
				});
			});
		this.listEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-unlinked' });
		this.renderList();
	}

	private renderSummary() {
		const lines = this.groups.reduce((sum, group) => sum + group.uses.length, 0);
		const recipes = new Set(this.groups.flatMap((group) => group.uses.map((use) => use.recipe.path))).size;
		this.summaryEl.setText(
			lines
				? `${plural(lines, 'unlinked ingredient line')} in ${plural(recipes, 'recipe')}. Linking a wording links it in every recipe listed; untick any that mean something else.`
				: 'No unlinked ingredients to review.',
		);
	}

	private renderList() {
		this.renderSummary();
		this.listEl.empty();
		const shown = this.groups.filter((group) => !this.filter || group.key.includes(this.filter));
		for (const group of shown)
			this.renderGroup(this.listEl.createDiv({ cls: 'cocktail-cabinet-unlinked-group' }), group);
		if (this.groups.length && !shown.length) this.listEl.createEl('p', { text: 'No wordings match.' });
	}

	private renderGroup(el: HTMLElement, group: UnlinkedGroup) {
		el.empty();
		const recipes = recipeCount(group);
		const row = new Setting(el).setName(group.wording);
		const pending = this.pending.get(group.key);
		if (recipes === 1) this.recipeLink(row.descEl, group.uses[0]!.recipe);
		else
			row.setDesc(
				`${plural(recipes, 'recipe')}${group.uses.length > recipes ? `, ${group.uses.length} lines` : ''}`,
			);
		const choose = (note: CabinetNote) => {
			const source = defaultLinkSource(group.wording, note, this.plugin.settings.linkText);
			this.pending.set(group.key, {
				note,
				ticked: new Set(group.uses.map((_use, index) => index)),
				source,
				text: source === 'name' ? note.name : group.wording,
			});
			this.renderGroup(el, group);
		};
		if (!pending) {
			const suggested = suggestIngredient(group.wording, this.plugin.store.notes());
			const suggestions = suggested.length ? el.createDiv({ cls: 'cocktail-cabinet-suggestions' }) : el;
			for (const note of suggested) {
				new ButtonComponent(suggestions)
					.setButtonText(`${note.name} · ${note.kind}`)
					.setTooltip(`Link to ${note.path}`)
					.onClick(() => choose(note));
			}
			row.addButton((button) =>
				button.setButtonText('Select link').onClick(() => pickIngredient(this.plugin, choose)),
			);
			row.addButton((button) =>
				button.setButtonText('Create…').onClick((event) => {
					const menu = new Menu();
					addCreateItems(menu, this.plugin, group.wording, choose);
					menu.showAtMouseEvent(event);
				}),
			);
			return;
		}
		row.setDesc(
			`Link to ${pending.note.name} (${pending.note.kind}) in the ticked recipes${pending.remembered ? ', from a remembered wording' : ''}.`,
		);
		let linkButton!: ButtonComponent;
		const textError = () => (pending.source === 'typed' ? linkTextError(pending.text) : '');
		const lineLink = (use: UnlinkedUse) => this.lineLink(use, pending);
		const update = () => {
			const count = new Set([...pending.ticked].map((index) => group.uses[index]!.recipe.path)).size;
			linkButton
				.setButtonText(`Link in ${plural(count, 'recipe')}`)
				.setDisabled(this.busy || !count || !!textError());
			errorEl.setText(textError());
		};
		renderLinkText(el, {
			name: pending.note.name,
			original: group.wording,
			originalLabel: 'Recipe wording',
			text: pending.text,
			source: pending.source,
			desc: (source) =>
				source === 'original'
					? 'Each recipe keeps its own wording.'
					: source === 'name'
						? 'Other words in a line stay beside the link.'
						: 'Every ticked line shows this text.',
			onChange: (text, source) => {
				pending.source = source;
				pending.text = text;
				renderUses();
				update();
			},
		});
		if (!pending.remembered)
			renderRemember(el, group.wording, pending.note, !!pending.remember, (value) => {
				pending.remember = value;
			});
		const errorEl = el.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		const list = el.createEl('ul', { cls: 'cocktail-cabinet-unlinked-uses' });
		const renderUses = () => {
			list.empty();
			group.uses.forEach((use, index) => {
				const item = list.createEl('li');
				const box = item.createEl('input', {
					type: 'checkbox',
					attr: { 'aria-label': `Link in ${use.recipe.name}` },
				});
				box.checked = pending.ticked.has(index);
				box.addEventListener('change', () => {
					if (box.checked) pending.ticked.add(index);
					else pending.ticked.delete(index);
					update();
				});
				item.appendText(' ');
				this.recipeLink(item, use.recipe);
				item.appendText(': ');
				renderPreview(item.createSpan(), linkedLinePreview(use.text, lineLink(use)));
			});
		};
		renderUses();
		new Setting(el)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => {
					this.pending.delete(group.key);
					this.renderGroup(el, group);
				}),
			)
			.addButton((button) => {
				linkButton = button.setCta().onClick(() => void this.link(el, group));
			});
		update();
	}

	/** A line linked as chosen for its group. */
	private lineLink(use: UnlinkedUse, pending: { note: CabinetNote; source: LinkTextSource; text: string }) {
		return wordingLink(ingredientParts(use.text).wording, pending.note, pending.source, pending.text);
	}

	/** A recipe's name that opens it beside the review, or a new tab with Ctrl or Cmd. */
	private recipeLink(el: HTMLElement, recipe: { name: string; path: string }) {
		viewLink(this, el, recipe.path, recipe.name, 'cocktail-cabinet-unlinked-recipe');
	}

	private async link(el: HTMLElement, group: UnlinkedGroup) {
		const pending = this.pending.get(group.key);
		if (!pending || this.busy) return;
		this.busy = true;
		const chosen = group.uses.filter((_use, index) => pending.ticked.has(index));
		try {
			const text = pending.source === 'original' ? undefined : pending.text;
			const result = await this.links.linkMany(
				chosen.map((use) => ({
					path: use.recipe.path,
					line: use.line,
					raw: use.raw,
					text: this.lineLink(use, pending),
				})),
				pending.note.path,
			);
			const failed = new Set(result.failed.map((item) => item.path));
			const linked = chosen.filter((use) => !failed.has(use.recipe.path));
			group.uses = group.uses.filter((use) => !linked.includes(use));
			new Notice(
				`Linked ${group.wording} to ${pending.note.name}${text === undefined || text === group.wording ? '' : `, shown as ${text},`} in ${plural(result.linked, 'recipe')}.` +
					(result.failed.length
						? ` Not linked: ${result.failed.map((item) => (item.changed ? `${item.name} (changed since this list was read)` : item.name)).join(', ')}.`
						: ''),
				result.failed.length ? 0 : undefined,
			);
			if (pending.remember && result.linked) await rememberAfterLink(this.plugin, pending.note, group.wording);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Couldn’t link the recipes.');
		} finally {
			this.busy = false;
			this.pending.delete(group.key);
		}
		if (this.closed) return;
		if (!group.uses.length) {
			this.groups = this.groups.filter((item) => item !== group);
			el.remove();
			this.renderSummary();
		} else {
			this.renderSummary();
			this.renderGroup(el, group);
		}
	}
}

/** Open the review as a main-area tab, reusing one already open. */
export async function openUnlinked(plugin: CocktailCabinetPlugin): Promise<void> {
	await openView(plugin, UNLINKED_VIEW);
}
