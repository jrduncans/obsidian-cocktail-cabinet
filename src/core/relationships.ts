import type { CabinetNote } from './schema';

const indexes = new WeakMap<readonly CabinetNote[], { size: number; byPath: Map<string, CabinetNote> }>();

/**
 * The notes by path, built once per notes list: availability asks about every stock note against every
 * linked target, and rebuilding this each time made What can I make? take most of a second. Rebuilt if
 * the list grows, since a form adds notes it creates to its own list.
 */
export function pathIndex(notes: readonly CabinetNote[]): ReadonlyMap<string, CabinetNote> {
	let index = indexes.get(notes);
	if (!index || index.size !== notes.length) {
		index = { size: notes.length, byPath: new Map(notes.map((note) => [note.path, note])) };
		indexes.set(notes, index);
	}
	return index.byPath;
}

/** Traverses only explicit parent links. No inference from names or sibling groups. */
export function isWithin(notes: readonly CabinetNote[], child: string, ancestor: string): boolean {
	return hasAncestor(pathIndex(notes), child, ancestor);
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

/** A subtype's parent type (Bourbon for Bonded Bourbon); undefined for a type under a family. */
export function parentType(
	notes: ReadonlyMap<string, CabinetNote>,
	type: CabinetNote | undefined,
): CabinetNote | undefined {
	if (type?.kind !== 'type') return undefined;
	return type.parents.map((path) => notes.get(path)).find((parent) => parent?.kind === 'type');
}

/** Types a type can be a subtype of: not itself, and not a subtype, since subtypes have no subtypes. */
export function subtypeParents(notes: readonly CabinetNote[], self?: string): CabinetNote[] {
	const byPath = pathIndex(notes);
	return notes.filter((note) => note.kind === 'type' && note.path !== self && !parentType(byPath, note));
}

/**
 * The types whose bottles a bottle can stand in for: its own type unless a catch-all, and, for a
 * subtype, the parent type too (a bonded bourbon serves a recipe naming any bourbon bottle).
 */
export function swapTypes(notes: ReadonlyMap<string, CabinetNote>, bottle: CabinetNote): string[] {
	return bottle.parents.flatMap((path) => {
		const type = notes.get(path);
		const parent = parentType(notes, type);
		return [type, parent].filter((note) => note && !note.catchAll).map((note) => note!.path);
	});
}

export function relatedTargets(notes: readonly CabinetNote[], target: CabinetNote): Set<string> {
	const targets = new Set<string>([target.path]);
	if (target.kind === 'recipe') return targets;
	const byPath = pathIndex(notes);
	for (const note of notes) {
		// A broadly specified recipe can also use a more specific ingredient.
		if (hasAncestor(byPath, note.path, target.path) || hasAncestor(byPath, target.path, note.path)) {
			targets.add(note.path);
		}
		// Preserve same-type bottle alternatives without widening to sibling types or within a catch-all type.
		// A subtype bottle also serves recipes naming a bottle of its parent type, not the reverse.
		if (target.kind === 'bottle' && note.kind === 'bottle') {
			const swaps = swapTypes(byPath, target);
			if (note.parents.some((parent) => swaps.includes(parent))) targets.add(note.path);
		}
	}
	return targets;
}
