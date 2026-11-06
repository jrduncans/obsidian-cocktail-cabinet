import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { isEditable, sameFields } from '../core/note-edit';
import type { EditableKind } from '../core/note-edit';
import { replaceRecipeSections } from '../core/recipe-sections';
import type { RecipeSection } from '../core/recipe-sections';
import type { CabinetNote, Properties } from '../core/schema';
import { readRecipeDocument } from './recipe-document';

/** The note as the form opened it, read from the file rather than the metadata cache. */
export interface EditSnapshot {
	kind: EditableKind;
	content: string;
	properties: Record<string, unknown>;
}

export interface EditChanges {
	properties: Properties;
	sections: Partial<Record<RecipeSection, string>>;
}

export function hasChanges(changes: EditChanges): boolean {
	return Object.keys(changes.properties).length > 0 || Object.keys(changes.sections).length > 0;
}

/** Reads and saves the fields of one cabinet note for **Edit cabinet note**. */
export class EditStore {
	private writing = false;

	constructor(private app: App) {}

	private file(note: CabinetNote): TFile {
		const file = this.app.vault.getAbstractFileByPath(note.path);
		if (!(file instanceof TFile)) throw new Error(`${note.name} was moved or deleted.`);
		return file;
	}

	async read(note: CabinetNote): Promise<EditSnapshot> {
		if (!isEditable(note.kind)) throw new Error('This kind of cabinet note has no fields to edit.');
		const content = await this.app.vault.read(this.file(note));
		return { kind: note.kind, content, properties: readRecipeDocument(content).metadata };
	}

	/**
	 * Write the changes only if the note still matches the snapshot: the whole note when
	 * recipe sections change, otherwise the edited properties. Sections are written first,
	 * then properties through the frontmatter API, so other properties keep their formatting.
	 */
	async save(note: CabinetNote, snapshot: EditSnapshot, changes: EditChanges): Promise<void> {
		if (!hasChanges(changes)) return;
		if (this.writing) throw new Error('Another edit is still saving.');
		this.writing = true;
		const stale = 'This note changed after the form opened. Nothing saved; close and edit again.';
		try {
			const file = this.file(note);
			if (Object.keys(changes.sections).length) {
				await this.app.vault.process(file, current => {
					if (normalize(current) !== normalize(snapshot.content)) throw new Error(stale);
					return replaceRecipeSections(current, changes.sections);
				});
			}
			if (Object.keys(changes.properties).length) {
				await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
					if (!sameFields(snapshot.kind, snapshot.properties, properties)) throw new Error(stale);
					Object.assign(properties, changes.properties);
				});
			}
		} finally {
			this.writing = false;
		}
	}
}

function normalize(content: string): string {
	return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
