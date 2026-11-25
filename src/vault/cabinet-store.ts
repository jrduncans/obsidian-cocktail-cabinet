import { App, TFile, TFolder, getAllTags, parseFrontMatterAliases, parseYaml } from 'obsidian';
import { cabinetFolder, contentFingerprint, KINDS, PROP, wikiLink } from '../core/schema';
import type { CabinetNote, NoteDraft, NoteKind } from '../core/schema';
import { localDate, renderNote } from '../core/notes';
import { withNavigationSections, withSubtypesSection } from '../core/navigation';
import { cabinetNotePath, cabinetViews, customViewsPath, managedNotes, starterPlan } from '../core/setup';
import { managedFingerprint, managedState, withoutMarker, yourVersionPath } from '../core/managed';
import { STARTER_EXAMPLES } from '../catalog/examples';
import { basePath, RETIRED_BASES } from '../core/bases';
import { DEFAULT_RESTOCK } from '../core/restock';
import type { RestockThresholds } from '../core/restock';
import type { SetupPreview } from '../core/setup';
import { enhancedRecipeContent } from './recipe-document';
import { withWording, writtenAsProperty } from '../core/written-as';

/** A managed note someone changed, beside the plugin's current version of it. */
export interface ManagedUpdate {
	path: string;
	current: string;
	next: string;
}

export interface RecipeSnapshot {
	path: string;
	content: string;
}

const PARENT_PROPERTIES: Partial<Record<NoteKind, string>> = {
	family: PROP.category,
	type: PROP.family,
	bottle: PROP.type,
	ingredient: PROP.provides,
};

export class CabinetStore {
	private writing = false;

	constructor(
		readonly app: App,
		private folder: () => string,
		private restock: () => RestockThresholds = () => DEFAULT_RESTOCK,
		/** The standard drink, in grams of alcohol, that the Recipes Base shows. */
		private drinkGrams: () => number = () => 14,
	) {}

	get root(): string {
		return cabinetFolder(this.folder());
	}

	notes(): CabinetNote[] {
		const files = this.cabinetFiles();
		return this.notesFrom(
			files,
			new Map(files.map((file) => [file.path, this.app.metadataCache.getFileCache(file)?.frontmatter])),
		);
	}

	/** How many cabinet recipes carry each tag, in the tags property or the text, by the spelling seen first. */
	recipeTagCounts(): Map<string, number> {
		const counts = new Map<string, number>();
		const spelling = new Map<string, string>();
		for (const file of this.cabinetFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.[PROP.kind] !== 'recipe') continue;
			const seen = new Set<string>();
			for (const tag of getAllTags(cache) ?? []) {
				const name = tag.replace(/^#/, '');
				const key = name.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				if (!spelling.has(key)) spelling.set(key, name);
				counts.set(spelling.get(key)!, (counts.get(spelling.get(key)!) ?? 0) + 1);
			}
		}
		return counts;
	}

	/** Logging needs current properties even while a recent write invalidates the metadata cache. */
	async readNotes(): Promise<CabinetNote[]> {
		const files = this.cabinetFiles();
		const properties = await Promise.all(
			files.map(async (file) => [file.path, await this.frontmatter(file)] as const),
		);
		return this.notesFrom(files, new Map(properties));
	}

