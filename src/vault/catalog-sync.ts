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
	/** A note of the user's already at `path`, with its `cc-kind`: a conflict, not something to add. */
	existing?: { kind: string | null };
}

export interface CatalogPlan {
	/** Fields still matching an earlier catalog value: nobody changed them. */
	silent: CatalogFieldUpdate[];
	/** Fields the user changed, where the catalog has a different value to offer. */
	review: CatalogFieldUpdate[];
	/** Entries new to this cabinet since it last synced: added without asking. */
	fresh: CatalogAddition[];
	/** Missing entries whose history is unknown, offered in review with **Add** or **Skip**. */
	additions: CatalogAddition[];
}

/**
 * What the plugin remembers about the cabinet's catalog entries, in its settings. `seen` lists every entry
 * the cabinet has had a chance to hold, so a missing one on it was deleted on purpose and stays deleted;
 * `null` means it was never recorded (a cabinet from before this was tracked). `pending` lists missing
 * entries offered for review, `skipped` the ones the user declined, `kept` fields kept against a value.
 */
export interface CatalogState {
	kept: Readonly<Record<string, string>>;
	skipped: readonly string[];
	seen: readonly string[] | null;
	pending: readonly string[];
}

/** The outcome of a sync, with the `seen` and `pending` lists to save. */
export interface CatalogSyncResult {
	updated: string[];
	added: string[];
	review: number;
	seen: string[];
	pending: string[];
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
 * entry new to the cabinet is added, and one the user deleted stays deleted. Notes are found by
 * `cc-catalog-id`, wherever they are.
 */
export class CatalogSync {
	constructor(
		private app: App,
		private cabinet: CabinetStore,
		private state: () => CatalogState,
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
		const plan: CatalogPlan = { silent: [], review: [], fresh: [], additions: [] };
		if (!(await this.cabinet.isSetUp())) return plan;
		const root = this.cabinet.root;
		const notes = await this.notes();
		const state = this.state();
		const kept = state.kept;
		const skipped = new Set(state.skipped);
		const seen = state.seen && new Set(state.seen);
		const pending = new Set(state.pending);
		for (const entry of STARTER_CATALOG) {
			const note = notes.get(entry.id);
			if (!note) {
				if (skipped.has(entry.id)) continue;
				const addition: CatalogAddition = {
					id: entry.id,
					name: entry.name,
					kind: entry.kind,
					path: renderNote(root, catalogDraft(root, entry, paths(notes)), localDate()).path,
				};
				const there = this.app.vault.getAbstractFileByPath(addition.path);
				if (there) {
					const kind =
						there instanceof TFile ? frontmatter(await this.app.vault.read(there))[PROP.kind] : null;
					addition.existing = { kind: typeof kind === 'string' ? kind : null };
				}
				if (!seen || pending.has(entry.id)) plan.additions.push(addition);
				else if (!seen.has(entry.id)) (addition.existing ? plan.additions : plan.fresh).push(addition);
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

	/**
	 * Bring the cabinet up to date: untouched fields silently, and entries new to it added. An entry that
	 * can't be added (a file in the way) is offered in review instead. Returns `null` before setup, so a
	 * cabinet's entries are first recorded once it has notes.
	 */
	async sync(): Promise<CatalogSyncResult | null> {
		if (!(await this.cabinet.isSetUp())) return null;
		const state = this.state();
		const plan = await this.plan();
		const updated = await this.apply(plan.silent);
		const added: string[] = [];
		const pending = new Set(plan.additions.map((item) => item.id));
		for (const addition of plan.fresh) {
			try {
				await this.add(addition);
				added.push(addition.name);
			} catch {
				pending.add(addition.id);
			}
		}
		const present = await this.notes();
		const seen = new Set([
			...(state.seen ?? []),
			...present.keys(),
			...plan.fresh.map((item) => item.id),
			...pending,
		]);
		return {
			updated,
			added,
			review: new Set(plan.review.map((item) => item.path)).size + pending.size,
			seen: STARTER_CATALOG.map((entry) => entry.id).filter((id) => seen.has(id)),
			pending: [...pending],
		};
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

	/**
	 * Make the user's note at a missing entry's path that entry's starter note, by giving it the catalog
	 * ID; nothing else in it changes. Only a note of the same kind can stand in for the entry.
	 */
	async adopt(addition: CatalogAddition): Promise<void> {
		const entry = STARTER_CATALOG.find((item) => item.id === addition.id);
		if (!entry) throw new Error(`${addition.name} is no longer in the catalog.`);
		if ((await this.notes()).has(entry.id)) throw new Error(`${addition.name} is already in the cabinet.`);
		const file = this.app.vault.getAbstractFileByPath(addition.path);
		if (!(file instanceof TFile))
			throw new Error(`${addition.path} is gone. Review again to add ${addition.name}.`);
		const kind = frontmatter(await this.app.vault.read(file))[PROP.kind];
		if (kind !== entry.kind)
			throw new Error(`${addition.path} isn’t a ${entry.kind} note, so it can’t stand in for ${addition.name}.`);
		await this.app.fileManager.processFrontMatter(file, (properties: Properties) => {
			properties[PROP.catalogId] = entry.id;
		});
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
