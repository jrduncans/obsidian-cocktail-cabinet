import { Modal, Setting } from 'obsidian';
import type { App, ButtonComponent } from 'obsidian';
import type { CabinetNote } from '../core/schema';
import { NotePicker } from './picker';

export abstract class CabinetForm extends Modal {
	protected errorEl!: HTMLElement;
	protected submitButton!: ButtonComponent;
	protected busy = false;

	constructor(app: App) { super(app); }

	protected begin(title: string, description?: string) {
		this.titleEl.setText(title);
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		if (description) this.contentEl.createEl('p', { text: description });
		this.errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
	}

	protected text(label: string, value: string, change: (value: string) => void, description = '', container = this.contentEl) {
		return new Setting(container).setName(label).setDesc(description)
			.addText(text => text.setValue(value).onChange(change));
	}

	protected area(label: string, value: string, change: (value: string) => void, description = '', rows = 3) {
		return new Setting(this.contentEl).setName(label).setDesc(description)
			.addTextArea(text => {
				text.setValue(value).onChange(change);
				text.inputEl.rows = rows;
			});
	}

	protected select(label: string, options: Record<string, string>, value: string, change: (value: string) => void, container = this.contentEl) {
		return new Setting(container).setName(label)
			.addDropdown(dropdown => dropdown.addOptions(options).setValue(value).onChange(change));
	}

	protected toggle(label: string, value: boolean, change: (value: boolean) => void) {
		return new Setting(this.contentEl).setName(label)
			.addToggle(toggle => toggle.setValue(value).onChange(change));
	}

	protected choose(label: string, notes: () => CabinetNote[], change: (notes: CabinetNote[]) => void, multiple = false) {
		const selected: CabinetNote[] = [];
		const row = new Setting(this.contentEl).setName(label).setDesc('None selected');
		row.addButton(button => button.setButtonText('Select').onClick(() => {
			new NotePicker(this.app, notes(), note => {
				if (!multiple) selected.length = 0;
				if (!selected.some(item => item.path === note.path)) selected.push(note);
				row.setDesc(selected.map(item => item.name).join(', '));
				change([...selected]);
			}).open();
		}));
		row.addButton(button => button.setButtonText('Clear').onClick(() => {
			selected.length = 0;
			row.setDesc('None selected');
			change([]);
		}));
	}

	protected submit(label: string, action: () => Promise<void>) {
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(button => {
				this.submitButton = button.setButtonText(label).setCta().onClick(() => this.run(action));
			});
	}

	protected async run(action: () => Promise<void>) {
		if (this.busy) return;
		this.busy = true;
		this.errorEl.empty();
		this.submitButton?.setDisabled(true);
		try { await action(); }
		catch (error) { this.errorEl.setText(error instanceof Error ? error.message : 'The cabinet change could not be completed.'); }
		finally {
			this.busy = false;
			this.submitButton?.setDisabled(false);
		}
	}

	onClose() { this.contentEl.empty(); }
}
