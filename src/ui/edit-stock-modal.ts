import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { BottleAmount, OPEN_AMOUNT_UNITS } from '../core/bottle-amount';
import { formatMl } from '../core/logging-stock';
import type { CabinetNote } from '../core/schema';
import { AVAILABILITY, STOCK_TRACKING } from '../core/stock';
import { boughtMore, describeStock, editFromState, finished, planStockEdit } from '../core/stock-edit';
import type { StockEdit, StockState } from '../core/stock-edit';
import type { StockStore } from '../vault/stock-store';
import { CabinetForm } from './form';

export class EditStockModal extends CabinetForm {
	private edit: StockEdit;
	private amount = new BottleAmount();
	private fieldsEl!: HTMLElement;
	private afterEl!: HTMLElement;
	private quick!: Setting;

	constructor(app: App, private stocks: StockStore, private note: CabinetNote, private before: StockState) {
		super(app);
		this.edit = editFromState(before);
		this.amount.load(before.open, before.volume);
	}

	private get bottle(): boolean { return this.before.kind === 'bottle'; }

	onOpen() {
		this.begin(`Edit stock: ${this.note.name}`, `Now: ${describeStock(this.before)}.`);
		if (this.before.problems.length) {
			this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', text: `${this.before.problems.join(' ')} Shown as unknown; left as is unless you change it.` });
		}
		this.quick = new Setting(this.contentEl).setName('Quick changes')
			.addButton(button => button.setButtonText('Bought more').onClick(() => {
				this.edit = boughtMore(this.edit, this.before.kind);
				this.render();
			}))
			.addButton(button => button.setButtonText('Finished').onClick(() => {
				this.edit = finished(this.edit, this.before.kind);
				if (this.bottle && this.edit.tracking === 'volume') this.amount.setValue('0');
				this.render();
			}));
		this.fieldsEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-stock-fields' });
		this.afterEl = this.contentEl.createEl('p');
		this.render();
		this.submit('Save', async () => {
			const plan = this.plan();
			if (!plan.changed) {
				this.close();
				new Notice('No stock changes to save.');
				return;
			}
			await this.stocks.save(this.note, this.before, plan);
			this.close();
			new Notice(`${this.note.name}: ${describeStock(plan.after)}.`);
		});
	}

	private plan() {
		const open = this.bottle && this.edit.tracking === 'volume' ? this.amount.toMl() : this.before.open;
		return planStockEdit(this.before, { ...this.edit, open });
	}

	private refresh() {
		this.errorEl.empty();
		try {
			const plan = this.plan();
			this.afterEl.setText(plan.changed ? `After: ${describeStock(plan.after)}.` : 'No changes yet.');
		} catch (error) {
			this.afterEl.setText('');
			this.errorEl.setText(error instanceof Error ? error.message : 'Check the amounts.');
		}
	}

	private render() {
		const el = this.fieldsEl;
		el.empty();
		this.quick.setDesc(this.edit.tracking === 'status' ? 'Bought more marks it Have. Finished marks it Out.'
			: this.bottle ? 'Bought more adds a sealed bottle. Finished empties the open one; logging opens a sealed bottle when needed.'
				: 'Bought more takes it off the shopping list; enter the new amount. Finished sets the amount left to 0.');
		new Setting(el).setName('Track stock by').addDropdown(dropdown => dropdown
			.addOptions(STOCK_TRACKING).setValue(this.edit.tracking).onChange(value => this.switchTracking(value)));
		if (this.edit.tracking === 'status') {
			new Setting(el).setName('Availability').addDropdown(dropdown => dropdown
				.addOptions(AVAILABILITY).setValue(this.edit.availability)
				.onChange(value => { this.edit.availability = value; this.refresh(); }));
		} else if (this.bottle) {
			this.openRow(el);
			this.number(el, 'Unopened bottles', this.edit.unopened, value => { this.edit.unopened = value; }, 'Sealed bottles. Leave blank if none.');
		} else {
			this.number(el, 'Amount left (mL)', this.edit.remaining, value => { this.edit.remaining = value; }, 'Clear if unknown; 0 means empty.');
		}
		this.number(el, 'Last purchase price', this.edit.price, value => { this.edit.price = value; }, 'Optional, without a currency symbol.');
		new Setting(el).setName('Add to shopping list').addToggle(toggle => toggle
			.setValue(this.edit.shoppingList).onChange(value => { this.edit.shoppingList = value; this.refresh(); }));
		this.refresh();
	}

	private number(el: HTMLElement, label: string, value: string, change: (value: string) => void, description: string) {
		new Setting(el).setName(label).setDesc(description).addText(text => {
			text.setValue(value).onChange(next => { change(next); this.refresh(); });
			text.inputEl.inputMode = 'decimal';
		});
	}

	private openRow(el: HTMLElement) {
		const size = this.before.volume === null ? 'Bottle size unknown, so enter mL.' : `${formatMl(this.before.volume)} mL bottle.`;
		const row = new Setting(el).setName('Open bottle').setDesc(`${size} Clear if unknown.`);
		row.addDropdown(dropdown => dropdown.addOptions(OPEN_AMOUNT_UNITS).setValue(this.amount.unit).onChange(value => {
			try {
				this.amount.setUnit(value);
				this.render();
			} catch (error) {
				dropdown.setValue(this.amount.unit);
				this.errorEl.setText(error instanceof Error ? error.message : 'Enter a valid amount.');
			}
		}));
		row.addText(text => {
			text.setValue(this.amount.value).onChange(value => { this.amount.setValue(value); this.refresh(); });
			text.inputEl.inputMode = 'decimal';
		});
	}

	/** Back to the saved mode restores its values; a new mode starts unknown, never converted. */
	private switchTracking(tracking: string) {
		const saved = editFromState(this.before);
		this.edit.tracking = tracking;
		if (tracking === this.before.tracking) {
			Object.assign(this.edit, { unopened: saved.unopened, remaining: saved.remaining, availability: saved.availability });
			this.amount.load(this.before.open, this.before.volume);
		} else {
			Object.assign(this.edit, { unopened: '', remaining: '', availability: 'Unknown' });
			this.amount.load(null, this.before.volume);
		}
		this.render();
	}
}
