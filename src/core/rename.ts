import { fileName, noteName } from './schema';

/** Where a renamed note goes: its new proper name and path, in the folder it already lives in. */
export interface RenameTarget {
	name: string;
	path: string;
}

export function renameTarget(path: string, oldName: string, input: string): RenameTarget {
	const name = noteName(input).normalize('NFC');
	if (name === oldName.normalize('NFC')) throw new Error('Enter a different name.');
	const folder = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/'))}/` : '';
	return { name, path: `${folder}${fileName(name)}.md` };
}

/**
 * The `aliases` value after a rename, or undefined to leave the property as it is.
 * The old name is dropped unless kept on purpose; the new name is added when it differs from its filename.
 */
export function renamedAliases(
	current: unknown,
	oldName: string,
	name: string,
	keepOld: boolean,
): string[] | undefined {
	const list = Array.isArray(current)
		? current.filter((value): value is string => typeof value === 'string')
		: typeof current === 'string' && current.trim()
			? [current]
			: [];
	const file = fileName(name);
	const next = list.filter((alias) => alias.normalize('NFC') !== oldName.normalize('NFC') && alias !== name);
	if (keepOld && oldName !== file) next.push(oldName);
	if (file !== name) next.push(name);
	const aliases = [...new Set(next)];
	if (current === undefined && !aliases.length) return undefined;
	return aliases;
}

/** The note with its first `# ` heading renamed, or null if that heading isn't the old name or filename. */
export function renameHeading(content: string, oldNames: readonly string[], name: string): string | null {
	const frontmatter = frontmatterOf(content);
	const body = content.slice(frontmatter.length);
	const heading = body.match(/^# +(.*?)[ \t]*$/m);
	if (!heading || !oldNames.some((old) => old.normalize('NFC') === heading[1]!.normalize('NFC'))) return null;
	return frontmatter + body.slice(0, heading.index) + `# ${name}` + body.slice(heading.index! + heading[0].length);
}

export function frontmatterOf(content: string): string {
	return content.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? '';
}

export interface LinkRename {
	/** Whether a link target (path or name, without heading) points at the renamed note. */
	matches(target: string): boolean;
	/** Whether that target must be rewritten: it no longer finds the note, or lost its path. */
	repoint(target: string): boolean;
	/** New link target, a vault path without `.md`. */
	target: string;
	/**
	 * Display text that means the note's name: the old name and filename, and the new filename,
	 * which Obsidian's own link updating writes over display text that was the old filename.
	 */
	names: readonly string[];
	name: string;
}

/**
 * Rewrites wiki links to a renamed note. Display text that showed the name shows the new one;
 * other wording (a recipe's “Rye (Bonded)”) is kept. A link whose target no longer resolves is
 * pointed at the new path, and gains the new name as display text if it had none.
 */
export function renameLinks(text: string, rename: LinkRename): string {
	return text
		.split('\n')
		.map((line) =>
			line.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (link: string, embed: string, inner: string) => {
				const pipeAt = inner.indexOf('|');
				const escaped = pipeAt > 0 && inner[pipeAt - 1] === '\\';
				const full = pipeAt < 0 ? inner : inner.slice(0, escaped ? pipeAt - 1 : pipeAt);
				const display = pipeAt < 0 ? undefined : inner.slice(pipeAt + 1);
				const hash = full.indexOf('#');
				const target = hash < 0 ? full : full.slice(0, hash);
				const subpath = hash < 0 ? '' : full.slice(hash);
				if (!target || !rename.matches(target)) return link;
				const repoint = rename.repoint(target);
				const nextTarget = repoint ? `${rename.target}${subpath}` : full;
				let nextDisplay = display;
				if (
					display !== undefined &&
					rename.names.some((name) => name.normalize('NFC') === display.trim().normalize('NFC'))
				)
					nextDisplay = rename.name;
				else if (display === undefined && repoint && !embed && !subpath) nextDisplay = rename.name;
				if (nextTarget === full && nextDisplay === display) return link;
				const pipe = escaped || (display === undefined && /^\s*\|/.test(line)) ? '\\|' : '|';
				return `${embed}[[${nextTarget}${nextDisplay === undefined ? '' : `${pipe}${nextDisplay}`}]]`;
			}),
		)
		.join('\n');
}

/** Applies `renameLinks` to string and string-list property values; returns whether any changed. */
export function renamePropertyLinks(properties: Record<string, unknown>, rename: LinkRename): boolean {
	let changed = false;
	const apply = (value: unknown): unknown => {
		if (typeof value !== 'string') return value;
		const next = renameLinks(value, rename);
		if (next !== value) changed = true;
		return next;
	};
	for (const [key, value] of Object.entries(properties)) {
		properties[key] = Array.isArray(value) ? value.map(apply) : apply(value);
	}
	return changed;
}

/** Raw targets of every wiki link in a note, without headings, for resolving before a rename. */
export function linkTargets(content: string): Set<string> {
	const targets = new Set<string>();
	for (const match of content.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
		const target = match[1]!.split('|')[0]!.replace(/\\$/, '').split('#')[0]!;
		if (target) targets.add(target);
	}
	return targets;
}

/**
 * The proper name a note takes after it was renamed outside the plugin (the title bar or file explorer),
 * or null when there's nothing to follow: only a folder changed, or `cc-name` already matches the new
 * filename (the plugin's own rename, or a rename that was already followed). A filename can't hold every
 * character a proper name can, so the new name is the filename as typed; **Rename cabinet note** sets others.
 */
export function followedName(current: unknown, oldBasename: string, newBasename: string): string | null {
	if (oldBasename === newBasename) return null;
	const name = typeof current === 'string' && current.trim() ? current.trim() : oldBasename;
	try {
		if (fileName(name) === newBasename) return null;
		return noteName(newBasename).normalize('NFC');
	} catch {
		return null;
	}
}
