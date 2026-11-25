import assert from 'node:assert/strict';
import test from 'node:test';
import {
	followedName,
	linkTargets,
	renamedAliases,
	renameHeading,
	renameLinks,
	renamePropertyLinks,
	renameTarget,
} from '../src/core/rename';
import type { LinkRename } from '../src/core/rename';
import { PROP } from '../src/core/schema';
import type { CabinetNote } from '../src/core/schema';
import { RenameStore } from '../src/vault/rename-store';
import { TFile } from './obsidian-stub';
import type { App, TFile as VaultFile } from 'obsidian';

void test('the target keeps the folder and derives the filename from the proper name', () => {
	assert.deepEqual(renameTarget('Cocktails/Recipes/Vieux Carre.md', 'Vieux Carre', ' Vieux Carré '), {
		name: 'Vieux Carré',
		path: 'Cocktails/Recipes/Vieux Carre.md',
	});
	assert.deepEqual(renameTarget('Cocktails/Types/Fruit Juice.md', 'Fruit Juice', 'Juice'), {
		name: 'Juice',
		path: 'Cocktails/Types/Juice.md',
	});
	assert.equal(
		renameTarget('Cocktails/Recipes/Tuxedo.md', 'Tuxedo', 'Tuxedo #2').path,
		'Cocktails/Recipes/Tuxedo No 2.md',
	);
	assert.throws(() => renameTarget('Cocktails/Recipes/Tuxedo.md', 'Tuxedo', 'Tuxedo'), /different name/);
	assert.throws(() => renameTarget('Cocktails/Recipes/Tuxedo.md', 'Tuxedo', 'A/B'), /special characters/);
});

void test('aliases drop the old name unless kept and add a name that differs from its filename', () => {
	assert.deepEqual(renamedAliases(['Vieux Carré', 'VC'], 'Vieux Carré', 'Vieux Carre', false), ['VC']);
	assert.deepEqual(renamedAliases(undefined, 'Vieux Carre', 'Vieux Carré', false), ['Vieux Carré']);
	assert.equal(renamedAliases(undefined, 'Fruit Juice', 'Juice', false), undefined);
	assert.deepEqual(renamedAliases([], 'Fruit Juice', 'Juice', false), []);
	assert.deepEqual(renamedAliases(undefined, 'Fruit Juice', 'Juice', true), ['Fruit Juice']);
	assert.deepEqual(renamedAliases('Old', 'Last Word', 'Last Wørd', true), ['Old', 'Last Word', 'Last Wørd']);
	// Existing aliases stay, in order, with the old name added after them.
	assert.deepEqual(renamedAliases(['Pamplemousse', 'Grapefruit'], 'Fruit Juice', 'Juice', true), [
		'Pamplemousse',
		'Grapefruit',
		'Fruit Juice',
	]);
	assert.deepEqual(renamedAliases(['Pamplemousse', 'Fruit Juice'], 'Fruit Juice', 'Jüice', true), [
		'Pamplemousse',
		'Fruit Juice',
		'Jüice',
	]);
	assert.deepEqual(renamedAliases(['Pamplemousse', 'Fruit Juice'], 'Fruit Juice', 'Juice', false), ['Pamplemousse']);
	// Keeping a name that is still the filename adds nothing.
	assert.deepEqual(renamedAliases(undefined, 'Vieux Carre', 'Vieux Carré', true), ['Vieux Carré']);
});

void test('the heading follows only when it showed the old name or filename', () => {
	const note = '---\ncc-name: "Fruit Juice"\n---\n# Fruit Juice\n\nText\n\n# Fruit Juice again\n';
	assert.equal(
		renameHeading(note, ['Fruit Juice'], 'Juice'),
		'---\ncc-name: "Fruit Juice"\n---\n# Juice\n\nText\n\n# Fruit Juice again\n',
	);
	assert.equal(renameHeading('# Vieux Carre\n', ['Vieux Carré', 'Vieux Carre'], 'Vieux Carré'), '# Vieux Carré\n');
	assert.equal(renameHeading('# Something else\n', ['Fruit Juice'], 'Juice'), null);
	assert.equal(renameHeading('No heading\n', ['Fruit Juice'], 'Juice'), null);
});

const juice = (targets: string[], repoint: string[] = []): LinkRename => ({
	matches: (target) => targets.includes(target),
	repoint: (target) => repoint.includes(target),
	target: 'Cocktails/Types/Juice',
	names: ['Fruit Juice'],
	name: 'Juice',
});

