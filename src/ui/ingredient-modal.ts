import type CocktailCabinetPlugin from '../main';
import { PROP, noteName } from '../core/schema';
import type { CabinetNote, NoteKind, Properties } from '../core/schema';
import { CabinetForm } from './form';
import type { NewNoteChoice } from './picker';
import { StockModal } from './stock-modal';
import { subtypeParents } from '../core/relationships';

type Level = 'category' | 'family' | 'type';
const LEVELS: Record<Level, string> = { type: 'Type', family: 'Family', category: 'Category' };
/** What **Then add** opens for the new type: a bottle or other stock form, with the type selected. */
const THEN_ADD = { '': 'Nothing', bottle: 'A bottle', ingredient: 'Other stock' } as const;

/** **New type…** in a type picker: the type form over the current one, named from the search. */
export function newTypeChoice(plugin: CocktailCabinetPlugin): NewNoteChoice {
	return {
		label: 'ingredient type',
		open: (name, done) => new IngredientModal(plugin, 'type', done, name).open(),
	};
}

export class IngredientModal extends CabinetForm {
	private description = '';
	private thenAdd: keyof typeof THEN_ADD = '';

	/** `chooseLevel` adds a Level dropdown, for **Add ingredient type**: families and categories are rarely added. */
	constructor(
		private plugin: CocktailCabinetPlugin,
		private kind: Level = 'type',
		private created?: (note: CabinetNote) => void,
		private name = '',
		private chooseLevel = false,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.begin(
			`Add ingredient ${this.kind}`,
			this.kind === 'category'
				? undefined
				: this.kind === 'type'
					? 'A family is optional. For a narrower kind of an existing type, such as Bonded Bourbon under Bourbon, choose that type under Subtype of instead: its bottles then fill recipes calling for the type.'
					: 'An ingredient category is optional. Select one when it provides a useful grouping.',
		);
		if (this.chooseLevel)
			this.select('Level', LEVELS, this.kind, (value) => {
				// Name and description carry over; the rest of the form belongs to the level.
				this.kind = value as Level;
				this.contentEl.empty();
				this.onOpen();
			});
		let preparation = '';
		let shoppingList = false,
			catchAll = false;
		let parents: CabinetNote[] = [];
		let parentType: CabinetNote[] = [];
		this.text('Name', this.name, (value) => {
			this.name = value;
		}).setClass('cocktail-cabinet-name');
		this.area('Description', this.description, (value) => {
			this.description = value;
		});
		if (this.kind !== 'category') {
			const parentKind: NoteKind = this.kind === 'family' ? 'category' : 'family';
			this.choose(
				`Ingredient ${parentKind} (optional)`,
				() => this.plugin.store.notes().filter((note) => note.kind === parentKind),
				(notes) => {
					parents = notes;
				},
			);
		}
		if (this.kind === 'type') {
			this.choose(
				'Subtype of (optional)',
				() => subtypeParents(this.plugin.store.notes()),
				(notes) => {
					parentType = notes;
				},
			);
			this.area('Preparation (optional)', preparation, (value) => {
				preparation = value;
			});
			this.toggle(
				'Catch-all type',
				catchAll,
				(value) => {
					catchAll = value;
				},
				'Its bottles are likely substitutes, not interchangeable: logging offers them but never picks one for you.',
			);
			this.toggle('Add to shopping list', shoppingList, (value) => {
				shoppingList = value;
			});
			// Only from the command: a form that asked for the type carries on with it itself.
			if (!this.created)
				this.select('Then add', THEN_ADD, this.thenAdd, (value) => {
					this.thenAdd = value as keyof typeof THEN_ADD;
				}).setDesc('Open a bottle or other stock form for the new type after it’s created.');
		}
		this.submit('Create note', async () => {
			const properties: Properties = {};
			if (this.kind !== 'category' && parents[0])
				properties[this.kind === 'family' ? PROP.category : PROP.family] = this.plugin.store.link(parents[0]);
			if (this.kind === 'type') {
				// A subtype's family is its type's, so it keeps none of its own.
				if (parentType[0] && parents[0])
					throw new Error('A subtype takes its family from its type. Leave the family empty.');
				if (parentType[0]) properties[PROP.type] = this.plugin.store.link(parentType[0]);
				if (catchAll) properties[PROP.catchAll] = true;
				properties[PROP.shoppingList] = shoppingList;
			}
			const file = await this.plugin.store.create({
				kind: this.kind,
				name: this.name,
				description: this.description,
				method: preparation,
				properties,
			});
			if (parentType[0])
				await this.plugin.store.addSubtypesSection(this.plugin.store.link(parentType[0]), file.path);
			this.close();
			const note: CabinetNote = {
				path: file.path,
				name: noteName(this.name).normalize('NFC'),
				kind: this.kind,
				parents: (parentType[0] ? parentType : parents).map((item) => item.path),
			};
			if (this.created) this.created(note);
			else if (this.kind === 'type' && this.thenAdd)
				new StockModal(this.plugin, this.thenAdd === 'bottle', { types: [note] }).open();
			else await this.plugin.store.open(file.path);
		});
	}
}
