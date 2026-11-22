import { htmlToMarkdown, requestUrl, Setting } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
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
		// A new recipe opens on the form itself, with the paste box first.
		this.edit(parseRecipeText(''));
	}

	/**
	 * Paste recipe text or a page's address to fill the form. Open on an empty new recipe, folded once
	 * something has been read, holding what was pasted.
	 */
	private renderPaste(pasted: string, open: boolean) {
		const details = this.contentEl.createEl('details', { cls: 'cocktail-cabinet-paste' });
		details.open = open;
		details.createEl('summary', { text: 'Paste a recipe' });
		details.createEl('p', {
			cls: 'setting-item-description',
			text: 'Paste ingredient lines and preparation text copied from a recipe; headings and bullets are optional. Or paste the address of a recipe page on its own: the page is fetched and read, with nothing filled in from anywhere else. Reading replaces what’s in the form.',
		});
		const textArea = details.createEl('textarea', {
			cls: 'cocktail-cabinet-paste-text',
			attr: { rows: 8, 'aria-label': 'Recipe text or address' },
		});
		textArea.value = pasted;
		let readButton!: ButtonComponent;
		new Setting(details).addButton((button) =>
			(readButton = button)
				.setButtonText('Read recipe')
				.setCta()
				.onClick(() => {
					const text = textArea.value;
					try {
						if (!text.trim()) throw new Error('Paste recipe text or a recipe page’s address first.');
						const url = recipeUrl(text);
						if (url) {
							void this.reviewPage(url, readButton, (value) => {
								textArea.value = value;
								textArea.focus();
								textArea.setSelectionRange(value.length, value.length);
							});
							return;
						}
						this.review(text);
					} catch (error) {
						this.showError(error);
					}
				}),
		);
		if (open) window.setTimeout(() => textArea.focus(), 0);
	}

	/**
	 * Fetch one page and read its recipe (docs/import.md#web-pages). Nothing else is fetched. On failure, the
	 * text field keeps the page as its source line, ready for the recipe text to be pasted below it.
	 */
	private async reviewPage(url: URL, button: ButtonComponent, setText: (value: string) => void) {
		const fail = (reason: string) => {
			this.errorEl.setText(`${reason} Copy the recipe text from the page and paste it below the source line.`);
			setText(`Source: ${sourceUrl(url.href)}\n\n`);
		};
		this.errorEl.empty();
		button.setDisabled(true).setButtonText('Reading page…');
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
			fail(
				`The page couldn’t be fetched${error instanceof Error && error.message ? ` (${error.message})` : ''}.`,
			);
		} finally {
			button.setDisabled(false).setButtonText('Read recipe');
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
		if (!this.snapshot && !this.prefill) this.renderPaste(pasted, !pasted);
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
		this.text('Source (optional)', recipe.source, (value) => {
			recipe.source = value;
		}).setClass('cocktail-cabinet-name');
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
