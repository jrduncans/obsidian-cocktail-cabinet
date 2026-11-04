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
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or removed. Reopen the review.`);
		return file;
	}

	async readSource(note: CabinetNote): Promise<StockSource> {
		const content = await this.app.vault.read(this.file(note.path));
		const yaml = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		const properties: unknown = yaml ? parseYaml(yaml) : {};
		if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error(`Could not read the stock recorded for ${note.name}.`);
		return stockSnapshot(note, properties as Record<string, unknown>);
	}

	async review(recipe: CabinetNote): Promise<LoggingReview> {
		const notes = await this.cabinet.readNotes();
		const currentRecipe = notes.find(note => note.path === recipe.path && note.kind === 'recipe');
		if (!currentRecipe) throw new Error('This note is no longer a cabinet recipe. Reopen a recipe to log it.');
		recipe = currentRecipe;
		const content = await this.app.vault.read(this.file(recipe.path));
		const sources = await Promise.all(notes.filter(note => note.kind === 'bottle' || note.kind === 'ingredient').map(note => this.readSource(note)));
		const lines = classifyLoggingLines(content, notes, sources, link => this.cabinet.resolve(link, recipe.path)?.path ?? null);
		return { recipe, content, sources, lines, daily: await this.daily.preview(recipe) };
	}

	async apply(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (this.writing) throw new Error('Another cocktail is being logged. Wait for it to finish.');
		if (plan.errors.length) throw new Error('Select what you used and check the amounts before logging.');
		if (!plan.changes.length && !addDaily) throw new Error('Select ingredients or turn on the daily note entry to log this drink.');
		this.writing = true;
		try { return await this.applyReviewed(review, plan, addDaily); }
		finally { this.writing = false; }
	}

	private async applyReviewed(review: LoggingReview, plan: LoggingPlan, addDaily: boolean): Promise<ApplyLogResult> {
		if (await this.app.vault.read(this.file(review.recipe.path)) !== review.content) {
			return { status: 'stale', review: await this.review(review.recipe), notice: 'The recipe changed. Check the updated ingredients before logging.' };
		}
		if (addDaily) {
			const daily = await this.daily.preview(review.recipe);
			if (daily.error) throw new Error(daily.error);
			if (daily.path !== review.daily.path || daily.configuration !== review.daily.configuration
				|| daily.date !== review.daily.date || daily.duplicate !== review.daily.duplicate) {
				return { status: 'stale', review: await this.review(review.recipe), notice: 'Your daily note or its settings changed. Nothing was saved. Check the updated details.' };
			}
		}
		// Re-read all selections before the first write, never using metadata-cache stock.
		const current = await Promise.all(plan.selected.map(source => this.readSource(source.note)));
		if (plan.selected.some((source, index) => !sameStock(source, current[index]!))) {
			return { status: 'stale', review: await this.review(review.recipe), notice: 'Your stock changed. Nothing was saved. Check the updated amounts before logging.' };
		}
		const written: string[] = [];
		for (const change of plan.changes) {
			try {
				await this.app.fileManager.processFrontMatter(this.file(change.source.note.path), (properties: Record<string, unknown>) => {
					// Protect edits that race the preflight while another bottle is being written.
					if (!sameStock(change.source, stockSnapshot(change.source.note, properties))) throw new Error('The recorded amount changed while saving.');
					Object.assign(properties, change.updates);
				});
				written.push(change.source.note.name);
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'The write failed.';
				throw new LoggingWriteError(`Could not save ${change.source.note.name}. ${reason} Already updated: ${written.join(', ') || 'none'}. Your daily note was not changed. Check these amounts before trying again so the same drink is not subtracted twice.`);
			}
		}
		if (addDaily) {
			try {
				const appended = await this.daily.append(review.daily, review.recipe, dailyLogLine(review.recipe, plan.servings));
				return { status: 'applied', notice: appended ? 'Cocktail logged.' : 'Stock updated. This cocktail is already in today’s note, so no extra entry was added.' };
			} catch (error) {
				throw new LoggingWriteError(`Your stock was updated, but the daily note entry could not be saved. ${error instanceof Error ? error.message : 'Please check the note.'} Add the entry to your note yourself. Do not log this drink again, or it will be subtracted twice. Entry: ${dailyLogText(review.recipe, plan.servings)}`);
			}
		}
		return { status: 'applied', notice: 'Stock updated. Daily note unchanged.' };
	}
}
