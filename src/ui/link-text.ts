import { Modal, Notice, Setting, SuggestModal, prepareFuzzySearch } from 'obsidian';
import type { ButtonComponent, TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { recipeIngredientNotes, suggestIngredient } from '../core/recipe-import';
import { linkTextError } from '../core/unlinked-lines';
import type { LinkPreview } from '../core/unlinked-lines';
import { CREATE, createIngredient } from './link-choice';
import { pickerText } from './picker';

/** Where the link text came from: the note's name, the text already there, or typed. */
export type LinkTextSource = 'name' | 'original' | 'typed';

export interface LinkTextControls {
	name: string;
	/** The text already there: the recipe's wording, the selection, or the link's current text. */
	original: string;
	originalLabel: string;
	text: string;
	/** Shown under the field, such as "Each recipe keeps its own wording." */
	desc?: (source: LinkTextSource) => string;
	onChange: (text: string, source: LinkTextSource) => void;
}

/** The link text field with buttons for the note's name and the text already there. */
export function renderLinkText(container: HTMLElement, controls: LinkTextControls): { input: TextComponent } {
	let input!: TextComponent;
	const buttons: [ButtonComponent, LinkTextSource][] = [];
	const row = new Setting(container).setName('Link text').setClass('cocktail-cabinet-link-text');
	const mark = (source: LinkTextSource) => {
		for (const [button, value] of buttons) {
			button.buttonEl.toggleClass('is-active', value === source);
			button.buttonEl.setAttribute('aria-pressed', String(value === source));
		}
		row.setDesc(controls.desc?.(source) ?? '');
	};
	const set = (text: string, source: LinkTextSource) => {
		if (source !== 'typed') input.setValue(text);
		mark(source);
		controls.onChange(text, source);
	};
	row.addText(text => {
		input = text;
		text.setValue(controls.text).onChange(value => set(value, value === controls.name ? 'name' : value === controls.original ? 'original' : 'typed'));
		text.inputEl.setAttribute('aria-label', 'Link text');
	});
	if (controls.name !== controls.original) {
		row.addButton(button => { buttons.push([button, 'name']); button.setButtonText('Cabinet name').setTooltip(controls.name).onClick(() => set(controls.name, 'name')); });
		row.addButton(button => { buttons.push([button, 'original']); button.setButtonText(controls.originalLabel).setTooltip(controls.original).onClick(() => set(controls.original, 'original')); });
	}
	mark(controls.text === controls.name ? 'name' : controls.text === controls.original ? 'original' : 'typed');
	return { input };
}

/** A line as it will read, with the link's text marked. */
export function renderPreview(container: HTMLElement, preview: LinkPreview) {
	container.empty();
	if (preview.before) container.appendText(`${preview.before}${/[(\s]$/.test(preview.before) ? '' : ' '}`);
	container.createSpan({ cls: 'cocktail-cabinet-link-shown', text: preview.link || '…' });
	if (preview.after) container.appendText(preview.after);
}

export interface LinkTextOptions {
	note: CabinetNote;
	original: string;
	originalLabel: string;
	preview: (text: string) => LinkPreview;
	submit: (text: string) => Promise<void> | void;
}

/** Choose a link's text before writing it: the cabinet name, the text already there, or your own. */
export class LinkTextModal extends Modal {
	private text: string;
	private busy = false;

	constructor(plugin: CocktailCabinetPlugin, private options: LinkTextOptions) {
		super(plugin.app);
		this.text = options.original;
	}

	onOpen() {
		const { note, original, originalLabel } = this.options;
		this.titleEl.setText(`Link to ${note.name}`);
		this.modalEl.addClass('cocktail-cabinet-modal');
		this.contentEl.addClass('cocktail-cabinet-form');
		let linkButton: ButtonComponent | undefined;
		let previewEl: HTMLElement | undefined;
		let errorEl: HTMLElement | undefined;
		const update = () => {
			if (!previewEl || !errorEl) return;
			renderPreview(previewEl, this.options.preview(this.text));
			const error = linkTextError(this.text);
			errorEl.setText(error);
			linkButton?.setDisabled(this.busy || !!error);
		};
		const { input } = renderLinkText(this.contentEl, {
			name: note.name, original, originalLabel, text: this.text,
			desc: () => `Links to ${note.path.replace(/\.md$/, '')} (${note.kind}).`,
			onChange: text => { this.text = text; update(); },
		});
		const reads = this.contentEl.createDiv({ cls: 'cocktail-cabinet-link-reads' });
		reads.createDiv({ cls: 'setting-item-description', text: 'Reads as' });
		previewEl = reads.createDiv({ cls: 'cocktail-cabinet-link-preview' });
		errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		input.inputEl.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void this.submit(); }
		});
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(button => { linkButton = button.setButtonText('Link').setCta().onClick(() => void this.submit()); });
		update();
		window.setTimeout(() => { input.inputEl.focus(); input.inputEl.select(); }, 0);
	}

	private async submit() {
		if (this.busy || linkTextError(this.text)) return;
		this.busy = true;
		try {
			await this.options.submit(this.text.trim());
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Couldn’t link it.');
		} finally {
			this.busy = false;
			this.close();
		}
	}

	onClose() { this.contentEl.empty(); }
}

