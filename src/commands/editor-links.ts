import { Notice } from 'obsidian';
import type { Editor, MarkdownFileInfo, MarkdownView, Menu } from 'obsidian';
import type CocktailCabinetPlugin from '../main';
import type { CabinetNote } from '../core/schema';
import { wikiLink } from '../core/schema';
import {
	ingredientLines,
	ingredientParts,
	linkAt,
	linkedLine,
	linkedLinePreview,
	linkSpans,
	plainIngredient,
	replacedPreview,
	replaceLink,
} from '../core/unlinked-lines';
import type { LinkPreview } from '../core/unlinked-lines';
import { LinkTextModal } from '../ui/link-text';
import { pickIngredient } from '../ui/link-choice';

type Context = MarkdownView | MarkdownFileInfo;

const STALE = 'The note changed while you were choosing. Nothing was linked.';

/** Choose a note, then the link text, then write it if the editor still shows the same text there. */
function chooseAndLink(
	plugin: CocktailCabinetPlugin,
	ctx: Context,
	editor: Editor,
	options: {
		wording: string;
		originalLabel: string;
		preview: (text: string) => LinkPreview;
		/** The text to replace, as it read when chosen, and what replaces it. */
		from: { line: number; ch: number };
		to: { line: number; ch: number };
		replacement: (note: CabinetNote, text: string) => string;
	},
) {
	const path = ctx.file?.path;
	const before = editor.getRange(options.from, options.to);
	pickIngredient(
		plugin,
		(note) => {
			new LinkTextModal(plugin, {
				note,
				original: options.wording,
				originalLabel: options.originalLabel,
				preview: options.preview,
				submit: (text) => {
					if (!path || ctx.file?.path !== path || editor.getRange(options.from, options.to) !== before)
						throw new Error(STALE);
					editor.replaceRange(options.replacement(note, text), options.from, options.to);
				},
			}).open();
		},
		options.wording,
	);
}

function insertLink(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const selection = editor.getSelection();
	if (!selection) {
		const cursor = editor.getCursor();
		pickIngredient(plugin, (note) => {
			const link = wikiLink(note.path, note.name);
			editor.replaceRange(link, cursor);
			editor.setCursor({ line: cursor.line, ch: cursor.ch + link.length });
		});
		return;
	}
	if (selection.includes('\n')) {
		new Notice('Select text on one line to link it.');
		return;
	}
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	const line = editor.getLine(from.line);
	chooseAndLink(plugin, ctx, editor, {
		wording: plainIngredient(selection).trim(),
		originalLabel: 'Selected text',
		preview: (text) => replacedPreview(line, from.ch, to.ch, text),
		from,
		to,
		replacement: (note, text) => wikiLink(note.path, text),
	});
}

/** The recipe ingredient line under the cursor, if the note is a recipe and the cursor is in its Ingredients section. */
function ingredientLineAt(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const file = ctx.file;
	if (!file || !plugin.store.notes().some((note) => note.path === file.path && note.kind === 'recipe'))
		return undefined;
	const cursor = editor.getCursor();
	return ingredientLines(editor.getValue()).find((line) => line.line === cursor.line);
}

/** What the cursor is on in a recipe's Ingredients: a link to edit, or an unlinked line to link. */
function ingredientTarget(plugin: CocktailCabinetPlugin, editor: Editor, ctx: Context) {
	const line = ingredientLineAt(plugin, editor, ctx);
	if (!line) return undefined;
	const raw = editor.getLine(line.line);
	const span = linkAt(raw, editor.getCursor().ch);
	if (span) return { kind: 'link' as const, line, raw, span };
	if (!linkSpans(raw).length && ingredientParts(line.text).wording) return { kind: 'line' as const, line, raw };
	return undefined;
}

function linkTarget(
	plugin: CocktailCabinetPlugin,
	editor: Editor,
	ctx: Context,
	target: NonNullable<ReturnType<typeof ingredientTarget>>,
) {
	const { line, raw } = target;
	const range = { from: { line: line.line, ch: 0 }, to: { line: line.line, ch: raw.length } };
	if (target.kind === 'link') {
		const { span } = target;
		chooseAndLink(plugin, ctx, editor, {
			wording: span.text,
			originalLabel: 'Current text',
			preview: (text) => replacedPreview(raw, span.start, span.end, text),
			...range,
			replacement: (note, text) => replaceLink(raw, span, note.path, text),
		});
	} else {
		const wording = ingredientParts(line.text).wording;
		chooseAndLink(plugin, ctx, editor, {
			wording,
			originalLabel: 'Recipe wording',
			preview: (text) => linkedLinePreview(line.text, text),
			...range,
			replacement: (note, text) => linkedLine(raw, note.path, text),
		});
	}
}

const TARGET_COMMANDS = [
	{ kind: 'line', id: 'link-ingredient-line', name: 'Link this ingredient line', icon: 'link-2' },
	{ kind: 'link', id: 'edit-ingredient-link', name: 'Edit this ingredient link', icon: 'pencil-line' },
] as const;

export function registerEditorLinks(plugin: CocktailCabinetPlugin) {
	plugin.addCommand({
		id: 'insert-ingredient-link',
		name: 'Insert ingredient link',
		icon: 'link',
		editorCallback: (editor, ctx) => insertLink(plugin, editor, ctx),
	});
	// Each appears only where it applies: on an unlinked Ingredients line, or with the cursor in an Ingredients link.
	for (const command of TARGET_COMMANDS) {
		plugin.addCommand({
			id: command.id,
			name: command.name,
			icon: command.icon,
			editorCheckCallback: (checking, editor, ctx) => {
				const target = ingredientTarget(plugin, editor, ctx);
				if (target?.kind !== command.kind) return false;
				if (!checking) linkTarget(plugin, editor, ctx, target);
				return true;
			},
		});
	}
	// In cabinet notes, also offer them from the editor's context menu (right-click, or long-press on mobile).
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, ctx: Context) => {
			if (!ctx.file?.path.startsWith(`${plugin.store.root}/`)) return;
			const target = ingredientTarget(plugin, editor, ctx);
			const command = TARGET_COMMANDS.find((item) => item.kind === target?.kind);
			if (target && command) {
				menu.addItem((item) =>
					item
						.setSection('cocktail-cabinet')
						.setTitle(command.name)
						.setIcon(command.icon)
						.onClick(() => linkTarget(plugin, editor, ctx, target)),
				);
			}
			menu.addItem((item) =>
				item
					.setSection('cocktail-cabinet')
					.setTitle('Insert ingredient link')
					.setIcon('link')
					.onClick(() => insertLink(plugin, editor, ctx)),
			);
		}),
	);
}
