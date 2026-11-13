import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { applyRestore, planUndo, removeDailyEntry, stillExpected } from '../core/log-undo';
import type { LogRecord, UndoPlan } from '../core/log-undo';
import type { LoggingStore } from './logging-store';

export type UndoResult =
	{ status: 'stale'; plan: UndoPlan | null; notice: string } | { status: 'done'; notice: string };

/** Undo a logged drink: put back what it changed, if nothing has changed that stock since. */
export class LogUndoStore {
	private writing = false;

	constructor(
		private app: App,
		private logger: LoggingStore,
	) {}

	/** The most recent log still kept, or null. */
	last(): LogRecord | null {
		return this.logger.journal.load().at(-1) ?? null;
	}

	/** Plan undoing a log from fresh note properties; null once it's gone from the journal. */
	async preview(id = this.last()?.id): Promise<UndoPlan | null> {
		const record = this.logger.journal.load().find((item) => item.id === id);
		if (!record) return null;
		const current = new Map<string, Record<string, unknown> | null>();
		for (const note of record.notes) {
			try {
				current.set(note.path, await this.logger.readProperties(note.path, note.name));
			} catch {
				current.set(note.path, null);
			}
		}
		return planUndo(structuredClone(record), (path) => current.get(path) ?? null);
	}

	async undo(plan: UndoPlan): Promise<UndoResult> {
		if (this.writing) throw new Error('Already undoing a log.');
		this.writing = true;
		try {
			return await this.undoReviewed(plan);
		} finally {
			this.writing = false;
		}
	}

	private async undoReviewed(reviewed: UndoPlan): Promise<UndoResult> {
		// Undo exactly what was shown: anything that changed since means a fresh look first.
		const plan = await this.preview(reviewed.record.id);
		if (!plan || plan.blocked.length || JSON.stringify(plan) !== JSON.stringify(reviewed)) {
			return { status: 'stale', plan, notice: 'Something changed. Nothing undone; check and undo again.' };
		}
		const restored: string[] = [];
		for (const restore of plan.restores) {
			try {
				const file = this.app.vault.getAbstractFileByPath(restore.path);
				if (!(file instanceof TFile)) throw new Error('moved or deleted');
				await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
					if (!stillExpected(restore, properties)) throw new Error('it changed while undoing');
					applyRestore(restore, properties);
				});
				restored.push(restore.name);
			} catch (error) {
				const reason = (error instanceof Error ? error.message : 'write failed').replace(/\.$/, '');
				throw new Error(
					`Couldn’t put back ${restore.name} (${reason}). Already put back: ${restored.join(', ') || 'none'}. Undo last log again to finish.`,
				);
			}
		}
		let daily = '';
		const entry = plan.record.daily;
		if (entry) {
			const file = this.app.vault.getAbstractFileByPath(entry.path);
			let removed = false;
			try {
				if (file instanceof TFile) {
					await this.app.vault.process(file, (content) => {
						const next = removeDailyEntry(content, entry.entry);
						removed = next !== null;
						return next ?? content;
					});
				}
			} catch {
				removed = false;
			}
			daily = removed
				? ' Removed from the daily note.'
				: ' Couldn’t find its entry in the daily note; remove it yourself if it’s there.';
		}
		const forgotten = await this.logger.forget(plan.record.id);
		return {
			status: 'done',
			notice:
				`Undid ${plan.record.title}.` +
				daily +
				(plan.kept.length ? ` Left as they are: ${plan.kept.join(' ')}` : '') +
				(forgotten ? '' : ' Couldn’t clear it from the undo list, so don’t undo it again.'),
		};
	}
}
