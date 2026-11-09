import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'cocktail-cabinet-catalog-'));
try {
	const bundle = join(directory, 'catalog.cjs');
	await build({ entryPoints: ['src/catalog/catalog.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node20' });
	const { STARTER_CATALOG: entries } = createRequire(import.meta.url)(bundle);
	const types = entries.filter(entry => entry.kind === 'type').sort((left, right) => left.name.localeCompare(right.name, 'en'));
	const families = entries.filter(entry => entry.kind === 'family');
	const categories = entries.filter(entry => entry.kind === 'category');
	const bottles = entries.filter(entry => entry.kind === 'bottle').sort((left, right) => left.name.localeCompare(right.name, 'en'));
	const stock = entries.filter(entry => entry.kind === 'ingredient').sort((left, right) => left.name.localeCompare(right.name, 'en'));
	const stockRows = stock.map(entry => `| ${entry.name} | ${entry.properties['cc-form']} | ${entry.provides?.join(', ') || '—'} |`);
	const bottleRows = bottles.map(entry => `| ${entry.name} | ${entry.parent || '—'} | Unknown |`);
	const rows = types.map(entry => {
		const family = families.find(family => family.name === entry.parent);
		return `| ${entry.name} | ${family?.name || '—'} | ${family?.parent || '—'} |`;
	});
	const content = '# Starter hierarchy draft\n\n'
		+ 'Generated from `src/catalog/catalog.ts`. Run `npm run catalog:docs` after changing the defaults; `npm test` checks that this table is current.\n\n'
		+ 'Ingredient types are the starting point. Families and categories are optional groupings. A dash means no parent, not missing information.\n\n'
		+ `${types.length} ingredient types, ${families.length} families, ${categories.length} categories, and ${bottles.length} reference bottle${bottles.length === 1 ? '' : 's'}. See [the design notes](cabinet-design.md) for agreed choices and remaining review questions.\n\n`
		+ 'Names below are the proper displayed names. Filenames use plain Latin characters; generated links display the proper name, for example `[[Cocktails/Families/Cachaca|Cachaça]]`.\n\n'
		+ '| Ingredient type | Family (optional) | Category (optional) |\n| --- | --- | --- |\n'
		+ rows.join('\n') + '\n'
		+ (bottles.length ? '\n## Reference bottles\n\n'
			+ 'Named bottles can be linked in recipes without asserting that they are owned. Record stock on the existing bottle note when needed.\n\n'
			+ '| Bottle | Ingredient type | Availability |\n| --- | --- | --- |\n'
			+ bottleRows.join('\n') + '\n' : '')
		+ (stock.length ? '\n## Starter other stock\n\n'
			+ 'Kitchen staples are the ingredient themselves and provide no type; recipes link them directly. All start at Unknown.\n\n'
			+ '| Name | Form | Provides |\n| --- | --- | --- |\n'
			+ stockRows.join('\n') + '\n' : '');
	const path = 'docs/starter-hierarchy.md';
	if (process.argv.includes('--check')) {
		const existing = await readFile(path, 'utf8');
		if (existing !== content) {
			process.stderr.write('Starter hierarchy is out of date. Run npm run catalog:docs.\n');
			process.exitCode = 1;
		}
	} else {
		await writeFile(path, content);
	}
} finally {
	await rm(directory, { recursive: true, force: true });
}
