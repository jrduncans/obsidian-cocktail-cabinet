import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
/** The release artifacts Obsidian loads. */
export const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'] as const;

/** Only merged work reaches a real vault: the repository must be on main with nothing uncommitted. */
export async function releaseCheck(repo: string): Promise<void> {
	const git = (...args: string[]) => run('git', ['-C', repo, ...args]);
	const branch = (await git('branch', '--show-current')).stdout.trim();
	if (branch !== 'main')
		throw new Error(`Install from main, not ${branch || 'a detached HEAD'}. Merge your branch first.`);
	if ((await git('status', '--porcelain')).stdout.trim())
		throw new Error('Commit or discard your changes before installing.');
}

/**
 * Copy the built plugin into a vault's plugin folder, keeping its settings (data.json).
 * Refuses a symlinked plugin folder: that is a development vault, where the link already
 * points at this repository.
 */
export async function installPlugin(repo: string, vault: string): Promise<string> {
	const config = join(vault, '.obsidian');
	if (!(await lstat(config).catch(() => null))?.isDirectory()) throw new Error(`${vault} is not an Obsidian vault.`);
	const manifest = JSON.parse(await readFile(join(repo, 'manifest.json'), 'utf8')) as { id: string; version: string };
	const target = join(config, 'plugins', manifest.id);
	const existing = await lstat(target).catch(() => null);
	if (existing?.isSymbolicLink())
		throw new Error(`${target} is a symlink (a development vault); builds already reach it.`);
	if (existing && !existing.isDirectory()) throw new Error(`${target} is not a folder.`);
	if (
		await realpath(vault)
			.then((path) => path.startsWith(`${repo}/`))
			.catch(() => false)
	)
		throw new Error('Choose a vault outside the repository.');
	await mkdir(target, { recursive: true });
	for (const file of PLUGIN_FILES) await copyFile(join(repo, file), join(target, file));
	return manifest.version;
}