void test('link text showing the old name changes; recipe wording stays', () => {
	const rename = juice(['Cocktails/Types/Juice', 'Juice']);
	assert.equal(
		renameLinks('- 1 oz [[Cocktails/Types/Juice|Fruit Juice]]', rename),
		'- 1 oz [[Cocktails/Types/Juice|Juice]]',
	);
	assert.equal(
		renameLinks('- 1 oz [[Cocktails/Types/Juice|grapefruit juice]]', rename),
		'- 1 oz [[Cocktails/Types/Juice|grapefruit juice]]',
	);
	assert.equal(
		renameLinks('[[Juice]] and [[Juice#Notes|Fruit Juice]] and [[Other|Fruit Juice]]', rename),
		'[[Juice]] and [[Juice#Notes|Juice]] and [[Other|Fruit Juice]]',
	);
	assert.equal(
		renameLinks('| [[Cocktails/Types/Juice\\|Fruit Juice]] |', rename),
		'| [[Cocktails/Types/Juice\\|Juice]] |',
	);
});

void test('links that no longer resolve are pointed at the new path', () => {
	const rename = juice(
		['Fruit Juice', 'Cocktails/Types/Fruit Juice'],
		['Fruit Juice', 'Cocktails/Types/Fruit Juice'],
	);
	assert.equal(
		renameLinks(
			'[[Fruit Juice]] [[Cocktails/Types/Fruit Juice|fresh juice]] ![[Fruit Juice]] [[Fruit Juice#Notes]]',
			rename,
		),
		'[[Cocktails/Types/Juice|Juice]] [[Cocktails/Types/Juice|fresh juice]] ![[Cocktails/Types/Juice]] [[Cocktails/Types/Juice#Notes]]',
	);
	assert.equal(renameLinks('| [[Fruit Juice]] |', rename), '| [[Cocktails/Types/Juice\\|Juice]] |');
});

void test('property links follow, and targets are collected from text', () => {
	const properties: Record<string, unknown> = {
		[PROP.provides]: ['[[Cocktails/Types/Juice|Fruit Juice]]', '[[Cocktails/Types/Lime Juice|Lime Juice]]'],
		[PROP.name]: 'Fresh Limes',
		rating: 3,
	};
	assert.equal(renamePropertyLinks(properties, juice(['Cocktails/Types/Juice'])), true);
	assert.deepEqual(properties[PROP.provides], [
		'[[Cocktails/Types/Juice|Juice]]',
		'[[Cocktails/Types/Lime Juice|Lime Juice]]',
	]);
	assert.equal(renamePropertyLinks({ a: 'plain' }, juice(['x'])), false);
	assert.deepEqual([...linkTargets('[[A|x]] [[B#h]] | [[C\\|y]] ![[D]]')], ['A', 'B', 'C', 'D']);
});