type Choice = { note: CabinetNote; suggested: boolean } | { create: typeof CREATE[number]; name: string };

/** Pick what to link to: suggestions for the wording first, any cabinet note by search, or a new one. */
export class LinkPicker extends SuggestModal<Choice> {
	constructor(private plugin: CocktailCabinetPlugin, private wording: string, private choose: (note: CabinetNote) => void) {
		super(plugin.app);
		this.setPlaceholder(wording ? `Link “${wording}” to…` : 'Find a cabinet note');
		this.emptyStateText = 'No matching cabinet notes.';
		this.setInstructions([{ command: '↑↓', purpose: 'to navigate' }, { command: '↵', purpose: 'to choose' }, { command: 'esc', purpose: 'to dismiss' }]);
	}

	getSuggestions(query: string): Choice[] {
		const q = query.trim();
		const all = this.plugin.store.notes();
		const notes = recipeIngredientNotes(all);
		const create = (name: string): Choice[] => name ? CREATE.map(create => ({ create, name })) : [];
		if (!q) {
			// Suggestions first, then every note to browse; creating one is last, typed out or at the end.
			const suggested = this.wording ? suggestIngredient(this.wording, all) : [];
			const rest = notes.filter(note => !suggested.includes(note)).sort((a, b) => a.name.localeCompare(b.name));
			return [...suggested.map(note => ({ note, suggested: true })), ...rest.map(note => ({ note, suggested: false })), ...create(this.wording)];
		}
		const search = prepareFuzzySearch(q);
		const found = notes.map(note => ({ note, match: search(pickerText(note)) }))
			.filter(item => item.match).sort((a, b) => b.match!.score - a.match!.score).slice(0, 50);
		return [...found.map(item => ({ note: item.note, suggested: false })), ...create(q)];
	}

	renderSuggestion(choice: Choice, el: HTMLElement) {
		if ('note' in choice) {
			const detail = pickerText(choice.note).slice(choice.note.name.length).replace(/^\s*·\s*/, '').trim();
			el.addClass('mod-complex');
			const content = el.createDiv({ cls: 'suggestion-content' });
			content.createDiv({ cls: 'suggestion-title', text: choice.note.name });
			content.createDiv({ cls: 'suggestion-note', text: `${choice.suggested ? 'Suggested · ' : ''}${detail}` });
		} else {
			el.createDiv({ cls: 'suggestion-title', text: `New ${choice.create[1].toLowerCase()}: ${choice.name}` });
		}
	}

	onChooseSuggestion(choice: Choice) {
		if ('note' in choice) this.choose(choice.note);
		else createIngredient(this.plugin, choice.create[0], choice.name, this.choose);
	}
}
