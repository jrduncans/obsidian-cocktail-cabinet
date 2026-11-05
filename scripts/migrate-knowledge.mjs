import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-migration-'));
try {
	const entry = join(directory, 'migration.mjs');
	await build({ entryPoints: ['scripts/migrate-knowledge.ts'], outfile: entry, bundle: true, platform: 'node', format: 'esm', target: 'node20',
		banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
	});
	const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
