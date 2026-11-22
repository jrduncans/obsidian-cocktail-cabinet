import { ButtonComponent, htmlToMarkdown, requestUrl, setIcon } from 'obsidian';
import type { TFile } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { parseRecipeText } from '../core/recipe-import';
import type { RecipeImport } from '../core/recipe-import';
import { readRecipePage, recipeUrl, sourceUrl } from '../core/web-recipe';
import { ratingOptions, ratingText } from '../core/note-edit';
import { duplicateRecipes, parseTags, splitTags, uniqueTags } from '../core/recipe-tags';
import { noteName, parseRating } from '../core/schema';
import type { NoteDraft } from '../core/schema';
import { readRecipeDocument } from '../vault/recipe-document';
import type { RecipeSnapshot } from '../vault/cabinet-store';
import { CabinetForm } from './form';
import { RecipeIngredients } from './recipe-ingredients';
import { RecipeTagsField } from './recipe-tags';
import { PasteRecipeModal } from './paste-recipe-modal';

const IMPORTED_FIELDS = ['cc-name', 'name', 'title', 'source', 'rating', 'created', 'cc-kind', 'tags'];

/** A new recipe opened straight at review, such as a saved one-off, and what to do once it's created. */
export interface RecipePrefill {
	recipe: RecipeImport;
	created: (file: TFile, name: string) => Promise<void>;
}

export class RecipeModal extends CabinetForm {
	constructor(
		private plugin: CocktailCabinetPlugin,
		private snapshot?: RecipeSnapshot,
		private prefill?: RecipePrefill,
	) {
		super(plugin.app);
	}

	onOpen() {
		if (this.prefill) {
			this.edit(this.prefill.recipe);
			return;
		}
		if (this.snapshot) {
			try {
				this.review(this.snapshot.content);
			} catch (error) {
				this.edit(parseRecipeText(''));
				this.showError(error);
			}
			return;
		}
		// A new recipe opens on the form itself; Paste a recipe… fills it from copied text or a page.
		this.edit(parseRecipeText(''));
	}

	/** A button opening the paste dialog, which fills the form from copied text or a page's address. */
	private renderPaste(pasted: string) {
		const row = this.contentEl.createDiv({ cls: 'cocktail-cabinet-paste' });
		const button = new ButtonComponent(row).setButtonText('Paste a recipe…').onClick(() => {
			new PasteRecipeModal(this.app, pasted, (text, setText) => this.read(text, setText)).open();
		});
		// setButtonText replaces the content, so the icon goes in afterward.
		setIcon(button.buttonEl.createSpan({ cls: 'cocktail-cabinet-button-icon', prepend: true }), 'clipboard-paste');
		row.createSpan({
			cls: 'setting-item-description',
			text: pasted
				? 'Read again, or paste something else.'
				: 'Fill the form from copied text or a recipe page’s address.',
		});
	}

	/** Fill the form from the page in Source; if it can't be read, the paste dialog opens with the reason. */
	private async readSource(source: string, button: ButtonComponent) {
		const url = recipeUrl(source);
		if (!url) return;
		let text = '';
		button.setDisabled(true).setButtonText('Reading page…');
		try {
			const error = await this.readPage(url, (value) => (text = value));
			if (error)
				new PasteRecipeModal(this.app, text, (value, setText) => this.read(value, setText), error).open();
		} finally {
			button.setDisabled(false).setButtonText('Read page');
		}
	}

	/** Read pasted text or a page into the form; returns a reason when nothing could be read. */
	private async read(text: string, setText: (value: string) => void): Promise<string | void> {
		if (!text.trim()) return 'Paste recipe text or a recipe page’s address first.';
		const url = recipeUrl(text);
		if (url) return this.readPage(url, setText);
		try {
			this.review(text);
		} catch (error) {
			return error instanceof Error ? error.message : 'The recipe text could not be read.';
		}
	}