	private cabinetFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${this.root}/`));
	}

	private notesFrom(
		files: TFile[],
		properties: ReadonlyMap<string, Record<string, unknown> | undefined>,
	): CabinetNote[] {
		const notes = files
			.flatMap((file) => {
				const frontmatter = properties.get(file.path);
				const kind: unknown = frontmatter?.[PROP.kind];
				if (!KINDS.some((value) => value === kind)) return [];
				// A subtype is a type whose parent is another type (`cc-type`) in place of a family.
				const parentProperty =
					kind === 'type' && frontmatter?.[PROP.type] !== undefined && frontmatter?.[PROP.type] !== null
						? PROP.type
						: PARENT_PROPERTIES[kind as NoteKind];
				const parents = (parentProperty ? [parentProperty] : []).flatMap((key) => {
					const value: unknown = frontmatter?.[key];
					// Hierarchy parents are single links; only other stock provides several types.
					const links = kind === 'ingredient' && Array.isArray(value) ? value : [value];
					return links.flatMap((link: unknown) => {
						if (typeof link !== 'string') return [];
						const target = this.resolve(link, file.path);
						return target ? [target.path] : [];
					});
				});
				const properName: unknown = frontmatter?.[PROP.name];
				const name =
					typeof properName === 'string' && properName.trim() && !/[|[\]\r\n]/.test(properName)
						? properName.trim()
						: file.basename;
				return [
					{
						path: file.path,
						name,
						kind: kind as NoteKind,
						parents,
						aliases: parseFrontMatterAliases(frontmatter) || [],
						...writtenAsProperty(kind as NoteKind, frontmatter?.[PROP.writtenAs]),
						...(kind === 'type' && frontmatter?.[PROP.catchAll] === true ? { catchAll: true } : {}),
					},
				];
			})
			.sort((left, right) => left.name.localeCompare(right.name));
		const byPath = new Map(notes.map((note) => [note.path, note]));
		const isSubtype = (note: CabinetNote | undefined) =>
			note?.kind === 'type' && note.parents.some((path) => byPath.get(path)?.kind === 'type');
		for (const note of notes) {
			note.parents = note.parents.filter((path) => {
				const parent = byPath.get(path);
				if (note.kind === 'family') return parent?.kind === 'category';
				// One level of subtypes: a type's parent is a family, or a type that isn't itself a subtype.
				if (note.kind === 'type')
					return parent?.kind === 'family' || (parent?.kind === 'type' && !isSubtype(parent));
				return parent?.kind === 'type';
			});
		}
		return notes;
	}

	resolve(link: string, sourcePath: string): TFile | null {
		const target = link.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.split('#')[0];
		if (!target) return null;
		return this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
	}

	/** Add a recipe wording to an ingredient note's `cc-written-as`; false when it was already there. */
	async rememberWording(path: string, wording: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Couldn’t find ${path}.`);
		let added = false;
		await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
			if (properties[PROP.kind] === 'recipe' || !KINDS.some((kind) => kind === properties[PROP.kind]))
				throw new Error(`${file.basename} isn’t an ingredient note.`);
			const next = withWording(properties[PROP.writtenAs], wording);
			if (!next) return;
			properties[PROP.writtenAs] = next;
			added = true;
		});
		return added;
	}

	async isSetUp(): Promise<boolean> {
		const note = this.app.vault.getAbstractFileByPath(cabinetNotePath(this.root));
		return note instanceof TFile && (await this.frontmatter(note))[PROP.kind] === 'cabinet';
	}

	async previewSetup(folder: string): Promise<SetupPreview> {
		const root = cabinetFolder(folder);
		const result: SetupPreview = { root, create: [], update: [], keep: [], conflicts: [] };
		const allFiles = this.app.vault.getFiles();
		const byLowerPath = new Map(allFiles.map((file) => [file.path.toLowerCase(), file]));
		const catalogPaths = new Map<string, string>();
		// Read current content rather than relying on a cache immediately after a write or rename.
		const markdownFiles = allFiles.filter((file) => file.extension === 'md' && file.path.startsWith(`${root}/`));
		for (const file of markdownFiles) {
			const properties = await this.frontmatter(file);
			const id = properties[PROP.catalogId];
			if (typeof id !== 'string') continue;
			if (catalogPaths.has(id)) result.conflicts.push(file.path);
			else catalogPaths.set(id, file.path);
		}
		// The worked example comes with a new cabinet only, so a deleted example stays deleted.
		const cabinetNote = cabinetNotePath(root);
		const newCabinet =
			!this.app.vault.getAbstractFileByPath(cabinetNote) && !byLowerPath.has(cabinetNote.toLowerCase());
		for (const planned of starterPlan(root, catalogPaths, newCabinet, this.restock(), this.drinkGrams())) {
			const parts = planned.path.split('/');
			for (let depth = 1; depth < parts.length; depth++) {
				const parent = parts.slice(0, depth).join('/');
				const existing = this.app.vault.getAbstractFileByPath(parent) || byLowerPath.get(parent.toLowerCase());
				if (existing && !(existing instanceof TFolder)) result.conflicts.push(parent);
			}
			const existing =
				this.app.vault.getAbstractFileByPath(planned.path) || byLowerPath.get(planned.path.toLowerCase());
			if (!existing) {
				result.create.push(planned);
				continue;
			}
			if (
				existing instanceof TFile &&
				existing.path === planned.path &&
				planned.kind === 'base' &&
				existing.extension === 'base'
			) {
				// Views belong to the plugin: any difference from the current version is replaced.
				if ((await this.app.vault.read(existing)) === planned.content) result.keep.push(existing.path);
				else result.update.push(planned);
				continue;
			}
			// An example never blocks setup: whatever already has its path is the user's.
			if (planned.example) {
				result.keep.push(existing.path);
				continue;
			}
			if (existing instanceof TFile && existing.extension === 'md' && existing.path === planned.path) {
				const properties = await this.frontmatter(existing);
				// Someone may have added their own Salt before the starter offered one; it stays theirs.
				if (
					properties[PROP.kind] === planned.kind &&
					(!planned.catalogId ||
						planned.kind === 'ingredient' ||
						properties[PROP.catalogId] === planned.catalogId)
				) {
					result.keep.push(existing.path);
					continue;
				}
			}
			result.conflicts.push(planned.path);
		}
		result.conflicts = [...new Set(result.conflicts)];
		return result;
	}

	async setup(folder: string): Promise<{ created: number; updated: number; kept: number }> {
		return this.write(async () => {
			const preview = await this.previewSetup(folder);
			if (preview.conflicts.length) {
				const conflicts = preview.conflicts.slice(0, 3).join(', ');
				throw new Error(
					`Setup conflicts with existing files: ${conflicts}. Choose a different cabinet folder.`,
				);
			}
			for (const file of preview.create) {
				await this.ensureFolder(file.path.slice(0, file.path.lastIndexOf('/')));
				await this.app.vault.create(file.path, file.content);
			}
			let updated = 0;
			for (const file of preview.update) {
				const existing = this.app.vault.getAbstractFileByPath(file.path);
				if (!(existing instanceof TFile)) continue;
				await this.app.vault.process(existing, (current) => {
					if (current !== file.content) updated++;
					return file.content;
				});
			}
			await this.ensureFolder(customViewsPath(preview.root));
			return { created: preview.create.length, updated, kept: preview.keep.length };
		});
	}

	/**
	 * Bring the plugin's views up to date. `written` maps each view's path to the fingerprint of the
	 * version last written. Without `force`, a view is written only when the current version differs
	 * from that record (a release or a setting changed it), so Obsidian's own saves of column widths
	 * and sorting, and a deleted view, stay until then. With `force`, every view that differs or is
	 * missing is written. Returns the updated paths and the new record; nothing happens before setup.
	 */
	async syncViews(
		written: Readonly<Record<string, string>>,
		force = false,
	): Promise<{ updated: string[]; removed: string[]; written: Record<string, string> }> {
		return this.write(async () => {
			if (!(await this.isSetUp())) return { updated: [], removed: [], written: { ...written } };
			const root = this.root;
			const updated: string[] = [];
			const next: Record<string, string> = {};
			for (const view of cabinetViews(root, this.restock(), this.drinkGrams())) {
				const fingerprint = contentFingerprint(view.content, root);
				next[view.path] = fingerprint;
				if (!force && written[view.path] === fingerprint) continue;
				const existing = this.app.vault.getAbstractFileByPath(view.path);
				if (existing instanceof TFile) {
					let changed = false;
					await this.app.vault.process(existing, (current) => {
						changed = current !== view.content;
						return view.content;
					});
					if (changed) updated.push(view.path);
				} else if (!existing) {
					await this.ensureFolder(view.path.slice(0, view.path.lastIndexOf('/')));
					await this.app.vault.create(view.path, view.content);
					updated.push(view.path);
				}
			}
			// Views belong to the plugin, so one a release retired goes to the trash, where it can be recovered.
			const removed: string[] = [];
			for (const name of RETIRED_BASES) {
				const retired = this.app.vault.getAbstractFileByPath(basePath(root, name));
				if (!(retired instanceof TFile)) continue;
				await this.app.fileManager.trashFile(retired);
				removed.push(retired.path);
			}
			return { updated, removed, written: next };
		});
	}

	/** The plugin's current version of each managed note, with links to whichever worked examples remain. */
	private async plannedManaged() {
		const root = this.root;
		const ids = new Set(STARTER_EXAMPLES.map((example) => example.id));
		const examples = new Map<string, string>();
		for (const file of this.app.vault.getFiles()) {
			if (file.extension !== 'md' || !file.path.startsWith(`${root}/`)) continue;
			const properties: Record<string, unknown> =
				this.app.metadataCache.getFileCache(file)?.frontmatter ?? (await this.frontmatter(file));
			const id = properties[PROP.catalogId];
			if (typeof id === 'string' && ids.has(id) && !examples.has(id)) examples.set(id, file.path);
		}
		return managedNotes(root, examples);
	}

	private async contentAt(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? this.app.vault.read(file) : null;
	}

	/**
	 * Bring managed notes up to date (docs/ownership.md). `written` maps each note's path to the
	 * fingerprint of the plugin's version last handled. Without `force`, only notes whose version changed
	 * since are looked at, and a managed note deleted since it was written stays deleted. Notes nobody
	 * changed are replaced; changed ones are returned in `review`; notes without `cc-managed` are the
	 * user's and never touched. With `force`, every note is looked at and deleted ones are restored.
	 */
	async syncManaged(
		written: Readonly<Record<string, string>>,
		force = false,
	): Promise<{ created: string[]; updated: string[]; review: string[]; written: Record<string, string> }> {
		return this.write(async () => {
			const result = { created: [] as string[], updated: [] as string[], review: [] as string[] };
			if (!(await this.isSetUp())) return { ...result, written: { ...written } };
			const root = this.root;
			const next: Record<string, string> = {};
			for (const planned of await this.plannedManaged()) {
				const version = managedFingerprint(planned.content, root);
				next[planned.path] = version;
				if (!force && written[planned.path] === version) continue;
				const current = await this.contentAt(planned.path);
				const state = managedState(current, planned.content, root);
				if (state === 'missing') {
					if (!force && planned.path in written) continue;
					if (this.app.vault.getAbstractFileByPath(planned.path)) continue;
					await this.ensureFolder(planned.path.slice(0, planned.path.lastIndexOf('/')));
					await this.app.vault.create(planned.path, planned.content);
					result.created.push(planned.path);
				} else if (state === 'unchanged') {
					await this.replace(planned.path, planned.content, current);
					result.updated.push(planned.path);
				} else if (state === 'changed') result.review.push(planned.path);
			}
			return { ...result, written: next };
		});
	}

	/** Managed notes someone changed, each with the plugin's current version. */
	async managedUpdates(): Promise<ManagedUpdate[]> {
		const root = this.root;
		if (!(await this.isSetUp())) return [];
		const updates: ManagedUpdate[] = [];
		for (const planned of await this.plannedManaged()) {
			const current = await this.contentAt(planned.path);
			if (current !== null && managedState(current, planned.content, root) === 'changed')
				updates.push({ path: planned.path, current, next: planned.content });
		}
		return updates;
	}

	/**
	 * Replace a managed note with the plugin's current version. With `keepCopy`, the note as it was is
	 * first saved beside it as `<name> (your version).md`, without `cc-managed`, and its path returned.
	 * `expected` guards against a note that changed after review opened.
	 */
	async useNewVersion(path: string, keepCopy: boolean, expected?: string): Promise<string | null> {
		return this.write(async () => {
			const planned = (await this.plannedManaged()).find((file) => file.path === path);
			if (!planned) throw new Error(`${path} isn’t a managed note.`);
			const current = await this.contentAt(path);
			if (current === null) throw new Error(`${path} was moved or deleted.`);
			if (expected !== undefined && current !== expected)
				throw new Error(`${path} changed after review opened. Review it again.`);
			let copy: string | null = null;
			if (keepCopy) {
				const lower = new Set(this.app.vault.getAllLoadedFiles().map((file) => file.path.toLowerCase()));
				copy = yourVersionPath(path, (candidate) => lower.has(candidate.toLowerCase()));
				await this.app.vault.create(copy, withoutMarker(current));
			}
			await this.replace(path, planned.content, current);
			return copy;
		});
	}

	/** Keep a changed managed note as it is: removing `cc-managed` makes it the user's. */
	async keepMine(path: string, expected?: string): Promise<void> {
		return this.write(async () => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
			await this.app.vault.process(file, (current) => {
				if (expected !== undefined && current !== expected)
					throw new Error(`${path} changed after review opened. Review it again.`);
				return withoutMarker(current);
			});
		});
	}

	private async replace(path: string, content: string, expected: string | null): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
		await this.app.vault.process(file, (current) => {
			if (expected !== null && current !== expected)
				throw new Error(`${path} changed while it was being updated. Try again.`);
			return content;
		});
	}

	async create(draft: NoteDraft): Promise<TFile> {
		return this.write(async () => {
			if (!(await this.isSetUp())) throw new Error('Set up a cabinet before adding notes.');
			const file = renderNote(this.root, draft, localDate());
			const exists = this.app.vault
				.getAllLoadedFiles()
				.some((existing) => existing.path.toLowerCase() === file.path.toLowerCase());
			if (exists) {
				throw new Error(
					'A note with that name already exists in this part of the cabinet. Choose another name.',
				);
			}
			await this.ensureFolder(file.path.slice(0, file.path.lastIndexOf('/')));
			return this.app.vault.create(file.path, file.content);
		});
	}

	recipeDestination(path: string): string {
		return path.startsWith(`${this.root}/`) ? path : `${this.root}/Recipes/${path.split('/').at(-1)!}`;
	}

	async enhanceRecipe(snapshot: RecipeSnapshot, draft: NoteDraft): Promise<TFile> {
		return this.write(async () => {
			if (!(await this.isSetUp())) throw new Error('Set up a cabinet before saving recipes.');
			const file = this.app.vault.getAbstractFileByPath(snapshot.path);
			if (!(file instanceof TFile) || file.extension !== 'md')
				throw new Error('The original note was moved or removed. Reopen it to review again.');
			const destination = this.recipeDestination(snapshot.path);
			if (
				destination !== snapshot.path &&
				this.app.vault.getAllLoadedFiles().some((item) => item.path.toLowerCase() === destination.toLowerCase())
			) {
				throw new Error(
					'A note with this filename already exists in Recipes. Rename one of the notes and review again.',
				);
			}
			const content = enhancedRecipeContent(snapshot.content, draft);
			await this.app.vault.process(file, (current) => {
				if (normalizeSource(current) !== normalizeSource(snapshot.content))
					throw new Error(
						'The note changed after review opened. Reopen the review to include those changes.',
					);
				return content;
			});
			if (destination !== snapshot.path) {
				try {
					await this.ensureFolder(destination.slice(0, destination.lastIndexOf('/')));
					await this.app.fileManager.renameFile(file, destination);
				} catch (error) {
					let restored = false;
					try {
						await this.app.vault.process(file, (current) => {
							if (current !== content) throw new Error('The note changed during the move.');
							return snapshot.content;
						});
						restored = true;
					} catch {
						/* Preserve any concurrent changes instead of rolling them back. */
					}
					const reason = error instanceof Error ? error.message : 'The move failed.';
					throw new Error(
						`Could not move the recipe: ${reason} ${restored ? 'The original note content was restored.' : `The enhanced note remains at ${file.path}; inspect it before retrying.`}`,
					);
				}
			}
			return file;
		});
	}

	/**
	 * Add any Related section a resource note's kind shows and the note lacks, such as Subtypes on a type
	 * that gained subtypes or a section a release added. Never removes or reorders embeds. Returns the
	 * updated paths; nothing happens before setup.
	 */
	async syncSections(): Promise<string[]> {
		return this.write(async () => {
			if (!(await this.isSetUp())) return [];
			const root = this.root;
			const notes = this.notes();
			const byPath = new Map(notes.map((note) => [note.path, note]));
			const withSubtypes = new Set(
				notes
					.filter((note) => note.kind === 'type')
					.flatMap((note) => note.parents.filter((path) => byPath.get(path)?.kind === 'type')),
			);
			const updated: string[] = [];
			for (const note of notes) {
				const file = this.app.vault.getAbstractFileByPath(note.path);
				if (!(file instanceof TFile)) continue;
				const hasSubtypes = withSubtypes.has(note.path);
				const current = await this.app.vault.read(file);
				if (withNavigationSections(root, note.kind, current, hasSubtypes) === current) continue;
				let changed = false;
				await this.app.vault.process(file, (content) => {
					const next = withNavigationSections(root, note.kind, content, hasSubtypes);
					changed = next !== content;
					return next;
				});
				if (changed) updated.push(note.path);
			}
			return updated;
		});
	}

	/** Give a subtype's type note its Subtypes section, if it lacks one. */
	async addSubtypesSection(parentLink: string, sourcePath: string): Promise<void> {
		const file = this.resolve(parentLink, sourcePath);
		if (!file || !file.path.startsWith(`${this.root}/`)) return;
		await this.app.vault.process(file, (content) => withSubtypesSection(this.root, content));
	}

	link(note: CabinetNote): string {
		return wikiLink(note.path, note.name);
	}

	async open(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('This note no longer exists. Refresh the cabinet.');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** A note's properties read from the file, not the metadata cache, which lags behind writes. */
	async frontmatter(file: TFile): Promise<Record<string, unknown>> {
		const content = await this.app.vault.read(file);
		const source = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		if (!source) return {};
		const parsed: unknown = parseYaml(source);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return parsed as Record<string, unknown>;
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = path.split('/');
		for (let depth = 1; depth <= parts.length; depth++) {
			const folder = parts.slice(0, depth).join('/');
			const existing = this.app.vault.getAbstractFileByPath(folder);
			if (!existing) await this.app.vault.createFolder(folder);
			else if (!(existing instanceof TFolder)) throw new Error(`A file blocks the folder ${folder}.`);
		}
	}

	private async write<T>(operation: () => Promise<T>): Promise<T> {
		if (this.writing) throw new Error('Another cabinet change is still running. Try again when it finishes.');
		this.writing = true;
		try {
			return await operation();
		} finally {
			this.writing = false;
		}
	}
}

function normalizeSource(content: string): string {
	return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
