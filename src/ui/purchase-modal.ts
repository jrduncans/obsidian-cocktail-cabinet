import { FuzzySuggestModal, Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
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
import { StockModal } from './stock-modal';

const NEW_BOTTLE = '__new-bottle__';

interface Row {
	/** The note on the list, or the one added: a bottle, other stock, or an ingredient type. */
	item: CabinetNote;
	onList: boolean;
	bought: boolean;
	/** What was bought: the item itself, or for a type, the bottle or other stock chosen. */
	source?: CabinetNote;
	before?: StockState;
	entry?: PurchaseEntry;
	/** Created here with Add a bottle or Add other stock, which recorded its stock already. */
	created?: boolean;
	problem?: string;
	el?: HTMLElement;
}

/**
 * Record a shopping trip. One line per item, the same height whether or not it's checked:
 * its fields are always shown, dimmed until checked, and typing in one checks it. The modal
 * sits near the top and only the list scrolls, so checking items never moves anything.
 */
export class PurchaseModal extends CabinetForm {
	private rows: Row[] = [];
	private listEl!: HTMLElement;

	constructor(
		private plugin: CocktailCabinetPlugin,
		private stocks: StockStore,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.begin('Record purchases', 'Check what you bought. Anything unchecked stays on the shopping list.');
		this.modalEl.addClass('cocktail-cabinet-purchases');
		this.containerEl.addClass('cocktail-cabinet-purchases-container');
		this.listEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-purchase-list' });
		this.submit('Save', () => this.save());
		void this.run(() => this.load());
	}

	private async load() {
		const flagged = this.plugin.store
			.notes()
			.filter(
				(note) =>
					(note.kind === 'bottle' || note.kind === 'ingredient' || note.kind === 'type') &&
					this.app.metadataCache.getCache(note.path)?.frontmatter?.[PROP.shoppingList] === true,
			);
		const rows = await Promise.all(
			flagged.map(async (note) => {
				const row: Row = { item: note, onList: true, bought: false };
				if (note.kind !== 'type') await this.useSource(row, note);
				return row;
			}),
		);
		// Rows with the same controls stay together, each group by name, so the controls don't
		// change back and forth down the list (most noticeable on a phone).
		this.rows = rows.sort(
			(left, right) => shapeRank(left) - shapeRank(right) || left.item.name.localeCompare(right.item.name),
		);
		this.render();
	}

	/** Read the source's stock fresh, for the form and for stale protection when saving. */
	private async useSource(row: Row, source: CabinetNote) {
		Object.assign(row, { source, created: false, problem: undefined, before: undefined, entry: undefined });
		try {
			row.before = await this.stocks.read(source);
			row.entry = purchaseDefaults(row.before);
			purchaseFields(row.before);
		} catch (error) {
			row.problem = error instanceof Error ? error.message : 'Couldn’t read its stock.';
		}
	}

	private sourcesFor(type: CabinetNote): CabinetNote[] {
		return this.plugin.store
			.notes()
			.filter(
				(note) => (note.kind === 'bottle' || note.kind === 'ingredient') && note.parents.includes(type.path),
			);
	}

	private render() {
		this.listEl.empty();
		const listed = this.rows.filter((row) => row.onList);
		const added = this.rows.filter((row) => !row.onList);
		this.listEl.createDiv({ cls: 'cocktail-cabinet-purchase-heading', text: 'From your shopping list' });
		if (!listed.length)
			this.listEl.createDiv({ cls: 'cocktail-cabinet-purchase-empty', text: 'Nothing on the list.' });
		for (const row of listed) this.renderRow(row, this.listEl.createDiv());
		this.listEl.createDiv({ cls: 'cocktail-cabinet-purchase-heading', text: 'Also bought' });
		for (const row of added) this.renderRow(row, this.listEl.createDiv());
		const add = this.listEl.createEl('button', { cls: 'cocktail-cabinet-purchase-add' });
		setIcon(add.createSpan(), 'plus');
		add.createSpan({ text: 'Add something else…' });
		add.addEventListener('click', () => this.addSomething());
	}

	/** Draw one row into `el`, replacing what was there; later changes redraw just this row. */
	private renderRow(row: Row, el = row.el) {
		if (!el) return;
		row.el = el;
		el.empty();
		el.className = 'cocktail-cabinet-purchase-row';
		el.toggleClass('is-bought', row.bought);
		const check = el.createEl('input', { type: 'checkbox', cls: 'cocktail-cabinet-purchase-check' });
		check.checked = row.bought;
		check.setAttr('aria-label', `Bought ${row.item.name}`);
		check.addEventListener('change', () => {
			row.bought = check.checked;
			el.toggleClass('is-bought', row.bought);
		});
		const label = el.createDiv({ cls: 'cocktail-cabinet-purchase-label' });
		label.createSpan({
			cls: 'cocktail-cabinet-purchase-name',
			text: row.item.kind === 'type' ? `${row.item.name} (any)` : row.item.name,
		});
		if (row.item.kind === 'type') this.typePicker(row, label);
		else {
			if (row.before)
				label.createSpan({ cls: 'cocktail-cabinet-purchase-meta', text: describeStock(row.before) });
			label.addEventListener('click', () => check.click());
		}
		const fields = el.createDiv({ cls: 'cocktail-cabinet-purchase-fields' });
		// Typing anywhere in a row means it was bought.
		fields.addEventListener('input', () => {
			if (!row.bought) check.click();
		});
		this.fields(row, fields, el);
	}

	/** Under a type's name: which bottle or other stock of that type was bought. */
	private typePicker(row: Row, label: HTMLElement) {
		const select = label.createEl('select', { cls: 'dropdown cocktail-cabinet-purchase-which' });
		select.createEl('option', { value: '', text: 'Which one?' });
		for (const source of this.sourcesFor(row.item))
			select.createEl('option', { value: source.path, text: source.name });
		select.createEl('option', { value: NEW_BOTTLE, text: 'New bottle…' });
		select.value = row.source && !row.created ? row.source.path : '';
		select.addEventListener('change', () => {
			row.bought = true;
			if (select.value === NEW_BOTTLE) {
				this.addNew(true, row);
				return;
			}
			const source = this.plugin.store.notes().find((note) => note.path === select.value);
			if (!source) {
				row.source = undefined;
				this.renderRow(row);
				return;
			}
			void this.run(async () => {
				await this.useSource(row, source);
				this.renderRow(row);
			});
		});
	}

	private fields(row: Row, fields: HTMLElement, el: HTMLElement) {
		if (row.created) {
			const name = row.item.kind === 'type' && row.source ? `: ${row.source.name}` : '';
			fields.createSpan({ cls: 'cocktail-cabinet-purchase-note', text: `New${name}, added with its stock` });
			return;
		}
		if (row.problem) {
			fields.createSpan({ cls: 'cocktail-cabinet-error', text: row.problem });
			return;
		}
		if (!row.before || !row.entry) return;
		const entry = row.entry;
		const kind = purchaseFields(row.before);
		if (kind === 'bottle')
			this.input(fields, 'Qty', entry.quantity, 'narrow', (value) => {
				entry.quantity = value;
			});
		else if (kind === 'amount')
			this.input(fields, 'mL', entry.amount, 'narrow', (value) => {
				entry.amount = value;
			});
		else fields.createSpan({ cls: 'cocktail-cabinet-purchase-note is-amount', text: `→ ${AVAILABILITY.Have}` });
		this.input(
			fields,
			'Price',
			entry.price,
			'medium',
			(value) => {
				entry.price = value;
			},
			'',
			'price',
		);
		if (kind !== 'bottle') return;
		// A size change is rare, so its explanation appears only once the size differs.
		const original = row.before.volume;
		const help = el.createDiv({ cls: 'cocktail-cabinet-purchase-help' });
		const showHelp = () =>
			help.setText(
				entry.volume.trim() && Number(entry.volume) !== original
					? 'New size for this bottle from now on, such as 750 to 700 mL. A 375 mL or 1 L is a separate bottle: use Add something else → New bottle.'
					: '',
			);
		this.input(
			fields,
			'Size',
			entry.volume,
			'medium',
			(value) => {
				entry.volume = value;
				showHelp();
			},
			'mL',
			'size',
		);
		showHelp();
	}

	/** A small labeled input in one of the row's three field columns, so fields line up down the list. */
	private input(
		container: HTMLElement,
		label: string,
		value: string,
		width: 'narrow' | 'medium',
		change: (value: string) => void,
		unit = '',
		column: 'amount' | 'price' | 'size' = 'amount',
	) {
		const field = container.createEl('label', { cls: `cocktail-cabinet-purchase-field is-${column}` });
		field.createSpan({ text: label });
		const input = field.createEl('input', { type: 'text', cls: `is-${width}`, value });
		input.inputMode = 'decimal';
		input.addEventListener('input', () => change(input.value));
		if (unit) field.createSpan({ text: unit });
	}

	/** One picker for anything not on the list, with new notes at the top. */
	private addSomething() {
		const listed = new Set(this.rows.flatMap((row) => [row.item.path, row.source?.path ?? '']));
		const notes = this.plugin.store
			.notes()
			.filter((note) => (note.kind === 'bottle' || note.kind === 'ingredient') && !listed.has(note.path));
		new AddPicker(this.app, notes, (choice) => {
			if (choice === 'bottle' || choice === 'ingredient') {
				this.addNew(choice === 'bottle');
				return;
			}
			void this.run(async () => {
				const row: Row = { item: choice, onList: false, bought: true };
				await this.useSource(row, choice);
				this.rows.push(row);
				this.render();
			});
		}).open();
	}

	/** Add a bottle or other stock; for a type row, a bottle of that type. */
	private addNew(bottle: boolean, forType?: Row) {
		new StockModal(this.plugin, bottle, {
			types: forType ? [forType.item] : [],
			created: (note) => {
				const row = forType ?? { item: note, onList: false, bought: true };
				Object.assign(row, {
					source: note,
					created: true,
					bought: true,
					before: undefined,
					entry: undefined,
					problem: undefined,
				});
				if (forType) this.renderRow(row);
				else {
					this.rows.push(row);
					this.render();
				}
			},
		}).open();
		if (forType) this.renderRow(forType);
	}

	private async save() {
		const bought = this.rows.filter((row) => row.bought);
		if (!bought.length) throw new Error('Check at least one thing you bought.');
		// Check every row before writing anything.
		const plans = bought.map((row): { row: Row; before: StockState | null; updates: Properties } => {
			const name = row.item.name;
			if (!row.source) throw new Error(`${name}: choose which one you bought.`);
			if (row.created) return { row, before: null, updates: {} };
			if (row.problem || !row.before || !row.entry)
				throw new Error(`${name}: ${row.problem ?? 'its stock couldn’t be read.'}`);
			try {
				return { row, before: row.before, updates: planPurchase(row.before, row.entry) };
			} catch (error) {
				throw new Error(`${name}: ${error instanceof Error ? error.message : 'check the amounts.'}`);
			}
		});
		const date = localDate();
		const saved: string[] = [],
			failed: string[] = [];
		for (const { row, before, updates } of plans) {
			const source = row.source;
			if (!source) continue;
			try {
				await this.stocks.recordPurchase(source, before, updates, date);
				if (row.item.kind === 'type')
					await this.stocks.recordPurchase(row.item, null, { [PROP.shoppingList]: false }, date);
				saved.push(source.name);
			} catch (error) {
				failed.push(
					`${source.name} (${error instanceof Error ? error.message.replace(/\.$/, '') : 'not saved'})`,
				);
			}
		}
		this.close();
		const done = saved.length ? `Recorded ${saved.length === 1 ? saved[0] : `${saved.length} purchases`}.` : '';
		new Notice(
			[done, failed.length ? `Not saved: ${failed.join(', ')}. Check them and record again.` : '']
				.filter(Boolean)
				.join(' '),
		);
	}
}

/** Bottles in mL (Qty, Price, Size), other stock in mL (mL, Price), availability (Have, Price), unreadable, then types (a picker). */
function shapeRank(row: Row): number {
	if (row.item.kind === 'type') return 4;
	if (!row.before) return 3;
	try {
		return { bottle: 0, amount: 1, status: 2 }[purchaseFields(row.before)];
	} catch {
		return 3;
	}
}

type AddChoice = CabinetNote | 'bottle' | 'ingredient';

/** Bottles and other stock not already in the form, after options to create a new one. */
class AddPicker extends FuzzySuggestModal<AddChoice> {
	constructor(
		app: App,
		private notes: CabinetNote[],
		private choose: (choice: AddChoice) => void,
	) {
		super(app);
		this.setPlaceholder('What else did you buy?');
	}
	getItems(): AddChoice[] {
		return ['bottle', 'ingredient', ...this.notes];
	}
	getItemText(choice: AddChoice): string {
		if (choice === 'bottle') return 'New bottle…';
		if (choice === 'ingredient') return 'New other stock…';
		return `${choice.name} · ${choice.kind === 'bottle' ? 'bottle' : 'other stock'}`;
	}
	onChooseItem(choice: AddChoice) {
		this.choose(choice);
	}
}
