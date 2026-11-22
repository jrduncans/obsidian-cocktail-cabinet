import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Keeps `src/catalog/history.json`: every value each catalog field has had, by entry ID, so the plugin
 * can tell a starter note nobody changed (it matches some catalog value) from one the user edited
 * (docs/ownership.md). Run through `npm run catalog:docs` after changing the catalog; `--check` (in
 * `npm test`) fails when a current value is missing. `--from-git` rebuilds it from every committed
 * version of the catalog plus the working tree.
 */
const HISTORY = 'src/catalog/history.json';
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-history-'));

async function load(root, name) {
	const outfile = join(directory, `${name}.cjs`);
	await build({
		entryPoints: [join(root, 'src/catalog/catalog.ts')],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node20',
		logLevel: 'silent',
	});
	return require(outfile).STARTER_CATALOG;
}

try {
	const fieldsFile = join(directory, 'fields.cjs');
	await build({
		entryPoints: ['src/catalog/fields.ts'],
		outfile: fieldsFile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node20',
	});
	const { CATALOG_FIELDS, catalogKey, entryFields, sameValue } = require(fieldsFile);

	const history = process.argv.includes('--from-git') ? {} : JSON.parse(await readFile(HISTORY, 'utf8'));
	const add = (entries) => {
		let added = 0;
		for (const entry of entries) {
			if (!entry.id) continue;
			const id = catalogKey(entry.id);
			const fields = entryFields(entry);
			for (const field of CATALOG_FIELDS) {
				const values = ((history[id] ??= {})[field] ??= []);
				if (!values.some((value) => sameValue(value, fields[field]))) {
					values.push(fields[field]);
					added++;
				}
			}
		}
		return added;
	};

	if (process.argv.includes('--from-git')) {
		const commits = execFileSync('git', ['log', '--reverse', '--format=%H', '--', 'src/catalog/catalog.ts'], {
			encoding: 'utf8',
		})
			.trim()
			.split('\n');
		for (const commit of commits) {
			const root = join(directory, commit);
			await mkdir(root);
			execFileSync('sh', ['-c', `git archive ${commit} src | tar -x -C "${root}"`]);
			try {
				add(await load(root, commit));
			} catch (error) {
				process.stderr.write(`Skipped ${commit.slice(0, 7)}: ${error.message.split('\n')[0]}\n`);
			}
		}
	}

	add(await load(resolve('.'), 'current'));
	// Fields that have only ever been empty carry no information.
	for (const fields of Object.values(history))
		for (const field of Object.keys(fields))
			if (fields[field].length === 1 && fields[field][0] === null) delete fields[field];
	const content = `${JSON.stringify(history, null, '\t')}\n`;
	if (process.argv.includes('--check')) {
		// Compare the file itself: fields only ever empty are re-added above, then pruned.
		if (content !== (await readFile(HISTORY, 'utf8'))) {
			process.stderr.write('Catalog history is missing current values. Run npm run catalog:docs.\n');
			process.exitCode = 1;
		}
	} else await writeFile(HISTORY, content);
} finally {
	await rm(directory, { recursive: true, force: true });
}
