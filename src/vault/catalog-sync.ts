import { App, TFile } from 'obsidian';
import { readProperties, readPropertiesOrNone, UnreadableProperties } from './frontmatter';
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
	/**
	 * A note of the user's already at `path`: a conflict, not something to add. `differs` lists the catalog
	 * fields where a note of the entry's kind differs from the catalog, each offered for review once linked.
	 */
	existing?: { kind: string | null; differs: CatalogField[] };
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
 * `aliases` lists, by entry, the catalog aliases already offered to the cabinet's note, so one the user
 * removed isn't added back; `null` means none were recorded yet.
 */
export interface CatalogState {
	kept: Readonly<Record<string, string>>;
	skipped: readonly string[];
	seen: readonly string[] | null;
	pending: readonly string[];
	aliases?: Readonly<Record<string, readonly string[]>> | null;
}

/** The outcome of a sync, with the `seen`, `pending`, and `aliases` records to save. */
export interface CatalogSyncResult {
	updated: string[];
	added: string[];
	review: number;
	seen: string[];
	pending: string[];
	aliases: Record<string, string[]>;
}

const aliasKey = (alias: string) => alias.trim().toLowerCase();
const aliasList = (value: unknown): string[] =>
	(Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && !!item.trim(),
	);

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

	/** Starter notes by catalog ID, read from their files. */
	private async notes() {
		return (await this.scan(false)).found;
	}

	/**
	 * Starter notes by catalog ID, and the cabinet notes whose properties can't be read (any of which may be
	 * a starter note). `fast`, for planning, trusts the metadata cache to pass over notes without a catalog
	 * ID, so startup doesn't read every recipe and bottle; writes read every note.
	 */
	private async scan(fast: boolean) {
		const root = this.cabinet.root;
		const found = new Map<string, { file: TFile; properties: Properties; content: string }>();
		const unreadable: string[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith(`${root}/`)) continue;
			if (fast) {
				const cached: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[PROP.catalogId];
				// No cached properties may mean a note not yet indexed, or broken YAML: those are read.
				if (cached === undefined && this.app.metadataCache.getFileCache(file)?.frontmatter) continue;
			}
			const content = fast ? await this.app.vault.cachedRead(file) : await this.app.vault.read(file);
			let properties: Properties;
			try {
				properties = readProperties(content, file.path) as Properties;
			} catch (error) {
				if (!(error instanceof UnreadableProperties)) throw error;
				unreadable.push(file.path);
				continue;
			}
			const id = properties[PROP.catalogId];
			if (typeof id === 'string' && !found.has(id)) found.set(id, { file, properties, content });
		}
		return { found, unreadable };
	}

	async plan(): Promise<CatalogPlan> {
		const plan: CatalogPlan = { silent: [], review: [], fresh: [], additions: [] };
		if (!(await this.cabinet.isSetUp())) return plan;
		const root = this.cabinet.root;
		const { found: notes, unreadable } = await this.scan(true);
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
					const content = there instanceof TFile ? await this.app.vault.read(there) : '';
					const properties = readPropertiesOrNone(content, addition.path) as Properties;
					const kind = properties[PROP.kind];
					const mine = kind === entry.kind ? noteFields(entry.kind, properties, content) : null;
					const next = entryFields(entry);
					addition.existing = {
						kind: typeof kind === 'string' ? kind : null,
						differs: mine ? CATALOG_FIELDS.filter((field) => !sameValue(mine[field], next[field])) : [],
					};
				}
				if (!seen || pending.has(entry.id)) plan.additions.push(addition);
				// A note with unreadable properties may be this entry, renamed, so new entries wait for review.
				else if (!seen.has(entry.id))
					(addition.existing || unreadable.length ? plan.additions : plan.fresh).push(addition);
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
		const aliases = await this.offerAliases(present, state.aliases ?? {});
		for (const path of aliases.updated) if (!updated.includes(path)) updated.push(path);
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
			aliases: aliases.offered,
		};
	}

	/**
	 * Add to each starter note the catalog aliases not yet offered to it, beside the user's own. Aliases are
	 * never removed: one the user deleted after it was offered stays deleted, and one the catalog drops stays
	 * on the note. Returns the notes changed and the updated record of what was offered.
	 */
	private async offerAliases(
		notes: Awaited<ReturnType<CatalogSync['notes']>>,
		before: Readonly<Record<string, readonly string[]>>,
	): Promise<{ updated: string[]; offered: Record<string, string[]> }> {
		const offered: Record<string, string[]> = Object.fromEntries(
			Object.entries(before).map(([id, list]) => [id, [...list]]),
		);
		const updated: string[] = [];
		for (const entry of STARTER_CATALOG) {
			const note = notes.get(entry.id);
			const catalog = aliasList(entry.properties?.aliases);
			if (!note || note.properties[PROP.kind] !== entry.kind || !catalog.length) continue;
			const earlier = new Set((offered[entry.id] ?? []).map(aliasKey));
			const fresh = catalog.filter((alias) => !earlier.has(aliasKey(alias)));
			offered[entry.id] = [...(offered[entry.id] ?? []), ...fresh];
			if (!fresh.length) continue;
			const has = new Set(aliasList(note.properties.aliases).map(aliasKey));
			if (fresh.every((alias) => has.has(aliasKey(alias)))) continue;
			let wrote = false;
			await this.app.fileManager.processFrontMatter(note.file, (properties: Properties) => {
				const mine = aliasList(properties.aliases);
				const present = new Set(mine.map(aliasKey));
				const add = fresh.filter((alias) => !present.has(aliasKey(alias)));
				if (!add.length) return;
				properties.aliases = [...mine, ...add];
				wrote = true;
			});
			if (wrote) updated.push(note.file.path);
		}
		return { updated, offered };
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
	 * Make the user's note at a missing entry's path that entry's starter note: it gets the catalog ID, and
	 * the catalog's aliases if it has none, so recipes find it by them too. Nothing else changes; fields that
	 * differ from the catalog are then offered for review. Only a note of the same kind can stand in.
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
		const aliases = entry.properties?.aliases;
		await this.app.fileManager.processFrontMatter(file, (properties: Properties) => {
			properties[PROP.catalogId] = entry.id;
			const mine = properties.aliases;
			const empty = mine === undefined || mine === null || (Array.isArray(mine) && !mine.length);
			if (empty && Array.isArray(aliases) && aliases.length) properties.aliases = [...aliases];
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

/** Properties for comparing and planning; unreadable ones read as none, which matches nothing. */
function frontmatter(content: string): Properties {
	return readPropertiesOrNone(content, '') as Properties;
}
