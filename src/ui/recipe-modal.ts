import { Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import { parseRecipeText } from '../core/recipe-import';
import type { RecipeImport } from '../core/recipe-import';
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
		this.begin(
			this.snapshot ? 'Enhance as cocktail recipe' : 'Create a cocktail recipe',
			'Paste copied recipe text, or enter a recipe manually. To enhance an existing Obsidian page, open it and run Enhance as cocktail recipe.',
		);
		if (this.snapshot) {
			try {
				this.review(this.snapshot.content);
			} catch (error) {
				this.showError(error);
			}
			return;
		}
		let text = '';
		this.area(
			'Recipe text',
			text,
			(value) => {
				text = value;
			},
			'Paste ingredient lines and preparation text copied from a recipe. Headings and bullets are optional. URLs can be recorded as sources; pages are not fetched.',
			12,
		).setClass('cocktail-cabinet-name');
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('Enter manually').onClick(() => this.edit(parseRecipeText(''))))
			.addButton((button) =>
				button
					.setButtonText('Review recipe')
					.setCta()
					.onClick(() => {
						try {
							if (!text.trim())
								throw new Error('Paste recipe text before reviewing it, or select Enter manually.');
							this.review(text);
						} catch (error) {
							this.showError(error);
						}
					}),
			);
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
		this.edit(recipe, text, metadata);
	}

	private edit(recipe: RecipeImport, original = '', metadata: Record<string, unknown> = {}) {
		this.contentEl.empty();
		this.begin(
			'Review cocktail recipe',
			'Check the detected ingredients and preparation text, then accept any useful links. Only wordings you’ve chosen to remember are linked for you.',
		);
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
		this.area('Description', recipe.description, (value) => {
			recipe.description = value;
		}).setClass('cocktail-cabinet-name');
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
