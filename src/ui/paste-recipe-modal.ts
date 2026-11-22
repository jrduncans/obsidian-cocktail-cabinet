import { Modal, Setting } from 'obsidian';
import { recipeUrl } from '../core/web-recipe';
import type { App, ButtonComponent } from 'obsidian';

/**
 * Read recipe text, or a recipe page's address, into the recipe form. `read` fills the form and returns
 * nothing on success, or a reason to show here; it may replace the text, such as with a page's source line.
 */
export class PasteRecipeModal extends Modal {
	private textArea!: HTMLTextAreaElement;

	constructor(
		app: App,
		private text: string,
		private read: (text: string, setText: (value: string) => void) => Promise<string | void>,
		/** A reason to show on opening, such as a page from the Source field that couldn't be read. */
		private error = '',
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText('Paste a recipe');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		let address = '';
		const addressRow = new Setting(this.contentEl)
			.setName('Recipe page address')
			.setDesc('The page is fetched and read, with nothing filled in from anywhere else.')
			.addText((text) => {
				text.setPlaceholder('Such as punchdrink.com/recipes/…').onChange((value) => {
					address = value;
				});
				text.inputEl.type = 'url';
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') void submit();
				});
			})
			.setClass('cocktail-cabinet-name');
		this.contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Or paste ingredient lines and preparation text copied from a recipe; headings and bullets are optional. Reading replaces what’s in the form.',
		});
		this.textArea = this.contentEl.createEl('textarea', {
			cls: 'cocktail-cabinet-paste-text',
			attr: { rows: 10, 'aria-label': 'Recipe text or address' },
		});
		this.textArea.value = this.text;
		const errorEl = this.contentEl.createEl('p', {
			cls: 'cocktail-cabinet-error',
			text: this.error,
			attr: { role: 'alert' },
		});
		let readButton!: ButtonComponent;
		const setText = (value: string) => {
			this.textArea.value = value;
			this.textArea.focus();
			this.textArea.setSelectionRange(value.length, value.length);
		};
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				(readButton = button)
					.setButtonText('Read recipe')
					.setCta()
					.onClick(() => void submit()),
			);
		// An address, when given, wins over the text; one without its scheme gets https://.
		const submit = async () => {
			errorEl.empty();
			const typed = address.trim();
			const page = typed && (recipeUrl(typed) ?? recipeUrl(`https://${typed}`));
			if (typed && !page) {
				errorEl.setText('That isn’t a web page’s address.');
				return;
			}
			readButton.setDisabled(true).setButtonText(page ? 'Reading page…' : 'Read recipe');
			try {
				const error = await this.read(page ? page.href : this.textArea.value, setText);
				if (error) errorEl.setText(error);
				else this.close();
			} finally {
				readButton.setDisabled(false).setButtonText('Read recipe');
			}
		};
		const first = this.textArea.value ? this.textArea : addressRow.controlEl.querySelector('input');
		window.setTimeout(() => first?.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
