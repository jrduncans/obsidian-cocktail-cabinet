import { parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { classifyLoggingLines } from '../core/logging-lines';
import type { LoggingLines } from '../core/logging-lines';
import { dailyLogLine, dailyLogText } from '../core/logging-daily';
import type { LoggingPlan } from '../core/logging-plan';
import { sameStock, stockSnapshot } from '../core/logging-stock';
import type { StockSource } from '../core/logging-stock';
import type { CabinetNote } from '../core/schema';
import type { CabinetStore } from './cabinet-store';
import { LoggingDaily } from './logging-daily';
import type { DailyPreview } from './logging-daily';

export interface LoggingReview {
	recipe: CabinetNote;
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

	async review(recipe: CabinetNote): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const currentRecipe = notes.find(note => note.path === recipe.path && note.kind === 'recipe');
		if (!currentRecipe) throw new Error('This note isn’t a cabinet recipe.');
		recipe = currentRecipe;
		const content = await this.app.vault.read(this.file(recipe.path));
		const sources = await Promise.all(notes.filter(note => note.kind === 'bottle' || note.kind === 'ingredient').map(note => this.readSource(note)));
		const lines = classifyLoggingLines(content, notes, sources, link => this.cabinet.resolve(link, recipe.path)?.path ?? null);
		return { recipe, content, sources, lines, daily: await this.daily.preview(recipe) };
	}

	async apply(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (this.writing) throw new Error('Another cocktail is still being logged.');
		if (plan.errors.length || plan.unselected) throw new Error('Select what you used and check the amounts.');
		if (!plan.changes.length && !addDaily) throw new Error('Nothing to log.');
		this.writing = true;
		try { return await this.applyReviewed(review, plan, addDaily); }
		finally { this.writing = false; }
	}

	private async applyReviewed(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (await this.app.vault.read(this.file(review.recipe.path)) !== review.content) {
			return { status: 'stale', review: await this.review(review.recipe), notice: 'The recipe changed. Nothing saved; check and log again.' };
		}
		if (addDaily) {
			const daily = await this.daily.preview(review.recipe);
			if (daily.error) throw new Error(daily.error);
			if (daily.path !== review.daily.path || daily.configuration !== review.daily.configuration
				|| daily.date !== review.daily.date || daily.duplicate !== review.daily.duplicate) {
				return { status: 'stale', review: await this.review(review.recipe), notice: 'Your daily note changed. Nothing saved; check and log again.' };
			}
		}
		// Re-read all selections before the first write, never using metadata-cache stock.
		const current = await Promise.all(plan.selected.map(source => this.readSource(source.note)));
		if (plan.selected.some((source, index) => !sameStock(source, current[index]!))) {
			return { status: 'stale', review: await this.review(review.recipe), notice: 'Stock changed. Nothing saved; check and log again.' };
		}
		const written: string[] = [];
		for (const change of plan.changes) {
			try {
				await this.app.fileManager.processFrontMatter(this.file(change.source.note.path), (properties: Record<string, unknown>) => {
					// Protect edits that race the preflight while another bottle is being written.
					if (!sameStock(change.source, stockSnapshot(change.source.note, properties))) throw new Error('Its stock changed while saving.');
					Object.assign(properties, change.updates);
				});
				written.push(change.source.note.name);
			} catch (error) {
				const reason = (error instanceof Error ? error.message : 'write failed').replace(/\.$/, '');
				throw new LoggingWriteError(`Couldn’t save ${change.source.note.name} (${reason}). Already updated: ${written.join(', ') || 'none'}. Daily note unchanged. Check those bottles before logging again, or this drink is subtracted twice.`);
			}
		}
		if (addDaily) {
			try {
				const appended = await this.daily.append(review.daily, review.recipe, dailyLogLine(review.recipe, plan.servings));
				return { status: 'applied', notice: appended ? 'Cocktail logged.' : 'Stock updated. Already in today’s note.' };
			} catch (error) {
				throw new LoggingWriteError(`Stock updated, but the daily note wasn’t (${(error instanceof Error ? error.message : 'unknown error').replace(/\.$/, '')}). Add “${dailyLogText(review.recipe, plan.servings)}” yourself; don’t log again, or the stock is subtracted twice.`);
			}
		}
		return { status: 'applied', notice: 'Stock updated.' };
	}
}
