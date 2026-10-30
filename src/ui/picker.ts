import { FuzzySuggestModal } from 'obsidian';
import type { App } from 'obsidian';
import type { CabinetNote } from '../core/schema';

export class NotePicker extends FuzzySuggestModal<CabinetNote> {
	constructor(app: App, private notes: CabinetNote[], private choose: (note: CabinetNote) => void) {
		super(app);
		this.setPlaceholder('Find a cabinet note');
		this.emptyStateText = 'No matching cabinet notes.';
	}
	getItems(): CabinetNote[] { return this.notes; }
	getItemText(note: CabinetNote): string {
		const filename = note.path.split('/').slice(-1)[0]?.replace(/\.md$/, '') || note.name;
		const aliases = [...new Set(note.aliases || [])].filter(alias => alias !== note.name && alias !== filename);
		return `${note.name}${filename === note.name ? '' : ` (${filename})`}${aliases.length ? ` · ${aliases.join(', ')}` : ''} · ${note.kind}`;
	}
	onChooseItem(note: CabinetNote) { this.choose(note); }
}
