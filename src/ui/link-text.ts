import { Modal, Notice, Setting } from 'obsidian';
import type { ButtonComponent, TextComponent } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { linkTextError } from '../core/unlinked-lines';
import { canRemember } from '../core/written-as';
import type { LinkPreview } from '../core/unlinked-lines';

import type { LinkTextSource } from '../core/link-text';
export type { LinkTextSource } from '../core/link-text';

export interface LinkTextControls {
	name: string;
	/** The text already there: the recipe's wording, the selection, or the link's current text. */
	original: string;
	originalLabel: string;
	text: string;
	/** Which button starts highlighted; the review's As written can differ from the name only in case. */
	source: LinkTextSource;
	/** Shown under the field, such as "Each recipe keeps its own wording." */
	desc?: (source: LinkTextSource) => string;
	onChange: (text: string, source: LinkTextSource) => void;
}

/** The link text field with buttons for the note's name and the text already there. */
export function renderLinkText(container: HTMLElement, controls: LinkTextControls): { input: TextComponent } {
	let input!: TextComponent;
	const buttons: [ButtonComponent, LinkTextSource][] = [];
	const row = new Setting(container).setName('Link shows').setClass('cocktail-cabinet-link-text');
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
	row.addText((text) => {
		input = text;
		text.setValue(controls.text).onChange((value) =>
			set(value, value === controls.name ? 'name' : value === controls.original ? 'original' : 'typed'),
		);
		text.inputEl.setAttribute('aria-label', 'Link shows');
	});
	row.addButton((button) => {
		buttons.push([button, 'name']);
		button
			.setButtonText(controls.name)
			.setTooltip('The note’s name')
			.onClick(() => set(controls.name, 'name'));
	});
	row.addButton((button) => {
		buttons.push([button, 'original']);
		button
			.setButtonText(controls.originalLabel)
			.setTooltip(`“${controls.original}”`)
			.onClick(() => set(controls.original, 'original'));
	});
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
	/** Which text to start on (docs/link-text.md); the text already there by default. */
	source?: LinkTextSource;
	/** How the line reads with this text; a recipe line keeps words beside the cabinet name. */
	preview: (text: string, source: LinkTextSource) => LinkPreview;
	submit: (text: string, source: LinkTextSource) => Promise<void> | void;
	/** A recipe line's wording: offers to remember it for the note (`cc-written-as`) once linked. */
	remember?: string;
}

/** A checkbox offering to remember a recipe wording for a note, when that's worth offering. */
export function renderRemember(
	container: HTMLElement,
	wording: string,
	note: CabinetNote,
	checked: boolean,
	onChange: (value: boolean) => void,
): boolean {
	if (!canRemember(wording, note)) return false;
	const label = container.createDiv({ cls: 'cocktail-cabinet-remember' }).createEl('label');
	const box = label.createEl('input', { type: 'checkbox' });
	box.checked = checked;
	box.addEventListener('change', () => onChange(box.checked));
	label.appendText(` Remember “${wording.trim()}” for ${note.name}`);
	label.setAttribute('title', 'Recipes with this wording will come into review already linked.');
	return true;
}

/** Remember a wording after a link was written; a failure is reported, never undoes the link. */
export async function rememberAfterLink(plugin: CocktailCabinetPlugin, note: CabinetNote, wording: string) {
	try {
		if (await plugin.store.rememberWording(note.path, wording.trim()))
			new Notice(`Remembered “${wording.trim()}” for ${note.name}.`);
	} catch (error) {
		new Notice(error instanceof Error ? error.message : `Couldn’t remember “${wording.trim()}”.`);
	}
}

/** Choose a link's text before writing it: the cabinet name, the text already there, or your own. */
export class LinkTextModal extends Modal {
	private text: string;
	private source: LinkTextSource;
	private busy = false;
	private remember = false;

	constructor(
		private plugin: CocktailCabinetPlugin,
		private options: LinkTextOptions,
	) {
		super(plugin.app);
		this.source = options.source ?? 'original';
		this.text = this.source === 'name' ? options.note.name : options.original;
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
			renderPreview(previewEl, this.options.preview(this.text, this.source));
			const error = linkTextError(this.text);
			errorEl.setText(error);
			linkButton?.setDisabled(this.busy || !!error);
		};
		const { input } = renderLinkText(this.contentEl, {
			name: note.name,
			original,
			originalLabel,
			text: this.text,
			source: this.source,
			desc: () => `Links to ${note.path.replace(/\.md$/, '')} (${note.kind}).`,
			onChange: (text, source) => {
				this.text = text;
				this.source = source;
				update();
			},
		});
		const reads = this.contentEl.createDiv({ cls: 'cocktail-cabinet-link-reads' });
		reads.createDiv({ cls: 'setting-item-description', text: 'Reads as' });
		previewEl = reads.createDiv({ cls: 'cocktail-cabinet-link-preview' });
		if (this.options.remember)
			renderRemember(this.contentEl, this.options.remember, note, this.remember, (value) => {
				this.remember = value;
			});
		errorEl = this.contentEl.createEl('p', { cls: 'cocktail-cabinet-error', attr: { role: 'alert' } });
		input.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				void this.submit();
			}
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => {
				linkButton = button
					.setButtonText('Link')
					.setCta()
					.onClick(() => void this.submit());
			});
		update();
		window.setTimeout(() => {
			input.inputEl.focus();
			input.inputEl.select();
		}, 0);
	}

	private async submit() {
		if (this.busy || linkTextError(this.text)) return;
		this.busy = true;
		try {
			await this.options.submit(this.text.trim(), this.source);
			if (this.remember && this.options.remember)
				await rememberAfterLink(this.plugin, this.options.note, this.options.remember);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Couldn’t link it.');
		} finally {
			this.busy = false;
			this.close();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
