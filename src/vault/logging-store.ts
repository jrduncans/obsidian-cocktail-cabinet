import { parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { classifyLoggingLines } from '../core/logging-lines';
import type { LoggingLines } from '../core/logging-lines';
import { dailyLogLine, dailyLogText } from '../core/logging-daily';
import type { LoggingPlan } from '../core/logging-plan';
import { sameStock, stockSnapshot } from '../core/logging-stock';
import type { StockSource } from '../core/logging-stock';
import { localDate } from '../core/notes';
import type { CabinetNote } from '../core/schema';
import { oneOffContent, oneOffDailyEntry, oneOffDailyText } from '../core/one-off';
import type { OneOff } from '../core/one-off';
import { madeUpdates, usedUpdates } from '../core/usage';
import type { CabinetStore } from './cabinet-store';
import { LoggingDaily } from './logging-daily';
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
export type ApplyLogResult = { status: 'stale'; review: LoggingReview; notice: string }
	| { status: 'applied'; notice: string };

/** An I/O failure after writes begin must close the review to prevent another decrement. */
export class LoggingWriteError extends Error {
	constructor(message: string) { super(message); this.name = 'LoggingWriteError'; }
}

export class LoggingStore {
	private writing = false;
	readonly daily: LoggingDaily;

	constructor(private app: App, private cabinet: CabinetStore) { this.daily = new LoggingDaily(app); }

	private file(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
		return file;
	}

	async readSource(note: CabinetNote): Promise<StockSource> {
		const content = await this.app.vault.read(this.file(note.path));
		const yaml = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		const properties: unknown = yaml ? parseYaml(yaml) : {};
		if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error(`Couldn’t read the stock for ${note.name}.`);
		return stockSnapshot(note, properties as Record<string, unknown>);
	}

	async review(recipe: CabinetNote, date?: string): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const currentRecipe = notes.find(note => note.path === recipe.path && note.kind === 'recipe');
		if (!currentRecipe) throw new Error('This note isn’t a cabinet recipe.');
		recipe = currentRecipe;
		const content = await this.app.vault.read(this.file(recipe.path));
		const sources = await Promise.all(notes.filter(note => note.kind === 'bottle' || note.kind === 'ingredient').map(note => this.readSource(note)));
		const lines = classifyLoggingLines(content, notes, sources, link => this.cabinet.resolve(link, recipe.path)?.path ?? null);
		return { recipe, content, sources, lines, daily: await this.daily.preview(recipe, date) };
	}

	/** A one-off reads like a recipe made of its lines. Nothing in it can be linked in place, so no line offers to. */
	async reviewOneOff(oneOff: OneOff, date?: string): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const content = oneOffContent(oneOff);
		const sources = await Promise.all(notes.filter(note => note.kind === 'bottle' || note.kind === 'ingredient').map(note => this.readSource(note)));
		const lines = classifyLoggingLines(content, notes, sources, link => this.cabinet.resolve(link, oneOff.riffOn?.path ?? '')?.path ?? null);
		lines.skipped = lines.skipped.map(({ link: _link, ...line }) => line);
		return { oneOff, content, sources, lines, daily: await this.daily.preview(null, date) };
	}

	/** A fresh review of the same recipe or one-off. */
	again(review: LoggingReview, date = review.daily.date): Promise<LoggingReview> {
		return review.oneOff ? this.reviewOneOff(review.oneOff, date) : this.review(review.recipe!, date);
	}

	async apply(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (this.writing) throw new Error('Another cocktail is still being logged.');
		if (plan.errors.length || plan.unselected) throw new Error('Select what you used and check the amounts.');
		if (!plan.changes.length && !addDaily) throw new Error('Nothing to log.');
		// Usage dates come from this date even without a daily note, so it must be a real day, not in the future.
		const day = review.daily.date;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day > localDate()) throw new Error('Pick today or an earlier date.');
		this.writing = true;
		try { return await this.applyReviewed(review, plan, addDaily); }
		finally { this.writing = false; }
	}

	private async applyReviewed(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (review.recipe && await this.app.vault.read(this.file(review.recipe.path)) !== review.content) {
			return { status: 'stale', review: await this.again(review), notice: 'The recipe changed. Nothing saved; check and log again.' };
		}
		if (addDaily) {
			const daily = await this.daily.preview(review.recipe ?? null, review.daily.date);
			if (daily.error) throw new Error(daily.error);
			if (daily.path !== review.daily.path || daily.configuration !== review.daily.configuration
				|| daily.date !== review.daily.date || daily.duplicate !== review.daily.duplicate) {
				return { status: 'stale', review: await this.again(review), notice: 'Your daily note changed. Nothing saved; check and log again.' };
			}
		}
		// Re-read all selections before the first write, never using metadata-cache stock.
		const current = await Promise.all(plan.selected.map(source => this.readSource(source.note)));
		if (plan.selected.some((source, index) => !sameStock(source, current[index]!))) {
			return { status: 'stale', review: await this.again(review), notice: 'Stock changed. Nothing saved; check and log again.' };
		}
		const date = review.daily.date;
		const written: string[] = [];
		for (const change of plan.changes) {
			try {
				await this.app.fileManager.processFrontMatter(this.file(change.source.note.path), (properties: Record<string, unknown>) => {
					// Protect edits that race the preflight while another bottle is being written.
					if (!sameStock(change.source, stockSnapshot(change.source.note, properties))) throw new Error('Its stock changed while saving.');
					Object.assign(properties, change.updates, usedUpdates(properties, date));
				});
				written.push(change.source.note.name);
			} catch (error) {
				const reason = (error instanceof Error ? error.message : 'write failed').replace(/\.$/, '');
				throw new LoggingWriteError(`Couldn’t save ${change.source.note.name} (${reason}). Already updated: ${written.join(', ') || 'none'}. Daily note unchanged. Check those bottles before logging again, or this drink is subtracted twice.`);
			}
		}
		const missed = await this.recordUse(review.recipe, plan, date);
		const [entry, text] = review.oneOff
			? [oneOffDailyEntry(review.oneOff, plan.servings), oneOffDailyText(review.oneOff, plan.servings)]
			: [dailyLogLine(review.recipe!, plan.servings), dailyLogText(review.recipe!, plan.servings)];
		const usage = missed.length ? ` Couldn’t record last used or times made on ${missed.join(', ')}.` : '';
		if (addDaily) {
			try {
				const appended = await this.daily.append(review.daily, review.recipe ?? null, entry);
				return { status: 'applied', notice: (appended ? 'Cocktail logged.' : `Stock updated. Already in the note for ${date}.`) + usage };
			} catch (error) {
				throw new LoggingWriteError(`Stock updated, but the daily note wasn’t (${(error instanceof Error ? error.message : 'unknown error').replace(/\.$/, '')}). Add “${text}”${review.oneOff ? ' and its ingredients' : ''} yourself; don’t log again, or the stock is subtracted twice.`);
			}
		}
		return { status: 'applied', notice: 'Stock updated.' + usage };
	}

	/**
	 * Last used on sources the stock writes didn't cover (status-tracked, or lines without mL), and the
	 * recipe's last made and times made (a one-off has no recipe). Bookkeeping: a failure is reported, never undoing the log.
	 */
	private async recordUse(recipe: CabinetNote | undefined, plan: LoggingPlan, date: string): Promise<string[]> {
		const missed: string[] = [];
		const changed = new Set(plan.changes.map(change => change.source.note.path));
		const write = async (note: CabinetNote, updates: (properties: Record<string, unknown>) => Record<string, unknown>) => {
			try {
				await this.app.fileManager.processFrontMatter(this.file(note.path), (properties: Record<string, unknown>) => {
					Object.assign(properties, updates(properties));
				});
			} catch { missed.push(note.name); }
		};
		const notes = [...plan.selected.map(source => source.note), ...plan.alsoUsed.flatMap(path => this.cabinet.notes().filter(note => note.path === path))];
		for (const note of notes.filter(note => !changed.has(note.path))) {
			await write(note, properties => usedUpdates(properties, date));
		}
		if (recipe) await write(recipe, properties => madeUpdates(properties, date));
		return missed;
	}
}
