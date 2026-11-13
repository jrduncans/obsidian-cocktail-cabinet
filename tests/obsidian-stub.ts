// Minimal runtime boundary for exercising setup without the Obsidian application.
export class TFile {
	constructor(readonly path: string) {}
	get extension(): string {
		return this.path.split('.').at(-1) || '';
	}
}

export class TFolder {
	constructor(readonly path = '') {}
}

// Minimal date boundary for Daily notes tests; native formatting is checked in the dev vault.
export function moment(value?: string, _format?: string) {
	const date = value ? new Date(`${value}T12:00:00`) : new Date();
	const tokens: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		MM: String(date.getMonth() + 1).padStart(2, '0'),
		DD: String(date.getDate()).padStart(2, '0'),
	};
	return { format: (pattern: string) => pattern.replace(/YYYY|MM|DD/g, (token) => tokens[token]!) };
}
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

// Fixtures use JSON frontmatter, which is valid YAML supported by Obsidian.
/** JSON, or the `key: <JSON value>` lines the plugin writes (bare words read as strings). */
export function parseYaml(source: string): unknown {
	if (source.trim().startsWith('{')) return JSON.parse(source);
	return Object.fromEntries(
		source
			.split('\n')
			.filter((line) => line.includes(':'))
			.map((line) => {
				const colon = line.indexOf(':');
				const value = line.slice(colon + 1).trim();
				let parsed: unknown;
				try {
					parsed = value ? JSON.parse(value) : null;
				} catch {
					parsed = value;
				}
				return [line.slice(0, colon).trim(), parsed];
			}),
	);
}
export function stringifyYaml(value: unknown): string {
	return JSON.stringify(value);
}
export function parseFrontMatterAliases(): string[] {
	return [];
}

/** Tags from a cache: inline tags and the tags property, each with `#`. */
export function getAllTags(cache: {
	tags?: { tag: string }[];
	frontmatter?: Record<string, unknown>;
}): string[] | null {
	const property = cache.frontmatter?.tags;
	const listed = Array.isArray(property) ? property : typeof property === 'string' ? property.split(/[\s,]+/) : [];
	return [
		...listed
			.filter((tag): tag is string => typeof tag === 'string' && !!tag)
			.map((tag) => `#${tag.replace(/^#/, '')}`),
		...(cache.tags ?? []).map((item) => item.tag),
	];
}

/** Calls through at once; timing is checked in the dev vault. */
export function debounce<T extends unknown[]>(fn: (...args: T) => unknown) {
	const call = (...args: T) => {
		fn(...args);
		return call;
	};
	return Object.assign(call, { cancel: () => call, run: () => undefined });
}
