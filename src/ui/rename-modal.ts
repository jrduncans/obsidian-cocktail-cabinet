import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { renameTarget } from '../core/rename';
import type { RenameTarget } from '../core/rename';
import type { CabinetNote } from '../core/schema';
import type { RenameStore } from '../vault/rename-store';
import { CabinetForm } from './form';

export class RenameModal extends CabinetForm {
	private input: string;
	private keepOld = false;
	private previewEl!: HTMLElement;

	constructor(app: App, private renamer: RenameStore, private note: CabinetNote) {
		super(app);
		this.input = note.name;
	}

	onOpen() {
		const linking = this.renamer.linkingNotes(this.note.path).length;
		this.begin(`Rename: ${this.note.name}`, linking
			? `Links from ${linking} ${linking === 1 ? 'note follow' : 'notes follow'}. Link text showing “${this.note.name}” changes to the new name; other wording stays.`
			: 'No other notes link here yet.');
		this.text('New name', this.input, value => { this.input = value; this.refresh(); }, 'The proper name, shown in the heading and new links.')
			.setClass('cocktail-cabinet-name');
		this.toggle('Keep the old name as an alias', this.keepOld, value => { this.keepOld = value; })
			.setDesc('So searching for the old name still finds it.');
		this.previewEl = this.contentEl.createEl('p');
		this.refresh();
		this.submit('Rename', async () => {
			const target = this.target();
			const result = await this.renamer.rename(this.note, target, this.keepOld);
			this.close();
			const parts = [`Renamed to ${target.name}.`];
			if (!result.heading) parts.push('The heading didn’t match the old name, so it was left as is.');
			if (result.failed.length) parts.push(`Couldn’t update links in ${result.failed.join(', ')}.`);
			new Notice(parts.join(' '), result.failed.length ? 0 : undefined);
		});
	}

	private target(): RenameTarget {
		const target = renameTarget(this.note.path, this.note.name, this.input);
		const conflict = this.renamer.conflict(this.note, target.path);
		if (conflict) throw new Error(`${conflict} already exists. Choose another name.`);
		return target;
	}

	private refresh() {
		this.errorEl.empty();
		this.previewEl.setText('');
		if (this.input.trim().normalize('NFC') === this.note.name.normalize('NFC')) return;
		try {
			const target = this.target();
			this.previewEl.setText(target.path === this.note.path ? 'The filename stays the same.' : `New file: ${target.path.split('/').at(-1)}`);
		} catch (error) {
			this.errorEl.setText(error instanceof Error ? error.message : 'Enter a valid name.');
		}
	}
}
