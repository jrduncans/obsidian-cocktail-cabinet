import { App, PluginSettingTab, Setting } from 'obsidian';
import type CocktailCabinetPlugin from './main';
import { cabinetFolder } from './core/schema';
import { SetupModal } from './ui/setup-modal';

export interface CocktailCabinetSettings {
	cabinetFolder: string;
}

export const DEFAULT_SETTINGS: CocktailCabinetSettings = { cabinetFolder: 'Cocktails' };

export function loadSettings(data: unknown): CocktailCabinetSettings {
	if (data && typeof data === 'object' && 'cabinetFolder' in data && typeof data.cabinetFolder === 'string') {
		try { return { cabinetFolder: cabinetFolder(data.cabinetFolder) }; }
		catch { /* Older or manually edited settings fall back to the default folder. */ }
	}
	return { ...DEFAULT_SETTINGS };
}

export class CocktailCabinetSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CocktailCabinetPlugin) { super(app, plugin); }

	display() {
		this.containerEl.empty();
		// Older Obsidian versions use this renderer; newer versions can also index the definitions.
		for (const definition of this.getSettingDefinitions()) {
			const setting = new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc);
			definition.render?.(setting);
		}
	}

	getSettingDefinitions() {
		return [{
			name: 'Cabinet folder',
			desc: `Current folder: ${this.plugin.settings.cabinetFolder}. Setup can select an existing cabinet or create a new one. It does not move or convert existing collections.`,
			render: (setting: Setting) => {
				setting.addButton(button => button.setButtonText('Set up cabinet').onClick(() => new SetupModal(this.plugin).open()));
			},
		}, {
			name: 'Local notes',
			desc: 'All notes stay in your vault. This plugin uses no network services. Edit ingredient descriptions, stock properties, and recipes normally in Obsidian.',
		}];
	}
}
