import type CocktailCabinetPlugin from '../main';
import { PROP, noteName, optionalNumber } from '../core/schema';
import type { CabinetNote, NoteKind, Properties } from '../core/schema';
import { CabinetForm } from './form';

export class IngredientModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin, private kind: 'category' | 'family' | 'type' = 'type', private created?: (note: CabinetNote) => void) {
		super(plugin.app);
	}

	onOpen() {
		this.begin(`Add ingredient ${this.kind}`, this.kind === 'category' ? undefined
			: `An ingredient ${this.kind === 'type' ? 'family' : 'category'} is optional. Select one when it provides a useful grouping.`);
		let name = '', description = '', preparation = '', brix = '';
		let shoppingList = false;
		let parents: CabinetNote[] = [];
		this.text('Name', name, value => { name = value; });
		this.area('Description', description, value => { description = value; });
		if (this.kind !== 'category') {
			const parentKind: NoteKind = this.kind === 'family' ? 'category' : 'family';
			this.choose(`Ingredient ${parentKind} (optional)`, () => this.plugin.store.notes().filter(note => note.kind === parentKind), notes => { parents = notes; }, true);
		}
		if (this.kind === 'type') {
			this.text('Brix (optional)', brix, value => { brix = value; }, 'Sugar concentration from 0 to 100. Leave blank when it is not defined.');
			this.area('Preparation (optional)', preparation, value => { preparation = value; });
			this.toggle('Add to shopping list', shoppingList, value => { shoppingList = value; });
		}
		this.submit('Create note', async () => {
			const properties: Properties = {};
			if (this.kind !== 'category') properties[this.kind === 'family' ? PROP.category : PROP.family] = parents.map(note => this.plugin.store.link(note));
			if (this.kind === 'type') {
				properties[PROP.brix] = optionalNumber(brix, 'Brix', 0, 100);
				properties[PROP.shoppingList] = shoppingList;
			}
			const file = await this.plugin.store.create({ kind: this.kind, name, description, method: preparation, properties });
			this.close();
			if (this.created) this.created({ path: file.path, name: noteName(name).normalize('NFC'), kind: this.kind, parents: parents.map(note => note.path) });
			else await this.plugin.store.open(file.path);
		});
	}
}
