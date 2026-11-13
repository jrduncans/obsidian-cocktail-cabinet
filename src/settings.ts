import { App, debounce, PluginSettingTab, Setting } from 'obsidian';
import type CocktailCabinetPlugin from './main';
import { DEFAULT_RESTOCK } from './core/restock';
import { cabinetFolder } from './core/schema';
import { CUSTOM_VIEWS_FOLDER } from './core/setup';
import { SetupModal } from './ui/setup-modal';

export interface CocktailCabinetSettings {
	cabinetFolder: string;
	/** Restock's Running low: the last bottle at or under this percent full. */
	lowStockPercent: number;
	/** Restock's Running low without a bottle size, and for other stock: at or under this many mL. */
	lowStockMl: number;
	/** Fingerprint of the version of each plugin view last written, by path (see `CabinetStore.syncViews`). */
	viewVersions: Record<string, string>;
}

export const DEFAULT_SETTINGS: CocktailCabinetSettings = {
	cabinetFolder: 'Cocktails',
	lowStockPercent: DEFAULT_RESTOCK.percent,
	lowStockMl: DEFAULT_RESTOCK.ml,
	viewVersions: {},
};

const positive = (value: unknown, max = Infinity): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

export function loadSettings(data: unknown): CocktailCabinetSettings {
	const settings: CocktailCabinetSettings = { ...DEFAULT_SETTINGS, viewVersions: {} };
	if (!data || typeof data !== 'object') return settings;
	const saved = data as Record<string, unknown>;
	if (typeof saved.cabinetFolder === 'string') {
		try {
			settings.cabinetFolder = cabinetFolder(saved.cabinetFolder);
		} catch {
			/* Older or manually edited settings fall back to the default folder. */
		}
	}
	if (positive(saved.lowStockPercent, 100)) settings.lowStockPercent = saved.lowStockPercent;
	if (positive(saved.lowStockMl)) settings.lowStockMl = saved.lowStockMl;
	const versions = saved.viewVersions;
	if (versions && typeof versions === 'object' && !Array.isArray(versions)) {
		settings.viewVersions = Object.fromEntries(
			Object.entries(versions).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
		);
	}
	return settings;
}

export class CocktailCabinetSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: CocktailCabinetPlugin,
	) {
		super(app, plugin);
	}

	/** Rewrite Restock once typing pauses, not on every keystroke. */
	private saveThresholds = debounce(
		async () => {
			await this.plugin.saveSettings();
			await this.plugin.syncViews();
		},
		800,
		true,
	);

	display() {
		this.containerEl.empty();
		// Older Obsidian versions use this renderer; newer versions can also index the definitions.
		for (const definition of this.getSettingDefinitions()) {
			const setting = new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc);
			definition.render?.(setting);
		}
	}

	/** A number setting that saves valid input and rewrites Restock; other input is ignored until fixed. */
	private threshold(setting: Setting, key: 'lowStockPercent' | 'lowStockMl', max: number) {
		setting.addText((text) => {
			text.inputEl.inputMode = 'decimal';
			text.setValue(String(this.plugin.settings[key])).onChange((value) => {
				const number = Number(value.trim());
				if (!value.trim() || !positive(number, max)) return;
				this.plugin.settings[key] = number;
				this.saveThresholds();
			});
		});
	}

	getSettingDefinitions() {
		return [
			{
				name: 'Cabinet folder',
				desc: `Current folder: ${this.plugin.settings.cabinetFolder}. Setup can select an existing cabinet or create a new one. It does not move or convert existing collections.`,
				render: (setting: Setting) => {
					setting.addButton((button) =>
						button.setButtonText('Set up cabinet').onClick(() => new SetupModal(this.plugin).open()),
					);
				},
			},
			{
				name: 'Running low: percent full',
				desc: 'In the Restock view, the last bottle of a kind counts as running low at or under this percent full.',
				render: (setting: Setting) => this.threshold(setting, 'lowStockPercent', 100),
			},
			{
				name: 'Running low: mL',
				desc: 'For bottles without a size, and other stock tracked in mL, running low means at or under this many mL.',
				render: (setting: Setting) => this.threshold(setting, 'lowStockMl', Infinity),
			},
			{
				name: 'Cabinet views',
				desc: `The Bases in the cabinet's Views folder belong to the plugin, which updates them in new releases. To change one, copy it into ${CUSTOM_VIEWS_FOLDER} and edit the copy. Refresh restores the originals.`,
				render: (setting: Setting) => {
					setting.addButton((button) =>
						button.setButtonText('Refresh views').onClick(() => void this.plugin.syncViews(true)),
					);
				},
			},
			{
				name: 'Local notes',
				desc: 'All notes stay in your vault. This plugin uses no network services. Edit ingredient descriptions, stock properties, and recipes normally in Obsidian.',
			},
		];
	}
}
