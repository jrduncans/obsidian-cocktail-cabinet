import { ButtonComponent, Menu, Modal, Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { suggestIngredient } from '../core/recipe-import';
import { ingredientParts, linkedLinePreview, linkTextError } from '../core/unlinked-lines';
import type { UnlinkedGroup } from '../core/unlinked-lines';
import type { RecipeLinkStore } from '../vault/recipe-links';
import { addCreateItems, pickIngredient } from './link-choice';
import { renderLinkText, renderPreview } from './link-text';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const recipeCount = (group: UnlinkedGroup) => new Set(group.uses.map((use) => use.recipe.path)).size;

/** Reviewable unlinked lines across recipes, linked in bulk by wording. */
export class UnlinkedModal extends Modal {
	private groups: UnlinkedGroup[] = [];
	private filter = '';
	private showGarnishes = false;
	private busy = false;
	private closed = false;
	private summaryEl!: HTMLElement;
	private listEl!: HTMLElement;
	/** The note chosen for a wording, the lines (by index into its uses) still ticked, and the link text (null: each line's own wording). */
	private pending = new Map<string, { note: CabinetNote; ticked: Set<number>; text: string | null }>();

	constructor(
		private plugin: CocktailCabinetPlugin,
		private links: RecipeLinkStore,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.titleEl.setText('Unlinked ingredients');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Loading…' });
		void this.load();
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}

	private async load() {
		try {
			this.groups = await this.links.unlinked({ includeGarnishes: this.showGarnishes });
			if (this.closed) return;
			this.render();
		} catch (error) {
			if (!this.closed)
				this.contentEl.setText(error instanceof Error ? error.message : 'Couldn’t read the recipes.');
		}
	}

	private render() {
		this.contentEl.empty();
		this.summaryEl = this.contentEl.createEl('p');
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
					this.pending.clear();
					this.contentEl.empty();
					this.contentEl.createEl('p', { text: 'Loading…' });
					void this.load();
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
		const desc =
			recipes === 1
				? group.uses[0]!.recipe.name
				: `${plural(recipes, 'recipe')}${group.uses.length > recipes ? `, ${group.uses.length} lines` : ''}`;
		const row = new Setting(el).setName(group.wording).setDesc(desc);
		const pending = this.pending.get(group.key);
		const choose = (note: CabinetNote) => {
			this.pending.set(group.key, { note, ticked: new Set(group.uses.map((_use, index) => index)), text: null });
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
		row.setDesc(`Link to ${pending.note.name} (${pending.note.kind}) in the ticked recipes.`);
		let linkButton!: ButtonComponent;
		const textError = () => (pending.text === null ? '' : linkTextError(pending.text));
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
			text: pending.text ?? group.wording,
			source: pending.text === null ? 'original' : pending.text === pending.note.name ? 'name' : 'typed',
			desc: (source) =>
				source === 'original' ? 'Each recipe keeps its own wording.' : 'Every ticked line shows this text.',
			onChange: (text, source) => {
				pending.text = source === 'original' ? null : text;
				renderUses();
				update();
			},
		});
		const errorEl = el.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		const list = el.createEl('ul', { cls: 'cocktail-cabinet-unlinked-uses' });
		const renderUses = () => {
			list.empty();
			group.uses.forEach((use, index) => {
				const label = list.createEl('li').createEl('label');
				const box = label.createEl('input', { type: 'checkbox' });
				box.checked = pending.ticked.has(index);
				box.addEventListener('change', () => {
					if (box.checked) pending.ticked.add(index);
					else pending.ticked.delete(index);
					update();
				});
				label.createSpan({ cls: 'cocktail-cabinet-unlinked-recipe', text: ` ${use.recipe.name}: ` });
				renderPreview(
					label.createSpan(),
					linkedLinePreview(use.text, pending.text ?? ingredientParts(use.text).wording),
				);
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

	private async link(el: HTMLElement, group: UnlinkedGroup) {
		const pending = this.pending.get(group.key);
		if (!pending || this.busy) return;
		this.busy = true;
		const chosen = group.uses.filter((_use, index) => pending.ticked.has(index));
		try {
			const text = pending.text ?? undefined;
			const result = await this.links.linkMany(
				chosen.map((use) => ({ path: use.recipe.path, line: use.line, raw: use.raw, text })),
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
