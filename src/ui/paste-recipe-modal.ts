import { Modal, Setting } from 'obsidian';
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
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText('Paste a recipe');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		this.contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Paste ingredient lines and preparation text copied from a recipe; headings and bullets are optional. Or paste the address of a recipe page on its own: the page is fetched and read, with nothing filled in from anywhere else. Reading replaces what’s in the form.',
		});
		this.textArea = this.contentEl.createEl('textarea', {
			cls: 'cocktail-cabinet-paste-text',
			attr: { rows: 10, 'aria-label': 'Recipe text or address' },
		});
		this.textArea.value = this.text;
		const errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
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
					.onClick(async () => {
						errorEl.empty();
						readButton.setDisabled(true);
						try {
							const error = await this.read(this.textArea.value, setText);
							if (error) errorEl.setText(error);
							else this.close();
						} finally {
							readButton.setDisabled(false);
						}
					}),
			);
		window.setTimeout(() => this.textArea.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
