import { optionalNumber, parseRating, PROP, RATING_MAX } from './schema';
import type { NoteKind, Properties, PropertyValue } from './schema';
import { formatMl } from './logging-stock';
import { STOCK_FORMS } from './stock';
import { parseTags } from './recipe-tags';

/**
 * Fields **Edit cabinet note** changes. The name belongs to Rename cabinet note, and a
 * bottle's or other stock's stock, price, and shopping flag to Edit stock.
 */
export const EDIT_FIELDS = {
	family: [PROP.category, PROP.abvTypical],
	type: [PROP.family, PROP.catchAll, PROP.shoppingList, PROP.abvTypical],
	bottle: [PROP.type, PROP.volume, PROP.abv],
	ingredient: [PROP.provides, PROP.form],
	recipe: ['source', 'rating', 'tags'],
} as const;
export type EditableKind = keyof typeof EDIT_FIELDS;

export const PARENT_FIELD: Partial<Record<EditableKind, string>> = {
	family: PROP.category,
	type: PROP.family,
	bottle: PROP.type,
	ingredient: PROP.provides,
};

export function isEditable(kind: NoteKind): kind is EditableKind {
	return kind in EDIT_FIELDS;
}

/** Form values; a field left undefined isn't on the form or wasn't touched. */
export interface FieldEdit {
	/** Parent links as they should be saved. */
	parents?: string[];
	volume?: string;
	/** Percent, as typed. */
	abv?: string;
	/** A type's or family's typical ABV: percent, as typed. */
	typicalAbv?: string;
	form?: string;
	shoppingList?: boolean;
	catchAll?: boolean;
	source?: string;
	/** Empty for unrated, a whole number, or `keep` for an unreadable saved value. */
	rating?: string;
	/** Recipe tags without `#`. */
	tags?: string[];
}

/** The saved values the form edits, plus a bottle's open amount, which limits its size. */
export function editedFields(kind: EditableKind, properties: Record<string, unknown>): Record<string, unknown> {
	const keys: string[] = [...EDIT_FIELDS[kind]];
	if (kind === 'bottle') keys.push(PROP.open);
	return Object.fromEntries(keys.map((key) => [key, properties[key] ?? null]));
}

/** Whether a fresh read still matches the values the form opened with. */
export function sameFields(
	kind: EditableKind,
	expected: Record<string, unknown>,
	current: Record<string, unknown>,
): boolean {
	return JSON.stringify(editedFields(kind, expected)) === JSON.stringify(editedFields(kind, current));
}

export function numberText(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** A fractional ABV as the percent the form shows. */
export function abvText(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value) ? String(Number((value * 100).toFixed(4))) : '';
}

export function sourceText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** The rating dropdown's value: empty for unrated, `keep` for a saved value that can't be read. */
export function ratingText(value: unknown): string {
	const rating = parseRating(value);
	return rating === undefined ? 'keep' : rating === null ? '' : String(rating);
}

export const RATING_OPTIONS: Record<string, string> = { '': 'Unrated' };
for (let rating = 1; rating <= RATING_MAX; rating++) RATING_OPTIONS[String(rating)] = '⭐'.repeat(rating);

/** The form options, keeping a saved form that isn't one of the standard ones. */
export function formOptions(current: unknown): Record<string, string> {
	return typeof current === 'string' && current && !(current in STOCK_FORMS)
		? { ...STOCK_FORMS, [current]: current }
		: { ...STOCK_FORMS };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/** Validate the form and return only the properties that change. */
export function planFieldEdit(kind: EditableKind, before: Record<string, unknown>, edit: FieldEdit): Properties {
	const updates: Properties = {};
	const set = (key: string, value: PropertyValue) => {
		if (!same(before[key], value)) updates[key] = value;
	};
	const parentKey = PARENT_FIELD[kind];
	if (parentKey && edit.parents) {
		if (kind !== 'ingredient' && edit.parents.length > 1) throw new Error('Select one parent.');
		set(parentKey, kind === 'ingredient' ? edit.parents : (edit.parents[0] ?? null));
	}
	if (kind === 'bottle') {
		if (edit.volume !== undefined && edit.volume.trim() !== numberText(before[PROP.volume])) {
			const volume = optionalNumber(edit.volume, 'Bottle volume', 0);
			if (volume === 0) throw new Error('Bottle volume must be greater than zero.');
			const open = before[PROP.open];
			if (volume !== null && typeof open === 'number' && open > volume) {
				throw new Error(
					`The open bottle has ${formatMl(open)} mL, more than ${formatMl(volume)} mL. Correct it with Edit stock first.`,
				);
			}
			set(PROP.volume, volume);
		}
		if (edit.abv !== undefined && edit.abv.trim() !== abvText(before[PROP.abv])) {
			const abv = optionalNumber(edit.abv, 'Alcohol by volume', 0, 100);
			set(PROP.abv, abv === null ? null : Number((abv / 100).toFixed(6)));
		}
	}
	if (
		(kind === 'type' || kind === 'family') &&
		edit.typicalAbv !== undefined &&
		edit.typicalAbv.trim() !== abvText(before[PROP.abvTypical])
	) {
		const abv = optionalNumber(edit.typicalAbv, 'Typical ABV', 0, 100);
		set(PROP.abvTypical, abv === null ? null : Number((abv / 100).toFixed(6)));
	}
	if (kind === 'ingredient' && edit.form !== undefined && !same(before[PROP.form], edit.form)) {
		if (!(edit.form in formOptions(before[PROP.form]))) throw new Error('Select an ingredient form.');
		set(PROP.form, edit.form);
	}
	if (kind === 'type' && edit.catchAll !== undefined && edit.catchAll !== (before[PROP.catchAll] === true)) {
		set(PROP.catchAll, edit.catchAll);
	}
	if (
		kind === 'type' &&
		edit.shoppingList !== undefined &&
		edit.shoppingList !== (before[PROP.shoppingList] === true)
	) {
		set(PROP.shoppingList, edit.shoppingList);
	}
	if (kind === 'recipe') {
		if (edit.source !== undefined && edit.source.trim() !== sourceText(before.source).trim())
			set('source', edit.source.trim() || null);
		if (edit.rating !== undefined && edit.rating !== 'keep' && edit.rating !== ratingText(before.rating)) {
			const rating = edit.rating ? parseRating(edit.rating) : null;
			if (rating === undefined) throw new Error(`Select a rating from 1 to ${RATING_MAX}, or Unrated.`);
			set('rating', rating);
		}
		if (edit.tags !== undefined) {
			const saved = parseTags(before.tags);
			const sorted = (tags: readonly string[]) => [...tags].sort().join(' ');
			// A list that only differs in order, or in how it was written, is left as saved.
			if (sorted(edit.tags) !== sorted(saved) || (edit.tags.length > 0 && !Array.isArray(before.tags)))
				set('tags', edit.tags.length ? edit.tags : null);
		}
	}
	return updates;
}
