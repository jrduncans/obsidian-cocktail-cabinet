import { Notice, TFile, setIcon } from 'obsidian';
import { toBuy } from '../core/availability-lists';
import { PROP } from '../core/schema';
import type CocktailCabinetPlugin from '../main';
import type { CabinetAvailability } from '../vault/availability-store';
import { AvailabilityBase } from './availability-view';
import { openView } from './view-leaves';

export const BUY_VIEW = 'cocktail-cabinet-buy';

/**
 * What should I buy? The missing ingredients that would let you make the most recipes, each with a
 * button for the shopping list. Its own tab, apart from What can I make?: shopping is a different
 * question from choosing a drink (docs/availability.md).
 */
export class BuyView extends AvailabilityBase {
	getViewType() {
		return BUY_VIEW;
	}
	getDisplayText() {
		return 'What should I buy?';
	}
	getIcon() {
		return 'shopping-cart';
	}

	protected renderData(el: HTMLElement, data: CabinetAvailability) {
		el.createEl('p', {
			cls: 'setting-item-description',
			text: 'What’s missing, by how many recipes buying it alone would let you make.',
		});
		const items = toBuy(data.recipes).filter((item) => item.unlocks.length || item.closer.length);
		const recipeNames = new Map(data.recipes.map((entry) => [entry.path, entry.name]));
		const list = el.createEl('ul', { cls: 'cocktail-cabinet-pane-buy' });
		for (const item of items.slice(0, 100)) {
			const row = list.createEl('li');
			const head = row.createDiv({ cls: 'cocktail-cabinet-pane-row' });
			item.targets.forEach((path, index) => {
				if (index) head.appendText(' or ');
				this.noteLink(head, path, this.name(path));
			});
			for (const path of item.targets) this.shoppingButton(head, path, item.targets.length > 1);
			const detail = row.createDiv({ cls: 'cocktail-cabinet-pane-caveats' });
			if (item.unlocks.length) {
				detail.appendText(`Unlocks ${item.unlocks.length}: `);
				item.unlocks.forEach((path, index) => {
					if (index) detail.appendText(', ');
					this.noteLink(detail, path, recipeNames.get(path) ?? path);
				});
			}
			if (item.closer.length)
				detail.appendText(`${item.unlocks.length ? '. ' : ''}${item.closer.length} more closer.`);
		}
		if (!items.length) el.createEl('p', { text: 'Nothing missing.' });
	}

	/** Mark a note for purchase; never removes a flag, since the shopping list is where that's done. */
	private shoppingButton(el: HTMLElement, path: string, named: boolean) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const flagged = this.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.shoppingList] === true;
		const label = flagged
			? 'On shopping list'
			: named
				? `Add ${this.name(path)} to shopping list`
				: 'Add to shopping list';
		const button = el.createEl('button', {
			cls: 'clickable-icon cocktail-cabinet-pane-shop',
			attr: { 'aria-label': label },
		});
		setIcon(button, flagged ? 'shopping-cart' : 'list-plus');
		button.disabled = flagged;
		button.addEventListener('click', () => {
			void this.app.fileManager
				.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
					frontmatter[PROP.shoppingList] = true;
				})
				.then(() => new Notice(`Added ${this.name(path)} to the shopping list.`))
				.catch(
					(error: unknown) =>
						new Notice(error instanceof Error ? error.message : 'Couldn’t update the shopping list.'),
				);
		});
	}
}

/** Open the view as a main-area tab, reusing one already open. */
export async function openBuy(plugin: CocktailCabinetPlugin): Promise<void> {
	await openView(plugin, BUY_VIEW);
}
