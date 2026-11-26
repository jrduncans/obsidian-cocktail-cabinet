import { execFileSync, spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { installPlugin, releaseCheck } from './vault/install';

/**
 * Install the plugin into a vault: npm run install:vault -- --vault PATH
 * Builds, copies main.js, manifest.json, and styles.css, then asks Obsidian to reload the plugin.
 * A real vault takes only merged work, so it must be installed from a clean main. A development
 * vault (npm run install:dev -- --vault PATH) skips that check and takes whatever is checked out.
 */
const { values } = parseArgs({ options: { vault: { type: 'string' }, dev: { type: 'boolean' } } });
if (!values.vault) throw new Error(`npm run install:${values.dev ? 'dev' : 'vault'} -- --vault PATH`);
const repo = process.cwd(),
	vault = resolve(values.vault);
if (!values.dev) await releaseCheck(repo);
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
const version = await installPlugin(repo, vault);
process.stdout.write(`Installed Cocktail Cabinet ${version} in ${vault}.\n`);
const reload = spawnSync('obsidian', [`vault=${basename(vault)}`, 'plugin:reload', 'id=cocktail-cabinet'], {
	stdio: ['ignore', 'pipe', 'pipe'],
	encoding: 'utf8',
});
process.stdout.write(
	reload.status === 0 && !/error/i.test(`${reload.stdout}${reload.stderr}`)
		? 'Reloaded in Obsidian.\n'
		: 'Reload it in Obsidian: enable Cocktail Cabinet in Settings → Community plugins, or turn it off and on.\n',
);
