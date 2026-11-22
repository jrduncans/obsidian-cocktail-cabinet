import { parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { classifyLoggingLines } from '../core/logging-lines';
import type { LoggingLines } from '../core/logging-lines';
import { dailyAlcoholUpdates, dailyLogLine, dailyLogText } from '../core/logging-daily';
import type { DailyAlcohol } from '../core/logging-daily';
import type { LoggingPlan } from '../core/logging-plan';
import { sameStock, stockSnapshot } from '../core/logging-stock';
import type { StockSource } from '../core/logging-stock';
import { localDate } from '../core/notes';
import { DEFAULT_VOLUME_UNIT } from '../core/recipe-amount';
import type { VolumeUnit } from '../core/recipe-amount';
import type { CabinetNote } from '../core/schema';
import { oneOffContent, oneOffDailyEntry, oneOffDailyText } from '../core/one-off';
import type { OneOff } from '../core/one-off';
import { madeUpdates, usedUpdates } from '../core/usage';
import { fieldChanges, KEPT_LOGS, recordFields } from '../core/log-undo';
import type { LogRecord } from '../core/log-undo';
import type { CabinetStore } from './cabinet-store';
import { LoggingDaily } from './logging-daily';
import { LogUndoStore } from './log-undo-store';
import type { DailyPreview } from './logging-daily';

/** What a review logs: a recipe note, or a one-off, which has no note. Exactly one is set. */
export interface LoggingReview {
	recipe?: CabinetNote;
	oneOff?: OneOff;
	content: string;
	sources: StockSource[];
	lines: LoggingLines;
	daily: DailyPreview;
}
export type ApplyLogResult =
	| { status: 'stale'; review: LoggingReview; notice: string }
	/** `undoable`: the log was saved for **Undo last log**. */
	| { status: 'applied'; notice: string; undoable: boolean };

/** An I/O failure after writes begin must close the review to prevent another decrement. */
export class LoggingWriteError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LoggingWriteError';
	}
}

/** Where the last few logs are kept for undo: the plugin's data. */
export interface LogJournal {
	load(): LogRecord[];
	save(records: LogRecord[]): Promise<void>;
}

/** A journal that lasts until Obsidian closes, for tests and callers without plugin data. */
export function memoryJournal(): LogJournal {
	let records: LogRecord[] = [];
	return {
		load: () => records,
		save: (next) => {
			records = next;
			return Promise.resolve();
		},
	};
}

export class LoggingStore {
	private writing = false;
	readonly daily: LoggingDaily;
	readonly undo: LogUndoStore;

	constructor(
		private app: App,
		private cabinet: CabinetStore,
		readonly journal: LogJournal = memoryJournal(),
		private volumeUnit: () => VolumeUnit = () => DEFAULT_VOLUME_UNIT,
	) {
		this.daily = new LoggingDaily(app);
		this.undo = new LogUndoStore(app, this);
	}

	/** Save a log's record, replacing an earlier save of the same log and keeping only the latest few. */
	private async remember(record: LogRecord): Promise<void> {
		const records = this.journal.load().filter((item) => item.id !== record.id);
		await this.journal.save([...records, structuredClone(record)].slice(-KEPT_LOGS));
	}

	private file(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
		return file;
	}

	/** A note's properties read from the file, never from the metadata cache, which lags behind writes. */
	async readProperties(path: string, name: string): Promise<Record<string, unknown>> {
		const content = await this.app.vault.read(this.file(path));
		const yaml = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		const properties: unknown = yaml ? parseYaml(yaml) : {};
		if (!properties || typeof properties !== 'object' || Array.isArray(properties))
			throw new Error(`Couldn’t read the properties of ${name}.`);
		return properties as Record<string, unknown>;
	}

	async readSource(note: CabinetNote): Promise<StockSource> {
		return stockSnapshot(note, await this.readProperties(note.path, note.name));
	}

