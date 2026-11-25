import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { lineDiff } from '../core/managed';
import type CocktailCabinetPlugin from '../main';
import type { ManagedUpdate } from '../vault/cabinet-store';
import { FIELD_LABELS } from '../catalog/fields';
import type { CatalogField, FieldValue } from '../catalog/fields';
import { keptKey, keptValue } from '../vault/catalog-sync';
import type { CatalogAddition, CatalogFieldUpdate } from '../vault/catalog-sync';

/** Unchanged lines shown around each difference; longer runs are folded. */
const CONTEXT = 2;

/**
 * **Review cabinet updates**: managed notes you've edited that have a newer version (compare, then **Use
 * new version**, optionally saving yours as a copy, or **Keep mine**); starter note fields you've changed
 * where the catalog has something new (**Use catalog’s** or **Keep mine**); and missing catalog entries
 * the plugin can't tell were deleted (**Add**, **Add all**, or **Skip**). Entries new to the cabinet are
 * added on startup instead. Anything left is offered again next time.
 */
export class ReviewUpdatesModal extends Modal {
	private keepCopy = true;
	private closed = false;

	constructor(private plugin: CocktailCabinetPlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.ignoreEarlyBackdropClicks();
		this.titleEl.setText('Review cabinet updates');
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		void this.reload();
	}

	/**
	 * The startup notice's **Review** button sits where the backdrop appears, so the second click of a
	 * double-click would close the review before it's seen. Backdrop clicks in the first moment are ignored;
	 * the close button and Escape work at once.
	 */
	private ignoreEarlyBackdropClicks() {
		const until = Date.now() + 600;
		const guard = (event: Event) => {
			if (Date.now() > until) return;
			if (!(event.target instanceof Element) || !event.target.closest('.modal-bg')) return;
			event.stopPropagation();
			event.preventDefault();
		};
		for (const type of ['pointerdown', 'mousedown', 'click'] as const)
			this.containerEl.addEventListener(type, guard, { capture: true });
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
			text:
				updates.length || fields.length
					? 'This release changes things you’ve edited. Choose which to keep, or close this to decide later; you’ll be reminded when Obsidian starts.'
					: 'Some starter notes are missing. Choose which to add, or close this to decide later; you’ll be reminded when Obsidian starts.',
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
		const conflicts = additions.filter((addition) => addition.existing);
		const missing = additions.filter((addition) => !addition.existing);
		if (missing.length) {
			const heading = new Setting(this.contentEl)
				.setName('Missing starter notes')
				.setDesc(
					'Your cabinet doesn’t have these, and the plugin can’t tell whether you deleted them. New starter notes in later releases are added for you.',
				)
				.setHeading();
			if (missing.length > 1)
				heading
					.addButton((button) =>
						button
							.setButtonText(`Add all ${missing.length}`)
							.setCta()
							.onClick(() =>
								this.act(async () => {
									const failed: string[] = [];
									for (const addition of missing)
										await this.plugin.catalog.add(addition).catch(() => failed.push(addition.name));
									const added = missing.length - failed.length;
									return failed.length
										? `Added ${added}; couldn’t add ${failed.join(', ')}, since a file is in the way.`
										: `Added ${added} starter notes.`;
								}),
							),
					)
					.addButton((button) =>
						button.setButtonText('Skip all').onClick(() =>
							this.act(async () => {
								await this.skip(missing);
								return `Skipped ${missing.length} starter notes; they won’t be offered again.`;
							}),
						),
					);
			for (const addition of missing) this.renderAddition(addition);
		}
		if (conflicts.length) {
			new Setting(this.contentEl)
				.setName('Already in your vault')
				.setDesc(
					'A note of yours already has the name of one of these starter notes. Link to catalog makes it that starter note: it keeps its text and stock, gains the catalog’s aliases if it has none, and each difference from the catalog appears above for you to decide. Skip leaves it outside the catalog, never updated.',
				)
				.setHeading();
			for (const addition of conflicts) this.renderConflict(addition);
		}
	}

