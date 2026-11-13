import { App, TFile, TFolder, getAllTags, parseFrontMatterAliases, parseYaml } from 'obsidian';
import { cabinetFolder, contentFingerprint, KINDS, PROP, wikiLink } from '../core/schema';
import type { CabinetNote, NoteDraft, NoteKind } from '../core/schema';
import { localDate, renderNote } from '../core/notes';
import { cabinetHomePath, cabinetViews, customViewsPath, starterPlan } from '../core/setup';
import { DEFAULT_RESTOCK } from '../core/restock';
import type { RestockThresholds } from '../core/restock';
import type { SetupPreview } from '../core/setup';
import { enhancedRecipeContent } from './recipe-document';

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
				const parentProperty = PARENT_PROPERTIES[kind as NoteKind];
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
						...(kind === 'type' && frontmatter?.[PROP.catchAll] === true ? { catchAll: true } : {}),
					},
				];
			})
			.sort((left, right) => left.name.localeCompare(right.name));
		const byPath = new Map(notes.map((note) => [note.path, note]));
		for (const note of notes) {
			const expected = note.kind === 'family' ? 'category' : note.kind === 'type' ? 'family' : 'type';
			note.parents = note.parents.filter((path) => byPath.get(path)?.kind === expected);
		}
		return notes;
	}

	resolve(link: string, sourcePath: string): TFile | null {
		const target = link.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.split('#')[0];
		if (!target) return null;
		return this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
	}

	async isSetUp(): Promise<boolean> {
		const home = this.app.vault.getAbstractFileByPath(cabinetHomePath(this.root));
		return home instanceof TFile && (await this.frontmatter(home))[PROP.kind] === 'cabinet';
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
		const home = cabinetHomePath(root);
		const newCabinet = !this.app.vault.getAbstractFileByPath(home) && !byLowerPath.has(home.toLowerCase());
		for (const planned of starterPlan(root, catalogPaths, newCabinet, this.restock())) {
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
	): Promise<{ updated: string[]; written: Record<string, string> }> {
		return this.write(async () => {
			if (!(await this.isSetUp())) return { updated: [], written: { ...written } };
			const root = this.root;
			const updated: string[] = [];
			const next: Record<string, string> = {};
			for (const view of cabinetViews(root, this.restock())) {
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
			return { updated, written: next };
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

	link(note: CabinetNote): string {
		return wikiLink(note.path, note.name);
	}

	async open(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('This note no longer exists. Refresh the cabinet.');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async frontmatter(file: TFile): Promise<Record<string, unknown>> {
		const content = await this.app.vault.read(file);
		const source = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		if (!source) return {};
		const parsed: unknown = parseYaml(source);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return parsed as Record<string, unknown>;
	}

	private async ensureFolder(path: string): Promise<void> {
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
