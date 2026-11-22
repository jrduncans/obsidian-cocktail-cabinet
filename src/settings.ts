import { App, debounce, PluginSettingTab, Setting } from 'obsidian';
import type CocktailCabinetPlugin from './main';
import { DEFAULT_RESTOCK } from './core/restock';
import { cabinetFolder } from './core/schema';
import { CUSTOM_VIEWS_FOLDER } from './core/setup';
import { isLogRecord, KEPT_LOGS } from './core/log-undo';
import type { LogRecord } from './core/log-undo';
import { DEFAULT_DILUTION, DEFAULT_TOP_ML } from './core/alcohol-estimate';
import type { Preparation } from './core/alcohol-estimate';
import { DEFAULT_VOLUME_UNIT } from './core/recipe-amount';
import type { VolumeUnit } from './core/recipe-amount';
import { SetupModal } from './ui/setup-modal';

export interface CocktailCabinetSettings {
	cabinetFolder: string;
	/** Restock's Running low: the last bottle at or under this percent full. */
	lowStockPercent: number;
	/** Restock's Running low without a bottle size, and for other stock: at or under this many mL. */
	lowStockMl: number;
	/** Fingerprint of the version of each plugin view last written, by path (see `CabinetStore.syncViews`). */
	viewVersions: Record<string, string>;
	/** Fingerprint of the plugin's version of each managed note last handled, by path (see `CabinetStore.syncManaged`). */
	managedVersions: Record<string, string>;
	/** The section rules last applied to resource notes (see `CabinetStore.syncSections`). */
	sectionsVersion: string;
	/** The catalog version starter notes were last checked against (see `CatalogSync`). */
	catalogVersion: string;
	/** Starter note fields kept in review: `<id>|<field>` → the catalog value kept against, as JSON. */
	catalogKept: Record<string, string>;
	/** Catalog entries the user chose not to add. */
	catalogSkipped: string[];
	/** The latest logs, oldest first, kept for **Undo last log**. */
	recentLogs: LogRecord[];
	/** Alcohol estimate: water added by chilling, as a share of the pour, by preparation. */
	dilution: Record<Preparation, number>;
	/** Alcohol estimate: the pour assumed for a “top” or “fill” with no amount, in mL. */
	topMl: number;
	/** How alcohol is shown in standard drinks: US (14 g) or UK units (8 g). */
	drinkUnit: 'us' | 'uk';
	/** Logging adds each drink's alcohol estimate to the daily note: a running total and the drinks on its line. */
	dailyAlcohol: boolean;
	/** Which stated amount logging and estimates use when a recipe line gives both US fluid ounces and mL. */
	volumeUnit: VolumeUnit;
}

export const DEFAULT_SETTINGS: CocktailCabinetSettings = {
	cabinetFolder: 'Cocktails',
	lowStockPercent: DEFAULT_RESTOCK.percent,
	lowStockMl: DEFAULT_RESTOCK.ml,
	viewVersions: {},
	managedVersions: {},
	sectionsVersion: '',
	catalogVersion: '',
	catalogKept: {},
	catalogSkipped: [],
	recentLogs: [],
	dilution: { ...DEFAULT_DILUTION },
	topMl: DEFAULT_TOP_ML,
	drinkUnit: 'us',
	dailyAlcohol: false,
	volumeUnit: DEFAULT_VOLUME_UNIT,
};

const positive = (value: unknown, max = Infinity): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

