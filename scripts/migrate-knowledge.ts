import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { applyPlan, safeDestination, snapshot, textSource, writeReport } from './knowledge/io';
import { readMapping } from './knowledge/mapping';
import { migrationPlan } from './knowledge/plan';
import { migrationReport } from './knowledge/report';
import { actualRemovals, restorePrepass } from './knowledge/renames';

const { values } = parseArgs({ options: {
	'source-vault': { type: 'string' }, 'target-vault': { type: 'string' }, root: { type: 'string' },
	apply: { type: 'boolean', default: false }, 'in-place': { type: 'boolean', default: false },
	report: { type: 'string' }, help: { type: 'boolean' },
} });
if (values.help) {
	process.stdout.write('npm run migrate:knowledge -- --source-vault PATH --root FOLDER [--target-vault PATH --apply] [--report PATH]\n'
		+ 'npm run migrate:knowledge -- --source-vault PATH --in-place [--apply] [--report PATH]\n'
		+ 'Dry run is the default. A rehearsal applies to a separate vault, in a new folder or unchanged copy.\n'
		+ 'In place converts the source vault\'s Cocktails folder; it needs git with nothing uncommitted there.\n');
} else {
	const inPlace = values['in-place'];
	if (inPlace && values['target-vault']) throw new Error('--in-place writes to the source vault; omit --target-vault.');
	if (inPlace && values.root && values.root !== 'Cocktails') throw new Error('--in-place converts the Cocktails folder; omit --root.');
	const root = inPlace ? 'Cocktails' : values.root;
	const target = inPlace ? values['source-vault'] : values['target-vault'];
	if (!values['source-vault'] || !root) throw new Error('--source-vault and --root (or --in-place) are required.');
	if (values.apply && !target) throw new Error('--apply requires --target-vault or --in-place.');
	if (values.apply) await safeDestination(values['source-vault'], target!, root, inPlace);
	const source = await snapshot(join(values['source-vault'], 'Cocktails'));
	const mapping = readMapping(await readFile('docs/knowledge-adoption-mapping.md', 'utf8'));
	// Notes the rename pre-pass already renamed are read under their old names.
	const restored = restorePrepass(textSource(source), mapping);
	const plan = migrationPlan(restored.source, root, mapping);
	actualRemovals(plan, restored.actual);
	const report = migrationReport(plan);
	if (values.report) await writeReport(values.report, report, values['source-vault']);
	else process.stdout.write(report);
	if (values.apply) {
		await applyPlan(values['source-vault'], target!, plan, source, inPlace);
		process.stdout.write(inPlace
			? 'Migrated Cocktails in place. Review with git diff; git checkout -- Cocktails && git clean -fd Cocktails undoes it.\n'
			: 'Applied rehearsal migration. Daily notes were not changed.\n');
	} else process.stdout.write('Dry run only. No cabinet files were written.\n');
	if (plan.issues.some(issue => issue.category === 'Conversion errors')) process.exitCode = 1;
}
