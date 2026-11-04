// Minimal runtime boundary for exercising setup without the Obsidian application.
export class TFile {
	constructor(readonly path: string) {}
	get extension(): string { return this.path.split('.').at(-1) || ''; }
}

export class TFolder { constructor(readonly path = '') {} }

// Minimal date boundary for Daily notes tests; native formatting is checked in the dev vault.
export function moment(value?: string, _format?: string) {
	const date = value ? new Date(`${value}T12:00:00`) : new Date();
	const tokens: Record<string, string> = {
		YYYY: String(date.getFullYear()), MM: String(date.getMonth() + 1).padStart(2, '0'), DD: String(date.getDate()).padStart(2, '0'),
	};
	return { format: (pattern: string) => pattern.replace(/YYYY|MM|DD/g, token => tokens[token]!) };
}
export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, ''); }

// Fixtures use JSON frontmatter, which is valid YAML supported by Obsidian.
export function parseYaml(source: string): unknown { return JSON.parse(source); }
export function stringifyYaml(value: unknown): string { return JSON.stringify(value); }
export function parseFrontMatterAliases(): string[] { return []; }
