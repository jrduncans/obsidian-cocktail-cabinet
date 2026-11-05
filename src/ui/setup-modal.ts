import { Notice, Setting } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { STARTER_CATALOG } from '../catalog/catalog';
import { cabinetFolder } from '../core/schema';
import type { PlannedFile } from '../core/schema';
import { CabinetForm } from './form';

export class SetupModal extends CabinetForm {
	constructor(private plugin: CocktailCabinetPlugin) { super(plugin.app); }

	onOpen() {
		this.begin('Set up your cabinet', `Create ${STARTER_CATALOG.filter(entry => entry.kind === 'type').length} ingredient types with descriptions and optional family and category groupings. Include named bottle references with unknown availability and live Bases for browsing and editing your collection, plus the sections shown in each note. A new cabinet also gets a small example: limes, lemons, a house syrup, and two recipes. Record stock for the bottles you own, then add other stock and cocktail recipes.`);
		let root = this.plugin.settings.cabinetFolder;
		this.text('Cabinet folder', root, value => { root = value; }, 'All new cabinet files go inside this vault folder. Existing files are preserved.');
		const previewEl = this.contentEl.createEl('p', { attr: { role: 'status' } });
		new Setting(this.contentEl).setName('Review setup').addButton(button => button.setButtonText('Preview').onClick(() => this.run(async () => {
			const preview = await this.plugin.store.previewSetup(root);
			previewEl.setText(preview.conflicts.length
				? `Conflicts: ${preview.conflicts.slice(0, 5).join(', ')}. Choose another folder; existing files will not be replaced.`
				: [`${preview.create.length} to create, ${preview.update.length} to update, ${preview.keep.length} to keep.`, exampleText(preview.create), customizedText(preview.customized)].filter(Boolean).join(' '));
		})));
		const help = this.contentEl.createEl('p');
		help.appendText('Enable ');
		help.createEl('strong', { text: 'Bases' });
		help.appendText(' in ');
		help.createEl('strong', { text: 'Settings' });
		help.appendText(' → ');
		help.createEl('strong', { text: 'Core plugins' });
		help.appendText(' to use the views. Run setup again to add missing notes and views. Existing files are preserved, except the plugin-managed Related view, which is updated unless you’ve changed it. Link or embed new views from the cabinet’s ');
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
			new Notice([`Cabinet ready: ${result.created} created, ${result.updated} updated, ${result.kept} kept.`, customizedText(result.customized)].filter(Boolean).join(' '));
			this.close();
			await this.plugin.store.open(`${folder}/Cocktail Cabinet.md`);
		});
	}
}

function exampleText(create: readonly PlannedFile[]): string {
	const count = create.filter(file => file.example).length;
	return count ? `Includes ${count} example ${count === 1 ? 'note' : 'notes'}, with stock unknown.` : 'No stock or recipes are added.';
}

function customizedText(paths: readonly string[]): string {
	return paths.length ? `${paths.join(', ')} has your changes, so it wasn’t updated. Delete it and run setup again to get the current version.` : '';
}
