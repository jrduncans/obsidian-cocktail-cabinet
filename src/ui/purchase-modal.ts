import { Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { localDate } from '../core/notes';
import { planPurchase, purchaseDefaults, purchaseFields } from '../core/purchase';
import type { PurchaseEntry } from '../core/purchase';
import { PROP } from '../core/schema';
import type { CabinetNote, Properties } from '../core/schema';
import { AVAILABILITY } from '../core/stock';
import { describeStock } from '../core/stock-edit';
import type { StockState } from '../core/stock-edit';
import type { StockStore } from '../vault/stock-store';
import { CabinetForm } from './form';
import { NotePicker } from './picker';
import { StockModal } from './stock-modal';

const NEW_BOTTLE = '__new__';

interface Row {
	/** The note on the list, or the one added: a bottle, other stock, or an ingredient type. */
	item: CabinetNote;
	onList: boolean;
	bought: boolean;
	/** What was bought: the item itself, or for a type, the bottle or other stock chosen. */
	source?: CabinetNote;
	before?: StockState;
	entry?: PurchaseEntry;
	/** Created here with Add a bottle, which recorded its stock already. */
	created?: boolean;
	problem?: string;
}

/** Record a shopping trip: what was bought from the shopping list, and anything else. */
export class PurchaseModal extends CabinetForm {
	private rows: Row[] = [];
	private listEl!: HTMLElement;

	constructor(private plugin: CocktailCabinetPlugin, private stocks: StockStore) { super(plugin.app); }

	onOpen() {
		this.begin('Record purchases', 'Mark what you bought. Anything you leave unmarked stays on the shopping list.');
		this.listEl = this.contentEl.createDiv();
		new Setting(this.contentEl).setName('Bought something else?')
			.addButton(button => button.setButtonText('Add another…').onClick(() => this.addExisting()))
			.addButton(button => button.setButtonText('New bottle…').onClick(() => this.addNew(true)))
			.addButton(button => button.setButtonText('New other stock…').onClick(() => this.addNew(false)));
		this.submit('Save', () => this.save());
		void this.run(() => this.load());
	}

	private async load() {
		const flagged = this.plugin.store.notes().filter(note =>
			(note.kind === 'bottle' || note.kind === 'ingredient' || note.kind === 'type')
			&& this.app.metadataCache.getCache(note.path)?.frontmatter?.[PROP.shoppingList] === true);
		const order = { bottle: 0, type: 1, ingredient: 2 } as Record<string, number>;
		flagged.sort((left, right) => (order[left.kind]! - order[right.kind]!) || left.name.localeCompare(right.name));
		this.rows = await Promise.all(flagged.map(async note => {
			const row: Row = { item: note, onList: true, bought: false };
			if (note.kind !== 'type') await this.useSource(row, note);
			return row;
		}));
		this.render();
	}

	/** Read the source's stock fresh, for the form and for stale protection when saving. */
	private async useSource(row: Row, source: CabinetNote) {
		row.source = source;
		row.created = false;
		row.problem = undefined;
		try {
			row.before = await this.stocks.read(source);
			row.entry = purchaseDefaults(row.before);
			purchaseFields(row.before);
		} catch (error) {
			row.problem = error instanceof Error ? error.message : 'Couldn’t read its stock.';
		}
	}

	private sourcesFor(type: CabinetNote): CabinetNote[] {
		return this.plugin.store.notes().filter(note => (note.kind === 'bottle' || note.kind === 'ingredient') && note.parents.includes(type.path));
	}

	private render() {
		this.listEl.empty();
		const groups: [string, (row: Row) => boolean][] = [
			['Bottles', row => row.onList && row.item.kind === 'bottle'],
			['Types', row => row.onList && row.item.kind === 'type'],
			['Other stock', row => row.onList && row.item.kind === 'ingredient'],
			['Not on the list', row => !row.onList],
		];
		if (!this.rows.length) this.listEl.createEl('p', { text: 'Your shopping list is empty. Add what you bought below.' });
		for (const [heading, belongs] of groups) {
			const rows = this.rows.filter(belongs);
			if (!rows.length) continue;
			new Setting(this.listEl).setName(heading).setHeading();
			for (const row of rows) this.renderRow(row);
		}
	}

	private renderRow(row: Row) {
		const type = row.item.kind === 'type';
		const desc = type ? 'Any bottle of this type will do.' : row.before ? `Now: ${describeStock(row.before)}.` : '';
		new Setting(this.listEl).setName(row.item.name).setDesc(desc)
			.addToggle(toggle => toggle.setTooltip('Bought').setValue(row.bought).onChange(value => { row.bought = value; this.render(); }));
		if (!row.bought) return;
		const details = this.listEl.createDiv({ cls: 'cocktail-cabinet-purchase' });
		if (type) {
			const options: Record<string, string> = { '': 'Select what you bought…' };
			for (const source of this.sourcesFor(row.item)) options[source.path] = source.name;
			options[NEW_BOTTLE] = 'New bottle…';
			this.select('Bought', options, row.created ? '' : row.source?.path ?? '', value => {
				if (value === NEW_BOTTLE) { this.addNew(true, row); return; }
				const source = this.plugin.store.notes().find(note => note.path === value);
				if (!source) { row.source = undefined; this.render(); return; }
				void this.run(async () => { await this.useSource(row, source); this.render(); });
			}, details);
			if (!row.source) return;
			if (row.created) details.createEl('p', { text: `New: ${row.source.name}, added with its stock.` });
		}
		if (row.created && !type) { details.createEl('p', { text: 'Added with its stock.' }); return; }
		if (row.created) return;
		if (row.problem) { details.createEl('p', { cls: 'cocktail-cabinet-error', text: row.problem }); return; }
		if (!row.before || !row.entry) return;
		const entry = row.entry;
		const fields = purchaseFields(row.before);
		if (fields === 'bottle') {
			this.number('Bottles bought', entry.quantity, value => { entry.quantity = value; }, '', details);
			this.number('Bottle size (mL)', entry.volume, value => { entry.volume = value; }, 'If the size changed, such as 750 to 700 mL. A different bottle, such as 375 mL or 1 L, is a separate bottle: use New bottle.', details);
		} else if (fields === 'amount') {
			this.number('Amount bought (mL)', entry.amount, value => { entry.amount = value; }, '', details);
		} else details.createEl('p', { text: `Sets availability to ${AVAILABILITY.Have}.` });
		this.number('Price', entry.price, value => { entry.price = value; }, 'For one. Blank keeps the last price.', details);
	}

	private number(label: string, value: string, change: (value: string) => void, description: string, container: HTMLElement) {
		this.text(label, value, change, description, container).controlEl.querySelector('input')?.setAttr('inputmode', 'decimal');
	}

	private addExisting() {
		const listed = new Set(this.rows.flatMap(row => [row.item.path, row.source?.path ?? '']));
		const notes = this.plugin.store.notes().filter(note => (note.kind === 'bottle' || note.kind === 'ingredient') && !listed.has(note.path));
		new NotePicker(this.app, notes, note => void this.run(async () => {
			const row: Row = { item: note, onList: false, bought: true };
			await this.useSource(row, note);
			this.rows.push(row);
			this.render();
		})).open();
	}

	/** Add a bottle or other stock; for a type row, a bottle of that type. */
	private addNew(bottle: boolean, forType?: Row) {
		new StockModal(this.plugin, bottle, {
			types: forType ? [forType.item] : [],
			created: note => {
				const row = forType ?? { item: note, onList: false, bought: true };
				Object.assign(row, { source: note, created: true, before: undefined, entry: undefined, problem: undefined });
				if (!forType) this.rows.push(row);
				this.render();
			},
		}).open();
		if (forType) this.render();
	}

	private async save() {
		const bought = this.rows.filter(row => row.bought);
		if (!bought.length) throw new Error('Mark at least one thing you bought.');
		// Check every row before writing anything.
		const plans = bought.map((row): { row: Row; before: StockState | null; updates: Properties } => {
			const name = row.item.name;
			if (!row.source) throw new Error(`${name}: select what you bought.`);
			if (row.created) return { row, before: null, updates: {} };
			if (row.problem || !row.before || !row.entry) throw new Error(`${name}: ${row.problem ?? 'its stock couldn’t be read.'}`);
			try { return { row, before: row.before, updates: planPurchase(row.before, row.entry) }; }
			catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : 'check the amounts.'}`); }
		});
		const date = localDate();
		const saved: string[] = [], failed: string[] = [];
		for (const { row, before, updates } of plans) {
			const source = row.source;
			if (!source) continue;
			try {
				await this.stocks.recordPurchase(source, before, updates, date);
				if (row.item.kind === 'type') await this.stocks.recordPurchase(row.item, null, { [PROP.shoppingList]: false }, date);
				saved.push(source.name);
			} catch (error) {
				failed.push(`${source.name} (${error instanceof Error ? error.message.replace(/\.$/, '') : 'not saved'})`);
			}
		}
		this.close();
		const done = saved.length ? `Recorded ${saved.length === 1 ? saved[0] : `${saved.length} purchases`}.` : '';
		new Notice([done, failed.length ? `Not saved: ${failed.join(', ')}. Check them and record again.` : ''].filter(Boolean).join(' '));
	}
}
