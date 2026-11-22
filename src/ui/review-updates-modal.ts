import { Modal, Notice, Setting } from 'obsidian';
import { lineDiff } from '../core/managed';
import type CocktailCabinetPlugin from '../main';
import type { ManagedUpdate } from '../vault/cabinet-store';
import { FIELD_LABELS } from '../catalog/fields';
import type { FieldValue } from '../catalog/fields';
import { keptKey, keptValue } from '../vault/catalog-sync';
import type { CatalogAddition, CatalogFieldUpdate } from '../vault/catalog-sync';

/** Unchanged lines shown around each difference; longer runs are folded. */
const CONTEXT = 2;

/**
 * **Review cabinet updates**: managed notes you've edited that have a newer version (compare, then **Use
 * new version**, optionally saving yours as a copy, or **Keep mine**); starter note fields you've changed
 * where the catalog has something new (**Use catalog’s** or **Keep mine**); and catalog entries the
 * cabinet lacks (**Add** or **Skip**). Anything left is offered again next time.
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
		let fields: CatalogFieldUpdate[];
		let additions: CatalogAddition[];
		try {
			updates = await this.plugin.store.managedUpdates();
			({ review: fields, additions } = await this.plugin.catalog.plan());
		} catch (error) {
			this.contentEl.empty();
			this.contentEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
			return;
		}
		if (this.closed) return;
		this.contentEl.empty();
		if (notice) this.contentEl.createEl('p', { text: notice, cls: 'cocktail-cabinet-review-notice' });
		if (!updates.length && !fields.length && !additions.length) {
			this.contentEl.createEl('p', { text: 'Your cabinet notes are current.' });
			return;
		}
		this.contentEl.createEl('p', {
			text: 'This release changes things you’ve edited. Choose which to keep, or close this to decide later.',
		});
		if (updates.length) {
			new Setting(this.contentEl).setName('Cabinet notes').setHeading();
			new Setting(this.contentEl)
				.setName('Save my version as a copy')
				.setDesc('Before switching, save your version beside the note as “(your version)”.')
				.addToggle((toggle) => toggle.setValue(this.keepCopy).onChange((value) => (this.keepCopy = value)));
			for (const update of updates) this.renderUpdate(update);
		}
		if (fields.length) {
			new Setting(this.contentEl)
				.setName('Starter notes')
				.setDesc('You changed these, and the catalog has a new version.')
				.setHeading();
			for (const field of fields) this.renderField(field);
		}
		if (additions.length) {
			new Setting(this.contentEl)
				.setName('New in the catalog')
				.setDesc('Starter notes your cabinet doesn’t have yet.')
				.setHeading();
			for (const addition of additions) this.renderAddition(addition);
		}
	}

	private renderField(update: CatalogFieldUpdate) {
		const section = this.contentEl.createDiv({ cls: 'cocktail-cabinet-review' });
		const setting = new Setting(section).setName(`${update.name}: ${FIELD_LABELS[update.field]}`);
		setting.addButton((button) =>
			button
				.setButtonText('Use catalog’s')
				.setCta()
				.onClick(() =>
					this.act(async () => {
						const changed = await this.plugin.catalog.apply([update]);
						if (!changed.length) throw new Error(`${update.name} changed after review opened.`);
						return `${update.name}: ${FIELD_LABELS[update.field].toLowerCase()} updated.`;
					}),
				),
		);
		setting.addButton((button) =>
			button.setButtonText('Keep mine').onClick(() =>
				this.act(async () => {
					this.plugin.settings.catalogKept[keptKey(update)] = keptValue(update);
					await this.plugin.saveSettings();
					return `${update.name}: keeping your ${FIELD_LABELS[update.field].toLowerCase()}.`;
				}),
			),
		);
		const compare = section.createDiv({ cls: 'cocktail-cabinet-field-compare' });
		compare.createDiv({ text: 'Yours', cls: 'cocktail-cabinet-field-label' });
		compare.createDiv({ text: show(update.yours), cls: 'cocktail-cabinet-diff-yours' });
		compare.createDiv({ text: 'Catalog', cls: 'cocktail-cabinet-field-label' });
		compare.createDiv({ text: show(update.next), cls: 'cocktail-cabinet-diff-new' });
	}

	private renderAddition(addition: CatalogAddition) {
		new Setting(this.contentEl)
			.setName(addition.name)
			.setDesc(addition.path)
			.addButton((button) =>
				button
					.setButtonText('Add')
					.setCta()
					.onClick(() =>
						this.act(async () => {
							await this.plugin.catalog.add(addition);
							return `Added ${addition.name}.`;
						}),
					),
			)
			.addButton((button) =>
				button.setButtonText('Skip').onClick(() =>
					this.act(async () => {
						this.plugin.settings.catalogSkipped.push(addition.id);
						await this.plugin.saveSettings();
						return `Skipped ${addition.name}; it won’t be offered again.`;
					}),
				),
			);
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

function show(value: FieldValue): string {
	if (value === null) return '(none)';
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return String(value);
}
