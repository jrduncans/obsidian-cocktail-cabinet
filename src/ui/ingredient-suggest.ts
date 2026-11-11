import { AbstractInputSuggest, prepareFuzzySearch } from 'obsidian';
import type { App } from 'obsidian';
import type { CabinetNote } from '../core/schema';
import { pickerText } from './picker';

/**
 * Type-ahead for an ingredient field: matching ingredient notes drop down under it as you type, searched like
 * the cabinet pickers (name, filename, aliases, kind). Ignoring the list leaves the text unlinked.
 */
export class IngredientSuggest extends AbstractInputSuggest<CabinetNote> {
	constructor(app: App, private inputEl: HTMLInputElement, private notes: () => readonly CabinetNote[], private choose: (note: CabinetNote) => void) {
		super(app, inputEl);
		this.limit = 20;
	}

	protected getSuggestions(query: string): CabinetNote[] {
		// Links typed by hand are kept as written.
		if (!query.trim() || query.includes('[[')) return [];
		const match = prepareFuzzySearch(query.trim());
		return this.notes().flatMap(note => {
			const result = match(pickerText(note));
			return result ? [{ note, score: result.score }] : [];
		}).sort((a, b) => b.score - a.score || a.note.name.localeCompare(b.note.name)).map(item => item.note);
	}

	renderSuggestion(note: CabinetNote, el: HTMLElement) {
		const content = el.createDiv({ cls: 'suggestion-content' });
		content.createDiv({ cls: 'suggestion-title', text: note.name });
		const filename = note.path.split('/').at(-1)!.replace(/\.md$/, '');
		content.createDiv({ cls: 'suggestion-note', text: filename === note.name ? note.kind : `${note.kind} · ${filename}` });
	}

	selectSuggestion(note: CabinetNote) {
		this.close();
		this.choose(note);
		this.inputEl.focus();
	}
}
