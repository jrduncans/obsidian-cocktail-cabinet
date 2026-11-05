import type { MigrationPlan } from './plan';

export function migrationReport(plan: MigrationPlan): string {
	const lines = ['# Knowledge migration dry-run report', '', `Target cabinet root: ${plan.root}`, '',
		'Private report: contains source paths and values. Keep outside the plugin repository.', '',
		'Unmapped content and legacy views are preserved. Conversion errors block apply. Daily notes are outside the migration.', '',
		'## Counts', '', '| Change | Count |', '| --- | --- |',
		...Object.entries(plan.counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `| ${name} | ${count} |`), ''];
	for (const category of [...new Set(plan.changes.map(change => change.category))].sort()) {
		lines.push(`## ${category}`, '');
		for (const change of plan.changes.filter(change => change.category === category)) {
			lines.push(`- ${change.action}: ${JSON.stringify(change.path)}${change.from && change.from !== change.path ? ` ← ${JSON.stringify(change.from)}` : ''}`);
		}
		lines.push('');
	}
	for (const category of ['Confirmation', 'Conversion errors', 'Unmapped notes', 'Unmapped links', 'Unmapped properties', 'Deferred cutover'] as const) {
		lines.push(`## ${category}`, '');
		const issues = plan.issues.filter(issue => issue.category === category);
		lines.push(...(issues.length ? issues.map(issue => `- ${JSON.stringify(issue.path)}: ${JSON.stringify(issue.detail)}`) : ['None.']), '');
	}
	return lines.join('\n');
}
