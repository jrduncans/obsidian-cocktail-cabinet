import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { tastingNoteLine } from '../core/logging-daily';
import { localDate } from '../core/notes';
import type { CabinetNote } from '../core/schema';
import type { LoggingDaily } from '../vault/logging-daily';
import { CabinetForm } from './form';

/** **Add tasting note**: an impression of a recipe, written to that day's daily note under the drink's “Made …” line. */
export class TastingNoteModal extends CabinetForm {
	private date = localDate();
	private note = '';

	constructor(
		app: App,
		private daily: LoggingDaily,
		private recipe: CabinetNote,
	) {
		super(app);
	}

	onOpen() {
		this.begin(
			`Tasting note: ${this.recipe.name}`,
			'Saved in the daily note, under the day’s “Made …” line for this drink when there is one. The recipe’s backlinks list every note.',
		);
		const area = this.area(
			'Note',
			this.note,
			(value) => {
				this.note = value;
			},
			'',
			4,
		).setClass('cocktail-cabinet-name');
		const input = area.controlEl.querySelector('textarea');
		window.setTimeout(() => input?.focus(), 0);
		this.text('Date', this.date, (value) => {
			this.date = value;
		})
			.controlEl.querySelector('input')
			?.setAttrs({ type: 'date', max: localDate(), 'aria-label': 'Date' });
		this.submit('Save', async () => {
			const line = tastingNoteLine(this.recipe, this.note);
			const preview = await this.daily.preview(null, this.date);
			if (preview.error) throw new Error(preview.error);
			await this.daily.addTastingNote(preview, this.recipe, line);
			this.close();
			new Notice(`Added to the daily note for ${preview.date}.`);
		});
	}
}