	/**
	 * Fetch one page and read its recipe (docs/import.md#web-pages). Nothing else is fetched. On failure, the
	 * text keeps the page as its source line, ready for the recipe text to be pasted below it.
	 */
	private async readPage(url: URL, setText: (value: string) => void): Promise<string | void> {
		const fail = (reason: string) => {
			setText(`Source: ${sourceUrl(url.href)}\n\n`);
			return `${reason} Copy the recipe text from the page and paste it below the source line.`;
		};
		try {
			const response = await requestUrl({ url: url.href, throw: false });
			if (response.status >= 400) return fail(`The page couldn’t be read (it answered ${response.status}).`);
			const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
			if (type && !/html/i.test(type)) return fail('That address isn’t a web page.');
			const { recipe, original } = readRecipePage(response.text, url.href, {
				parse: (html) => new DOMParser().parseFromString(html, 'text/html'),
				toMarkdown: (el) => htmlToMarkdown(el as HTMLElement),
			});
			if (!recipe.ingredients.length)
				return fail(
					'No recipe could be read from this page. It may need a sign-in, or build itself with scripts.',
				);
			this.edit(recipe, original, {}, url.href);
		} catch (error) {
			return fail(
				`The page couldn’t be fetched${error instanceof Error && error.message ? ` (${error.message})` : ''}.`,
			);
		}
	}

	/** Warn when the name matches a recipe already in the cabinet; each one opens in a new tab. */
	private showDuplicates(el: HTMLElement, name: string) {
		el.empty();
		const found = duplicateRecipes(name, this.plugin.store.notes(), this.snapshot?.path);
		if (!found.length) return;
		el.appendText('Already in the cabinet: ');
		found.forEach((note, index) => {
			if (index) el.appendText(', ');
			const link = el.createEl('a', { text: note.name, href: '#' });
			link.addEventListener('click', (event) => {
				event.preventDefault();
				void this.app.workspace.openLinkText(note.path, '', 'tab');
			});
		});
		el.appendText('.');
	}

	private showError(error: unknown) {
		this.errorEl.setText(error instanceof Error ? error.message : 'The recipe text could not be read.');
	}

	private review(text: string) {
		const { body, metadata } = readRecipeDocument(text);
		const recipe = parseRecipeText(body, metadata);
		if (!recipe.ingredients.length && !this.snapshot) {
			throw new Error(
				'No ingredient lines found. Use one ingredient per line, with amounts or list bullets, or add an Ingredients heading.',
			);
		}
		if (this.snapshot) recipe.name ||= this.snapshot.path.split('/').at(-1)!.replace(/\.md$/, '');
		this.edit(recipe, text, metadata, text);
	}

