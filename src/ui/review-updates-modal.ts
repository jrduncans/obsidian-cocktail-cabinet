import { Modal, Notice, Setting } from 'obsidian';
import { lineDiff } from '../core/managed';
import type CocktailCabinetPlugin from '../main';
import type { ManagedUpdate } from '../vault/cabinet-store';

/** Unchanged lines shown around each difference; longer runs are folded. */
const CONTEXT = 2;

/**
 * **Review cabinet updates**: managed notes you've edited that have a newer version. For each, compare,
 * then **Use new version** (optionally saving yours as a copy), **Keep mine**, or leave it for later.
 */
export class ReviewUpdatesModal extends Modal {
	private keepCopy = true;
	private closed = false;

	constructor(private plugin: CocktailCabinetPlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.titleEl.setText('Review cabinet updates');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		void this.reload();
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}

	private async reload(notice = '') {
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: 'Checking…' });
		let updates: ManagedUpdate[];
		try {
			updates = await this.plugin.store.managedUpdates();
		} catch (error) {
			this.contentEl.empty();
			this.contentEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
			return;
		}
		if (this.closed) return;
		this.contentEl.empty();
		if (notice) this.contentEl.createEl('p', { text: notice, cls: 'cocktail-cabinet-review-notice' });
		if (!updates.length) {
			this.contentEl.createEl('p', { text: 'Every cabinet note you haven’t taken over is current.' });
			return;
		}
		this.contentEl.createEl('p', {
			text: 'You’ve edited these notes, and this release has a new version of each. Compare, then choose which to keep, or close this to decide later.',
		});
		new Setting(this.contentEl)
			.setName('Save my version as a copy')
			.setDesc('Before switching, save your version beside the note as “(your version)”.')
			.addToggle((toggle) => toggle.setValue(this.keepCopy).onChange((value) => (this.keepCopy = value)));
		for (const update of updates) this.renderUpdate(update);
	}

	private renderUpdate(update: ManagedUpdate) {
		const name = update.path.slice(update.path.lastIndexOf('/') + 1).replace(/\.md$/, '');
		const section = this.contentEl.createDiv({ cls: 'cocktail-cabinet-review' });
		const setting = new Setting(section).setName(name).setHeading();
		setting.addButton((button) =>
			button
				.setButtonText('Use new version')
				.setCta()
				.onClick(() =>
					this.act(async () => {
						const copy = await this.plugin.store.useNewVersion(update.path, this.keepCopy, update.current);
						return copy ? `${name} updated; your version is in ${copy}.` : `${name} updated.`;
					}),
				),
		);
		setting.addButton((button) =>
			button.setButtonText('Keep mine').onClick(() =>
				this.act(async () => {
					await this.plugin.store.keepMine(update.path, update.current);
					return `${name} is yours now; the plugin won’t update it.`;
				}),
			),
		);
		const details = section.createEl('details');
		details.createEl('summary', { text: 'Compare' });
		const legend = details.createEl('p', { cls: 'cocktail-cabinet-diff-legend' });
		legend.createSpan({ text: '− yours only', cls: 'cocktail-cabinet-diff-yours' });
		legend.appendText(' ');
		legend.createSpan({ text: '+ new version only', cls: 'cocktail-cabinet-diff-new' });
		const diff = details.createEl('pre', { cls: 'cocktail-cabinet-diff' });
		const lines = lineDiff(update.current, update.next);
		const near = lines.map((_, index) =>
			lines.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some((line) => line.side !== 'same'),
		);
		let folded = 0;
		const flush = () => {
			if (!folded) return;
			diff.createDiv({
				text: `⋯ ${folded} unchanged ${folded === 1 ? 'line' : 'lines'}`,
				cls: 'cocktail-cabinet-diff-fold',
			});
			folded = 0;
		};
		lines.forEach((line, index) => {
			if (line.side === 'same' && !near[index]) {
				folded++;
				return;
			}
			flush();
			const mark = line.side === 'yours' ? '− ' : line.side === 'new' ? '+ ' : '  ';
			diff.createDiv({ text: `${mark}${line.text}`, cls: `cocktail-cabinet-diff-${line.side}` });
		});
		flush();
	}

	private act(run: () => Promise<string>) {
		void (async () => {
			try {
				const message = await run();
				await this.reload(message);
			} catch (error) {
				new Notice(error instanceof Error ? error.message : String(error));
				await this.reload();
			}
		})();
	}
}
