import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-tests-'));
try {
	const suites = ['core.test', 'cabinet-store.test', 'stock.test', 'recipe-import.test'];
	await build({
		entryPoints: suites.map(suite => `tests/${suite}.ts`), outdir: directory, outExtension: { '.js': '.mjs' },
		bundle: true, platform: 'node', format: 'esm', target: 'node20',
		alias: { obsidian: resolve('tests/obsidian-stub.ts') },
	});
	const result = spawnSync(process.execPath, ['--test', ...suites.map(suite => join(directory, `${suite}.mjs`))], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	await rm(directory, { recursive: true, force: true });
}
