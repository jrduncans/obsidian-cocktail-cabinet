import { contentFingerprint, PROP } from './schema';
import type { PlannedFile } from './schema';

/**
 * Managed notes: Markdown notes the plugin writes and keeps current, such as the Cocktail Cabinet note
 * and the shopping list. Each carries `cc-managed`, a fingerprint of the content the plugin last wrote,
 * so a note nobody has changed can be replaced silently, and one someone has changed is offered for
 * review instead (docs/ownership.md).
 */

const FRONTMATTER = /^(---\r?\n)([\s\S]*?\r?\n)?(---(?:\r?\n|$))/;
const MARKER = new RegExp(`^${PROP.managed}:[^\\n]*\\n?`, 'm');

function normalize(content: string): string {
	return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** The note without its `cc-managed` line; everything else counts as content. */
export function withoutMarker(content: string): string {
	const text = normalize(content);
	const match = text.match(FRONTMATTER);
	if (!match) return text;
	const properties = (match[2] ?? '').replace(MARKER, '');
	return `${match[1]}${properties}${match[3]}${text.slice(match[0].length)}`;
}

/** The `cc-managed` value, quoted or not, or null when the note has none. */
export function managedMarker(content: string): string | null {
	const properties = normalize(content).match(FRONTMATTER)?.[2] ?? '';
	const value = properties
		.match(MARKER)?.[0]
		.slice(PROP.managed.length + 1)
		.trim();
	if (!value) return null;
	return value.replace(/^(["'])(.*)\1$/, '$2');
}

/** Fingerprint of a note's content, ignoring its marker, line endings, trailing space, and the cabinet folder. */
export function managedFingerprint(content: string, root: string): string {
	return contentFingerprint(withoutMarker(content).trimEnd(), root);
}

/** A planned note with `cc-managed` added as its last property. */
export function asManaged(file: PlannedFile, root: string): PlannedFile {
	const text = withoutMarker(file.content);
	const match = text.match(FRONTMATTER);
	if (!match) throw new Error(`${file.path} needs properties to be managed.`);
	const marker = `${PROP.managed}: ${JSON.stringify(managedFingerprint(text, root))}\n`;
	return {
		...file,
		content: `${match[1]}${match[2] ?? ''}${marker}${match[3]}${text.slice(match[0].length)}`,
	};
}

/**
 * Where a note stands against the plugin's current version of it:
 * - `missing`: no file at its path;
 * - `current`: already the current version;
 * - `unchanged`: an earlier version nobody has changed, safe to replace;
 * - `changed`: someone changed it since the plugin wrote it;
 * - `unmanaged`: no `cc-managed`, so either taken over by the user or written before notes were managed.
 */
export type ManagedState = 'missing' | 'current' | 'unchanged' | 'changed' | 'unmanaged';

export function managedState(current: string | null, planned: string, root: string): ManagedState {
	if (current === null) return 'missing';
	const marker = managedMarker(current);
	if (withoutMarker(current).trimEnd() === withoutMarker(planned).trimEnd() && marker !== null) return 'current';
	if (marker === null) return 'unmanaged';
	return marker === managedFingerprint(current, root) ? 'unchanged' : 'changed';
}

/** `Cocktails/Shopping list.md` → `Cocktails/Shopping list (your version).md`, avoiding `taken` paths. */
export function yourVersionPath(path: string, taken: (path: string) => boolean): string {
	const stem = path.replace(/\.md$/, '');
	for (let count = 1; ; count++) {
		const candidate = `${stem} (your version${count === 1 ? '' : ` ${count}`}).md`;
		if (!taken(candidate)) return candidate;
	}
}

export interface DiffLine {
	/** `same`: in both; `yours`: only in your version; `new`: only in the plugin's. */
	side: 'same' | 'yours' | 'new';
	text: string;
}

/** A line diff from your version to the plugin's, ignoring `cc-managed`. */
export function lineDiff(yours: string, next: string): DiffLine[] {
	const left = withoutMarker(yours).trimEnd().split('\n');
	const right = withoutMarker(next).trimEnd().split('\n');
	// Longest common subsequence, from the end, so the walk below runs forward.
	const lengths = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
	for (let i = left.length - 1; i >= 0; i--)
		for (let j = right.length - 1; j >= 0; j--)
			lengths[i]![j] =
				left[i] === right[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
	const lines: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < left.length || j < right.length) {
		if (i < left.length && j < right.length && left[i] === right[j]) {
			lines.push({ side: 'same', text: left[i]! });
			i++;
			j++;
		} else if (j < right.length && (i >= left.length || lengths[i]![j + 1]! >= lengths[i + 1]![j]!)) {
			lines.push({ side: 'new', text: right[j]! });
			j++;
		} else {
			lines.push({ side: 'yours', text: left[i]! });
			i++;
		}
	}
	return lines;
}
