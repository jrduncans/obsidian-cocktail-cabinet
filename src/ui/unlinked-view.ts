import {
	ButtonComponent,
	debounce,
	ItemView,
	Menu,
	Notice,
	SearchComponent,
	TextComponent,
	ToggleComponent,
} from 'obsidian';
import { openView, viewLink } from './view-leaves';
import type { WorkspaceLeaf } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { suggestIngredient } from '../core/recipe-import';
import { groupLines, ingredientParts, linkedLinePreview, linkTextError, onlyLinesMoved } from '../core/unlinked-lines';
import type { UnlinkedGroup, UnlinkedUse } from '../core/unlinked-lines';
import { RecipeLinkStore } from '../vault/recipe-links';
import { addCreateItems, pickIngredient } from './link-choice';
import { rememberAfterLink, renderPreview, renderRemember } from './link-text';
import { defaultLinkSource, wordingLink } from '../core/link-text';
import type { LinkTextSource } from '../core/link-text';
import { rememberingNotes } from '../core/written-as';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const recipeCount = (group: UnlinkedGroup) => new Set(group.uses.map((use) => use.recipe.path)).size;
/** Lines shown in a wording's card before "Show all", so what the wording means is visible before choosing. */
const PREVIEW_LINES = 3;

export const UNLINKED_VIEW = 'cocktail-cabinet-unlinked';

/**
 * Reviewable unlinked lines across recipes, linked in bulk by wording. A main-area tab, so each recipe
 * opens in a split beside it. It reads the recipes when opened, on Refresh, and quietly after a recipe
 * changes: when only line numbers moved (a link's synced `cc-ingredients` adds a line above the
 * ingredients) it takes the new numbers without redrawing, so choices in progress aren't lost, and it
 * redraws only when lines themselves changed. Linking checks each line against what was read.
 */
