import { App, TFile, TFolder, parseFrontMatterAliases, parseYaml } from 'obsidian';
import { cabinetFolder, KINDS, PROP, wikiLink } from '../core/schema';
import type { CabinetNote, NoteDraft, NoteKind } from '../core/schema';
import { ingredientSection, localDate, renderNote } from '../core/notes';
import { relatedTargets } from '../core/relationships';
import { starterPlan } from '../core/setup';
import type { SetupPreview } from '../core/setup';

export class CabinetStore {
	private writing = false;

	constructor(readonly app: App, private folder: () => string) {}

	get root(): string { return cabinetFolder(this.folder()); }

	notes(): CabinetNote[] {
		const files = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(`${this.root}/`));
		const notes = files.flatMap(file => {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const kind: unknown = frontmatter?.[PROP.kind];
			if (!KINDS.some(value => value === kind)) return [];
			const parentProperty = kind === 'family' ? PROP.category : kind === 'type' ? PROP.family
				: kind === 'bottle' ? PROP.types : kind === 'ingredient' ? PROP.provides : null;
			const parents = (parentProperty ? [parentProperty] : []).flatMap(key => {
				const value: unknown = frontmatter?.[key];
				return (Array.isArray(value) ? value : [value]).flatMap((link: unknown) => {
					if (typeof link !== 'string') return [];
					const target = this.resolve(link, file.path);
					return target ? [target.path] : [];
				});
			});
			const properName: unknown = frontmatter?.[PROP.name];
			const name = typeof properName === 'string' && properName.trim() && !/[|[\]\r\n]/.test(properName)
				? properName.trim() : file.basename;
			return [{ path: file.path, name, kind: kind as NoteKind, parents, aliases: parseFrontMatterAliases(frontmatter) || [] }];
		}).sort((left, right) => left.name.localeCompare(right.name));
		const byPath = new Map(notes.map(note => [note.path, note]));
		for (const note of notes) {
			const expected = note.kind === 'family' ? 'category' : note.kind === 'type' ? 'family' : 'type';
			note.parents = note.parents.filter(path => byPath.get(path)?.kind === expected);
		}
		return notes;
	}

	resolve(link: string, sourcePath: string): TFile | null {
		const target = link.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0]?.split('#')[0];
		if (!target) return null;
		return this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
	}

	async isSetUp(): Promise<boolean> {
		const home = this.app.vault.getAbstractFileByPath(`${this.root}/Cocktail Cabinet.md`);
		return home instanceof TFile && (await this.frontmatter(home))[PROP.kind] === 'cabinet';
	}

	async previewSetup(folder: string): Promise<SetupPreview> {
		const root = cabinetFolder(folder);
		const result: SetupPreview = { root, create: [], keep: [], conflicts: [] };
		const allFiles = this.app.vault.getFiles();
		const byLowerPath = new Map(allFiles.map(file => [file.path.toLowerCase(), file]));
		const catalogPaths = new Map<string, string>();
		// Read current content rather than relying on a cache immediately after a write or rename.
		for (const file of allFiles.filter(file => file.extension === 'md' && file.path.startsWith(`${root}/`))) {
			const properties = await this.frontmatter(file);
			const id = properties[PROP.catalogId];
			if (typeof id !== 'string') continue;
			if (catalogPaths.has(id)) result.conflicts.push(file.path);
			else catalogPaths.set(id, file.path);
		}
		for (const planned of starterPlan(root, catalogPaths)) {
			const parts = planned.path.split('/');
			for (let depth = 1; depth < parts.length; depth++) {
				const parent = parts.slice(0, depth).join('/');
				const existing = this.app.vault.getAbstractFileByPath(parent) || byLowerPath.get(parent.toLowerCase());
				if (existing && !(existing instanceof TFolder)) result.conflicts.push(parent);
			}
			const existing = this.app.vault.getAbstractFileByPath(planned.path) || byLowerPath.get(planned.path.toLowerCase());
			if (!existing) { result.create.push(planned); continue; }
			if (existing instanceof TFile && existing.path === planned.path && planned.kind === 'base' && existing.extension === 'base') {
				result.keep.push(existing.path);
				continue;
			}
			if (existing instanceof TFile && existing.extension === 'md' && existing.path === planned.path) {
				const properties = await this.frontmatter(existing);
				if (properties[PROP.kind] === planned.kind &&
					(!planned.catalogId || properties[PROP.catalogId] === planned.catalogId)) {
					result.keep.push(existing.path);
					continue;
				}
			}
			result.conflicts.push(planned.path);
		}
		result.conflicts = [...new Set(result.conflicts)];
		return result;
	}

	async setup(folder: string): Promise<{ created: number; kept: number }> {
		return this.write(async () => {
			// Recheck at apply time; no existing file is ever overwritten.
			const preview = await this.previewSetup(folder);
			if (preview.conflicts.length) throw new Error(`Setup conflicts with existing files: ${preview.conflicts.slice(0, 3).join(', ')}. Choose a different cabinet folder.`);
			for (const file of preview.create) {
				await this.ensureFolder(file.path.slice(0, file.path.lastIndexOf('/')));
				await this.app.vault.create(file.path, file.content);
			}
			return { created: preview.create.length, kept: preview.keep.length };
		});
	}

	async create(draft: NoteDraft): Promise<TFile> {
		return this.write(async () => {
			if (!await this.isSetUp()) throw new Error('Set up a cabinet before adding notes.');
			const file = renderNote(this.root, draft, localDate());
			if (this.app.vault.getAllLoadedFiles().some(existing => existing.path.toLowerCase() === file.path.toLowerCase())) {
				throw new Error('A note with that name already exists in this part of the cabinet. Choose another name.');
			}
			await this.ensureFolder(file.path.slice(0, file.path.lastIndexOf('/')));
			return this.app.vault.create(file.path, file.content);
		});
	}

	async relatedRecipes(target: CabinetNote): Promise<CabinetNote[]> {
		const notes = this.notes();
		const targets = relatedTargets(notes, target);
		const recipes = notes.filter(note => note.kind === 'recipe');
		const found = await Promise.all(recipes.map(async recipe => {
			const file = this.app.vault.getAbstractFileByPath(recipe.path);
			if (!(file instanceof TFile)) return null;
			const ingredients = ingredientSection(await this.app.vault.cachedRead(file));
			const links = [...ingredients.matchAll(/\[\[([^\]]+)\]\]/g)];
			return links.some(match => {
				const linked = this.resolve(match[1] || '', file.path);
				return linked && targets.has(linked.path);
			}) ? recipe : null;
		}));
		return found.filter((note): note is CabinetNote => note !== null);
	}

	link(note: CabinetNote): string { return wikiLink(note.path, note.name); }

	async open(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('This note no longer exists. Refresh the cabinet.');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async frontmatter(file: TFile): Promise<Record<string, unknown>> {
		const content = await this.app.vault.read(file);
		const source = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
		if (!source) return {};
		const parsed: unknown = parseYaml(source);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
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
		try { return await operation(); }
		finally { this.writing = false; }
	}
}
