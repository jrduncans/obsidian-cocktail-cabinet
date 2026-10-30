import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { loadSettings, CocktailCabinetSettingTab } from './settings';
import type { CocktailCabinetSettings } from './settings';
import { CabinetStore } from './vault/cabinet-store';

export default class CocktailCabinetPlugin extends Plugin {
	settings!: CocktailCabinetSettings;
	store!: CabinetStore;

	async onload() {
		this.settings = loadSettings(await this.loadData());
		this.store = new CabinetStore(this.app, () => this.settings.cabinetFolder);
		registerCommands(this);
		this.addSettingTab(new CocktailCabinetSettingTab(this.app, this));
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
