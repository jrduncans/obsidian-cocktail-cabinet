import type { CabinetNote } from './schema';

/** Traverses only explicit parent links. No inference from names or sibling groups. */
export function isWithin(notes: readonly CabinetNote[], child: string, ancestor: string): boolean {
	const byPath = new Map(notes.map(note => [note.path, note]));
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
	for (const note of notes) {
		// A broadly specified recipe can also use a more specific ingredient.
		if (isWithin(notes, note.path, target.path) || isWithin(notes, target.path, note.path)) targets.add(note.path);
		// Preserve same-type bottle alternatives without widening to sibling types.
		if (target.kind === 'bottle' && note.kind === 'bottle' &&
			target.parents.some(parent => note.parents.includes(parent))) targets.add(note.path);
	}
	return targets;
}
