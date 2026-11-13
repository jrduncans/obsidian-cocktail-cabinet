import { Modal, Notice, Setting, TFile } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { MissingAbv, MissingAbvs } from '../vault/recipe-sync';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const KIND: Record<MissingAbv['kind'], string> = { bottle: 'Bottle', type: 'Type', family: 'Family' };

/**
 * **Review missing ABV values**: the bottles, types, and families whose ABV would complete partial alcohol
 * estimates, most recipes first, each with a field to set it. Recipes recalculate on their own.
 */
export class MissingAbvModal extends Modal {
	private closed = false;
	private saved = 0;

	constructor(
		private plugin: CocktailCabinetPlugin,
		private openUnlinked: () => void,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.titleEl.setText('Missing ABV values');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', { text: 'Loading…' });
		void this.plugin.recipes
			.missingAbvs()
			.then((missing) => {
				if (!this.closed) this.render(missing);
			})
			.catch((error: unknown) => {
				if (!this.closed)
					this.contentEl.setText(error instanceof Error ? error.message : 'Couldn’t read the recipes.');
			});
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
		if (this.saved) new Notice(`Saved ${plural(this.saved, 'ABV value')}. Estimates update in a few seconds.`);
	}

	private render({ notes, unlinked }: MissingAbvs) {
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			text: notes.length
				? 'Setting an ABV here completes the alcohol estimates of the recipes that use it. For a type or family, give a representative value; 0 for non-alcoholic.'
				: 'No bottle, type, or family is missing an ABV that recipes need.',
		});
		if (unlinked.length) {
			new Setting(this.contentEl)
				.setName(`${plural(unlinked.length, 'recipe')} with unlinked ingredients`)
				.setDesc('A line with an amount but no link has no known ABV. Link it to an ingredient note.')
				.addButton((button) =>
					button.setButtonText('Review unlinked').onClick(() => {
						this.close();
						this.openUnlinked();
					}),
				);
		}
		for (const note of notes) this.row(note);
	}

	private row(note: MissingAbv) {
		let value = '';
		const setting = new Setting(this.contentEl)
			.setName(note.name)
			.setDesc(`${KIND[note.kind]} · ${plural(note.recipes.length, 'recipe')}`);
		setting.addText((text) => {
			text.inputEl.inputMode = 'decimal';
			text.inputEl.setAttribute('aria-label', `${note.name} ABV (%)`);
			text.inputEl.addClass('cocktail-cabinet-dilution');
			text.setPlaceholder('%').onChange((input) => {
				value = input;
			});
		});
		setting.addButton((button) =>
			button.setButtonText('Save').onClick(async () => {
				const percent = Number(value.trim().replace(/%$/, ''));
				if (!value.trim() || !Number.isFinite(percent) || percent < 0 || percent > 100) {
					setting.setDesc(`${KIND[note.kind]} · Enter a percent from 0 to 100.`);
					return;
				}
				const file = this.app.vault.getAbstractFileByPath(note.path);
				if (!(file instanceof TFile)) {
					setting.setDesc(`${KIND[note.kind]} · This note was moved or deleted.`);
					return;
				}
				try {
					await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
						properties[note.property] = Number((percent / 100).toFixed(6));
					});
					this.saved++;
					setting.setDesc(`${KIND[note.kind]} · Saved ${percent}%`);
					button.setDisabled(true);
				} catch (error) {
					setting.setDesc(
						`${KIND[note.kind]} · ${error instanceof Error ? error.message : 'Couldn’t save.'}`,
					);
				}
			}),
		);
	}
}