	async review(recipe: CabinetNote, date?: string): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const currentRecipe = notes.find((note) => note.path === recipe.path && note.kind === 'recipe');
		if (!currentRecipe) throw new Error('This note isn’t a cabinet recipe.');
		recipe = currentRecipe;
		const content = await this.app.vault.read(this.file(recipe.path));
		const sources = await Promise.all(
			notes
				.filter((note) => note.kind === 'bottle' || note.kind === 'ingredient')
				.map((note) => this.readSource(note)),
		);
		const lines = classifyLoggingLines(
			content,
			notes,
			sources,
			(link) => this.cabinet.resolve(link, recipe.path)?.path ?? null,
			this.volumeUnit(),
		);
		return { recipe, content, sources, lines, daily: await this.daily.preview(recipe, date) };
	}

	/** A one-off reads like a recipe made of its lines. Nothing in it can be linked in place, so no line offers to. */
	async reviewOneOff(oneOff: OneOff, date?: string): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const content = oneOffContent(oneOff);
		const sources = await Promise.all(
			notes
				.filter((note) => note.kind === 'bottle' || note.kind === 'ingredient')
				.map((note) => this.readSource(note)),
		);
		const lines = classifyLoggingLines(
			content,
			notes,
			sources,
			(link) => this.cabinet.resolve(link, oneOff.riffOn?.path ?? '')?.path ?? null,
			this.volumeUnit(),
		);
		lines.skipped = lines.skipped.map(({ link: _link, ...line }) => line);
		return { oneOff, content, sources, lines, daily: await this.daily.preview(null, date) };
	}

	/** A fresh review of the same recipe or one-off. */
	again(review: LoggingReview, date = review.daily.date): Promise<LoggingReview> {
		return review.oneOff ? this.reviewOneOff(review.oneOff, date) : this.review(review.recipe!, date);
	}

	/**
	 * Log a reviewed drink. With `alcohol`, the daily note's alcohol total grows by its mL and the
	 * “Made …” line (a one-off's header) shows its drinks text; both need the daily entry, so neither happens without it.
	 */
	async apply(
		review: LoggingReview,
		plan: LoggingPlan,
		addDaily: boolean,
		alcohol?: DailyAlcohol,
	): Promise<ApplyLogResult> {
		if (this.writing) throw new Error('Another cocktail is still being logged.');
		if (plan.errors.length || plan.unselected) throw new Error('Select what you used and check the amounts.');
		if (!plan.changes.length && !addDaily) throw new Error('Nothing to log.');
		// Usage dates come from this date even without a daily note, so it must be a real day, not in the future.
		const day = review.daily.date;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day > localDate())
			throw new Error('Pick today or an earlier date.');
		this.writing = true;
		try {
			return await this.applyReviewed(review, plan, addDaily, alcohol);
		} finally {
			this.writing = false;
		}
	}

	private async applyReviewed(
		review: LoggingReview,
		plan: LoggingPlan,
		addDaily: boolean,
		alcohol?: DailyAlcohol,
	): Promise<ApplyLogResult> {
		if (review.recipe && (await this.app.vault.read(this.file(review.recipe.path))) !== review.content) {
			return {
				status: 'stale',
				review: await this.again(review),
				notice: 'The recipe changed. Nothing saved; check and log again.',
			};
		}
		if (addDaily) {
			const daily = await this.daily.preview(review.recipe ?? null, review.daily.date);
			if (daily.error) throw new Error(daily.error);
			if (
				daily.path !== review.daily.path ||
				daily.configuration !== review.daily.configuration ||
				daily.date !== review.daily.date ||
				daily.duplicate !== review.daily.duplicate
			) {
				return {
					status: 'stale',
					review: await this.again(review),
					notice: 'Your daily note changed. Nothing saved; check and log again.',
				};
			}
		}
		// Re-read all selections before the first write, never using metadata-cache stock.
		const current = await Promise.all(plan.selected.map((source) => this.readSource(source.note)));
		if (plan.selected.some((source, index) => !sameStock(source, current[index]!))) {
			return {
				status: 'stale',
				review: await this.again(review),
				notice: 'Stock changed. Nothing saved; check and log again.',
			};
		}
		const date = review.daily.date;
		// The record is saved before the first write, with the planned stock changes, so a log that stops
		// partway can still be undone; each write then records what it actually changed.
		const record: LogRecord = {
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			title: review.recipe?.name ?? review.oneOff!.name,
			date,
			servings: plan.servings,
			notes: [],
		};
		for (const change of plan.changes)
			recordFields(
				record,
				change.source.note.path,
				change.source.note.name,
				fieldChanges(change.source.fields, change.updates),
			);
		await this.remember(record);
		const written: string[] = [];
		for (const change of plan.changes) {
			const note = change.source.note;
			try {
				await this.app.fileManager.processFrontMatter(
					this.file(note.path),
					(properties: Record<string, unknown>) => {
						// Protect edits that race the preflight while another bottle is being written.
						if (!sameStock(change.source, stockSnapshot(note, properties)))
							throw new Error('Its stock changed while saving.');
						const updates = { ...change.updates, ...usedUpdates(properties, date) };
						recordFields(record, note.path, note.name, fieldChanges(properties, updates));
						Object.assign(properties, updates);
					},
				);
				written.push(note.name);
			} catch (error) {
				const reason = (error instanceof Error ? error.message : 'write failed').replace(/\.$/, '');
				// Nothing saved: drop the record, so undo still reaches the log before it.
				const saved = written.length ? await this.rememberQuietly(record) : await this.forget(record.id);
				throw new LoggingWriteError(
					`Couldn’t save ${note.name} (${reason}). Already updated: ${written.join(', ') || 'none'}. Daily note unchanged. ` +
						(written.length && saved
							? 'Use Undo last log to put those back before logging again.'
							: 'Check those bottles before logging again, or this drink is subtracted twice.'),
				);
			}
		}
		const missed = await this.recordUse(review.recipe, plan, date, record);
		const [entry, text] = review.oneOff
			? [
					oneOffDailyEntry(review.oneOff, plan.servings, alcohol?.text),
					oneOffDailyText(review.oneOff, plan.servings, alcohol?.text),
				]
			: [
					dailyLogLine(review.recipe!, plan.servings, alcohol?.text),
					dailyLogText(review.recipe!, plan.servings, alcohol?.text),
				];
		const usage = missed.length ? ` Couldn’t record last used or times made on ${missed.join(', ')}.` : '';
		let notice = 'Stock updated.';
		if (addDaily) {
			try {
				const appended = await this.daily.append(review.daily, review.recipe ?? null, entry);
				if (appended) record.daily = { path: review.daily.path, entry };
				notice = appended ? 'Cocktail logged.' : `Stock updated. Already in the note for ${date}.`;
				if (appended && alcohol && !(await this.addAlcohol(review.daily.path, alcohol.ml, record)))
					notice += ' Couldn’t add it to the daily alcohol total.';
			} catch (error) {
				const saved = await this.rememberQuietly(record);
				throw new LoggingWriteError(
					`Stock updated, but the daily note wasn’t (${(error instanceof Error ? error.message : 'unknown error').replace(/\.$/, '')}). Add “${text}”${review.oneOff ? ' and its ingredients' : ''} yourself${saved ? ', or use Undo last log to put the stock back' : ''}; don’t log again, or the stock is subtracted twice.`,
				);
			}
		}
		const saved = await this.rememberQuietly(record);
		return {
			status: 'applied',
			notice: notice + usage + (saved ? '' : ' Couldn’t save this log for undo.'),
			undoable: saved,
		};
	}

	/** Add to the daily note's alcohol total, recorded for undo. Bookkeeping: a failure is reported, never undoing the log. */
	private async addAlcohol(path: string, ml: number, record: LogRecord): Promise<boolean> {
		try {
			const name = path.split('/').at(-1)!.replace(/\.md$/, '');
			await this.app.fileManager.processFrontMatter(this.file(path), (properties: Record<string, unknown>) => {
				const updates = dailyAlcoholUpdates(properties, ml);
				recordFields(record, path, name, fieldChanges(properties, updates));
				Object.assign(properties, updates);
			});
			return true;
		} catch {
			return false;
		}
	}

	/** Drop a record: it was undone, or its log saved nothing. */
	async forget(id: string): Promise<boolean> {
		try {
			await this.journal.save(this.journal.load().filter((record) => record.id !== id));
			return true;
		} catch {
			return false;
		}
	}

	/** Save the record after writes began; a failure is reported, never undoing the log. */
	private async rememberQuietly(record: LogRecord): Promise<boolean> {
		try {
			await this.remember(record);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Last used on sources the stock writes didn't cover (status-tracked, or lines without mL), and the
	 * recipe's last made and times made (a one-off has no recipe). Bookkeeping: a failure is reported, never undoing the log.
	 */
	private async recordUse(
		recipe: CabinetNote | undefined,
		plan: LoggingPlan,
		date: string,
		record: LogRecord,
	): Promise<string[]> {
		const missed: string[] = [];
		const changed = new Set(plan.changes.map((change) => change.source.note.path));
		const write = async (
			note: CabinetNote,
			updates: (properties: Record<string, unknown>) => Record<string, unknown>,
		) => {
			try {
				await this.app.fileManager.processFrontMatter(
					this.file(note.path),
					(properties: Record<string, unknown>) => {
						const changes = updates(properties);
						recordFields(record, note.path, note.name, fieldChanges(properties, changes));
						Object.assign(properties, changes);
					},
				);
			} catch {
				missed.push(note.name);
			}
		};
		const notes = [
			...plan.selected.map((source) => source.note),
			...plan.alsoUsed.flatMap((path) => this.cabinet.notes().filter((note) => note.path === path)),
		];
		for (const note of notes.filter((note) => !changed.has(note.path))) {
			await write(note, (properties) => usedUpdates(properties, date));
		}
		if (recipe) await write(recipe, (properties) => madeUpdates(properties, date));
		return missed;
	}
}
