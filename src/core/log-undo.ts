import { formatMl } from './logging-stock';
import { DAILY_ALCOHOL_PROP } from './logging-daily';
import { PROP } from './schema';

/** One property a log changed. A missing `before` means the property wasn't there. */
export interface FieldChange {
	key: string;
	before?: unknown;
	after: unknown;
}
export interface NoteChange {
	path: string;
	name: string;
	fields: FieldChange[];
}
/**
 * What one log changed, kept so it can be undone: each note's properties before and after, and the
 * daily-note entry it appended. Undo compares values, not progress markers, so a log that stopped
 * partway undoes what it saved and skips what it didn't.
 */
export interface LogRecord {
	id: string;
	/** The recipe's or one-off's name. */
	title: string;
	/** The day it was logged for. */
	date: string;
	servings: number;
	notes: NoteChange[];
	daily?: { path: string; entry: string };
}

/** How many logs are kept for undo. */
export const KEPT_LOGS = 10;

/** Stock amounts: a later change to one blocks undo, since restoring it would lose that change. */
const STOCK_KEYS: readonly string[] = [PROP.open, PROP.unopened, PROP.remaining];
const LABELS: Record<string, string> = {
	[PROP.open]: 'open',
	[PROP.unopened]: 'unopened',
	[PROP.remaining]: 'left',
	[PROP.lastUsed]: 'last used',
	[PROP.lastMade]: 'last made',
	[PROP.timesMade]: 'times made',
	[DAILY_ALCOHOL_PROP]: 'alcohol',
};

/** Values compare as JSON, so a number, string, or null read back from the saved record matches the note. */
function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The changes `updates` makes to `properties`, leaving out keys it sets to the value they already have. */
export function fieldChanges(properties: Record<string, unknown>, updates: Record<string, unknown>): FieldChange[] {
	return Object.entries(updates)
		.filter(([key, after]) => !same(properties[key], after))
		.map(([key, after]) => (key in properties ? { key, before: properties[key], after } : { key, after }));
}

/** Add `fields` to the record's entry for a note, replacing earlier values for the same keys. */
export function recordFields(record: LogRecord, path: string, name: string, fields: FieldChange[]): void {
	if (!fields.length) return;
	let note = record.notes.find((item) => item.path === path);
	if (!note) record.notes.push((note = { path, name, fields: [] }));
	const keys = new Set(fields.map((field) => field.key));
	note.fields = [...note.fields.filter((field) => !keys.has(field.key)), ...fields];
}

function display(key: string, value: unknown): string {
	if (value === undefined || value === null || value === '') return 'none';
	if (typeof value === 'number' && (key === PROP.open || key === PROP.remaining || key === DAILY_ALCOHOL_PROP))
		return `${formatMl(value)} mL`;
	return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
}

/** Restore one note's properties; a key set to `undefined` is removed. */
export interface NoteRestore {
	path: string;
	name: string;
	/** Values each key must still have, checked again when writing. */
	expected: Record<string, unknown>;
	updates: Record<string, unknown>;
	/** “Campari: open 45 mL → 60 mL” */
	text: string;
}
export interface UndoPlan {
	record: LogRecord;
	restores: NoteRestore[];
	/** Dates and counts changed since, left as they are. */
	kept: string[];
	/** Stock changed since; nothing can be undone until it's fixed by hand. */
	blocked: string[];
}

/**
 * Plan undoing a log from each note's current properties (null for a note that's gone). A value the
 * log set is restored; one still at its old value was never saved and is skipped; anything else
 * changed since. Changed stock blocks the whole undo; a changed date or count is kept.
 */
export function planUndo(record: LogRecord, current: (path: string) => Record<string, unknown> | null): UndoPlan {
	const plan: UndoPlan = { record, restores: [], kept: [], blocked: [] };
	for (const note of record.notes) {
		const properties = current(note.path);
		const stock = note.fields.filter((field) => STOCK_KEYS.includes(field.key));
		if (!properties) {
			if (stock.length) plan.blocked.push(`${note.name}: Moved or deleted.`);
			else plan.kept.push(`${note.name}: Moved or deleted.`);
			continue;
		}
		const restore: NoteRestore = { path: note.path, name: note.name, expected: {}, updates: {}, text: '' };
		const parts: string[] = [];
		for (const field of note.fields) {
			const value = properties[field.key];
			const label = LABELS[field.key] ?? field.key;
			if (same(value, field.after)) {
				restore.expected[field.key] = field.after;
				restore.updates[field.key] = field.before;
				parts.push(`${label} ${display(field.key, field.after)} → ${display(field.key, field.before)}`);
			} else if (!same(value, field.before)) {
				if (STOCK_KEYS.includes(field.key))
					plan.blocked.push(`${note.name}: ${label} changed since (now ${display(field.key, value)}).`);
				else plan.kept.push(`${note.name}: ${label} changed since; left as ${display(field.key, value)}.`);
			}
		}
		if (parts.length) plan.restores.push({ ...restore, text: `${note.name}: ${parts.join(', ')}` });
	}
	return plan;
}

/** Whether a note's properties still hold what a restore expects. */
export function stillExpected(restore: NoteRestore, properties: Record<string, unknown>): boolean {
	return Object.entries(restore.expected).every(([key, value]) => same(properties[key], value));
}

/** Apply a restore to a note's properties, removing keys that weren't there before the log. */
export function applyRestore(restore: NoteRestore, properties: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(restore.updates)) {
		if (value === undefined) delete properties[key];
		else properties[key] = value;
	}
}

/** Remove the last copy of a daily entry (one or more whole lines); null when it isn't there. */
export function removeDailyEntry(content: string, entry: string): string | null {
	const lines = content.split('\n');
	const wanted = entry.replace(/\n+$/, '').split('\n');
	for (let start = lines.length - wanted.length; start >= 0; start--) {
		if (wanted.every((line, index) => lines[start + index]!.replace(/\r$/, '') === line)) {
			lines.splice(start, wanted.length);
			return lines.join('\n');
		}
	}
	return null;
}

/** A saved record, checked loosely: anything unreadable is dropped rather than undone. */
export function isLogRecord(value: unknown): value is LogRecord {
	if (!value || typeof value !== 'object') return false;
	const record = value as Partial<LogRecord>;
	return (
		typeof record.id === 'string' &&
		typeof record.title === 'string' &&
		typeof record.date === 'string' &&
		typeof record.servings === 'number' &&
		Array.isArray(record.notes) &&
		record.notes.every(
			(note) =>
				!!note &&
				typeof note.path === 'string' &&
				typeof note.name === 'string' &&
				Array.isArray(note.fields) &&
				note.fields.every((field) => !!field && typeof field.key === 'string' && 'after' in field),
		) &&
		(record.daily === undefined ||
			(!!record.daily && typeof record.daily.path === 'string' && typeof record.daily.entry === 'string'))
	);
}
