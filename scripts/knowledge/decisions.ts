import { fileName } from '../../src/core/schema';

/** Explicit, private supplements to the approved mapping; never inferred from note contents. */
export interface MigrationDecisions {
	filenames: Record<string, string>;
	volumes: Record<string, number>;
}

export function readDecisions(value: unknown): MigrationDecisions {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Decisions must be an object.');
	const object = value as Record<string, unknown>;
	if (Object.keys(object).some(key => !['filenames', 'volumes'].includes(key))) throw new Error('Unrecognized decision key.');
	const result: MigrationDecisions = { filenames: {}, volumes: {} };
	for (const key of ['filenames', 'volumes'] as const) {
		const entries = object[key] ?? {};
		if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Invalid ${key} decisions.`);
		for (const [path, entry] of Object.entries(entries)) {
			if (!/^Cocktails\/(?:Bottles|Recipes)\/[^/]+\.md$/.test(path)) throw new Error(`Decision must name one source note: ${path}`);
			if (key === 'filenames') {
				if (typeof entry !== 'string' || fileName(entry) !== entry) throw new Error('Filename decisions must be valid plain Latin names without an extension.');
				result.filenames[path] = entry;
			} else {
				if (!path.startsWith('Cocktails/Bottles/') || typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) throw new Error('Volume decisions must be positive mL for a bottle.');
				result.volumes[path] = entry;
			}
		}
	}
	return result;
}
