import { Notice, Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { loadSettings, CocktailCabinetSettingTab } from './settings';
import type { CocktailCabinetSettings } from './settings';
import { CabinetStore } from './vault/cabinet-store';
import { IngredientLinkSync } from './vault/ingredient-link-sync';

export default class CocktailCabinetPlugin extends Plugin {
	settings!: CocktailCabinetSettings;
	store!: CabinetStore;

	async onload() {
		this.settings = loadSettings(await this.loadData());
		this.store = new CabinetStore(
			this.app,
			() => this.settings.cabinetFolder,
			() => ({ percent: this.settings.lowStockPercent, ml: this.settings.lowStockMl }),
		);
		registerCommands(this);
		this.addSettingTab(new CocktailCabinetSettingTab(this.app, this));
		// Views a release changed are rewritten once the vault is indexed.
		this.app.workspace.onLayoutReady(() => void this.syncViews());
		this.syncIngredientLinks();
	}

	/**
	 * Keep recipes' `cc-ingredients` in step with their Ingredients sections: after each change, and once
	 * shortly after startup for edits made while Obsidian was closed or before this release.
	 */
	private syncIngredientLinks() {
		const links = new IngredientLinkSync(this.app, () => this.settings.cabinetFolder);
		this.register(() => links.cancel());
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.metadataCache.on('changed', (file, _data, cache) => links.changed(file, cache)),
			);
			const timer = window.setTimeout(() => void links.syncAll(), 5000);
			this.register(() => window.clearTimeout(timer));
		});
	}

	/** Settings synced from another device, including its recent logs, replace the ones loaded here. */
	async onExternalSettingsChange() {
		this.settings = loadSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Update the plugin's views; `force` rewrites every view that differs or is missing. */
	async syncViews(force = false): Promise<void> {
		try {
			const { updated, written } = await this.store.syncViews(this.settings.viewVersions, force);
			this.settings.viewVersions = written;
			await this.saveSettings();
			const names = updated.map((path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.base$/, ''));
			if (names.length)
				new Notice(
					`Cocktail Cabinet ${force ? 'refreshed' : 'updated'} ${names.length === 1 ? 'a view' : `${names.length} views`}: ${names.join(', ')}.`,
				);
			else if (force) new Notice('Cabinet views are already current.');
		} catch (error) {
			new Notice(`Couldn’t update cabinet views: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
