import { fileName, noteName } from '../../src/core/schema';
import { readDocument } from './document';
import type { AdoptionMapping } from './mapping';
import type { MigrationPlan } from './plan';

/**
 * The rename pre-pass: renames done in the knowledge vault through Obsidian before cutover,
 * so links everywhere (daily notes included) follow. Only filename-only and one-to-one renames;
 * reclassifications, merges, the Falernum swap, and folder moves stay in the migration.
 */

/** One-to-one type renames from the mapping done in the pre-pass. */
export const PREPASS_TYPES: readonly string[] = [
	'Barbados Rum',
	'Cassis Liqueur',
	'Classic Aromatic Bitters',
	'Demerara Syrup',
	'Haitian Rum',
	'New Orleans-Style Bitters',
	'Oaxacan Rum',
	'PX Sherry',
	'Passionfruit Syrup',
	'Rhum Agricole Blanc',
	'Simple Syrup',
	'Unaged Column Still Rum',
];
/** Homemade syrup bottles take their House names; the migration later moves them to other stock. */
const HOUSE: Record<string, string> = {
	'Simple Syrup, 1 to 1': 'House Simple Syrup (1 to 1)',
	'Demerara Syrup, 2 to 1': 'House Demerara Syrup (2 to 1)',
};
const CATEGORIES: Record<string, string> = { 'Fruit Juice': 'Juice' };
const FILENAME_FOLDERS = ['Bottles', 'Recipes', 'Types'];

export interface Rename {
	/** Vault-relative path before the pass. */
	path: string;
	/** New filename, without extension. */
	name: string;
	/** Alias to add first, so the old name stays searchable and the migration can recover it. */
	alias?: string;
}

const parts = (path: string) => {
	const segments = path.split('/');
	return { folder: segments.at(-2)!, name: segments.at(-1)!.replace(/\.md$/, '') };
};

/** Renames for a vault still using its old names. `source` keys are `Cocktails/...` paths. */
export function prepassRenames(paths: Iterable<string>, mapping: AdoptionMapping): Rename[] {
	const renames: Rename[] = [];
	for (const path of paths) {
		if (!path.endsWith('.md') || path.split('/').length !== 3) continue;
		const { folder, name } = parts(path);
		let next: string | undefined, alias: string | undefined;
		const rule = folder === 'Types' && PREPASS_TYPES.includes(name) ? mapping.types.get(name) : undefined;
		if (rule) next = fileName(rule.name);
		else if (folder === 'Bottles' && HOUSE[name]) {
			next = HOUSE[name];
			alias = name;
		} else if (folder === 'Categories' && CATEGORIES[name]) next = CATEGORIES[name];
		// Types that merge or change name (Crème de Cacao (dark)) are the migration's.
		else if (
			FILENAME_FOLDERS.includes(folder) &&
			fileName(name) !== name &&
			(folder !== 'Types' || mapping.types.get(name)?.name === name)
		) {
			next = fileName(name);
			alias = name;
		}
		if (next && next !== name) renames.push({ path, name: next, ...(alias ? { alias } : {}) });
	}
	return renames;
}

export interface Restored {
	/** The source with pre-pass names reversed, as the mapping expects. */
	source: Map<string, string>;
	/** Old path → the path the file actually has in the vault. */
	actual: Map<string, string>;
}

/**
 * Accept a vault that already ran the pre-pass by reversing its renames before planning,
 * so the plan is identical either way. Filename-only renames are recovered from the alias the
 * pre-pass adds; type, House, and category renames from the fixed tables above.
 */
