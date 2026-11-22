import { Modal, Setting } from 'obsidian';
import type { App, ButtonComponent } from 'obsidian';
import { recipeUrl } from '../core/web-recipe';

/** Ask for a recipe page's address; `read` fetches it and handles what follows, success or not. */
export class PageAddressModal extends Modal {
	constructor(
		app: App,
		private read: (url: URL) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText('Read a recipe page');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		let address = '';
		let input!: HTMLInputElement;
		new Setting(this.contentEl)
			.setName('Page address')
			.setDesc(
				'The page is fetched and read, with nothing filled in from anywhere else. Reading replaces what’s in the form.',
			)
			.setClass('cocktail-cabinet-name')
			.addText((text) => {
				input = text.inputEl;
				text.setPlaceholder('Such as punchdrink.com/recipes/…').onChange((value) => {
					address = value;
				});
				input.type = 'url';
				input.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') void submit();
				});
			});
		const errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		let readButton!: ButtonComponent;
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => {
				readButton = button
					.setButtonText('Read page')
					.setCta()
					.onClick(() => void submit());
			});
		// An address without its scheme gets https://.
		const submit = async () => {
			const typed = address.trim();
			const url = typed ? (recipeUrl(typed) ?? recipeUrl(`https://${typed}`)) : null;
			if (!url) {
				errorEl.setText(typed ? 'That isn’t a web page’s address.' : 'Enter a recipe page’s address.');
				return;
			}
			errorEl.empty();
			readButton.setDisabled(true).setButtonText('Reading page…');
			try {
				await this.read(url);
				this.close();
			} finally {
				readButton.setDisabled(false).setButtonText('Read page');
			}
		};
		window.setTimeout(() => input.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
