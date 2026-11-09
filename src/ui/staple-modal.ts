import { Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { AVAILABILITY, stapleProperties } from '../core/stock';
import { CabinetForm } from './form';

/** One step for an everyday ingredient: a name and whether it's in the kitchen. */
export class StapleModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	onOpen() {
		this.begin('Add kitchen staple', 'An everyday ingredient tracked as itself, such as salt or mint. If you’d care which brand or batch, add an ingredient type instead.');
		let name = '', availability = 'Unknown';
		new Setting(this.contentEl).setName('Name').setClass('cocktail-cabinet-name')
			.addText(text => text.onChange(value => { name = value; }));
		this.select('Availability', AVAILABILITY, availability, value => { availability = value; });
		this.submit('Create note', async () => {
			const file = await this.plugin.store.create({ kind: 'ingredient', name, description: '', properties: stapleProperties(availability) });
			this.close();
			await this.plugin.store.open(file.path);
		});
	}
}
