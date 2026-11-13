import { Setting } from 'obsidian';
import { normalizeTag, tagChoices } from '../core/recipe-tags';

const key = (tag: string) => tag.toLowerCase();

/** The recipe form's Tags row: a toggle button for each tag already on a recipe, and a field to add another. */
export class RecipeTagsField {
	private selected: string[];
	private choices: string[];
	private buttonsEl: HTMLElement;
	private noteEl: HTMLElement;

	constructor(container: HTMLElement, current: readonly string[], counts: ReadonlyMap<string, number>, note = '') {
		this.selected = [...current];
		this.choices = tagChoices(current, counts);
		const setting = new Setting(container)
			.setName('Tags')
			.setDesc(note || 'Your own groupings, saved in the tags property.')
			.setClass('cocktail-cabinet-name');
		this.noteEl = setting.descEl.createDiv({ cls: 'cocktail-cabinet-error' });
		this.buttonsEl = setting.controlEl.createDiv({ cls: 'cocktail-cabinet-tags' });
		setting.addText((text) => {
			text.setPlaceholder('Add a tag');
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				const tag = normalizeTag(text.getValue());
				if (!tag) {
					this.noteEl.setText('Tags use letters, numbers, -, _, and /.');
					return;
				}
				this.noteEl.setText('');
				if (!this.choices.some((other) => key(other) === key(tag))) this.choices.push(tag);
				if (!this.has(tag)) this.selected.push(tag);
				text.setValue('');
				this.render();
			});
		});
		this.render();
	}

	/** The chosen tags, in the order offered. */
	tags(): string[] {
		return this.choices.filter((tag) => this.has(tag));
	}

	private has(tag: string): boolean {
		return this.selected.some((other) => key(other) === key(tag));
	}

	private render() {
		this.buttonsEl.empty();
		for (const tag of this.choices) {
			const on = this.has(tag);
			const button = this.buttonsEl.createEl('button', {
				text: `#${tag}`,
				cls: on ? 'mod-cta' : '',
				attr: { 'aria-pressed': String(on), type: 'button' },
			});
			button.addEventListener('click', () => {
				this.selected = on ? this.selected.filter((other) => key(other) !== key(tag)) : [...this.selected, tag];
				this.render();
			});
		}
	}
}
