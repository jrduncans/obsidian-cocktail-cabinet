import type CocktailCabinetPlugin from '../main';
import { PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import { AVAILABILITY, STOCK_FORMS, STOCK_TRACKING, stockProperties } from '../core/stock';
import { CabinetForm } from './form';

export class StockModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin, private bottle: boolean) {
		super(plugin.app);
	}

	onOpen() {
		this.begin(
			this.bottle ? 'Add a bottle' : 'Add other stock',
			'Record what you have using volume or a manual availability status. Blank amounts stay unknown.',
		);
		let name = '', description = '', volume = '', abv = '';
		let open = '', unopened = '', remaining = '', lastPurchasePrice = '';
		let form = 'Fresh ingredient', availability = 'Unknown';
		let tracking = this.bottle ? 'volume' : 'status';
		let shoppingList = false;
		let types: CabinetNote[] = [];
		this.text('Name', name, value => { name = value; });
		this.choose(
			this.bottle ? 'Ingredient types' : 'Provides ingredients',
			() => this.plugin.store.notes().filter(note => note.kind === 'type'),
			notes => { types = notes; },
			true,
		);
		if (this.bottle) {
			this.text('Bottle volume (ml)', volume, value => { volume = value; });
			this.text('Alcohol by volume (%)', abv, value => { abv = value; });
		} else {
			this.select('Form', STOCK_FORMS, form, value => { form = value; });
		}
		this.select('Stock tracking', STOCK_TRACKING, tracking, value => {
			tracking = value;
			// Initialize the new representation explicitly; do not infer stock across modes.
			open = '';
			unopened = '';
			remaining = '';
			availability = 'Unknown';
			renderStock();
		});
		const stockEl = this.contentEl.createDiv();
		const renderStock = () => {
			stockEl.empty();
			if (tracking === 'status') {
				this.select('Availability', AVAILABILITY, availability, value => {
					availability = value;
				}, stockEl);
			} else if (this.bottle) {
				this.text('Remaining in open bottle (ml)', open, value => {
					open = value;
				}, 'Excludes unopened bottles. Enter 0 for no open stock.', stockEl);
				this.text('Unopened bottles', unopened, value => {
					unopened = value;
				}, '', stockEl);
			} else {
				this.text('Remaining volume (ml)', remaining, value => {
					remaining = value;
				}, 'Enter 0 for empty stock.', stockEl);
			}
		};
		renderStock();
		this.text('Last purchase price', lastPurchasePrice, value => {
			lastPurchasePrice = value;
		}, 'Optional numeric amount, without a currency symbol.');
		this.toggle('Add to shopping list', shoppingList, value => { shoppingList = value; });
		this.area('Description', description, value => { description = value; });
		this.submit('Create note', async () => {
			const kind = this.bottle ? 'bottle' : 'ingredient';
			const properties = stockProperties({
				kind, tracking, volume, abv, open, unopened, remaining,
				availability, form, lastPurchasePrice, shoppingList,
			});
			properties[this.bottle ? PROP.types : PROP.provides] = types.map(note => this.plugin.store.link(note));
			const file = await this.plugin.store.create({ kind, name, description, properties });
			this.close();
			await this.plugin.store.open(file.path);
		});
	}
}