export function restorePrepass(source: ReadonlyMap<string, string>, mapping: AdoptionMapping): Restored {
	const reverse = new Map<string, string>();
	const add = (folder: string, renamed: string, old: string) => {
		const from = `Cocktails/${folder}/${renamed}.md`,
			to = `Cocktails/${folder}/${old}.md`;
		if (source.has(from) && !source.has(to)) reverse.set(from, to);
	};
	for (const name of PREPASS_TYPES) {
		const rule = mapping.types.get(name);
		if (rule) add('Types', fileName(rule.name), name);
	}
	for (const [old, renamed] of Object.entries(HOUSE)) add('Bottles', renamed, old);
	for (const [old, renamed] of Object.entries(CATEGORIES)) add('Categories', renamed, old);
	for (const [path, content] of source) {
		if (!path.endsWith('.md') || path.split('/').length !== 3 || reverse.has(path)) continue;
		const { folder, name } = parts(path);
		if (!FILENAME_FOLDERS.includes(folder)) continue;
		const aliases: unknown = readDocument(content).metadata.aliases;
		const list = Array.isArray(aliases) ? aliases : typeof aliases === 'string' ? [aliases] : [];
		const proper = list.filter(
			(alias): alias is string =>
				typeof alias === 'string' && alias !== name && validName(alias) && fileName(alias) === name,
		);
		if (proper.length === 1) add(folder, name, proper[0]!);
	}
	// A bare link is reversed only when its name is unique; Obsidian writes a path otherwise.
	const counts = new Map<string, number>();
	for (const path of source.keys())
		if (path.endsWith('.md')) counts.set(parts(path).name, (counts.get(parts(path).name) ?? 0) + 1);
	const names = new Map(
		[...reverse]
			.filter(([from]) => counts.get(parts(from).name) === 1)
			.map(([from, to]) => [parts(from).name, parts(to).name]),
	);
	const restoreLink = (_: string, target: string, rest: string) => {
		const path = target.replace(/\.md$/, '');
		const explicit = path.includes('/')
			? reverse.get(`${path.startsWith('Cocktails/') ? path : `Cocktails/${path}`}.md`)
			: undefined;
		const old = explicit
			? (path.startsWith('Cocktails/') ? explicit : explicit.slice('Cocktails/'.length)).replace(/\.md$/, '')
			: !path.includes('/')
				? names.get(path)
				: undefined;
		return `[[${old ?? target}${rest}]]`;
	};
	const restored = new Map<string, string>();
	for (const [path, content] of source) {
		const text = path.endsWith('.md') ? content.replace(/\[\[([^\]|#\n]+)([^\]\n]*)\]\]/g, restoreLink) : content;
		restored.set(reverse.get(path) ?? path, text);
	}
	return { source: restored, actual: new Map([...reverse].map(([from, to]) => [to, from])) };
}

/** Point the plan's removals at the files' actual paths. */
export function actualRemovals(plan: MigrationPlan, actual: ReadonlyMap<string, string>): void {
	plan.remove = plan.remove.map((path) => {
		const real = actual.get(`Cocktails/${path.slice(plan.root.length + 1)}`);
		return real ? `${plan.root}/${real.slice('Cocktails/'.length)}` : path;
	});
}

function validName(value: string): boolean {
	try {
		noteName(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Give bare body links to renamed notes explicit display text, so the wording survives the
 * rename ([[Vieux Carré]] → [[Vieux Carré|Vieux Carré]]). Embeds, heading links, frontmatter,
 * and links that already have display text are unchanged. Table rows escape the pipe.
 */
export function withDisplayText(content: string, renamed: ReadonlySet<string>): string {
	const frontmatter = content.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? '';
	const body = content
		.slice(frontmatter.length)
		.split('\n')
		.map((line) => {
			const pipe = /^\s*\|/.test(line) ? '\\|' : '|';
			return line.replace(/(!?)\[\[([^\]|#\n]+)\]\]/g, (link: string, embed: string, target: string) => {
				const name = target.replace(/\.md$/, '').split('/').at(-1)!;
				return embed || !renamed.has(name) ? link : `[[${target}${pipe}${name}]]`;
			});
		})
		.join('\n');
	return frontmatter + body;
}
