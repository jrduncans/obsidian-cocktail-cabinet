import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin, PLUGIN_FILES, releaseCheck } from '../scripts/vault/install';

async function repository(directory: string): Promise<string> {
	const repo = join(directory, 'repo');
	await mkdir(repo);
	await writeFile(join(repo, 'manifest.json'), JSON.stringify({ id: 'cocktail-cabinet', version: '0.1.1' }));
	await writeFile(join(repo, 'main.js'), 'built');
	await writeFile(join(repo, 'styles.css'), '.style {}');
	return repo;
}

void test('installs only from a clean main', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vault-install-'));
	try {
		const repo = await repository(directory);
		const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args]);
		git('init', '-q', '-b', 'main');
		git('add', '-A');
		git('commit', '-qm', 'Synthetic plugin');
		await releaseCheck(repo);
		await writeFile(join(repo, 'main.js'), 'unfinished');
		await assert.rejects(releaseCheck(repo), /Commit or discard/);
		git('checkout', '-q', '--', 'main.js');
		git('switch', '-q', '-c', 'feature');
		await assert.rejects(releaseCheck(repo), /Install from main, not feature/);
	} finally { await rm(directory, { recursive: true, force: true }); }
});

void test('copies the release files, keeps settings, and refuses development vaults', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vault-install-'));
	try {
		const repo = await repository(directory);
		const vault = join(directory, 'vault');
		await assert.rejects(installPlugin(repo, vault), /not an Obsidian vault/);
		const plugin = join(vault, '.obsidian', 'plugins', 'cocktail-cabinet');
		await mkdir(plugin, { recursive: true });
		await writeFile(join(plugin, 'data.json'), '{"cabinetFolder":"Cocktails"}');
		assert.equal(await installPlugin(repo, vault), '0.1.1');
		for (const file of PLUGIN_FILES) assert.equal(await readFile(join(plugin, file), 'utf8'), await readFile(join(repo, file), 'utf8'));
		assert.equal(await readFile(join(plugin, 'data.json'), 'utf8'), '{"cabinetFolder":"Cocktails"}');
		const dev = join(directory, 'dev');
		await mkdir(join(dev, '.obsidian', 'plugins'), { recursive: true });
		await symlink(repo, join(dev, '.obsidian', 'plugins', 'cocktail-cabinet'));
		await assert.rejects(installPlugin(repo, dev), /symlink/);
		assert.equal(await readFile(join(repo, 'main.js'), 'utf8'), 'built', 'the repository is untouched');
	} finally { await rm(directory, { recursive: true, force: true }); }
});
