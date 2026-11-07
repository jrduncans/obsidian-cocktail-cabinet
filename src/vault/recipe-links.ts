import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { groupUnlinked, linkLines, StaleLineError } from '../core/unlinked-lines';
import type { LineEdit, UnlinkedGroup } from '../core/unlinked-lines';
import type { CabinetStore } from './cabinet-store';

export interface RecipeLineEdit extends LineEdit { path: string; }
export interface LinkResult {
	linked: number;
	/** Recipes left alone: `changed` when the line no longer read as reviewed. */
	failed: { path: string; name: string; changed: boolean }[];
}

/** Writes ingredient links into recipes, checking each line is still as reviewed. */
export class RecipeLinkStore {
	constructor(private app: App, private cabinet: CabinetStore) {}

	private file(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} was moved or deleted.`);
		return file;
	}

	/** Every recipe's unlinked measured lines, grouped by wording. */
	async unlinked(): Promise<UnlinkedGroup[]> {
		const recipes = this.cabinet.notes().filter(note => note.kind === 'recipe');
		const contents = await Promise.all(recipes.map(note => this.app.vault.cachedRead(this.file(note.path))));
		return groupUnlinked(recipes.map((note, index) => ({ note, content: contents[index]! })));
	}

	/** Link one line; throws `StaleLineError` when the recipe changed since it was read. */
	async linkLine(edit: RecipeLineEdit, target: string): Promise<void> {
		await this.app.vault.process(this.file(edit.path), content => linkLines(content, [edit], target));
	}

	/** Link lines across recipes, one write per recipe; a recipe that changed is left alone and reported. */
	async linkMany(edits: readonly RecipeLineEdit[], target: string): Promise<LinkResult> {
		const byPath = new Map<string, RecipeLineEdit[]>();
		for (const edit of edits) byPath.set(edit.path, [...byPath.get(edit.path) ?? [], edit]);
		const result: LinkResult = { linked: 0, failed: [] };
		for (const [path, lines] of byPath) {
			try {
				await this.app.vault.process(this.file(path), content => linkLines(content, lines, target));
				result.linked++;
			} catch (error) {
				const name = path.split('/').at(-1)!.replace(/\.md$/, '');
				result.failed.push({ path, name, changed: error instanceof StaleLineError });
			}
		}
		return result;
	}
}
