import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { snapshot, textSource } from './knowledge/io';
import { readMapping } from './knowledge/mapping';
import { prepassRenames, withDisplayText } from './knowledge/renames';

/**
 * The rename pre-pass on the knowledge vault, in two steps:
 * - `text`: aliases on notes whose name changes, and display text on links to them, vault-wide.
 * - `renames`: prints `path<TAB>new name` lines, to rename through Obsidian so links follow.
 * Dry run unless `--apply` (text step only); run `renames` while the vault still has its old names.
 */
const { values } = parseArgs({ options: {
	vault: { type: 'string' }, step: { type: 'string' }, apply: { type: 'boolean', default: false },
} });
if (!values.vault || !['text', 'renames'].includes(values.step ?? '')) {
	throw new Error('npm run prepass:knowledge -- --vault PATH --step text|renames [--apply]');
}
const vault = values.vault;
const mapping = readMapping(await readFile('docs/knowledge-adoption-mapping.md', 'utf8'));
const renames = prepassRenames(textSource(await snapshot(join(vault, 'Cocktails'))).keys(), mapping);
if (!renames.length) {
	process.stdout.write('No pre-pass renames left; the vault already uses the new names.\n');
} else if (values.step === 'renames') {
	process.stdout.write(renames.map(rename => `${rename.path}\t${rename.name}\n`).join(''));
} else {
	const names = new Set(renames.map(rename => rename.path.split('/').at(-1)!.replace(/\.md$/, '')));
	const aliases = new Map(renames.flatMap(rename => rename.alias ? [[rename.path, rename.alias] as const] : []));
	const files = (await readdir(vault, { recursive: true }))
		.filter(path => path.endsWith('.md') && !path.split('/').some(part => part.startsWith('.')));
	const changed: string[] = [];
	for (const path of files.sort()) {
		const content = await readFile(join(vault, path), 'utf8');
		let next = withDisplayText(content, names);
		const alias = aliases.get(path);
		if (alias) {
			if (/^\uFEFF?---\r?\n[\s\S]*?^aliases:/m.test(next.split(/\r?\n---(?:\r?\n|$)/)[0] ?? '')) throw new Error(`${path} already has aliases; add ${alias} by hand.`);
			const property = `aliases:\n  - ${JSON.stringify(alias)}\n`;
			next = /^\uFEFF?---\r?\n/.test(next) ? next.replace(/^(\uFEFF?---\r?\n)/, `$1${property}`) : `---\n${property}---\n${next}`;
		}
		if (next === content) continue;
		changed.push(path);
		if (values.apply) await writeFile(join(vault, path), next);
	}
	process.stdout.write(`${changed.join('\n')}\n\n${changed.length} files ${values.apply ? 'updated' : 'would change (dry run)'}.\n`);
}
