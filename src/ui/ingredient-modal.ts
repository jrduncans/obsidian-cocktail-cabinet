import type CocktailCabinetPlugin from '../main';
import { PROP, noteName } from '../core/schema';
import type { CabinetNote, NoteKind, Properties } from '../core/schema';
import { CabinetForm } from './form';
import { subtypeParents } from '../core/relationships';

type Level = 'category' | 'family' | 'type';
const LEVELS: Record<Level, string> = { type: 'Type', family: 'Family', category: 'Category' };

export class IngredientModal extends CabinetForm {
	private description = '';

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
		});
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
			if (this.created)
				this.created({
					path: file.path,
					name: noteName(this.name).normalize('NFC'),
					kind: this.kind,
					parents: (parentType[0] ? parentType : parents).map((note) => note.path),
				});
			else await this.plugin.store.open(file.path);
		});
	}
}
