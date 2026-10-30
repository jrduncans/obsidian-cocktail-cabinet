import { Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { STARTER_CATALOG } from '../catalog/catalog';
import { cabinetFolder } from '../core/schema';
import { CabinetForm } from './form';

export class SetupModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	onOpen() {
		this.begin('Set up your cabinet', `Create ${STARTER_CATALOG.filter(entry => entry.kind === 'type').length} ingredient types with descriptions and optional family and category groupings. Then add your own bottles, other stock, and cocktail recipes.`);
		let root = this.plugin.settings.cabinetFolder;
		this.text('Cabinet folder', root, value => { root = value; }, 'All new cabinet notes go inside this vault folder. Existing notes are preserved.');
		const previewEl = this.contentEl.createEl('p', { attr: { role: 'status' } });
		new Setting(this.contentEl).setName('Review setup').addButton(button => button.setButtonText('Preview').onClick(() => this.run(async () => {
			const preview = await this.plugin.store.previewSetup(root);
			previewEl.setText(preview.conflicts.length
				? `Conflicts: ${preview.conflicts.slice(0, 5).join(', ')}. Choose another folder; existing notes will not be replaced.`
				: `${preview.create.length} notes to create; ${preview.keep.length} existing notes to keep. No owned stock or cocktail recipes will be added.`);
		})));
		this.contentEl.createEl('p', { text: 'Setup can be run again to add missing starter notes. If interrupted, run it again to finish. Existing ingredient pages are kept as they are.' });
		this.submit('Create cabinet', async () => {
			const folder = cabinetFolder(root);
			const result = await this.plugin.store.setup(folder);
			const previousFolder = this.plugin.settings.cabinetFolder;
			this.plugin.settings.cabinetFolder = folder;
			try { await this.plugin.saveSettings(); }
			catch (error) {
				this.plugin.settings.cabinetFolder = previousFolder;
				throw error;
			}
			new Notice(`Cabinet ready: ${result.created} notes created, ${result.kept} kept.`);
			this.close();
			await this.plugin.store.open(`${folder}/Cocktail Cabinet.md`);
		});
	}
}
