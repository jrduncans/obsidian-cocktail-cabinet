import { Notice } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { abvText, formOptions, numberText, PARENT_FIELD, planFieldEdit, RATING_OPTIONS, ratingText, sourceText } from '../core/note-edit';
import type { FieldEdit } from '../core/note-edit';
import { splitIngredient } from '../core/recipe-amount';
import { recipeIngredientNotes } from '../core/recipe-import';
import { ingredientList, readRecipeSections } from '../core/recipe-sections';
import type { RecipeSection, RecipeSections } from '../core/recipe-sections';
import { PROP } from '../core/schema';
import type { CabinetNote, NoteKind } from '../core/schema';
import { hasChanges } from '../vault/edit-store';
import type { EditChanges, EditSnapshot, EditStore } from '../vault/edit-store';
import { CabinetForm } from './form';
import { RecipeIngredients } from './recipe-ingredients';
import type { IngredientRow } from './recipe-ingredients';

const PARENT_KIND: Partial<Record<NoteKind, NoteKind>> = { family: 'category', type: 'family', bottle: 'type', ingredient: 'type' };
const PARENT_LABEL: Partial<Record<NoteKind, string>> = {
	family: 'Ingredient category', type: 'Ingredient family', bottle: 'Ingredient type', ingredient: 'Provides ingredients',
};

/** **Edit cabinet note**: the fields the creation form set, apart from the name and stock. */
export class EditNoteModal extends CabinetForm {
	private edit: FieldEdit = {};
	private sections?: RecipeSections;
	private sectionText: Partial<Record<Exclude<RecipeSection, 'ingredients'>, string>> = {};
	private ingredients?: RecipeIngredients;

	constructor(private plugin: CocktailCabinetPlugin, private edits: EditStore, private note: CabinetNote, private snapshot: EditSnapshot) {
		super(plugin.app);
	}

	onOpen() {
		const { kind, properties } = this.snapshot;
		const elsewhere = ['To change the name, use Rename cabinet note.'];
		if (kind === 'bottle' || kind === 'ingredient') elsewhere.push('Stock, price, and the shopping list are in Edit stock.');
		if (kind !== 'recipe') elsewhere.push('Edit the description and other text in the note itself.');
		this.begin(`Edit: ${this.note.name}`, elsewhere.join(' '));

		const parentKind = PARENT_KIND[kind];
		const parentKey = PARENT_FIELD[kind];
		if (parentKind && parentKey) {
			const multiple = kind === 'ingredient';
			this.choose(
				multiple ? PARENT_LABEL[kind]! : `${PARENT_LABEL[kind]!} (optional)`,
				() => this.plugin.store.notes().filter(note => note.kind === parentKind),
				notes => { this.edit.parents = notes.map(note => this.plugin.store.link(note)); },
				multiple,
				this.savedParents(properties[parentKey], parentKind),
			);
		}
		if (kind === 'bottle') {
			this.number('Bottle volume (mL)', numberText(properties[PROP.volume]), value => { this.edit.volume = value; });
			this.number('Alcohol by volume (%)', abvText(properties[PROP.abv]), value => { this.edit.abv = value; });
		}
		if (kind === 'ingredient') {
			const saved = properties[PROP.form];
			const form = typeof saved === 'string' ? saved : '';
			this.select('Form', { ...(form ? {} : { '': 'Not set' }), ...formOptions(form) }, form, value => { this.edit.form = value; });
		}
		if (kind === 'type') {
			this.toggle('Add to shopping list', properties[PROP.shoppingList] === true, value => { this.edit.shoppingList = value; });
		}
		if (kind === 'recipe') this.recipeFields();

		this.submit('Save', async () => {
			const changes = this.changes();
			if (!hasChanges(changes)) {
				this.close();
				new Notice('No changes to save.');
				return;
			}
			await this.edits.save(this.note, this.snapshot, changes);
			this.close();
			new Notice(`Saved ${this.note.name}.`);
		});
	}

	/** The saved parents that resolve to cabinet notes of the right kind. */
	private savedParents(value: unknown, kind: NoteKind): CabinetNote[] {
		const notes = this.plugin.store.notes();
		return (Array.isArray(value) ? value : [value]).flatMap((link: unknown) => {
			if (typeof link !== 'string') return [];
			const file = this.plugin.store.resolve(link, this.note.path);
			const note = file && notes.find(item => item.path === file.path && item.kind === kind);
			return note ? [note] : [];
		});
	}

	private number(label: string, value: string, change: (value: string) => void) {
		this.text(label, value, change).controlEl.querySelector('input')?.setAttribute('inputmode', 'decimal');
	}

	private recipeFields() {
		const { properties, content } = this.snapshot;
		const sections = this.sections = readRecipeSections(content);
		this.text('Source (optional)', sourceText(properties.source), value => { this.edit.source = value; }).setClass('cocktail-cabinet-name');
		const rating = ratingText(properties.rating);
		const options = rating === 'keep' ? { keep: `Keep as written: ${String(properties.rating)}`, ...RATING_OPTIONS } : RATING_OPTIONS;
		this.select('Rating', options, rating, value => { this.edit.rating = value; });
		if (sections.ingredientsEditable) {
			this.ingredients = new RecipeIngredients(this.plugin, this.contentEl, sections.ingredients.map(line => this.savedRow(line)));
		} else {
			this.contentEl.createEl('p', { text: 'The ingredient list has nested items or other text this form can’t keep, so it’s left as is. Edit it in the note.' });
		}
		for (const [key, label] of [['method', 'Method'], ['description', 'Description'], ['tastingNotes', 'Tasting notes']] as const) {
			this.area(label, sections[key], value => { this.sectionText[key] = value; }).setClass('cocktail-cabinet-name');
		}
	}

	/** A saved ingredient line; a line that is one link to a cabinet note opens as a linked row. */
	private savedRow(line: string): IngredientRow {
		const { amount, text } = splitIngredient(line);
		const link = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
		const file = link ? this.plugin.store.resolve(text, this.note.path) : null;
		const note = file && recipeIngredientNotes(this.plugin.store.notes()).find(item => item.path === file.path);
		return note ? { amount, text: link![2]?.trim() || note.name, note, original: line } : { amount, text, original: line };
	}

	private changes(): EditChanges {
		const changes: EditChanges = { properties: planFieldEdit(this.snapshot.kind, this.snapshot.properties, this.edit), sections: {} };
		const sections = this.sections;
		if (!sections) return changes;
		if (this.ingredients) {
			const lines = this.ingredients.lines();
			if (lines.join('\n') !== sections.ingredients.join('\n')) changes.sections.ingredients = ingredientList(lines);
		}
		for (const [key, value] of Object.entries(this.sectionText) as [Exclude<RecipeSection, 'ingredients'>, string][]) {
			if (value.trim() !== sections[key]) changes.sections[key] = value;
		}
		return changes;
	}
}
