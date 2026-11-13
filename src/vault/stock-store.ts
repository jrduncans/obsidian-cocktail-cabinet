import { parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { PROP } from '../core/schema';
import type { CabinetNote, Properties } from '../core/schema';
import { dateUpdate } from '../core/usage';
import { readStockState, sameStockState } from '../core/stock-edit';
import type { StockEditPlan, StockKind, StockState } from '../core/stock-edit';

/** Reads and saves a single bottle's or other stock's stock, never from the metadata cache. */
export class StockStore {
	private writing = false;

	constructor(private app: App) {}

	private file(note: CabinetNote): TFile {
		const file = this.app.vault.getAbstractFileByPath(note.path);
		if (!(file instanceof TFile)) throw new Error(`${note.name} was moved or deleted.`);
		return file;
	}

	private kind(note: CabinetNote): StockKind {
		if (note.kind !== 'bottle' && note.kind !== 'ingredient') throw new Error('Open a bottle or other stock note.');
		return note.kind;
	}

	async read(note: CabinetNote): Promise<StockState> {
		const content = await this.app.vault.read(this.file(note));
		const yaml = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		const properties: unknown = yaml ? parseYaml(yaml) : {};
		if (!properties || typeof properties !== 'object' || Array.isArray(properties))
			throw new Error(`Couldn’t read the stock for ${note.name}.`);
		return readStockState(this.kind(note), properties as Record<string, unknown>);
	}

	/** Write the plan only if the note still has the stock the form opened with. */
	async save(note: CabinetNote, before: StockState, plan: StockEditPlan): Promise<void> {
		if (!plan.changed) return;
		if (this.writing) throw new Error('Another stock change is still saving.');
		this.writing = true;
		try {
			await this.app.fileManager.processFrontMatter(this.file(note), (properties: Record<string, unknown>) => {
				if (!sameStockState(before, readStockState(this.kind(note), properties))) {
					throw new Error(
						'This note’s stock changed after the form opened. Nothing saved; close and edit again.',
					);
				}
				for (const key of plan.remove) delete properties[key];
				Object.assign(properties, plan.updates);
			});
		} finally {
			this.writing = false;
		}
	}

	/**
	 * Record a purchase: `updates` from `planPurchase` plus today as `cc-last-purchased`. With
	 * `before`, refuses (changing nothing) if the stock changed since the form read it. Without,
	 * only the date and shopping flag are written: a new note, or an ingredient type bought for.
	 */
	async recordPurchase(
		note: CabinetNote,
		before: StockState | null,
		updates: Properties,
		date: string,
	): Promise<void> {
		const file = this.file(note);
		await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
			if (before && !sameStockState(before, readStockState(this.kind(note), properties))) {
				throw new Error('its stock changed after the form opened');
			}
			Object.assign(properties, updates);
			if (note.kind !== 'type') Object.assign(properties, dateUpdate(properties, PROP.lastPurchased, date));
		});
	}
}
