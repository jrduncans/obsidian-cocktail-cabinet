import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { cabinetFolder } from '../../src/core/schema';
import type { MigrationPlan } from './plan';

export const KNOWLEDGE_VAULT = '/Users/jrduncans/Library/Mobile Documents/iCloud~md~obsidian/Documents/knowledge';
const within = (path: string, root: string) => path === root || path.startsWith(`${root}${sep}`);

async function canonical(path: string): Promise<string> {
	try { return await realpath(path); }
	catch (error) {
		if ((error as { code?: string }).code !== 'ENOENT') throw error;
		const parent = dirname(path);
		if (parent === path) throw error;
		return join(await canonical(parent), basename(path));
	}
}

/**
 * In-place cutover converts the vault's own `Cocktails/` folder. It needs git with nothing
 * uncommitted there, so one `git checkout` or `git reset --hard` undoes it completely.
 */
async function inPlaceDestination(source: string, target: string, root: string): Promise<string> {
	if (target !== source) throw new Error('In-place migration writes to the source vault; omit a separate target.');
	if (root !== 'Cocktails') throw new Error('In-place migration converts the Cocktails folder; use --root Cocktails.');
	const destination = join(source, 'Cocktails');
	if (await canonical(destination) !== destination) throw new Error('Destination must stay inside the vault without symlinks.');
	const git = (...args: string[]) => promisify(execFile)('git', ['-C', source, ...args]);
	try { await git('rev-parse', '--is-inside-work-tree'); }
	catch { throw new Error('In-place migration needs the vault in a git repository, so it can be undone.'); }
	const { stdout } = await git('status', '--porcelain', '--untracked-files=all', '--', 'Cocktails');
	if (stdout.trim()) throw new Error('Commit or discard the changes in Cocktails first, so the migration can be undone with git.');
	return destination;
}

/** Resolve aliases and every existing ancestor before permitting any destination writes. */
export async function safeDestination(sourceVault: string, targetVault: string, root: string, inPlace = false): Promise<string> {
	const source = await realpath(sourceVault);
	const target = await realpath(targetVault);
	if (inPlace) return inPlaceDestination(source, target, root);
	const forbidden = await canonical(KNOWLEDGE_VAULT);
	const destination = resolve(target, cabinetFolder(root));
	const physical = await canonical(destination);
	if (within(target, forbidden) || within(physical, forbidden) || basename(target).toLowerCase() === 'knowledge') throw new Error('Apply to the knowledge vault is forbidden.');
	if (within(target, source) || within(physical, source) || within(source, physical)) throw new Error('Source and target must be separate vaults.');
	if (!within(physical, target) || physical !== destination) throw new Error('Destination must stay inside the target vault without symlinks.');
	return destination;
}

export async function snapshot(root: string): Promise<Map<string, Buffer>> {
	const files = new Map<string, Buffer>();
	async function visit(directory: string): Promise<void> {
		for (const name of (await readdir(directory)).sort()) {
			const path = join(directory, name);
			const stat = await lstat(path);
			if (stat.isSymbolicLink()) throw new Error(`Symlinks are not supported in a migration copy: ${path}`);
			if (stat.isDirectory()) await visit(path);
			else if (stat.isFile()) files.set(relative(root, path).split(sep).join('/'), await readFile(path));
			else throw new Error(`Unsupported source entry: ${path}`);
		}
	}
	await visit(root);
	return files;
}

export function sameSnapshot(a: ReadonlyMap<string, Buffer>, b: ReadonlyMap<string, Buffer>): boolean {
	return a.size === b.size && [...a].every(([path, value]) => b.get(path)?.equals(value));
}

export function textSource(files: ReadonlyMap<string, Buffer>): Map<string, string> {
	return new Map([...files].filter(([path]) => !path.split('/').some(part => part.startsWith('.')))
		.map(([path, content]) => [`Cocktails/${path}`, /\.(?:md|base|js)$/.test(path) ? content.toString('utf8') : '']));
}

/**
 * No overwrite of an edited rehearsal. Stage a complete copy, then swap with rollback.
 * In place, the target is the source's own Cocktails folder, an unchanged copy by definition.
 */
export async function applyPlan(sourceVault: string, targetVault: string, plan: MigrationPlan, expected: ReadonlyMap<string, Buffer>, inPlace = false): Promise<void> {
	if (plan.issues.some(issue => issue.category === 'Conversion errors')) throw new Error('Conversion errors block apply; review the report.');
	const destination = await safeDestination(sourceVault, targetVault, plan.root, inPlace);
	const source = join(await realpath(sourceVault), 'Cocktails');
	if (!sameSnapshot(expected, await snapshot(source))) throw new Error('Source changed since planning. Run a fresh dry run.');
	let exists = false;
	try {
		await lstat(destination);
		exists = true;
		if (!sameSnapshot(expected, await snapshot(destination))) throw new Error('Target is not an unchanged copy of source Cocktails. Use a new rehearsal folder.');
	} catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
	await mkdir(dirname(destination), { recursive: true });
	const staging = await mkdtemp(join(dirname(destination), '.cocktail-migration-'));
	const output = join(staging, 'output');
	const backup = join(staging, 'original');
	let moved = false;
	let cleanup = true;
	try {
		await cp(source, output, { recursive: true, errorOnExist: true, force: false });
		if (!sameSnapshot(expected, await snapshot(output))) throw new Error('Source changed during staging.');
		const outputPath = (path: string) => {
			const local = relative(plan.root, path);
			if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`) || !local) throw new Error('Invalid planned path.');
			return join(output, local);
		};
		for (const path of plan.remove) await rm(outputPath(path));
		for (const [path, content] of plan.files) {
			const file = outputPath(path);
			// An unmapped or deferred file must never be overwritten by generated output.
			const local = relative(output, file).split(sep).join('/');
			if (expected.has(local) && !plan.remove.includes(`${plan.root}/${local}`)) throw new Error(`Generated output conflicts with preserved file: ${local}`);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, content, { flag: 'wx' });
		}
		await safeDestination(sourceVault, targetVault, plan.root, inPlace);
		if (!sameSnapshot(expected, await snapshot(source))) throw new Error('Source changed before apply.');
		if (exists) {
			if (!sameSnapshot(expected, await snapshot(destination))) throw new Error('Target changed before apply.');
			await rename(destination, backup);
			moved = true;
		}
		await rename(output, destination);
		moved = false;
	} catch (error) {
		if (moved) {
			try { await rename(backup, destination); }
			catch {
				cleanup = false;
				throw new Error(`Installation and rollback failed (${String(error)}). Original copy preserved at ${backup}.`);
			}
		}
		throw error;
	} finally { if (cleanup) await rm(staging, { recursive: true, force: true }); }
}

export async function writeReport(path: string, content: string, sourceVault: string): Promise<void> {
	const physical = await canonical(resolve(path));
	if (within(physical, await realpath(sourceVault)) || within(physical, await canonical(KNOWLEDGE_VAULT))) throw new Error('Reports must be saved outside the source and knowledge vaults.');
	if (within(physical, await realpath(process.cwd()))) throw new Error('Private reports must be saved outside the plugin repository.');
	await writeFile(physical, content, { flag: 'wx', mode: 0o600 });
}
