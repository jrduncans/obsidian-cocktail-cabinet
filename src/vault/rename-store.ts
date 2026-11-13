import { parseYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
	frontmatterOf,
	linkTargets,
	renamedAliases,
	renameHeading,
	renameLinks,
	renamePropertyLinks,
} from '../core/rename';
import type { LinkRename, RenameTarget } from '../core/rename';
import { fileName, PROP } from '../core/schema';
import type { CabinetNote } from '../core/schema';

export interface RenameResult {
	/** Other notes whose links were checked. */
	linked: number;
	/** Notes whose links couldn't be updated. */
	failed: string[];
	/** Whether the page heading followed. */
	heading: boolean;
}

/** Renames a cabinet note: `cc-name`, aliases, heading, filename, and the links to it. */
export class RenameStore {
	private writing = false;

	constructor(private app: App) {}

	/** Notes that link to this one, from Obsidian's link index. */
	linkingNotes(path: string): string[] {
		return Object.entries(this.app.metadataCache.resolvedLinks)
			.filter(([source, targets]) => source !== path && targets[path])
			.map(([source]) => source);
	}

	/** A file other than this note already at the path, ignoring case. */
	conflict(note: CabinetNote, path: string): string | null {
		if (path === note.path) return null;
		const lower = path.toLowerCase();
		return (
			this.app.vault.getFiles().find((file) => file.path !== note.path && file.path.toLowerCase() === lower)
				?.path ?? null
		);
	}

	async rename(note: CabinetNote, target: RenameTarget, keepOld: boolean): Promise<RenameResult> {
		if (this.writing) throw new Error('Another rename is still saving.');
		this.writing = true;
		try {
			return await this.apply(note, target, keepOld);
		} finally {
			this.writing = false;
		}
	}

	private async apply(note: CabinetNote, target: RenameTarget, keepOld: boolean): Promise<RenameResult> {
		const file = this.app.vault.getAbstractFileByPath(note.path);
		if (!(file instanceof TFile)) throw new Error(`${note.name} was moved or deleted.`);
		const existing = this.conflict(note, target.path);
		if (existing) throw new Error(`${existing} already exists. Choose another name.`);
		const oldBasename = file.basename;

		// Before anything moves, record which link targets in each note find this one.
		const sources = new Map<string, Set<string>>();
		for (const source of [note.path, ...this.linkingNotes(note.path)]) {
			const sourceFile = this.app.vault.getAbstractFileByPath(source);
			if (!(sourceFile instanceof TFile)) continue;
			const targets = [...linkTargets(await this.app.vault.read(sourceFile))].filter(
				(link) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path === note.path,
			);
			if (targets.length) sources.set(source, new Set(targets));
		}

		await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
			const current: unknown = properties[PROP.name];
			const name = typeof current === 'string' && current.trim() ? current.trim() : oldBasename;
			if (name !== note.name)
				throw new Error(
					'This note’s name changed after the form opened. Nothing saved; close and rename again.',
				);
			properties[PROP.name] = target.name;
			const aliases = renamedAliases(properties.aliases, note.name, target.name, keepOld);
			if (aliases) properties.aliases = aliases;
		});
		let heading = false;
		await this.app.vault.process(file, (content) => {
			const next = renameHeading(content, [note.name, oldBasename], target.name);
			heading = next !== null;
			return next ?? content;
		});
		if (target.path !== note.path) await this.app.fileManager.renameFile(file, target.path);

		const failed: string[] = [];
		for (const [before, targets] of sources) {
			const source = before === note.path ? file.path : before;
			const resolves = (link: string) =>
				this.app.metadataCache.getFirstLinkpathDest(link, source)?.path === file.path;
			// Obsidian's link updating follows the vault's link format; keep a note's full-path links full.
			const paths = [...targets].every((link) => link.includes('/'));
			const rename: LinkRename = {
				matches: (link) => targets.has(link) || resolves(link),
				repoint: (link) => !resolves(link) || (paths && !link.includes('/')),
				target: file.path.replace(/\.md$/, ''),
				names: [note.name, oldBasename, fileName(target.name)],
				name: target.name,
			};
			try {
				await this.relink(source, rename);
			} catch {
				failed.push(source);
			}
		}
		return { linked: [...sources.keys()].filter((path) => path !== note.path).length, failed, heading };
	}

	private async relink(path: string, rename: LinkRename): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
		const yaml = frontmatterOf(await this.app.vault.read(file))
			.replace(/^\uFEFF?---\r?\n/, '')
			.replace(/\r?\n---(?:\r?\n|$)$/, '');
		const parsed: unknown = yaml.trim() ? parseYaml(yaml) : null;
		if (
			parsed &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			renamePropertyLinks({ ...(parsed as Record<string, unknown>) }, rename)
		) {
			await this.app.fileManager.processFrontMatter(file, (properties: Record<string, unknown>) => {
				renamePropertyLinks(properties, rename);
			});
		}
		await this.app.vault.process(file, (content) => {
			const frontmatter = frontmatterOf(content);
			return frontmatter + renameLinks(content.slice(frontmatter.length), rename);
		});
	}
}
