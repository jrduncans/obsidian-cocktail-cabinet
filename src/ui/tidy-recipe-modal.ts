import { Modal, Notice, Setting, TFile } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { tidiedLine, tidyContent, tidyLines } from '../core/tidy-recipe';
import type { TidyChange, TidyLine, TidyOptions } from '../core/tidy-recipe';
import { linkSpans, StaleLineError } from '../core/unlinked-lines';
import type { CabinetNote } from '../core/schema';

const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** The recipe's lines Tidy this recipe would change, read now, with the settings' choices. */
export async function recipeTidyLines(plugin: CocktailCabinetPlugin, file: TFile): Promise<TidyLine[]> {
	return contentTidyLines(plugin, await plugin.app.vault.read(file), file.path);
}

/** The lines of a recipe's `content`, saved at `path`, that Tidy this recipe would change. */
export function contentTidyLines(plugin: CocktailCabinetPlugin, content: string, path: string): TidyLine[] {
	return tidyLines(content, ingredientResolver(plugin, path), tidyOptions(plugin));
}

/** The ingredient note a link target in the note at `path` points to. */
export function ingredientResolver(plugin: CocktailCabinetPlugin, path: string) {
	const notes = plugin.store.notes();
	return (target: string): CabinetNote | undefined => {
		const found = plugin.store.resolve(target, path);
		return found ? notes.find((note) => note.path === found.path && note.kind !== 'recipe') : undefined;
	};
}

export const tidyOptions = (plugin: CocktailCabinetPlugin): TidyOptions => ({
	level: plugin.settings.linkText,
	fractions: plugin.settings.fractionCharacters,
});

/** **Tidy this recipe**: list the lines that would change, or say there are none. */
export async function openTidy(plugin: CocktailCabinetPlugin, note: CabinetNote): Promise<void> {
	const file = plugin.app.vault.getAbstractFileByPath(note.path);
	if (!(file instanceof TFile)) throw new Error(`${note.path} was moved or deleted.`);
	const lines = await recipeTidyLines(plugin, file);
	if (!lines.length) {
		new Notice(`Nothing to tidy in ${note.name}.`);
		return;
	}
	new TidyRecipeModal(plugin, note, file, lines).open();
}

/** The line as a reader sees it, links underlined. */
function renderLine(container: HTMLElement, raw: string) {
	container.empty();
	const text = raw.replace(MARKER, '');
	let at = 0;
	for (const span of linkSpans(text)) {
		container.appendText(text.slice(at, span.start));
		container.createSpan({ cls: 'cocktail-cabinet-link-shown', text: span.text });
		at = span.end;
	}
	container.appendText(text.slice(at));
}

const quoted = (text: string) => `“${text.trim()}”`;

function changeLabel(change: TidyChange): string {
	switch (change.kind) {
		case 'fraction':
			return `Write ${quoted(change.amount!.from)} as ${quoted(change.amount!.to)}`;
		case 'path':
			return `Link with the full path, ${change.target!}`;
		case 'move': {
			const words = [change.text!.to.before, change.text!.to.after]
				.map((part) => part.trim())
				.filter((part) => /[\p{L}\p{N}]/u.test(part));
			return `Move ${words.map(quoted).join(' and ')} out of the link`;
		}
		case 'name':
			return `Use ${quoted(change.text!.to.text)} instead of ${quoted(change.text!.from)}`;
	}
}

class TidyRecipeModal extends Modal {
	private ticked: Map<TidyLine, Set<TidyChange>>;
	private busy = false;

	constructor(
		private plugin: CocktailCabinetPlugin,
		private note: CabinetNote,
		private file: TFile,
		private lines: TidyLine[],
	) {
		super(plugin.app);
		this.ticked = new Map(lines.map((line) => [line, new Set(line.changes.filter((change) => change.ticked))]));
	}

	onOpen() {
		this.titleEl.setText(`Tidy: ${this.note.name}`);
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form', 'cocktail-cabinet-tidy');
		this.contentEl.createEl('p', {
			text: 'Changes your settings would make on their own start ticked. Replacing or moving the recipe’s words starts unticked: they may say something the cabinet name doesn’t.',
		});
		const errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		const list = this.contentEl.createDiv({ cls: 'cocktail-cabinet-tidy-lines' });
		let saveButton: HTMLButtonElement | undefined;
		const count = () => [...this.ticked.values()].filter((set) => set.size).length;
		const updateSave = () => {
			const lines = count();
			if (!saveButton) return;
			saveButton.setText(lines ? `Tidy ${lines} ${lines === 1 ? 'line' : 'lines'}` : 'Tidy');
			saveButton.disabled = this.busy || !lines;
		};
		for (const line of this.lines) {
			const ticked = this.ticked.get(line)!;
			const item = list.createDiv({ cls: 'cocktail-cabinet-tidy-line' });
			const before = item.createDiv({ cls: 'cocktail-cabinet-tidy-before' });
			renderLine(before, line.raw);
			const after = item.createDiv({ cls: 'cocktail-cabinet-link-preview' });
			const update = () => {
				const changes = line.changes.filter((change) => ticked.has(change));
				renderLine(after, tidiedLine(line.raw, changes));
				after.toggleClass('is-unchanged', !changes.length);
				updateSave();
			};
			const options = item.createEl('ul', { cls: 'cocktail-cabinet-unlinked-uses' });
			for (const change of line.changes) {
				const label = options.createEl('li').createEl('label');
				const box = label.createEl('input', { type: 'checkbox' });
				box.checked = ticked.has(change);
				label.appendText(` ${changeLabel(change)}`);
				box.addEventListener('change', () => {
					if (box.checked) ticked.add(change);
					else ticked.delete(change);
					update();
				});
			}
			update();
		}
		new Setting(this.contentEl)
			.setClass('cocktail-cabinet-submit')
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => {
				saveButton = button.buttonEl;
				button.setCta().onClick(async () => {
					this.busy = true;
					updateSave();
					try {
						const edits = this.lines
							.map((line) => ({
								...line,
								changes: line.changes.filter((change) => this.ticked.get(line)!.has(change)),
							}))
							.filter((edit) => edit.changes.length);
						await this.app.vault.process(this.file, (content) => tidyContent(content, edits));
						this.close();
						new Notice(
							`Tidied ${edits.length} ${edits.length === 1 ? 'line' : 'lines'} in ${this.note.name}.`,
						);
					} catch (error) {
						errorEl.setText(
							error instanceof StaleLineError || !(error instanceof Error)
								? 'The recipe changed since this opened. Nothing saved; close and tidy it again.'
								: error.message,
						);
						this.busy = false;
						updateSave();
					}
				});
			});
		updateSave();
	}

	onClose() {
		this.contentEl.empty();
	}
}
