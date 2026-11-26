import { parseYaml } from 'obsidian';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A note whose properties (YAML frontmatter) can't be parsed. Callers that scan many notes skip it. */
export class UnreadableProperties extends Error {
	constructor(readonly path: string) {
		super(`Couldn’t read the properties of ${path}. Fix its YAML in source mode, then try again.`);
		this.name = 'UnreadableProperties';
	}
}

/**
 * A note's properties read from its content, not the metadata cache, which lags behind writes. No
 * frontmatter reads as none; YAML that doesn't parse to named properties throws `UnreadableProperties`.
 */
export function readProperties(content: string, path: string): Record<string, unknown> {
	const source = content.replace(/^\uFEFF/, '').match(FRONTMATTER)?.[1];
	if (!source?.trim()) return {};
	let parsed: unknown;
	try {
		parsed = parseYaml(source);
	} catch {
		throw new UnreadableProperties(path);
	}
	if (parsed === null || parsed === undefined) return {};
	if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new UnreadableProperties(path);
	return parsed as Record<string, unknown>;
}

/** Like `readProperties`, but unreadable properties read as none: for checks where a broken note is simply not a match. */
export function readPropertiesOrNone(content: string, path: string): Record<string, unknown> {
	try {
		return readProperties(content, path);
	} catch (error) {
		if (error instanceof UnreadableProperties) return {};
		throw error;
	}
}
