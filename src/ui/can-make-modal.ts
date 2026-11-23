import { Modal, Notice, Setting } from 'obsidian';
import { lineStatus, statusText, stockToFix } from '../core/availability-lists';
import type { RecipeEntry } from '../core/availability-lists';
import type { LineAvailability } from '../core/availability';
import type { CabinetNote } from '../core/schema';
import { ingredientParts, linkedLinePreview, plainIngredient } from '../core/unlinked-lines';
import type CocktailCabinetPlugin from '../main';
import type { AvailabilityStore } from '../vault/availability-store';
import type { RecipeLinkStore } from '../vault/recipe-links';
import type { StockStore } from '../vault/stock-store';
import { EditStockModal } from './edit-stock-modal';
import { showLinkMenu } from './link-choice';
import { LinkTextModal } from './link-text';
import { defaultLinkSource, wordingLink } from '../core/link-text';

/** Can I make this? Each Ingredients line's availability, with the fixes at hand: Edit stock, Link…, and Log. */
export class CanMakeModal extends Modal {
	private notes: CabinetNote[] = [];
	private recipe?: RecipeEntry;
	private notice = '';
	private closed = false;

	constructor(
		private plugin: CocktailCabinetPlugin,
		private availability: AvailabilityStore,
		private stocks: StockStore,
		private links: RecipeLinkStore,
		private note: CabinetNote,
		private log: (recipe: CabinetNote) => void,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.titleEl.setText(this.note.name);
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Checking…' });
		void this.reload(false);
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}

	/** After an edit, read the files: the metadata cache lags behind writes. */
	private async reload(fresh: boolean, notice = '') {
		try {
			const { notes, recipe } = await this.availability.recipe(this.note.path, fresh);
			if (this.closed) return;
			this.notes = notes;
			this.recipe = recipe;
			this.notice = notice;
			this.render();
		} catch (error) {
			if (!this.closed)
				this.contentEl.setText(error instanceof Error ? error.message : 'Couldn’t check this recipe.');
		}
	}

	private name = (path: string) => this.notes.find((note) => note.path === path)?.name ?? path;

	private render() {
		const recipe = this.recipe!;
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			cls: 'cocktail-cabinet-check-status',
			attr: { role: 'status' },
			text: statusText(recipe.availability),
		});
		this.contentEl.createEl('p', { cls: 'cocktail-cabinet-log-notice', text: this.notice });
		const table = this.contentEl.createEl('table', { cls: 'cocktail-cabinet-log-preview' });
		const body = table.createEl('tbody');
		for (const line of recipe.availability.lines) {
			const row = body.createEl('tr', { cls: `cocktail-cabinet-check-${line.state}` });
			// A marked garnish already says so ("Garnish: …", "… to garnish").
			row.createEl('td', { cls: 'cocktail-cabinet-log-line', text: plainIngredient(line.text) });
			row.createEl('td', { cls: 'cocktail-cabinet-log-line', text: lineStatus(line, this.name) });
			this.actions(row.createEl('td'), line);
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText('Log this cocktail')
					.setCta()
					.onClick(() => {
						this.close();
						this.log(this.note);
					}),
			)
			.addButton((button) => button.setButtonText('Close').onClick(() => this.close()));
	}

	private actions(cell: HTMLElement, line: LineAvailability) {
		const button = (text: string, label: string, click: (event: MouseEvent) => void) =>
			cell
				.createEl('button', { cls: 'cocktail-cabinet-log-link', text, attr: { 'aria-label': label } })
				.addEventListener('click', click);
		const paths = stockToFix(line);
		for (const path of paths)
			button(
				paths.length === 1 ? 'Edit stock' : `Edit ${this.name(path)}`,
				`Edit stock of ${this.name(path)}`,
				() => this.editStock(path),
			);
		if (line.state === 'unlinked' && line.at)
			button('Link…', `Link ${plainIngredient(line.text)}`, (event) => this.linkLine(line, event));
	}

	private editStock(path: string) {
		const note = this.notes.find((item) => item.path === path);
		if (!note) return;
		void (async () => {
			try {
				new EditStockModal(this.app, this.stocks, note, await this.stocks.read(note), () => {
					void this.reload(true);
				}).open();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : 'Couldn’t open the stock.');
			}
		})();
	}

	/** Link the line in the recipe, as logging does, then check again. */
	private linkLine(line: LineAvailability, event: MouseEvent) {
		const at = line.at!;
		const wording = ingredientParts(line.text).wording;
		showLinkMenu(this.plugin, event, wording, (note) => {
			if (this.closed) return;
			new LinkTextModal(this.plugin, {
				note,
				original: wording,
				originalLabel: 'Recipe wording',
				remember: wording,
				source: defaultLinkSource(wording, note, this.plugin.settings.linkText),
				preview: (text, source) => linkedLinePreview(line.text, wordingLink(wording, note, source, text)),
				submit: async (typed, source) => {
					const text = wordingLink(wording, note, source, typed);
					if (this.closed) return;
					try {
						await this.links.linkLine(
							{ path: this.note.path, line: at.line, raw: at.raw, text },
							note.path,
						);
						await this.reload(true, `Linked ${wording} to ${note.name}.`);
					} catch (error) {
						await this.reload(true, error instanceof Error ? error.message : 'Couldn’t link the line.');
					}
				},
			}).open();
		});
	}
}
