import { App, TFile, parseYaml } from 'obsidian';
import { STARTER_CATALOG, catalogDraft } from '../catalog/catalog';
import type { CatalogEntry } from '../catalog/catalog';
import HISTORY from '../catalog/history.json';
import {
	CATALOG_FIELDS,
	FIELD_PROPERTIES,
	entryFields,
	noteFields,
	sameValue,
	withDescription,
	withPreparation,
} from '../catalog/fields';
import type { CatalogField, FieldValue } from '../catalog/fields';
import { localDate, renderNote } from '../core/notes';
import { PROP, textFingerprint } from '../core/schema';
import type { Properties } from '../core/schema';
import type { CabinetStore } from './cabinet-store';

const history = HISTORY as Record<string, Partial<Record<CatalogField, FieldValue[]>>>;

/** Changes whenever the catalog does, so startup rechecks starter notes only after such a release. */
export const CATALOG_VERSION = textFingerprint(JSON.stringify(history));

/** One field of one starter note, as it is and as the catalog now has it. */
export interface CatalogFieldUpdate {
	id: string;
	path: string;
	name: string;
	field: CatalogField;
	yours: FieldValue;
	next: FieldValue;
}

/** A catalog entry the cabinet has no note for. */
export interface CatalogAddition {
	id: string;
	name: string;
	kind: CatalogEntry['kind'];
	path: string;
}

export interface CatalogPlan {
	/** Fields still matching an earlier catalog value: nobody changed them. */
	silent: CatalogFieldUpdate[];
	/** Fields the user changed, where the catalog has a different value to offer. */
	review: CatalogFieldUpdate[];
	additions: CatalogAddition[];
}

/** Key for a field the user chose to keep, recorded with the catalog value they kept it against. */
export const keptKey = (update: Pick<CatalogFieldUpdate, 'id' | 'field'>) => `${update.id}|${update.field}`;
export const keptValue = (update: Pick<CatalogFieldUpdate, 'next'>) => JSON.stringify(update.next);

const PARENT_KEYS: Partial<Record<CatalogEntry['kind'], readonly string[]>> = {
	family: [PROP.category],
	type: [PROP.family, PROP.type],
	bottle: [PROP.type],
};

/**
 * Keeps starter notes in step with the catalog (docs/ownership.md): each field still matching some value
 * the catalog has had is updated silently; a field the user changed is offered for review; a catalog
 * entry the cabinet lacks is offered for adding. Notes are found by `cc-catalog-id`, wherever they are.
 */
export class CatalogSync {
	constructor(
		private app: App,
		private cabinet: CabinetStore,
		private kept: () => Readonly<Record<string, string>>,
		private skipped: () => readonly string[],
	) {}

	private async notes() {
		const root = this.cabinet.root;
		const found = new Map<string, { file: TFile; properties: Properties; content: string }>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith(`${root}/`)) continue;
			const content = await this.app.vault.read(file);
			const properties = frontmatter(content);
			const id = properties[PROP.catalogId];
			if (typeof id === 'string' && !found.has(id)) found.set(id, { file, properties, content });
		}
		return found;
	}

	async plan(): Promise<CatalogPlan> {
		const plan: CatalogPlan = { silent: [], review: [], additions: [] };
		if (!(await this.cabinet.isSetUp())) return plan;
		const root = this.cabinet.root;
		const notes = await this.notes();
		const kept = this.kept();
		const skipped = new Set(this.skipped());
		for (const entry of STARTER_CATALOG) {
			const note = notes.get(entry.id);
			if (!note) {
				if (!skipped.has(entry.id))
					plan.additions.push({
						id: entry.id,
						name: entry.name,
						kind: entry.kind,
						path: renderNote(root, catalogDraft(root, entry, paths(notes)), localDate()).path,
					});
				continue;
			}
			if (note.properties[PROP.kind] !== entry.kind) continue;
			const next = entryFields(entry);
			const yours = noteFields(entry.kind, note.properties, note.content);
			for (const field of CATALOG_FIELDS) {
				if (sameValue(yours[field], next[field])) continue;
				const update: CatalogFieldUpdate = {
					id: entry.id,
					path: note.file.path,
					name: entry.name,
					field,
					yours: yours[field],
					next: next[field],
				};
				// A field missing from the history has only ever been empty.
				const earlier = history[entry.id]?.[field] ?? [null];
				if (earlier.some((value) => sameValue(value, yours[field]))) plan.silent.push(update);
				else if (next[field] !== null && kept[keptKey(update)] !== keptValue(update)) plan.review.push(update);
			}
		}
		return plan;
	}

	/** Write the catalog's value for each field, skipping any note that changed since it was planned. */
	async apply(updates: readonly CatalogFieldUpdate[]): Promise<string[]> {
		const notes = await this.notes();
		const changed = new Set<string>();
		for (const update of updates) {
			const entry = STARTER_CATALOG.find((item) => item.id === update.id);
			const note = notes.get(update.id);
			if (!entry || !note || note.file.path !== update.path) continue;
			const current = (content: string) => noteFields(entry.kind, frontmatter(content), content)[update.field];
			if (update.field === 'description' || update.field === 'preparation') {
				const write = update.field === 'description' ? withDescription : withPreparation;
				let wrote = false;
				await this.app.vault.process(note.file, (content) => {
					if (!sameValue(current(content), update.yours)) return content;
					wrote = true;
					return write(content, typeof update.next === 'string' ? update.next : null);
				});
				if (wrote) changed.add(update.path);
				continue;
			}
			const root = this.cabinet.root;
			const planned = frontmatter(renderNote(root, catalogDraft(root, entry, paths(notes)), localDate()).content);
			const keys =
				update.field === 'parent' ? (PARENT_KEYS[entry.kind] ?? []) : (FIELD_PROPERTIES[update.field] ?? []);
			const content = await this.app.vault.read(note.file);
			if (!sameValue(current(content), update.yours)) continue;
			await this.app.fileManager.processFrontMatter(note.file, (properties: Properties) => {
				for (const key of keys) {
					if (planned[key] === undefined) delete properties[key];
					else properties[key] = planned[key];
				}
			});
			changed.add(update.path);
		}
		return [...changed];
	}

	/** Create a starter note the cabinet lacks. */
	async add(addition: CatalogAddition): Promise<TFile> {
		const entry = STARTER_CATALOG.find((item) => item.id === addition.id);
		if (!entry) throw new Error(`${addition.name} is no longer in the catalog.`);
		const notes = await this.notes();
		if (notes.has(entry.id)) throw new Error(`${addition.name} is already in the cabinet.`);
		const root = this.cabinet.root;
		const file = renderNote(root, catalogDraft(root, entry, paths(notes)), localDate());
		if (this.app.vault.getAbstractFileByPath(file.path))
			throw new Error(`${file.path} already exists. Move it, then add ${addition.name} again.`);
		await this.cabinet.ensureFolder(file.path.slice(0, file.path.lastIndexOf('/')));
		const created = await this.app.vault.create(file.path, file.content);
		// A new subtype's type lists it, as when one is added by hand.
		const parent = entry.parentIsType ? frontmatter(file.content)[PROP.type] : undefined;
		if (typeof parent === 'string') await this.cabinet.addSubtypesSection(parent, file.path);
		return created;
	}
}

const paths = (notes: ReadonlyMap<string, { file: TFile }>) =>
	new Map([...notes].map(([id, note]) => [id, note.file.path]));

function frontmatter(content: string): Properties {
	const source = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
	if (!source) return {};
	const parsed: unknown = parseYaml(source);
	return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Properties) : {};
}