export function loadSettings(data: unknown): CocktailCabinetSettings {
	const settings: CocktailCabinetSettings = {
		...DEFAULT_SETTINGS,
		viewVersions: {},
		managedVersions: {},
		catalogKept: {},
		catalogSkipped: [],
		recentLogs: [],
		dilution: { ...DEFAULT_DILUTION },
	};
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
	const record = (value: unknown): Record<string, string> =>
		value && typeof value === 'object' && !Array.isArray(value)
			? Object.fromEntries(
					Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
				)
			: {};
	settings.viewVersions = record(saved.viewVersions);
	settings.managedVersions = record(saved.managedVersions);
	if (typeof saved.sectionsVersion === 'string') settings.sectionsVersion = saved.sectionsVersion;
	if (typeof saved.catalogVersion === 'string') settings.catalogVersion = saved.catalogVersion;
	settings.catalogKept = record(saved.catalogKept);
	if (Array.isArray(saved.catalogSkipped))
		settings.catalogSkipped = saved.catalogSkipped.filter((id): id is string => typeof id === 'string');
	const dilution = saved.dilution;
	if (dilution && typeof dilution === 'object') {
		for (const key of Object.keys(DEFAULT_DILUTION) as Preparation[]) {
			const value = (dilution as Record<string, unknown>)[key];
			if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2)
				settings.dilution[key] = value;
		}
	}
	if (positive(saved.topMl, 1000)) settings.topMl = saved.topMl;
	if (saved.drinkUnit === 'uk') settings.drinkUnit = 'uk';
	if (saved.dailyAlcohol === true) settings.dailyAlcohol = true;
	if (saved.volumeUnit === 'oz' || saved.volumeUnit === 'ml') settings.volumeUnit = saved.volumeUnit;
	if (Array.isArray(saved.recentLogs)) settings.recentLogs = saved.recentLogs.filter(isLogRecord).slice(-KEPT_LOGS);
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

	/** Save an estimate setting once typing pauses, then recalculate recipes. */
	private saveEstimate = debounce(
		async () => {
			await this.plugin.saveSettings();
			this.plugin.recipes.refresh();
		},
		800,
		true,
	);

	/** A percent field for one preparation's dilution; other input is ignored until fixed. */
	private dilutionInput(setting: Setting, preparation: Preparation, label: string) {
		setting.addText((text) => {
			text.inputEl.inputMode = 'decimal';
			text.inputEl.setAttribute('aria-label', `${label} dilution (%)`);
			text.inputEl.addClass('cocktail-cabinet-dilution');
			text.setPlaceholder(label)
				.setValue(String(Number((this.plugin.settings.dilution[preparation] * 100).toFixed(2))))
				.onChange((value) => {
					const number = Number(value.trim());
					if (!value.trim() || !Number.isFinite(number) || number < 0 || number > 200) return;
					this.plugin.settings.dilution[preparation] = number / 100;
					this.saveEstimate();
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
				name: 'Amounts given in oz and mL',
				desc: 'When a recipe line gives both, as in “1 oz (30 ml)” or “1 oz / 30 ml”, logging, availability, and alcohol estimates use this one. Bottles stay in mL.',
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions({ oz: 'US fluid ounces', ml: 'mL' })
							.setValue(this.plugin.settings.volumeUnit)
							.onChange(async (value) => {
								this.plugin.settings.volumeUnit = value === 'ml' ? 'ml' : 'oz';
								await this.plugin.saveSettings();
								this.plugin.recipes.refresh();
							}),
					);
				},
			},
			{
				name: 'Standard drink',
				desc: 'Alcohol estimates show mL of alcohol and standard drinks of this size.',
				render: (setting: Setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions({ us: 'US: 14 g of alcohol', uk: 'UK unit: 8 g of alcohol' })
							.setValue(this.plugin.settings.drinkUnit)
							.onChange(async (value) => {
								this.plugin.settings.drinkUnit = value === 'uk' ? 'uk' : 'us';
								await this.plugin.saveSettings();
								await this.plugin.syncViews();
							}),
					);
				},
			},
			{
				name: 'Record alcohol in daily notes',
				desc: 'When a log adds to the daily note, also add its alcohol estimate: the standard drinks on its “Made …” line and the mL of alcohol to the note’s cc-alcohol-ml total.',
				render: (setting: Setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.dailyAlcohol).onChange(async (value) => {
							this.plugin.settings.dailyAlcohol = value;
							await this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: 'Dilution (%)',
				desc: 'Water that chilling adds, as a percent of the pour: built, stirred, shaken, and blended. A recipe’s cc-dilution property replaces it. Defaults follow BevNap.',
				render: (setting: Setting) => {
					this.dilutionInput(setting, 'built', 'Built');
					this.dilutionInput(setting, 'stirred', 'Stirred');
					this.dilutionInput(setting, 'shaken', 'Shaken');
					this.dilutionInput(setting, 'blended', 'Blended');
				},
			},
			{
				name: 'Assumed top (mL)',
				desc: 'The pour assumed for “top with” or “fill with” lines that give no amount. Estimates using it are marked rough.',
				render: (setting: Setting) => {
					setting.addText((text) => {
						text.inputEl.inputMode = 'decimal';
						text.setValue(String(this.plugin.settings.topMl)).onChange((value) => {
							const number = Number(value.trim());
							if (!value.trim() || !positive(number, 1000)) return;
							this.plugin.settings.topMl = number;
							this.saveEstimate();
						});
					});
				},
			},
			{
				name: 'Cabinet notes and views',
				desc: `The plugin keeps the Cocktail Cabinet and Shopping list notes and the Bases in the Views folder current. An edited note is left alone and offered in Review cabinet updates. To change a view, copy it into ${CUSTOM_VIEWS_FOLDER} and edit the copy. Refresh restores the original views and any notes you haven't edited.`,
				render: (setting: Setting) => {
					setting.addButton((button) =>
						button.setButtonText('Refresh').onClick(() => void this.plugin.syncCabinet(true)),
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
