import { Setting } from 'obsidian';
import type { DropdownComponent, TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { BottleAmount, OPEN_AMOUNT_UNITS } from '../core/bottle-amount';
import { PROP, noteName } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import { AVAILABILITY, STOCK_FORMS, STOCK_TRACKING, stockProperties } from '../core/stock';
import { CabinetForm } from './form';

export class StockModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin, private bottle: boolean, private created?: (note: CabinetNote) => void, private initialName = '') {
		super(plugin.app);
	}

	onOpen() {
		this.begin(
			this.bottle ? 'Add a bottle' : 'Add other stock',
			'Record what you have using volume or a manual availability status. Blank amounts stay unknown.',
		);
		let name = this.initialName, description = '', volume = '', abv = '';
		let unopened = '', remaining = '', lastPurchasePrice = '';
		const open = new BottleAmount();
		let refreshOpen: (() => void) | undefined;
		let form = 'Fresh ingredient', availability = 'Unknown';
		let tracking = this.bottle ? 'volume' : 'status';
		let shoppingList = false;
		let types: CabinetNote[] = [];
		this.text('Name', name, value => { name = value; }).setClass('cocktail-cabinet-name');
		this.choose(
			this.bottle ? 'Ingredient type (optional)' : 'Provides ingredients',
			() => this.plugin.store.notes().filter(note => note.kind === 'type'),
			notes => { types = notes; },
			!this.bottle,
		);
		if (this.bottle) {
			this.text('Bottle volume (mL)', volume, value => {
				volume = value;
				open.setVolume(value);
				refreshOpen?.();
			});
			this.text('Alcohol by volume (%)', abv, value => { abv = value; });
		} else {
			this.select('Form', STOCK_FORMS, form, value => { form = value; });
		}
		this.select('Stock tracking', STOCK_TRACKING, tracking, value => {
			tracking = value;
			// Initialize the new representation explicitly; do not infer stock across modes.
			open.reset();
			unopened = '';
			remaining = '';
			availability = 'Unknown';
			renderStock();
		});
		const stockEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-stock-fields' });
		const renderStock = () => {
			refreshOpen = undefined;
			stockEl.empty();
			if (tracking === 'status') {
				this.select('Availability', AVAILABILITY, availability, value => {
					availability = value;
				}, stockEl);
			} else if (this.bottle) {
				const row = new Setting(stockEl).setName('Remaining in open bottle');
				let amountInput: TextComponent;
				let unitInput: DropdownComponent;
				const describe = () => {
					let summary: string;
					try {
						const ml = open.toMl();
						summary = ml === null ? 'Amount unknown.' : `${open.unit === 'percent' ? 'About ' : ''}${Number(ml.toFixed(2))} mL remaining.`;
					} catch (error) {
						summary = error instanceof Error ? error.message : 'Enter a valid amount.';
					}
					row.setDesc(`${summary} Excludes unopened bottles. Clear if unknown; enter 0 for no open stock.`);
				};
				row.addDropdown(dropdown => {
					unitInput = dropdown.addOptions(OPEN_AMOUNT_UNITS).setValue(open.unit).onChange(value => {
						this.errorEl.empty();
						try { open.setUnit(value); }
						catch (error) { this.errorEl.setText(error instanceof Error ? error.message : 'Enter a valid amount.'); }
						refreshOpen?.();
					});
				});
				row.addText(text => {
					amountInput = text.setValue(open.value).onChange(value => {
						open.setValue(value);
						this.errorEl.empty();
						describe();
					});
					text.inputEl.inputMode = 'decimal';
				});
				refreshOpen = () => {
					unitInput.setValue(open.unit);
					amountInput.setValue(open.value);
					describe();
				};
				refreshOpen();
				this.text('Unopened bottles', unopened, value => {
					unopened = value;
				}, '', stockEl);
			} else {
				this.text('Remaining volume (mL)', remaining, value => {
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
				kind, tracking, volume, abv, open: open.value, openUnit: open.unit, unopened, remaining,
				availability, form, lastPurchasePrice, shoppingList,
			});
			if (this.bottle) {
				if (types[0]) properties[PROP.type] = this.plugin.store.link(types[0]);
			} else {
				properties[PROP.provides] = types.map(note => this.plugin.store.link(note));
			}
			const file = await this.plugin.store.create({ kind, name, description, properties });
			this.close();
			if (this.created) this.created({ path: file.path, name: noteName(name).normalize('NFC'), kind, parents: types.map(note => note.path) });
			else await this.plugin.store.open(file.path);
		});
	}
}
