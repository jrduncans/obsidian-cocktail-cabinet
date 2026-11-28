import { Setting } from 'obsidian';
import type { DropdownComponent, TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { BottleAmount, OPEN_AMOUNT_UNITS } from '../core/bottle-amount';
import { PROP, noteName } from '../core/schema';
import type { CabinetNote } from '../core/schema';
import {
	AVAILABILITY,
	BOTTLE_ANSWER,
	KITCHEN_STAPLE_FORM,
	STOCK_ANSWERS,
	STOCK_TRACKING,
	defaultTracking,
	houseName,
	stockKind,
	stockProperties,
	suggestedName,
} from '../core/stock';
import { CabinetForm } from './form';
import { newTypeChoice } from './ingredient-modal';

export interface StockModalOptions {
	/** Called with the new note instead of opening it. */
	created?: (note: CabinetNote) => void;
	name?: string;
	/** The bottle's type, or the types other stock provides. */
	types?: readonly CabinetNote[];
}

/** **Add stock**: a bottle or other stock, asking which first, since the fields and the note kind follow from it. */
export class StockModal extends CabinetForm {
	private answer: string;
	private name: string;
	private types: CabinetNote[];
	private description = '';
	private lastPurchasePrice = '';
	private shoppingList = false;
	/** The House name last suggested, so a later suggestion replaces it but never what was typed. */
	private suggestion = '';

	constructor(
		private plugin: CocktailCabinetPlugin,
		private options: StockModalOptions = {},
	) {
		super(plugin.app);
		this.answer = '';
		this.name = options.name ?? '';
		this.types = [...(options.types ?? [])];
	}

	private get bottle() {
		return this.answer === BOTTLE_ANSWER;
	}

	onOpen() {
		this.begin(
			'Add stock',
			'Record how much you have, or mark it as Have, Low, or Out. A blank amount means none.',
		);
		let provides: Setting | undefined;
		this.select('What is it?', STOCK_ANSWERS, this.answer, (value) => {
			const before = stockKind(this.answer);
			this.answer = value;
			// The other kind has other fields: draw the form again, keeping the name, types, and details.
			if (stockKind(value) !== before) return this.redraw();
			// A staple is the ingredient itself. Any selection comes back if the form changes again.
			provides?.settingEl.toggle(value !== KITCHEN_STAPLE_FORM);
			suggest();
		}).setDesc(
			'A bottle is a product you buy by brand, with a size, where you’d count sealed bottles. For anything else, choose what describes it, even when you keep it in a bottle.',
		);
		if (!stockKind(this.answer)) return;

		let volume = '',
			abv = '';
		let unopened = '',
			remaining = '';
		const open = new BottleAmount();
		let refreshOpen: (() => void) | undefined;
		let availability = 'Unknown';
		let tracking: string = defaultTracking(this.answer);
		let nameInput: TextComponent | undefined;
		// Homemade sources default to "House <type>" so they don't share their type's name.
		const suggest = () => {
			if (this.bottle) return;
			const next = houseName(this.answer, this.types[0]?.name);
			const value = suggestedName(this.name, this.suggestion, next);
			this.suggestion = next;
			if (value !== this.name) {
				this.name = value;
				nameInput?.setValue(value);
			}
		};
		// What it is and what it provides decide the suggested name, so they come before it.
		provides = this.choose(
			this.bottle ? 'Ingredient type (optional)' : 'Provides ingredients',
			() => this.plugin.store.notes().filter((note) => note.kind === 'type'),
			(notes) => {
				this.types = notes;
				suggest();
			},
			!this.bottle,
			this.bottle ? this.types.slice(0, 1) : this.types,
			newTypeChoice(this.plugin),
		);
		if (this.bottle) this.types = this.types.slice(0, 1);
		provides.settingEl.toggle(this.answer !== KITCHEN_STAPLE_FORM);
		new Setting(this.contentEl)
			.setName('Name')
			.setClass('cocktail-cabinet-name')
			.addText((text) => {
				nameInput = text.setValue(this.name).onChange((value) => {
					this.name = value;
				});
			});
		suggest();
		if (this.bottle) {
			this.text('Bottle volume (mL)', volume, (value) => {
				volume = value;
				open.setVolume(value);
				refreshOpen?.();
			});
			this.text('Alcohol by volume (%)', abv, (value) => {
				abv = value;
			});
		}
		this.select('Track stock by', STOCK_TRACKING, tracking, (value) => {
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
				this.select(
					'Availability',
					AVAILABILITY,
					availability,
					(value) => {
						availability = value;
					},
					stockEl,
				);
			} else if (this.bottle) {
				const row = new Setting(stockEl).setName('Remaining in open bottle');
				let amountInput: TextComponent;
				let unitInput: DropdownComponent;
				const describe = () => {
					let summary: string;
					try {
						const ml = open.toMl();
						summary =
							ml === null
								? 'None open.'
								: `${open.unit === 'percent' ? 'About ' : ''}${Number(ml.toFixed(2))} mL remaining.`;
					} catch (error) {
						summary = error instanceof Error ? error.message : 'Enter a valid amount.';
					}
					row.setDesc(`${summary} Excludes unopened bottles. Blank means none open.`);
				};
				row.addDropdown((dropdown) => {
					unitInput = dropdown
						.addOptions(OPEN_AMOUNT_UNITS)
						.setValue(open.unit)
						.onChange((value) => {
							this.errorEl.empty();
							try {
								open.setUnit(value);
							} catch (error) {
								this.errorEl.setText(error instanceof Error ? error.message : 'Enter a valid amount.');
							}
							refreshOpen?.();
						});
				});
				row.addText((text) => {
					amountInput = text.setValue(open.value).onChange((value) => {
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
				this.text(
					'Unopened bottles',
					unopened,
					(value) => {
						unopened = value;
					},
					'Leave blank if you have none.',
					stockEl,
				);
			} else {
				this.text(
					'Remaining volume (mL)',
					remaining,
					(value) => {
						remaining = value;
					},
					'Blank means empty.',
					stockEl,
				);
			}
		};
		renderStock();
		this.text(
			'Last purchase price',
			this.lastPurchasePrice,
			(value) => {
				this.lastPurchasePrice = value;
			},
			'Optional numeric amount, without a currency symbol.',
		);
		this.toggle('Add to shopping list', this.shoppingList, (value) => {
			this.shoppingList = value;
		});
		this.area('Description', this.description, (value) => {
			this.description = value;
		});
		this.submit('Create note', async () => {
			const kind = this.bottle ? 'bottle' : 'ingredient';
			const staple = this.answer === KITCHEN_STAPLE_FORM;
			const types = this.types;
			const properties = stockProperties({
				kind,
				tracking,
				volume,
				abv,
				open: open.value,
				openUnit: open.unit,
				unopened,
				remaining,
				availability,
				form: this.answer,
				lastPurchasePrice: this.lastPurchasePrice,
				shoppingList: this.shoppingList,
			});
			if (this.bottle) {
				if (types[0]) properties[PROP.type] = this.plugin.store.link(types[0]);
			} else if (!staple) {
				properties[PROP.provides] = types.map((note) => this.plugin.store.link(note));
			}
			const name = this.name;
			const file = await this.plugin.store.create({ kind, name, description: this.description, properties });
			this.close();
			if (this.options.created)
				this.options.created({
					path: file.path,
					name: noteName(name).normalize('NFC'),
					kind,
					parents: staple ? [] : types.map((note) => note.path),
				});
			else await this.plugin.store.open(file.path);
		});
	}

	private redraw() {
		this.contentEl.empty();
		this.onOpen();
	}
}
