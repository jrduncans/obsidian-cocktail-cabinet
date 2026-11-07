import { Modal, Notice, Setting } from 'obsidian';
import type { ButtonComponent, TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { linkTextError } from '../core/unlinked-lines';
import type { LinkPreview } from '../core/unlinked-lines';

/** Where the link text came from: the note's name, the text already there, or typed. */
export type LinkTextSource = 'name' | 'original' | 'typed';

export interface LinkTextControls {
	name: string;
	/** The text already there: the recipe's wording, the selection, or the link's current text. */
	original: string;
	originalLabel: string;
	text: string;
	/** Which button starts highlighted; the review's Recipe wording can differ from the name only in case. */
	source: LinkTextSource;
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
	row.addButton(button => { buttons.push([button, 'name']); button.setButtonText('Cabinet name').setTooltip(controls.name).onClick(() => set(controls.name, 'name')); });
	row.addButton(button => { buttons.push([button, 'original']); button.setButtonText(controls.originalLabel).setTooltip(controls.original).onClick(() => set(controls.original, 'original')); });
	mark(controls.source);
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
			name: note.name, original, originalLabel, text: this.text, source: 'original',
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