	/** The form; `pasted` is what the paste box read, kept there for another try. */
	private edit(recipe: RecipeImport, original = '', metadata: Record<string, unknown> = {}, pasted = '') {
		this.contentEl.empty();
		this.begin(
			this.prefill
				? 'Review cocktail recipe'
				: this.snapshot
					? 'Enhance as cocktail recipe'
					: 'Create a cocktail recipe',
		);
		if (!this.snapshot && !this.prefill) this.renderPaste(pasted);
		this.contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Check the ingredients and their links before saving. Only wordings you’ve chosen to remember are linked for you.',
		});
		if (this.snapshot) {
			const destination = this.plugin.store.recipeDestination(this.snapshot.path);
			this.contentEl.createEl('p', {
				text:
					destination === this.snapshot.path
						? `Save changes to ${destination}. Existing properties are kept.`
						: `Save and move ${this.snapshot.path} to ${destination}. Existing properties are kept. Obsidian manages links according to your vault settings.`,
			});
		}
		for (const warning of recipe.warnings) this.contentEl.createEl('p', { text: warning });
		if (original) {
			const details = this.contentEl.createEl('details');
			details.createEl('summary', { text: 'Original text' });
			details.createEl('pre', { text: original, cls: 'cocktail-cabinet-original' });
		}
		const extra = Object.fromEntries(Object.entries(metadata).filter(([key]) => !IMPORTED_FIELDS.includes(key)));
		if (!this.snapshot && Object.keys(extra).length) {
			this.contentEl.createEl('p', {
				text: 'Additional source properties were kept in the description for review.',
			});
			recipe.description = [recipe.description, `Imported properties:\n\n${JSON.stringify(extra, null, 2)}`]
				.filter(Boolean)
				.join('\n\n');
		}
		const nameRow = this.text('Recipe name', recipe.name, (value) => {
			recipe.name = value;
			this.showDuplicates(duplicatesEl, value);
		}).setClass('cocktail-cabinet-name');
		const duplicatesEl = nameRow.descEl.createDiv({ cls: 'cocktail-cabinet-warning' });
		this.showDuplicates(duplicatesEl, recipe.name);
		const sourceRow = this.text('Source (optional)', recipe.source, (value) => {
			recipe.source = value;
			showReadPage();
		}).setClass('cocktail-cabinet-name');
		// A new recipe's Source holding a web address can fill the form from that page.
		const canReadPage = !this.snapshot && !this.prefill;
		let readPageButton: ButtonComponent | undefined;
		if (canReadPage)
			sourceRow.addButton((button) => {
				readPageButton = button
					.setButtonText('Read page')
					.onClick(() => void this.readSource(recipe.source, button));
			});
		const showReadPage = () => readPageButton?.buttonEl.toggle(!!recipeUrl(recipe.source));
		showReadPage();
		let rating = ratingText(metadata.rating);
		this.select('Rating', ratingOptions(metadata.rating), rating, (value) => {
			rating = value;
		});
		const ingredients = new RecipeIngredients(this.plugin, this.contentEl, recipe.ingredients, undefined, {
			linkRemembered: true,
		});
		this.area('Method', recipe.method, (value) => {
			recipe.method = value;
		}).setClass('cocktail-cabinet-name');
		// Description is often empty, so it folds away unless there's something to check.
		const descriptionEl = this.contentEl.createEl('details', { cls: 'cocktail-cabinet-fold' });
		descriptionEl.open = !!recipe.description.trim();
		descriptionEl.createEl('summary', { text: 'Description' });
		this.area('Description', recipe.description, (value) => {
			recipe.description = value;
		})
			.setClass('cocktail-cabinet-name')
			.then((row) => {
				row.setName('');
				row.controlEl.querySelector('textarea')?.setAttribute('aria-label', 'Description');
				descriptionEl.appendChild(row.settingEl);
			});
		// Tags at the end of Tasting Notes move into the tags property; other tasting notes are kept as written.
		const notes = splitTags(recipe.tastingNotes);
		const tags = new RecipeTagsField(
			this.contentEl,
			uniqueTags([...parseTags(metadata.tags), ...notes.tags]),
			this.plugin.store.recipeTagCounts(),
			notes.tags.length ? 'The tags at the end of Tasting Notes move into the tags property.' : '',
		);
		if (notes.text)
			this.contentEl.createEl('p', {
				text: 'Tasting notes are kept as written. To change them, edit the note.',
				cls: 'setting-item-description',
			});
		const moving = this.snapshot && this.plugin.store.recipeDestination(this.snapshot.path) !== this.snapshot.path;
		this.submit(moving ? 'Move and save recipe' : this.snapshot ? 'Save recipe' : 'Create recipe', async () => {
			const draft: NoteDraft = {
				kind: 'recipe',
				name: recipe.name,
				ingredients: ingredients.lines(),
				method: recipe.method,
				description: recipe.description,
				tastingNotes: notes.text,
				// Keep as written leaves the rating out, so Enhance keeps the saved value.
				properties: {
					source: recipe.source.trim() || null,
					...(rating === 'keep' ? {} : { rating: rating ? (parseRating(rating) ?? null) : null }),
					tags: tags.tags().length ? tags.tags() : null,
				},
			};
			const file = this.snapshot
				? await this.plugin.store.enhanceRecipe(this.snapshot, draft)
				: await this.plugin.store.create(draft);
			this.close();
			await ingredients.saveRemembered();
			await this.prefill?.created(file, noteName(draft.name).normalize('NFC'));
			await this.plugin.store.open(file.path);
		});
	}
}
