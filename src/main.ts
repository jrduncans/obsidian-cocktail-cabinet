import { Notice, Plugin } from 'obsidian';
import { registerCli } from './cli';
import { registerCommands } from './commands';
import { loadSettings, CocktailCabinetSettingTab } from './settings';
import type { CocktailCabinetSettings } from './settings';
import { AvailabilityStore } from './vault/availability-store';
import { AVAILABILITY_VIEW, AvailabilityView } from './ui/availability-view';
import { BUY_VIEW, BuyView } from './ui/buy-view';
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
		this.catalog = new CatalogSync(this.app, this.store, () => ({
			kept: this.settings.catalogKept,
			skipped: this.settings.catalogSkipped,
			seen: this.settings.catalogSeen,
			pending: this.settings.catalogPending,
		}));
		this.registerView(AVAILABILITY_VIEW, (leaf) => new AvailabilityView(leaf, this));
		this.registerView(BUY_VIEW, (leaf) => new BuyView(leaf, this));
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
		else if (review.length) this.reviewNotice(review);
		else if (force && !notes && !views && !sections && !catalog.updated)
			new Notice('Cabinet notes and views are already current.');
	}

	/**
	 * Waiting reviews stay on screen until dismissed, with a button that opens them, since a passing
	 * notice is easy to miss and nothing else prompts for **Review cabinet updates**.
	 */
	private reviewNotice(review: string[]) {
		const message = createFragment();
		message.createDiv({ text: `Cocktail Cabinet has updates waiting for review: ${review.join(', ')}.` });
		const button = message.createEl('button', { text: 'Review', cls: 'mod-cta cocktail-cabinet-notice-button' });
		const notice = new Notice(message, 0);
		button.addEventListener('click', () => {
			notice.hide();
			new ReviewUpdatesModal(this).open();
		});
	}

	/**
	 * Update starter notes from the catalog when it changed, with `force`, or until the cabinet's entries
	 * are first recorded: untouched fields silently, and entries new to the cabinet added. Returns how many
	 * notes were updated or added and how many have changes waiting for review.
	 */
	private async syncCatalog(force: boolean): Promise<{ updated: number; review: number }> {
		const current = this.settings.catalogVersion === CATALOG_VERSION && this.settings.catalogSeen !== null;
		if (!force && current) return { updated: 0, review: 0 };
		try {
			const result = await this.catalog.sync();
			this.settings.catalogVersion = CATALOG_VERSION;
			if (result) {
				this.settings.catalogSeen = result.seen;
				this.settings.catalogPending = result.pending;
			}
			await this.saveSettings();
			if (!result) return { updated: 0, review: 0 };
			const { updated, added } = result;
			if (updated.length)
				new Notice(
					`Cocktail Cabinet updated ${updated.length === 1 ? noteName(updated[0]!) : `${updated.length} starter notes`} from the catalog.`,
				);
			if (added.length) new Notice(`Cocktail Cabinet added new starter notes: ${listNames(added)}.`, 10000);
			return { updated: updated.length + added.length, review: result.review };
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
			const { updated, removed, written } = await this.store.syncViews(this.settings.viewVersions, force);
			this.settings.viewVersions = written;
			await this.saveSettings();
			const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.base$/, '');
			const names = updated.map(baseName);
			const gone = removed.length
				? ` Moved retired views to the trash: ${removed.map(baseName).join(', ')}.`
				: '';
			if (names.length)
				new Notice(
					`Cocktail Cabinet ${force ? 'refreshed' : 'updated'} ${names.length === 1 ? 'a view' : `${names.length} views`}: ${names.join(', ')}.${gone}`,
				);
			else if (gone) new Notice(`Cocktail Cabinet${gone}`);
			return names.length + removed.length;
		} catch (error) {
			new Notice(`Couldn’t update cabinet views: ${error instanceof Error ? error.message : String(error)}`);
			return 0;
		}
	}
}

const noteName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** Names in a notice: the first few, then how many more. */
function listNames(names: readonly string[], shown = 5): string {
	return names.length <= shown + 1
		? names.join(', ')
		: `${names.slice(0, shown).join(', ')}, and ${names.length - shown} more`;
}
