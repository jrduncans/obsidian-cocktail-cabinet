import type CocktailCabinetPlugin from '../main';
import { checkOneOffName } from '../core/one-off';
import type { OneOff } from '../core/one-off';
import { CabinetForm } from './form';
import { ingredientRows, RecipeIngredients } from './recipe-ingredients';

/**
 * The first step of logging a drink without a recipe note: an optional name and the ingredients, entered like
 * a recipe's. A riff starts from a recipe's lines. Review hands the one-off to the logging dialog.
 */
export class OneOffModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin, private review: (oneOff: OneOff) => void,
		private initial: OneOff = { name: '', lines: [] }) { super(plugin.app); }

	onOpen() {
		const { riffOn } = this.initial;
		this.begin(riffOn ? `Riff on ${riffOn.name}` : 'Log a one-off',
			'Goes in your daily note, with no recipe note. If it’s a keeper, run Save one-off as recipe on that daily note.');
		const ingredients = new RecipeIngredients(this.plugin, this.contentEl, ingredientRows(this.plugin, this.initial.lines, riffOn?.path),
			'Amounts per serving. Start typing to pick what you poured, so logging can subtract it; plain text is fine for anything else.');
		// After the ingredients, so the name reads as the extra it is.
		let name = this.initial.name;
		this.text('Name (optional)', name, value => { name = value; }).setClass('cocktail-cabinet-name');
		this.submit('Review', () => {
			const oneOff: OneOff = { name: checkOneOffName(name), lines: ingredients.lines(), riffOn };
			this.close();
			this.review(oneOff);
			return Promise.resolve();
		});
		// Start where every one-off starts: the first amount. Modals focus their first field once open.
		window.setTimeout(() => this.contentEl.querySelector<HTMLInputElement>('.cocktail-cabinet-amount-input')?.focus(), 0);
	}
}
