import { Notice, Plugin } from 'obsidian';
import { registerCli } from './cli';
import { registerCommands } from './commands';
import { loadSettings, CocktailCabinetSettingTab } from './settings';
import type { CocktailCabinetSettings } from './settings';
import { AvailabilityStore } from './vault/availability-store';
import { AVAILABILITY_VIEW, AvailabilityView } from './ui/availability-view';
import { UNLINKED_VIEW, UnlinkedView } from './ui/unlinked-view';
import { registerHoverSource } from './ui/view-leaves';
import { CabinetStore } from './vault/cabinet-store';
import { RecipeSync } from './vault/recipe-sync';
import { STANDARD_DRINK_GRAMS } from './core/alcohol-estimate';
import { ReviewUpdatesModal } from './ui/review-updates-modal';
import { NAVIGATION_SECTIONS_VERSION } from './core/navigation';
import { CATALOG_VERSION, CatalogSync } from './vault/catalog-sync';

export default class CocktailCabinetPlugin extends Plugin {
	settings!: CocktailCabinetSettings;
	store!: CabinetStore;
	availability!: AvailabilityStore;
	recipes!: RecipeSync;
	catalog!: CatalogSync;

	async onload() {
		this.settings = loadSettings(await this.loadData());
		this.store = new CabinetStore(
			this.app,
			() => this.settings.cabinetFolder,
			() => ({ percent: this.settings.lowStockPercent, ml: this.settings.lowStockMl }),
			() => STANDARD_DRINK_GRAMS[this.settings.drinkUnit],
		);
		this.availability = new AvailabilityStore(
			this.app,
			this.store,
			() => ({ percent: this.settings.lowStockPercent, ml: this.settings.lowStockMl }),
			() => this.settings.volumeUnit,
		);
		this.catalog = new CatalogSync(
			this.app,
			this.store,
			() => this.settings.catalogKept,
			() => this.settings.catalogSkipped,
		);
		this.registerView(AVAILABILITY_VIEW, (leaf) => new AvailabilityView(leaf, this));
		this.registerView(UNLINKED_VIEW, (leaf) => new UnlinkedView(leaf, this));
		registerHoverSource(this);
		registerCommands(this);
		registerCli(this);
		this.addSettingTab(new CocktailCabinetSettingTab(this.app, this));
		// Views and managed notes a release changed are updated once the vault is indexed.
		this.app.workspace.onLayoutReady(() => void this.syncCabinet());
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
			() => ({
				dilution: this.settings.dilution,
				topMl: this.settings.topMl,
				volumeUnit: this.settings.volumeUnit,
			}),
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

	/**
	 * Update the plugin's views and managed notes (docs/ownership.md). `force` is **Refresh cabinet
	 * notes**: every view that differs or is missing is rewritten, deleted managed notes are restored, and
	 * any changed managed note opens **Review cabinet updates**. Resource notes get any missing Related
	 * section when a release changes the section rules, and on Refresh.
	 */
	async syncCabinet(force = false): Promise<void> {
		const views = await this.syncViews(force);
		const sections = await this.syncSections(force);
		const catalog = await this.syncCatalog(force);
		let notes = 0;
		let review: string[] = [];
		try {
			const result = await this.store.syncManaged(this.settings.managedVersions, force);
			this.settings.managedVersions = result.written;
			await this.saveSettings();
			const changed = [...result.created, ...result.updated].map(noteName);
			notes = changed.length;
			if (changed.length)
				new Notice(
					`Cocktail Cabinet ${force ? 'restored' : 'updated'} ${changed.length === 1 ? 'a note' : `${changed.length} notes`}: ${changed.join(', ')}.`,
				);
			review = result.review.map(noteName);
		} catch (error) {
			new Notice(`Couldn’t update cabinet notes: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (catalog.review) review.push(catalog.review === 1 ? 'a starter note' : `${catalog.review} starter notes`);
		if (review.length && force) new ReviewUpdatesModal(this).open();
		else if (review.length)
			new Notice(
				`Cocktail Cabinet has updates waiting for review: ${review.join(', ')}. Run Review cabinet updates to compare.`,
				10000,
			);
		else if (force && !notes && !views && !sections && !catalog.updated)
			new Notice('Cabinet notes and views are already current.');
	}

	/**
	 * Update starter notes from the catalog when it changed, or with `force`: untouched fields silently;
	 * returns how many notes were updated and how many have changes waiting for review.
	 */
	private async syncCatalog(force: boolean): Promise<{ updated: number; review: number }> {
		if (!force && this.settings.catalogVersion === CATALOG_VERSION) return { updated: 0, review: 0 };
		try {
			const plan = await this.catalog.plan();
			const updated = await this.catalog.apply(plan.silent);
			this.settings.catalogVersion = CATALOG_VERSION;
			await this.saveSettings();
			if (updated.length)
				new Notice(
					`Cocktail Cabinet updated ${updated.length === 1 ? noteName(updated[0]!) : `${updated.length} starter notes`} from the catalog.`,
				);
			return {
				updated: updated.length,
				review: new Set(plan.review.map((item) => item.path)).size + plan.additions.length,
			};
		} catch (error) {
			new Notice(`Couldn’t update starter notes: ${error instanceof Error ? error.message : String(error)}`);
			return { updated: 0, review: 0 };
		}
	}

	/** Add missing Related sections to resource notes, when the rules changed or with `force`; returns how many. */
	private async syncSections(force: boolean): Promise<number> {
		if (!force && this.settings.sectionsVersion === NAVIGATION_SECTIONS_VERSION) return 0;
		try {
			const updated = await this.store.syncSections();
			this.settings.sectionsVersion = NAVIGATION_SECTIONS_VERSION;
			await this.saveSettings();
			if (updated.length)
				new Notice(
					`Cocktail Cabinet added missing sections to ${updated.length === 1 ? noteName(updated[0]!) : `${updated.length} notes`}.`,
				);
			return updated.length;
		} catch (error) {
			new Notice(`Couldn’t update note sections: ${error instanceof Error ? error.message : String(error)}`);
			return 0;
		}
	}

	/** Update the plugin's views; `force` rewrites every view that differs or is missing. */
	async syncViews(force = false): Promise<number> {
		try {
			const { updated, written } = await this.store.syncViews(this.settings.viewVersions, force);
			this.settings.viewVersions = written;
			await this.saveSettings();
			const names = updated.map((path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.base$/, ''));
			if (names.length)
				new Notice(
					`Cocktail Cabinet ${force ? 'refreshed' : 'updated'} ${names.length === 1 ? 'a view' : `${names.length} views`}: ${names.join(', ')}.`,
				);
			return names.length;
		} catch (error) {
			new Notice(`Couldn’t update cabinet views: ${error instanceof Error ? error.message : String(error)}`);
			return 0;
		}
	}
}

const noteName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