function fixture(options: { updateLinks: boolean }) {
	const contents = new Map<string, string>([
		['Cocktails/Types/Fruit Juice.md', '---\ncc-kind: "type"\ncc-name: "Fruit Juice"\n---\n# Fruit Juice\n\nBody'],
		[
			'Cocktails/Recipes/Sour.md',
			'---\ncc-kind: "recipe"\n---\n# Sour\n\n- 1 oz [[Cocktails/Types/Fruit Juice|Fruit Juice]]\n- 1 oz [[Cocktails/Types/Fruit Juice|lemon juice]]',
		],
		[
			'Cocktails/Ingredients/Fresh Limes.md',
			'---\ncc-kind: "ingredient"\ncc-provides: ["[[Cocktails/Types/Fruit Juice|Fruit Juice]]"]\n---\n# Fresh Limes',
		],
		['Daily/2026-11-05.md', 'Bought [[Fruit Juice]].'],
		['Cocktails/Types/Juice Blend.md', 'unrelated'],
	]);
	const properties = (path: string) => {
		const yaml = contents.get(path)!.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
		return Object.fromEntries(
			yaml
				.split('\n')
				.filter(Boolean)
				.map((line) => {
					const colon = line.indexOf(':');
					return [line.slice(0, colon), JSON.parse(line.slice(colon + 1).trim()) as unknown];
				}),
		);
	};
	const writeProperties = (path: string, values: Record<string, unknown>) => {
		const body = contents.get(path)!.replace(/^---\n[\s\S]*?\n---\n/, '');
		contents.set(
			path,
			`---\n${Object.entries(values)
				.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
				.join('\n')}\n---\n${body}`,
		);
	};
	const files = new Map<string, TFile>();
	const fileAt = (path: string) => {
		if (!contents.has(path)) return null;
		if (!files.has(path)) files.set(path, new TFile(path));
		return files.get(path)!;
	};
	const resolve = (link: string) =>
		[...contents.keys()].find(
			(path) => path.replace(/\.md$/, '') === link || path.split('/').at(-1)!.replace(/\.md$/, '') === link,
		) ?? null;
	const writes: string[] = [];
	const resolvedLinks: Record<string, Record<string, number>> = {
		'Cocktails/Recipes/Sour.md': { 'Cocktails/Types/Fruit Juice.md': 2 },
		'Cocktails/Ingredients/Fresh Limes.md': { 'Cocktails/Types/Fruit Juice.md': 1 },
		'Daily/2026-11-05.md': { 'Cocktails/Types/Fruit Juice.md': 1 },
		'Cocktails/Types/Juice Blend.md': {},
	};
	const app = {
		metadataCache: {
			resolvedLinks,
			getFileCache: (file: TFile) => (contents.has(file.path) ? { frontmatter: properties(file.path) } : null),
			getFirstLinkpathDest: (link: string) => {
				const path = resolve(link);
				return path ? fileAt(path) : null;
			},
		},
		vault: {
			getAbstractFileByPath: fileAt,
			getFiles: () => [...contents.keys()].map((path) => fileAt(path)!),
			read: (file: TFile) => Promise.resolve(contents.get(file.path)!),
			process: (file: TFile, transform: (content: string) => string) => {
				writes.push(`process ${file.path}`);
				contents.set(file.path, transform(contents.get(file.path)!));
				return Promise.resolve(contents.get(file.path));
			},
		},
		fileManager: {
			processFrontMatter: (file: TFile, transform: (properties: Record<string, unknown>) => void) => {
				writes.push(`properties ${file.path}`);
				const values = properties(file.path);
				transform(values);
				writeProperties(file.path, values);
				return Promise.resolve();
			},
			renameFile: (file: TFile, path: string) => {
				writes.push(`rename ${file.path}`);
				const old = file.path;
				let content = contents.get(old)!;
				contents.delete(old);
				files.delete(old);
				Object.defineProperty(file, 'path', { value: path });
				Object.defineProperty(file, 'basename', {
					value: path.split('/').at(-1)!.replace(/\.md$/, ''),
					configurable: true,
				});
				contents.set(path, content);
				files.set(path, file);
				if (options.updateLinks) {
					for (const [source, text] of contents) {
						// Like Obsidian with the shortest link format: short paths, and old-filename display text follows the file.
						content = text
							.split('[[Cocktails/Types/Fruit Juice|Fruit Juice]]')
							.join('[[Juice|Juice]]')
							.split('[[Cocktails/Types/Fruit Juice')
							.join('[[Juice')
							.split('[[Fruit Juice]]')
							.join('[[Juice]]');
						contents.set(source, content);
					}
				}
				return Promise.resolve();
			},
		},
	};
	const type = new TFile('Cocktails/Types/Fruit Juice.md');
	Object.defineProperty(type, 'basename', { value: 'Fruit Juice', configurable: true });
	files.set(type.path, type);
	const note: CabinetNote = { path: type.path, name: 'Fruit Juice', kind: 'type', parents: [] };
	/** A rename made in Obsidian itself: the file moves, links update, and the link index follows. */
	const move = async (file: TFile, path: string) => {
		const old = file.path;
		await app.fileManager.renameFile(file, path);
		for (const targets of Object.values(resolvedLinks))
			if (targets[old]) {
				targets[path] = targets[old];
				delete targets[old];
			}
	};
	return { renamer: new RenameStore(app as unknown as App), contents, note, writes, file: () => type, move };
}

for (const updateLinks of [true, false]) {
	void test(`rename updates the note and its links (Obsidian link updating ${updateLinks ? 'on' : 'off'})`, async () => {
		const f = fixture({ updateLinks });
		assert.deepEqual(f.renamer.linkingNotes(f.note.path).sort(), [
			'Cocktails/Ingredients/Fresh Limes.md',
			'Cocktails/Recipes/Sour.md',
			'Daily/2026-11-05.md',
		]);
		const result = await f.renamer.rename(f.note, renameTarget(f.note.path, f.note.name, 'Jüice'), true);
		assert.deepEqual(result, { linked: 3, failed: [], heading: true });
		assert.equal(f.contents.has('Cocktails/Types/Fruit Juice.md'), false);
		assert.equal(
			f.contents.get('Cocktails/Types/Juice.md'),
			'---\ncc-kind: "type"\ncc-name: "Jüice"\naliases: ["Fruit Juice","Jüice"]\n---\n# Jüice\n\nBody',
		);
		assert.equal(
			f.contents.get('Cocktails/Recipes/Sour.md'),
			'---\ncc-kind: "recipe"\n---\n# Sour\n\n- 1 oz [[Cocktails/Types/Juice|Jüice]]\n- 1 oz [[Cocktails/Types/Juice|lemon juice]]',
		);
		assert.equal(
			f.contents.get('Cocktails/Ingredients/Fresh Limes.md'),
			'---\ncc-kind: "ingredient"\ncc-provides: ["[[Cocktails/Types/Juice|Jüice]]"]\n---\n# Fresh Limes',
		);
		assert.equal(
			f.contents.get('Daily/2026-11-05.md'),
			updateLinks ? 'Bought [[Juice]].' : 'Bought [[Cocktails/Types/Juice|Jüice]].',
		);
		assert.equal(f.contents.get('Cocktails/Types/Juice Blend.md'), 'unrelated');
	});
}