	/** One card per field: what changes, what each choice does, then the choices, all inside the card. */
	private renderField(update: CatalogFieldUpdate) {
		const label = FIELD_LABELS[update.field];
		const card = this.contentEl.createDiv({ cls: 'cocktail-cabinet-review-card' });
		const title = card.createDiv({ cls: 'cocktail-cabinet-review-card-title' });
		title.createSpan({ text: update.name });
		title.createSpan({ text: ` · ${label}`, cls: 'cocktail-cabinet-field-label' });
		const compare = card.createDiv({ cls: 'cocktail-cabinet-field-compare' });
		compare.createDiv({ text: 'Your note', cls: 'cocktail-cabinet-field-label' });
		compare.createDiv({ text: show(update.field, update.yours), cls: 'cocktail-cabinet-diff-yours' });
		compare.createDiv({ text: 'Catalog', cls: 'cocktail-cabinet-field-label' });
		compare.createDiv({ text: show(update.field, update.next), cls: 'cocktail-cabinet-diff-new' });
		const outcome = card.createDiv({ cls: 'cocktail-cabinet-review-outcome' });
		outcome.createDiv({ text: `Use catalog’s: ${change(update)}` });
		outcome.createDiv({
			text: 'Keep mine: nothing changes, and you’re asked again only if the catalog changes it again.',
		});
		const actions = card.createDiv({ cls: 'cocktail-cabinet-review-actions' });
		new ButtonComponent(actions).setButtonText('Keep mine').onClick(() =>
			this.act(async () => {
				this.plugin.settings.catalogKept[keptKey(update)] = keptValue(update);
				await this.plugin.saveSettings();
				return `${update.name}: keeping your ${lower(update.field)}.`;
			}),
		);
		new ButtonComponent(actions)
			.setButtonText('Use catalog’s')
			.setCta()
			.onClick(() =>
				this.act(async () => {
					const changed = await this.plugin.catalog.apply([update]);
					if (!changed.length) throw new Error(`${update.name} changed after review opened.`);
					return `${update.name}: ${lower(update.field)} updated.`;
				}),
			);
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
						await this.skip([addition]);
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

	private renderConflict(addition: CatalogAddition) {
		const sameKind = addition.existing?.kind === addition.kind;
		const differs = addition.existing?.differs ?? [];
		const setting = new Setting(this.contentEl)
			.setName(addition.name)
			.setDesc(
				sameKind
					? `Your note: ${addition.path}. ${
							differs.length
								? `Differs from the catalog in ${differs.map((field) => lower(field)).join(', ')}.`
								: 'Matches the catalog.'
						}`
					: `${addition.path} is a different kind of note, so it can’t stand in for this ${addition.kind}.`,
			);
		if (sameKind)
			setting.addButton((button) =>
				button
					.setButtonText('Link to catalog')
					.setCta()
					.onClick(() =>
						this.act(async () => {
							await this.plugin.catalog.adopt(addition);
							// Fields still at an earlier catalog value take the current one, as for any starter note;
							// the rest wait above as review cards.
							const { silent, review } = await this.plugin.catalog.plan();
							await this.plugin.catalog.apply(silent.filter((update) => update.id === addition.id));
							const settings = this.plugin.settings;
							settings.catalogPending = settings.catalogPending.filter((id) => id !== addition.id);
							await this.plugin.saveSettings();
							const waiting = review.filter((update) => update.id === addition.id).length;
							return waiting
								? `Linked ${addition.name}. Decide its ${waiting === 1 ? 'difference' : `${waiting} differences`} under Starter notes.`
								: `Linked ${addition.name}; it matches the catalog.`;
						}),
					),
			);
		setting.addButton((button) =>
			button.setButtonText('Skip').onClick(() =>
				this.act(async () => {
					await this.skip([addition]);
					return `Skipped ${addition.name}; your note stays outside the catalog.`;
				}),
			),
		);
	}

	/** Never offer these entries again: they leave the review, and the reminder, for good. */
	private async skip(additions: readonly CatalogAddition[]) {
		const ids = new Set(additions.map((addition) => addition.id));
		const settings = this.plugin.settings;
		settings.catalogSkipped = [...new Set([...settings.catalogSkipped, ...ids])];
		settings.catalogPending = settings.catalogPending.filter((id) => !ids.has(id));
		await this.plugin.saveSettings();
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

function show(field: CatalogField, value: FieldValue): string {
	if (value === null) return field === 'parent' ? 'None (standalone)' : field === 'catchAll' ? 'No' : 'Not set';
	if (field === 'abvTypical' && typeof value === 'number') return `${Math.round(value * 1000) / 10}%`;
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return String(value);
}

/** A field label inside a sentence: lowercase, except initialisms such as ABV. */
function lower(field: CatalogField): string {
	return FIELD_LABELS[field].replace(/\b[A-Z][a-z]/g, (start) => start.toLowerCase());
}

/** What **Use catalog’s** does to the note, in words. */
function change(update: CatalogFieldUpdate): string {
	const { field, next } = update;
	const label = FIELD_LABELS[field];
	if (field === 'parent')
		return next === null
			? 'the note becomes standalone, with no parent.'
			: `the note moves to ${show(field, next)}.`;
	if (next === null) return `the ${lower(field)} is cleared.`;
	if (field === 'description' || field === 'preparation') return `the catalog’s ${lower(field)} replaces yours.`;
	return `${label} becomes ${show(field, next)}.`;
}
