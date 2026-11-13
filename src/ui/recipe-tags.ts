import { Setting } from 'obsidian';
import { normalizeTag, PREP_TAGS, suggestPrep, tagChoices } from '../core/recipe-tags';

const key = (tag: string) => tag.toLowerCase();
const isPrep = (tag: string) => PREP_TAGS.some((prep) => prep === key(tag));

/**
 * The recipe form's Tags row: a toggle button per offered tag and a field to add another.
 * With `suggest`, a prep tag follows the method until a prep tag is chosen by hand.
 */
export class RecipeTagsField {
	private selected: string[];
	private choices: string[];
	private buttonsEl: HTMLElement;
	private noteEl: HTMLElement;
	private suggested: string | null = null;
	private prepChosen: boolean;

	constructor(
		container: HTMLElement,
		current: readonly string[],
		counts: ReadonlyMap<string, number>,
		private suggest = false,
	) {
		this.selected = [...current];
		this.choices = tagChoices(current, counts);
		this.prepChosen = !suggest || current.some(isPrep);
		const setting = new Setting(container)
			.setName('Tags')
			.setDesc('Saved on the last line of the tasting notes.')
			.setClass('cocktail-cabinet-name');
		this.noteEl = setting.descEl.createDiv();
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
				if (!this.choices.some((other) => key(other) === key(tag))) this.choices.push(tag);
				if (!this.has(tag)) this.selected.push(tag);
				if (isPrep(tag)) this.prepChosen = true;
				text.setValue('');
				this.render();
			});
		});
		this.render();
	}

	/** Follow the method's prep until one is chosen by hand. */
	methodChanged(method: string) {
		if (this.prepChosen) return;
		const next = suggestPrep(method);
		if (next === this.suggested) return;
		if (this.suggested) this.selected = this.selected.filter((tag) => key(tag) !== this.suggested);
		this.suggested = next;
		if (next && !this.has(next)) this.selected.push(next);
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
				if (isPrep(tag)) this.prepChosen = true;
				this.render();
			});
		}
		if (this.suggest && !this.prepChosen)
			this.noteEl.setText(this.suggested ? `#${this.suggested} was picked from the method.` : '');
		else if (this.noteEl.getText().startsWith('#')) this.noteEl.setText('');
	}
}
