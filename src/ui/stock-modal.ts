import type CocktailCabinetPlugin from '../main';
import { PROP, optionalNumber } from '../core/schema';
import type { CabinetNote, Properties } from '../core/schema';
import { CabinetForm } from './form';

export class StockModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin, private bottle: boolean) { super(plugin.app); }

	onOpen() {
		this.begin(this.bottle ? 'Add a bottle' : 'Add other stock', this.bottle
			? 'Describe a bottling and the stock you have. Amounts left blank stay unknown.'
			: 'Record fresh ingredients, homemade preparations, or purchased sources of ingredients.');
		let name = '', description = '', volume = '', abv = '', open = '', unopened = '';
		let form = 'Fresh ingredient', availability = 'Unknown';
		let types: CabinetNote[] = [];
		this.text('Name', name, value => { name = value; });
		this.choose(this.bottle ? 'Ingredient types' : 'Provides ingredients', () => this.plugin.store.notes().filter(note => note.kind === 'type'), notes => { types = notes; }, true);
		if (this.bottle) {
			this.text('Bottle volume (ml)', volume, value => { volume = value; });
			this.text('Alcohol by volume (%)', abv, value => { abv = value; });
			this.text('Remaining in open bottle (%)', open, value => { open = value; });
			this.text('Unopened bottles', unopened, value => { unopened = value; });
		} else {
			this.select('Form', { 'Fresh ingredient': 'Fresh ingredient', 'Prepared juice': 'Prepared juice', 'Bottled juice': 'Bottled juice', 'Homemade syrup': 'Homemade syrup', 'Purchased syrup': 'Purchased syrup', Other: 'Other' }, form, value => { form = value; });
			this.select('Availability', { Unknown: 'Unknown', Have: 'Have', Low: 'Low', Out: 'Out' }, availability, value => { availability = value; });
		}
		this.area('Description', description, value => { description = value; });
		this.submit('Create note', async () => {
			const properties: Properties = {};
			properties[this.bottle ? PROP.types : PROP.provides] = types.map(note => this.plugin.store.link(note));
			if (this.bottle) {
				const bottleVolume = optionalNumber(volume, 'Bottle volume', 0);
				if (bottleVolume === 0) throw new Error('Bottle volume must be greater than zero.');
				properties[PROP.volume] = bottleVolume;
				const alcohol = optionalNumber(abv, 'Alcohol by volume', 0, 100);
				const remaining = optionalNumber(open, 'Remaining in open bottle', 0, 100);
				properties[PROP.abv] = alcohol === null ? null : alcohol / 100;
				properties[PROP.open] = remaining === null ? null : remaining / 100;
				properties[PROP.unopened] = optionalNumber(unopened, 'Unopened bottles', 0, Infinity, true);
			} else {
				properties[PROP.form] = form;
				properties[PROP.availability] = availability;
			}
			const file = await this.plugin.store.create({ kind: this.bottle ? 'bottle' : 'ingredient', name, description, properties });
			this.close();
			await this.plugin.store.open(file.path);
		});
	}
}
