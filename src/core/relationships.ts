import type { CabinetNote } from './schema';

/** Traverses only explicit parent links. No inference from names or sibling groups. */
export function isWithin(notes: readonly CabinetNote[], child: string, ancestor: string): boolean {
	const byPath = new Map(notes.map(note => [note.path, note]));
	return hasAncestor(byPath, child, ancestor);
}

function hasAncestor(byPath: ReadonlyMap<string, CabinetNote>, child: string, ancestor: string): boolean {
	const pending = [child];
	const seen = new Set<string>();
	while (pending.length) {
		const path = pending.pop();
		if (!path || seen.has(path)) continue;
		if (path === ancestor) return true;
		seen.add(path);
		pending.push(...(byPath.get(path)?.parents || []));
	}
	return false;
}

export function relatedTargets(notes: readonly CabinetNote[], target: CabinetNote): Set<string> {
	const targets = new Set<string>([target.path]);
	if (target.kind === 'recipe') return targets;
	const byPath = new Map(notes.map(note => [note.path, note]));
	for (const note of notes) {
		// A broadly specified recipe can also use a more specific ingredient.
		if (hasAncestor(byPath, note.path, target.path) || hasAncestor(byPath, target.path, note.path)) {
			targets.add(note.path);
		}
		// Preserve same-type bottle alternatives without widening to sibling types or within a catch-all type.
		if (target.kind === 'bottle' && note.kind === 'bottle' &&
			target.parents.some(parent => note.parents.includes(parent) && !byPath.get(parent)?.catchAll)) {
			targets.add(note.path);
		}
	}
	return targets;
}
