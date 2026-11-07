import { PROP } from './schema';

/** A YAML date can arrive as a string or, from some parsers, a Date. */
function isoDate(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

/** The later of a saved date and `date`; dates never move backward, and an unreadable value is replaced. */
export function laterDate(saved: unknown, date: string): string {
	const current = isoDate(saved);
	return current && current > date ? current : date;
}

/** A bottle or other stock was selected when logging on `date`. */
export function usedUpdates(properties: Record<string, unknown>, date: string): Record<string, string> {
	const next = laterDate(properties[PROP.lastUsed], date);
	return isoDate(properties[PROP.lastUsed]) === next ? {} : { [PROP.lastUsed]: next };
}

/** A recipe was logged on `date`: one more time made, whatever the servings. */
export function madeUpdates(properties: Record<string, unknown>, date: string): Record<string, string | number> {
	const count = properties[PROP.timesMade];
	const times = typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0;
	return { [PROP.lastMade]: laterDate(properties[PROP.lastMade], date), [PROP.timesMade]: times + 1 };
}
