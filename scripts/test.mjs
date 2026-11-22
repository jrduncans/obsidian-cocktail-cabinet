import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-tests-'));
try {
	const suites = [
		'core.test',
		'cabinet-store.test',
		'stock.test',
		'stock-edit.test',
		'purchase.test',
		'rename.test',
		'note-edit.test',
		'recipe-import.test',
		'written-as.test',
		'web-recipe.test',
		'logging.test',
		'subtypes.test',
		'availability.test',
		'catalog-sync.test',
		'alcohol-estimate.test',
		'one-off.test',
		'unlinked-lines.test',
		'logging-store.test',
		'knowledge-migration.test',
		'vault-install.test',
	];
	await build({
		entryPoints: suites.map((suite) => `tests/${suite}.ts`),
		outdir: directory,
		outExtension: { '.js': '.mjs' },
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node20',
		alias: { obsidian: resolve('tests/obsidian-stub.ts') },
		banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
	});
	const result = spawnSync(process.execPath, ['--test', ...suites.map((suite) => join(directory, `${suite}.mjs`))], {
		stdio: 'inherit',
	});
	process.exitCode = result.status ?? 1;
} finally {
	await rm(directory, { recursive: true, force: true });
}
