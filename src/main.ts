import { Notice, Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { loadSettings, CocktailCabinetSettingTab } from './settings';
import type { CocktailCabinetSettings } from './settings';
import { CabinetStore } from './vault/cabinet-store';
import { RecipeSync } from './vault/recipe-sync';

export default class CocktailCabinetPlugin extends Plugin {
	settings!: CocktailCabinetSettings;
	store!: CabinetStore;
	recipes!: RecipeSync;

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
		this.syncRecipes();
	}

	/**
	 * Keep recipes' derived properties (`cc-ingredients`, the alcohol estimate) in step: after each change,
	 * after a linked note's ABV or hierarchy changes, and once shortly after startup for edits made while
	 * Obsidian was closed or before this release.
	 */
	private syncRecipes() {
		this.recipes = new RecipeSync(
			this.app,
			() => this.settings.cabinetFolder,
			() => ({ dilution: this.settings.dilution, topMl: this.settings.topMl }),
		);
		this.register(() => this.recipes.cancel());
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.metadataCache.on('changed', (file, _data, cache) => this.recipes.changed(file, cache)),
			);
			const timer = window.setTimeout(() => void this.recipes.syncAll(), 5000);
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
