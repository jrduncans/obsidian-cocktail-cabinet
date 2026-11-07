import { Notice } from 'obsidian';
import type { Editor, MarkdownFileInfo, MarkdownView, Menu } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { wikiLink } from '../core/schema';
import {
	ingredientLines, ingredientParts, linkAt, linkedLine, linkedLinePreview, linkSpans, plainIngredient, replacedPreview, replaceLink,
} from '../core/unlinked-lines';
import type { LinkPreview } from '../core/unlinked-lines';
import { LinkPicker, LinkTextModal } from '../ui/link-text';

type Context = MarkdownView | MarkdownFileInfo;

const STALE = 'The note changed while you were choosing. Nothing was linked.';

/** Choose a note, then the link text, then write it if the editor still shows the same text there. */
function chooseAndLink(plugin: CocktailCabinetPlugin, ctx: Context, editor: Editor, options: {
	wording: string; originalLabel: string; preview: (text: string) => LinkPreview;
	/** The text to replace, as it read when chosen, and what replaces it. */
	from: { line: number; ch: number }; to: { line: number; ch: number }; replacement: (note: CabinetNote, text: string) => string;
}) {
	const path = ctx.file?.path;
	const before = editor.getRange(options.from, options.to);
	new LinkPicker(plugin, options.wording, note => {
		new LinkTextModal(plugin, {
			note, original: options.wording, originalLabel: options.originalLabel, preview: options.preview,
			submit: text => {
				if (!path || ctx.file?.path !== path || editor.getRange(options.from, options.to) !== before) throw new Error(STALE);
				editor.replaceRange(options.replacement(note, text), options.from, options.to);
			},
		}).open();
	}).open();
}

function insertLink(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const selection = editor.getSelection();
	if (!selection) {
		const cursor = editor.getCursor();
		new LinkPicker(plugin, '', note => {
			editor.replaceRange(wikiLink(note.path, note.name), cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + wikiLink(note.path, note.name).length });
		}).open();
		return;
	}
	if (selection.includes('\n')) { new Notice('Select text on one line to link it.'); return; }
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	const line = editor.getLine(from.line);
	chooseAndLink(plugin, ctx, editor, {
		wording: plainIngredient(selection).trim(), originalLabel: 'Selected text',
		preview: text => replacedPreview(line, from.ch, to.ch, text),
		from, to, replacement: (note, text) => wikiLink(note.path, text),
	});
}

/** The recipe ingredient line under the cursor, if the note is a recipe and the cursor is in its Ingredients section. */
function ingredientLineAt(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const file = ctx.file;
	if (!file || !plugin.store.notes().some(note => note.path === file.path && note.kind === 'recipe')) return undefined;
	const cursor = editor.getCursor();
	return ingredientLines(editor.getValue()).find(line => line.line === cursor.line);
}

function linkThisLine(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const line = ingredientLineAt(plugin, editor, ctx);
	if (!line) return;
	const raw = editor.getLine(line.line);
	const lineRange = { from: { line: line.line, ch: 0 }, to: { line: line.line, ch: raw.length } };
	const span = linkAt(raw, editor.getCursor().ch);
	if (span) {
		chooseAndLink(plugin, ctx, editor, {
			wording: span.text, originalLabel: 'Current text',
			preview: text => replacedPreview(raw, span.start, span.end, text),
			...lineRange, replacement: (note, text) => replaceLink(raw, span, note.path, text),
		});
	} else if (linkSpans(raw).length) {
		new Notice('Click inside the link you want to change, then try again.');
	} else {
		const wording = ingredientParts(line.text).wording;
		if (!wording) { new Notice('This line has no ingredient to link.'); return; }
		chooseAndLink(plugin, ctx, editor, {
			wording, originalLabel: 'Recipe wording',
			preview: text => linkedLinePreview(line.text, text),
			...lineRange, replacement: (note, text) => linkedLine(raw, note.path, text),
		});
	}
}

export function registerEditorLinks(plugin: CocktailCabinetPlugin) {
	plugin.addCommand({
		id: 'insert-ingredient-link', name: 'Insert ingredient link', icon: 'link',
		editorCallback: (editor, ctx) => insertLink(plugin, editor, ctx),
	});
	plugin.addCommand({
		id: 'link-this-line', name: 'Link this line', icon: 'link-2',
		editorCheckCallback: (checking, editor, ctx) => {
			if (!ingredientLineAt(plugin, editor, ctx)) return false;
			if (!checking) linkThisLine(plugin, editor, ctx);
			return true;
		},
	});
	// In cabinet notes, also offer both from the editor's context menu (right-click, or long-press on mobile).
	plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, ctx: Context) => {
		if (!ctx.file?.path.startsWith(`${plugin.store.root}/`)) return;
		if (ingredientLineAt(plugin, editor, ctx)) {
			menu.addItem(item => item.setSection('cocktail-cabinet').setTitle('Link this line').setIcon('link-2').onClick(() => linkThisLine(plugin, editor, ctx)));
		}
		menu.addItem(item => item.setSection('cocktail-cabinet').setTitle('Insert ingredient link').setIcon('link').onClick(() => insertLink(plugin, editor, ctx)));
	}));
}
