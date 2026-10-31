// Minimal runtime boundary for exercising setup without the Obsidian application.
export class TFile {
	constructor(readonly path: string) {}
	get extension(): string { return this.path.split('.').at(-1) || ''; }
}

export class TFolder {}

// Fixtures use JSON frontmatter, which is valid YAML supported by Obsidian.
export function parseYaml(source: string): unknown { return JSON.parse(source); }
export function parseFrontMatterAliases(): string[] { return []; }