export class UnlinkedView extends ItemView {
	private links: RecipeLinkStore;
	private groups: UnlinkedGroup[] = [];
	private filter = '';
	private showGarnishes = false;
	private busy = false;
	private closed = false;
	/** Counts reads, so an older read finishing late doesn't replace a newer one. */
	private reads = 0;
	/** A recipe changed during a link; read again once it's done. */
	private stale = false;
	private summaryEl!: HTMLElement;
	private listEl!: HTMLElement;
	/**
	 * The note chosen for a wording, the lines (by index into its uses) still ticked, and the link text:
	 * the cabinet name (keeping other words beside it, line by line), each line's own wording, or typed.
	 */
	private pending = new Map<
		string,
		{
			note: CabinetNote;
			ticked: Set<number>;
			source: LinkTextSource;
			text: string;
			remember?: boolean;
			/** The link text choice is open; otherwise one line says what the link will show. */
			editText?: boolean;
		}
	>();
	/** Wordings whose cards show every line. */
	private expanded = new Set<string>();

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CocktailCabinetPlugin,
	) {
		super(leaf);
		this.links = new RecipeLinkStore(plugin.app, plugin.store);
	}

	getViewType() {
		return UNLINKED_VIEW;
	}
	getDisplayText() {
		return 'Unlinked ingredients';
	}
	getIcon() {
		return 'unlink';
	}

	async onOpen() {
		this.contentEl.addClass('cocktail-cabinet-pane', 'cocktail-cabinet-form', 'cocktail-cabinet-unlinked-pane');
		this.render();
		this.listEl.setText('Loading…');
		// A pane restored with the workspace waits for the vault to be indexed.
		this.app.workspace.onLayoutReady(() => {
			void this.read();
			const refresh = debounce(() => this.refresh(), 500, true);
			this.registerEvent(
				this.app.metadataCache.on('changed', (file) => {
					if (file.path.startsWith(`${this.plugin.store.root}/`)) refresh();
				}),
			);
		});
		return Promise.resolve();
	}

	async onClose() {
		this.closed = true;
		this.contentEl.empty();
		return Promise.resolve();
	}

	/**
	 * Read the recipes again, keeping the toolbar and any choice whose wording still covers the same
	 * lines; a choice whose lines changed is dropped, since its ticks point at lines by position.
	 */
	reload() {
		if (this.busy) return;
		this.summaryEl.empty();
		this.listEl.setText('Loading…');
		void this.read();
	}

	/** Read again after a recipe changed, unless a link is being written; that reads again when done. */
	private refresh() {
		if (this.closed) return;
		if (this.busy) this.stale = true;
		else void this.read(true);
	}

	/**
	 * Read the recipes. Quietly, a read that only moved line numbers updates them in place with nothing
	 * redrawn; otherwise the list is redrawn, keeping each choice whose lines are the same.
	 */
	private async read(quiet = false) {
		const read = ++this.reads;
		try {
			if (!(await this.plugin.store.isSetUp())) {
				if (!this.closed && read === this.reads) this.listEl.setText('The cabinet isn’t set up yet.');
				return;
			}
			const groups = await this.links.unlinked({ includeGarnishes: this.showGarnishes });
			if (this.closed || read !== this.reads) return;
			// A link started while reading changes the groups itself; it reads again when it's done.
			if (this.busy) {
				this.stale = true;
				return;
			}
			if (quiet && onlyLinesMoved(this.groups, groups)) {
				const fresh = new Map(groups.map((group) => [group.key, group.uses]));
				for (const group of this.groups) group.uses = fresh.get(group.key)!;
				return;
			}
			const before = new Map(this.groups.map((group) => [group.key, groupLines(group)]));
			this.groups = groups;
			const after = new Map(this.groups.map((group) => [group.key, groupLines(group)]));
			for (const key of [...this.pending.keys()])
				if (!after.has(key) || after.get(key) !== before.get(key)) this.pending.delete(key);
			this.renderList();
		} catch (error) {
			if (!this.closed && read === this.reads && !quiet)
				this.listEl.setText(error instanceof Error ? error.message : 'Couldn’t read the recipes.');
		}
	}

	/** The toolbar, summary, and list, built once; reading the recipes again fills only the list. */
	private render() {
		this.contentEl.empty();
		// Controls for the whole list, kept in view while scrolling.
		const bar = this.contentEl.createDiv({ cls: 'cocktail-cabinet-pane-toolbar' });
		const search = new SearchComponent(bar)
			.setPlaceholder('Filter wordings, such as gin')
			.setValue(this.filter)
			.onChange((value) => {
				this.filter = value.trim().toLowerCase();
				this.renderList();
			});
		search.inputEl.setAttribute('aria-label', 'Filter wordings');
		const garnishes = bar.createDiv({
			cls: 'cocktail-cabinet-pane-toolbar-item',
			attr: { title: 'Include marked garnishes that match an ingredient' },
		});
		const toggle = new ToggleComponent(garnishes).setValue(this.showGarnishes).onChange((value) => {
			if (this.busy) {
				toggle.setValue(this.showGarnishes);
				return;
			}
			this.showGarnishes = value;
			this.reload();
		});
		toggle.toggleEl.setAttribute('aria-label', 'Show garnishes');
		// The toggle isn't a form control, so its words switch it by hand.
		garnishes
			.createSpan({ cls: 'cocktail-cabinet-pane-toolbar-label', text: 'Show garnishes' })
			.addEventListener('click', () => {
				toggle.setValue(!toggle.getValue());
			});
		new ButtonComponent(bar)
			.setIcon('refresh-cw')
			.setTooltip('Read the recipes again')
			.onClick(() => this.reload());
		this.summaryEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-unlinked-summary' });
		this.listEl = this.contentEl.createDiv({ cls: 'cocktail-cabinet-unlinked' });
	}

	private renderSummary() {
		const lines = this.groups.reduce((sum, group) => sum + group.uses.length, 0);
		const recipes = new Set(this.groups.flatMap((group) => group.uses.map((use) => use.recipe.path))).size;
		this.summaryEl.setText(
			lines
				? `${plural(lines, 'unlinked ingredient line')} in ${plural(recipes, 'recipe')}. Choosing a note for a wording links it in every recipe listed; you can untick any where it means something else.`
				: 'No unlinked ingredients to review.',
		);
	}

	private renderList() {
		this.renderSummary();
		this.listEl.empty();
		const shown = this.groups.filter((group) => !this.filter || group.key.includes(this.filter));
		for (const group of shown)
			this.renderGroup(this.listEl.createDiv({ cls: 'cocktail-cabinet-unlinked-group' }), group);
		if (this.groups.length && !shown.length) this.listEl.createEl('p', { text: 'No wordings match.' });
	}

	private renderGroup(el: HTMLElement, group: UnlinkedGroup) {
		el.empty();
		const recipes = recipeCount(group);
		const head = el.createDiv({ cls: 'cocktail-cabinet-unlinked-head' });
		head.createSpan({ cls: 'cocktail-cabinet-unlinked-wording', text: group.wording });
		const count = head.createSpan({ cls: 'cocktail-cabinet-unlinked-count' });
		const pending = this.pending.get(group.key);
		if (recipes === 1) this.recipeLink(count, group.uses[0]!.recipe);
		else
			count.setText(
				`${plural(recipes, 'recipe')}${group.uses.length > recipes ? `, ${group.uses.length} lines` : ''}`,
			);
		const choose = (note: CabinetNote) => {
			const source = defaultLinkSource(group.wording, note, this.plugin.settings.linkText);
			this.pending.set(group.key, {
				note,
				ticked: new Set(group.uses.map((_use, index) => index)),
				source,
				text: source === 'name' ? note.name : group.wording,
			});
			this.renderGroup(el, group);
		};
		const list = el.createEl('ul', { cls: 'cocktail-cabinet-unlinked-uses' });
		if (!pending) {
			// The lines first, so what the wording means is plain before choosing what it links to.
			const all = this.expanded.has(group.key) || group.uses.length <= PREVIEW_LINES;
			for (const use of all ? group.uses : group.uses.slice(0, PREVIEW_LINES)) {
				const item = list.createEl('li');
				this.recipeLink(item, use.recipe);
				item.appendText(': ');
				item.createSpan({ text: use.text });
			}
			if (!all) {
				const more = list.createEl('li').createEl('a', {
					cls: 'cocktail-cabinet-unlinked-more',
					text: `Show all ${group.uses.length} lines`,
					href: '#',
				});
				more.addEventListener('click', (event) => {
					event.preventDefault();
					this.expanded.add(group.key);
					this.renderGroup(el, group);
				});
			}
		}
		// Every line once a note is chosen, ticked and shown as it will read, so nothing is linked unseen.
		const renderUses = () => {
			if (!pending) return;
			list.empty();
			group.uses.forEach((use, index) => {
				const item = list.createEl('li');
				const box = item.createEl('input', {
					type: 'checkbox',
					attr: { 'aria-label': `Link in ${use.recipe.name}` },
				});
				box.checked = pending.ticked.has(index);
				box.addEventListener('change', () => {
					if (box.checked) pending.ticked.add(index);
					else pending.ticked.delete(index);
					update();
				});
				item.appendText(' ');
				this.recipeLink(item, use.recipe);
				item.appendText(': ');
				renderPreview(item.createSpan(), linkedLinePreview(use.text, this.lineLink(use, pending)));
			});
		};
		renderUses();

		// What to link this wording to: the likely notes first, each saying what kind of note it is and
		// whether it remembers this wording (those come first). Nothing starts chosen, so each wording
		// gets a look at its lines. The chosen one stays here, highlighted; choosing another switches.
		const actions = el.createDiv({ cls: 'cocktail-cabinet-unlinked-actions' });
		const notes = this.plugin.store.notes();
		const suggested = suggestIngredient(group.wording, notes);
		const remembering = new Set(rememberingNotes(group.wording, notes).map((note) => note.path));
		if (pending && !suggested.some((note) => note.path === pending.note.path)) suggested.unshift(pending.note);
		actions.createSpan({ cls: 'cocktail-cabinet-unlinked-label', text: 'Link to' });
		for (const note of suggested) {
			const chosen = pending?.note.path === note.path;
			const button = new ButtonComponent(actions)
				.setClass('cocktail-cabinet-unlinked-suggestion')
				.setTooltip(chosen ? `Linking to ${note.path}` : `Link to ${note.path}`)
				.onClick(() => {
					if (!chosen) choose(note);
				});
			button.buttonEl.toggleClass('is-active', chosen);
			button.buttonEl.setAttribute('aria-pressed', String(chosen));
			button.buttonEl.createSpan({ text: note.name });
			button.buttonEl.createSpan({
				cls: 'cocktail-cabinet-unlinked-kind',
				text: remembering.has(note.path) ? `${note.kind}, remembered` : note.kind,
			});
			if (remembering.has(note.path))
				button.setTooltip(`${chosen ? 'Linking' : 'Link'} to ${note.path}, which remembers this wording`);
		}
		if (suggested.length) actions.createSpan({ cls: 'cocktail-cabinet-unlinked-label', text: 'or' });
		new ButtonComponent(actions)
			.setButtonText(suggested.length ? 'Another note…' : 'A note…')
			.onClick(() => pickIngredient(this.plugin, choose));
		new ButtonComponent(actions).setButtonText('New note…').onClick((event) => {
			const menu = new Menu();
			addCreateItems(menu, this.plugin, group.wording, choose);
			menu.showAtMouseEvent(event);
		});
		if (!pending) return;

		// Everything the Link button will do, beside it, pinned to the bottom of the window while the card shows.
		const bar = el.createDiv({ cls: 'cocktail-cabinet-unlinked-commit' });
		const summary = bar.createDiv({ cls: 'cocktail-cabinet-unlinked-commit-summary' });
		const shows = bar.createDiv({ cls: 'cocktail-cabinet-unlinked-shows' });
		shows.createSpan({ cls: 'cocktail-cabinet-unlinked-label', text: 'Link shows' });
		const options: [LinkTextSource, string, string][] = [
			['original', 'As written', 'Each recipe keeps its own wording'],
			['name', pending.note.name, 'The note’s name; other words in a line stay beside it'],
			['typed', 'Your own…', 'The same text in every ticked line'],
		];
		const sourceButtons = options.map(([source, label, tooltip]) => {
			const button = new ButtonComponent(shows).setButtonText(label).setTooltip(tooltip);
			button.onClick(() => {
				pending.source = source;
				if (source === 'name') pending.text = pending.note.name;
				else if (source === 'original') pending.text = group.wording;
				changed();
				if (source === 'typed') typed.inputEl.focus();
			});
			return [button, source] as const;
		});
		const typed = new TextComponent(shows).setValue(pending.text).onChange((value) => {
			pending.text = value;
			changed();
		});
		typed.inputEl.setAttribute('aria-label', 'Link text');
		const commit = bar.createDiv({ cls: 'cocktail-cabinet-unlinked-commit-buttons' });
		renderRemember(commit, group.wording, pending.note, !!pending.remember, (value) => {
			pending.remember = value;
		});
		const errorEl = bar.createDiv({ cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		new ButtonComponent(commit).setButtonText('Cancel').onClick(() => {
			this.pending.delete(group.key);
			this.renderGroup(el, group);
		});
		const linkButton = new ButtonComponent(commit).setCta().onClick(() => void this.link(el, group));
		const textError = () => (pending.source === 'typed' ? linkTextError(pending.text) : '');
		const update = () => {
			const lines = pending.ticked.size;
			const recipes = new Set([...pending.ticked].map((index) => group.uses[index]!.recipe.path)).size;
			summary.setText(`Link ${plural(lines, 'line')} to ${pending.note.name} (${pending.note.kind})`);
			for (const [button, source] of sourceButtons) {
				button.buttonEl.toggleClass('is-active', source === pending.source);
				button.buttonEl.setAttribute('aria-pressed', String(source === pending.source));
			}
			typed.inputEl.toggleClass('cocktail-cabinet-hidden', pending.source !== 'typed');
			linkButton
				.setButtonText(`Link in ${plural(recipes, 'recipe')}`)
				.setDisabled(this.busy || !recipes || !!textError());
			errorEl.setText(textError());
		};
		const changed = () => {
			if (pending.source === 'typed' && typed.getValue() !== pending.text) typed.setValue(pending.text);
			renderUses();
			update();
		};
		update();
	}

	/** A line linked as chosen for its group. */
	private lineLink(use: UnlinkedUse, pending: { note: CabinetNote; source: LinkTextSource; text: string }) {
		return wordingLink(ingredientParts(use.text).wording, pending.note, pending.source, pending.text);
	}

	/** A recipe's name that opens it beside the review, or a new tab with Ctrl or Cmd. */
	private recipeLink(el: HTMLElement, recipe: { name: string; path: string }) {
		viewLink(this, el, recipe.path, recipe.name, 'cocktail-cabinet-unlinked-recipe');
	}

	private async link(el: HTMLElement, group: UnlinkedGroup) {
		const pending = this.pending.get(group.key);
		if (!pending || this.busy) return;
		this.busy = true;
		const chosen = group.uses.filter((_use, index) => pending.ticked.has(index));
		let changed = false;
		try {
			const text = pending.source === 'original' ? undefined : pending.text;
			const result = await this.links.linkMany(
				chosen.map((use) => ({
					path: use.recipe.path,
					line: use.line,
					raw: use.raw,
					text: this.lineLink(use, pending),
				})),
				pending.note.path,
			);
			const failed = new Set(result.failed.map((item) => item.path));
			changed = result.failed.some((item) => item.changed);
			const linked = chosen.filter((use) => !failed.has(use.recipe.path));
			group.uses = group.uses.filter((use) => !linked.includes(use));
			new Notice(
				`Linked ${group.wording} to ${pending.note.name}${text === undefined || text === group.wording ? '' : `, shown as ${text},`} in ${plural(result.linked, 'recipe')}.` +
					(result.failed.length
						? ` Not linked: ${result.failed.map((item) => (item.changed ? `${item.name} (changed since this list was read)` : item.name)).join(', ')}.`
						: ''),
				result.failed.length ? 0 : undefined,
			);
			if (pending.remember && result.linked) await rememberAfterLink(this.plugin, pending.note, group.wording);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Couldn’t link the recipes.');
		} finally {
			this.busy = false;
			this.pending.delete(group.key);
		}
		if (this.closed) return;
		if (!group.uses.length) {
			this.groups = this.groups.filter((item) => item !== group);
			el.remove();
			this.renderSummary();
		} else {
			this.renderSummary();
			this.renderGroup(el, group);
		}
		// A recipe that changed since it was read, or during the link, is read again, so linking it
		// again works on what it says now.
		if (this.stale || changed) {
			this.stale = false;
			void this.read(true);
		}
	}
}

/** Open the review as a main-area tab, reusing one already open. */
export async function openUnlinked(plugin: CocktailCabinetPlugin): Promise<void> {
	await openView(plugin, UNLINKED_VIEW);
}
