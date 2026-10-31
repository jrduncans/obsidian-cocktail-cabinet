import { Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { STARTER_CATALOG } from '../catalog/catalog';
import { cabinetFolder } from '../core/schema';
import { CabinetForm } from './form';

export class SetupModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	onOpen() {
		this.begin('Set up your cabinet', `Create ${STARTER_CATALOG.filter(entry => entry.kind === 'type').length} ingredient types with descriptions and optional family and category groupings. Include six live Bases for browsing and editing your collection. Then add your own bottles, other stock, and cocktail recipes.`);
		let root = this.plugin.settings.cabinetFolder;
		this.text('Cabinet folder', root, value => { root = value; }, 'All new cabinet files go inside this vault folder. Existing files are preserved.');
		const previewEl = this.contentEl.createEl('p', { attr: { role: 'status' } });
		new Setting(this.contentEl).setName('Review setup').addButton(button => button.setButtonText('Preview').onClick(() => this.run(async () => {
			const preview = await this.plugin.store.previewSetup(root);
			previewEl.setText(preview.conflicts.length
				? `Conflicts: ${preview.conflicts.slice(0, 5).join(', ')}. Choose another folder; existing files will not be replaced.`
				: `${preview.create.length} files to create; ${preview.keep.length} existing files to keep. No owned stock or cocktail recipes will be added.`);
		})));
		const help = this.contentEl.createEl('p');
		help.appendText('Enable ');
		help.createEl('strong', { text: 'Bases' });
		help.appendText(' in ');
		help.createEl('strong', { text: 'Settings' });
		help.appendText(' → ');
		help.createEl('strong', { text: 'Core plugins' });
		help.appendText(' to use the views. Run setup again to add missing notes and views. Existing files are preserved. Link or embed new views from the cabinet’s ');
		help.createEl('strong', { text: 'Views' });
		help.appendText(' folder in an older home page.');
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
			new Notice(`Cabinet ready: ${result.created} files created, ${result.kept} kept.`);
			this.close();
			await this.plugin.store.open(`${folder}/Cocktail Cabinet.md`);
		});
	}
}
