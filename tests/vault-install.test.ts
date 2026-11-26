import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin, PLUGIN_FILES } from '../scripts/vault/install';

async function repository(directory: string): Promise<string> {
	const repo = join(directory, 'repo');
	await mkdir(repo);
	await writeFile(join(repo, 'manifest.json'), JSON.stringify({ id: 'cocktail-cabinet', version: '0.1.1' }));
	await writeFile(join(repo, 'main.js'), 'built');
	await writeFile(join(repo, 'styles.css'), '.style {}');
	return repo;
}

void test('copies the release files, keeps settings, and refuses a symlinked plugin folder', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'vault-install-'));
	try {
		const repo = await repository(directory);
		const vault = join(directory, 'vault');
		await assert.rejects(installPlugin(repo, vault), /not an Obsidian vault/);
		const plugin = join(vault, '.obsidian', 'plugins', 'cocktail-cabinet');
		await mkdir(plugin, { recursive: true });
		await writeFile(join(plugin, 'data.json'), '{"cabinetFolder":"Cocktails"}');
		assert.equal(await installPlugin(repo, vault), '0.1.1');
		for (const file of PLUGIN_FILES)
			assert.equal(await readFile(join(plugin, file), 'utf8'), await readFile(join(repo, file), 'utf8'));
		assert.equal(await readFile(join(plugin, 'data.json'), 'utf8'), '{"cabinetFolder":"Cocktails"}');
		const linked = join(directory, 'linked');
		await mkdir(join(linked, '.obsidian', 'plugins'), { recursive: true });
		await symlink(repo, join(linked, '.obsidian', 'plugins', 'cocktail-cabinet'));
		await assert.rejects(installPlugin(repo, linked), /symlink/);
		assert.equal(await readFile(join(repo, 'main.js'), 'utf8'), 'built', 'the repository is untouched');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
