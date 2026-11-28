import { FuzzySuggestModal } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
import type { CabinetNote } from '../core/schema';
import { placeNewChoice } from '../core/picker-choices';

/** A note as pickers list it: name, filename when different, aliases, and kind, all searchable. */
export function pickerText(note: CabinetNote): string {
	const filename = note.path.split('/').slice(-1)[0]?.replace(/\.md$/, '') || note.name;
	const aliases = [...new Set(note.aliases || [])].filter((alias) => alias !== note.name && alias !== filename);
	return `${note.name}${filename === note.name ? '' : ` (${filename})`}${aliases.length ? ` · ${aliases.join(', ')}` : ''} · ${note.kind}`;
}

/** A picker choice that creates the note it didn't find, such as **New type…**. */
export interface NewNoteChoice {
	/** What it creates, in lowercase, such as "ingredient type". */
	label: string;
	/** Open the creation form with `name` (possibly blank), passing the new note to `done`. */
	open: (name: string, done: (note: CabinetNote) => void) => void;
}

type PickerItem = CabinetNote | { newName: string };

export class NotePicker extends FuzzySuggestModal<PickerItem> {
	constructor(
		app: App,
		private notes: CabinetNote[],
		private choose: (note: CabinetNote) => void,
		private create?: NewNoteChoice,
	) {
		super(app);
		this.setPlaceholder('Find a cabinet note');
		this.emptyStateText = 'No matching cabinet notes.';
	}
	getItems(): PickerItem[] {
		return this.notes;
	}
	getSuggestions(query: string): FuzzyMatch<PickerItem>[] {
		const found = super.getSuggestions(query);
		if (!this.create) return found;
		return placeNewChoice(found, query, (newName) => ({ item: { newName }, match: { score: 0, matches: [] } }));
	}
	getItemText(item: PickerItem): string {
		if ('newName' in item)
			return item.newName ? `New ${this.create?.label}: ${item.newName}` : `New ${this.create?.label}…`;
		return pickerText(item);
	}
	onChooseItem(item: PickerItem) {
		if ('newName' in item) this.create?.open(item.newName, this.choose);
		else this.choose(item);
	}
}