void test('keeping the old name adds it to aliases the note already has', async () => {
	const f = fixture({ updateLinks: true });
	f.contents.set(
		f.note.path,
		'---\ncc-kind: "type"\ncc-name: "Fruit Juice"\naliases: ["Squeezed Fruit","Jus"]\n---\n# Fruit Juice\n\nBody',
	);
	await f.renamer.rename(f.note, renameTarget(f.note.path, f.note.name, 'Jüice'), true);
	assert.match(
		f.contents.get('Cocktails/Types/Juice.md')!,
		/^aliases: \["Squeezed Fruit","Jus","Fruit Juice","Jüice"\]$/m,
	);
});

void test('rename refuses a taken filename or a name changed since the form opened, before writing', async () => {
	const f = fixture({ updateLinks: true });
	await assert.rejects(
		f.renamer.rename(f.note, renameTarget(f.note.path, f.note.name, 'juice blend'), false),
		/already exists/,
	);
	await assert.rejects(
		f.renamer.rename({ ...f.note, name: 'Juices' }, renameTarget(f.note.path, 'Juices', 'Juice'), false),
		/changed after the form opened/,
	);
	assert.deepEqual(f.writes, ['properties Cocktails/Types/Fruit Juice.md']);
	assert.equal(
		f.contents.get('Cocktails/Types/Fruit Juice.md'),
		'---\ncc-kind: "type"\ncc-name: "Fruit Juice"\n---\n# Fruit Juice\n\nBody',
	);
});

void test('a rename made outside the plugin is followed only when the filename and cc-name disagree', () => {
	assert.equal(followedName('Fruit Juice', 'Fruit Juice', 'Juice'), 'Juice');
	assert.equal(followedName(undefined, 'Fruit Juice', 'Juice'), 'Juice');
	// A folder move, the plugin's own rename (cc-name already set), and a rename already followed.
	assert.equal(followedName('Fruit Juice', 'Fruit Juice', 'Fruit Juice'), null);
	assert.equal(followedName('Jüice', 'Fruit Juice', 'Juice'), null);
	assert.equal(followedName('Tuxedo #2', 'Tuxedo', 'Tuxedo No 2'), null);
	assert.equal(followedName('Vieux Carré', 'Vieux Carre', 'Vieux Carre Royale'), 'Vieux Carre Royale');
});

void test('following a native rename brings the name, aliases, heading, and link text along', async () => {
	const f = fixture({ updateLinks: true });
	// Display text Obsidian's own updating leaves alone, since the link has a heading.
	f.contents.set('Daily/2026-11-05.md', 'Bought [[Cocktails/Types/Fruit Juice#Notes|Fruit Juice]].');
	const file = f.file();
	await f.move(file, 'Cocktails/Types/Juice.md');
	const result = await f.renamer.follow(file as unknown as VaultFile, 'Cocktails/Types/Fruit Juice.md', 'Cocktails');
	assert.deepEqual(result, { name: 'Juice', linked: 3, failed: [] });
	assert.equal(
		f.contents.get('Cocktails/Types/Juice.md'),
		'---\ncc-kind: "type"\ncc-name: "Juice"\n---\n# Juice\n\nBody',
	);
	// Obsidian repointed the links in its short format; cabinet notes get full paths back, and recipe wording stays.
	assert.equal(
		f.contents.get('Cocktails/Recipes/Sour.md'),
		'---\ncc-kind: "recipe"\n---\n# Sour\n\n- 1 oz [[Cocktails/Types/Juice|Juice]]\n- 1 oz [[Cocktails/Types/Juice|lemon juice]]',
	);
	assert.equal(
		f.contents.get('Cocktails/Ingredients/Fresh Limes.md'),
		'---\ncc-kind: "ingredient"\ncc-provides: ["[[Cocktails/Types/Juice|Juice]]"]\n---\n# Fresh Limes',
	);
	assert.equal(f.contents.get('Daily/2026-11-05.md'), 'Bought [[Juice#Notes|Juice]].');
	assert.equal(
		await f.renamer.follow(file as unknown as VaultFile, 'Cocktails/Types/Fruit Juice.md', 'Cocktails'),
		null,
	);
});
