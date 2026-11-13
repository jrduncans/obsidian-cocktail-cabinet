import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Bundles a TypeScript script and runs it: node scripts/run-ts.mjs scripts/x.ts [args]
const [script, ...args] = process.argv.slice(2);
const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-script-'));
try {
	const entry = join(directory, 'script.mjs');
	await build({
		entryPoints: [script],
		outfile: entry,
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node20',
		banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
	});
	const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	await rm(directory, { recursive: true, force: true });
}
