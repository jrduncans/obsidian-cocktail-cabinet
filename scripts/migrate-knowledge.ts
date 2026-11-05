import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { applyPlan, safeDestination, snapshot, textSource, writeReport } from './knowledge/io';
import { readMapping } from './knowledge/mapping';
import { migrationPlan } from './knowledge/plan';
import { migrationReport } from './knowledge/report';

const { values } = parseArgs({ options: {
	'source-vault': { type: 'string' }, 'target-vault': { type: 'string' }, root: { type: 'string' },
	apply: { type: 'boolean', default: false }, report: { type: 'string' }, help: { type: 'boolean' },
} });
if (values.help) {
	process.stdout.write('npm run migrate:knowledge -- --source-vault PATH --root FOLDER [--target-vault PATH --apply] [--report PATH]\nDry run is the default. Apply only to a separate vault, in a new folder or unchanged copy.\n');
} else {
	if (!values['source-vault'] || !values.root) throw new Error('--source-vault and --root are required.');
	if (values.apply && !values['target-vault']) throw new Error('--apply requires --target-vault.');
	if (values.apply) await safeDestination(values['source-vault'], values['target-vault']!, values.root);
	const source = await snapshot(join(values['source-vault'], 'Cocktails'));
	const mapping = readMapping(await readFile('docs/knowledge-adoption-mapping.md', 'utf8'));
	const plan = migrationPlan(textSource(source), values.root, mapping);
	const report = migrationReport(plan);
	if (values.report) await writeReport(values.report, report, values['source-vault']);
	else process.stdout.write(report);
	if (values.apply) {
		await applyPlan(values['source-vault'], values['target-vault']!, plan, source);
		process.stdout.write('Applied rehearsal migration. Daily notes were not changed.\n');
	} else process.stdout.write('Dry run only. No cabinet files were written.\n');
	if (plan.issues.some(issue => issue.category === 'Conversion errors')) process.exitCode = 1;
}
