import { DEFAULT_VOLUME_UNIT, lineVolumeMl } from './recipe-amount';
import type { VolumeUnit } from './recipe-amount';
import { isWithin, parentType, pathIndex, swapTypes } from './relationships';
import { PROP } from './schema';
import type { CabinetNote } from './schema';
import { isStocked } from './logging-stock';
import type { StockSource } from './logging-stock';
import { ingredientLines } from './unlinked-lines';

export interface CountedLine {
	id: number;
	text: string;
	ml: number;
	targets: string[];
	candidates: string[];
	/** Stocked bottles sharing a named bottle's catch-all type: offered as likely substitutes, never preselected. */
	alternatives: string[];
	/** Heading for `alternatives`, such as "Other Amaro". */
	alternativesLabel?: string;
	/** Candidates reached through a subtype of a linked type, listed after the type's own bottles under the subtype's name. */
	candidateGroups?: { label: string; paths: string[] }[];
	initialSelection: string | null;
}
export interface SkippedLine {
	text: string;
	reason: string;
	/** The one source the line clearly uses though nothing is subtracted (status-tracked, or no mL amount), for last used. */
	used?: string;
	/** An unlinked measured line or a broken link, which logging offers to link: its line in the note, as written. */
	link?: { line: number; raw: string };
}
/** Selection value for a line the user chose not to subtract. */
export const SKIP_LINE = '__skip__';
export interface LoggingLines {
	counted: CountedLine[];
	skipped: SkippedLine[];
}

/** The types two bottles share. */
function sharedTypes(notes: readonly CabinetNote[], source: CabinetNote, target: CabinetNote): CabinetNote[] {
	if (source.kind !== 'bottle' || target.kind !== 'bottle' || source.path === target.path) return [];
	return target.parents
		.filter((path) => source.parents.includes(path))
		.flatMap((path) => pathIndex(notes).get(path) ?? []);
}

/**
 * A named bottle widens only to bottles with its explicitly assigned type, unless that type is a catch-all,
 * and to bottles of its type's subtypes: a bonded bourbon fits a line naming any bourbon bottle.
 */
export function fitsLine(notes: readonly CabinetNote[], source: CabinetNote, target: CabinetNote): boolean {
	if (source.path === target.path) return true;
	if (target.kind === 'bottle') {
		if (source.kind !== 'bottle') return false;
		const swaps = swapTypes(pathIndex(notes), source);
		return target.parents.some((parent) => swaps.includes(parent));
	}
	if (target.kind === 'ingredient') return false;
	return isWithin(notes, source.path, target.path);
}

/**
 * The type making a source a likely substitute, not an assumed one: a named bottle's catch-all type
 * (Averna for Meletti), or the parent of a subtype the line names (a plain bourbon for Bonded Bourbon).
 */
export function lesserType(
	notes: readonly CabinetNote[],
	source: CabinetNote,
	target: CabinetNote,
): CabinetNote | undefined {
	const catchAll = sharedTypes(notes, source, target).find((type) => type.catchAll);
	if (catchAll) return catchAll;
	const byPath = pathIndex(notes);
	const subtype =
		target.kind === 'type' ? target : target.kind === 'bottle' ? byPath.get(target.parents[0] ?? '') : undefined;
	const parent = parentType(byPath, subtype);
	return parent && source.kind === 'bottle' && isWithin(notes, source.path, parent.path) ? parent : undefined;
}

export function classifyLoggingLines(
	content: string,
	notes: readonly CabinetNote[],
	sources: readonly StockSource[],
	resolve: (link: string) => string | null,
	volumeUnit: VolumeUnit = DEFAULT_VOLUME_UNIT,
): LoggingLines {
	const counted: CountedLine[] = [],
		skipped: SkippedLine[] = [];
	for (const { line: id, raw, text } of ingredientLines(content)) {
		const links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)];
		const targets = [
			...new Set(
				links.flatMap((match) => {
					const path = resolve(match[1]!);
					const note = notes.find((item) => item.path === path && item.kind !== 'recipe');
					return note ? [note.path] : [];
				}),
			),
		];
		const ml = lineVolumeMl(text, volumeUnit);
		const link = { line: id, raw };
		if (!links.length) {
			skipped.push({ text, reason: 'Not linked', ...(ml === null ? {} : { link }) });
			continue;
		}
		if (!targets.length) {
			skipped.push({ text, reason: 'Link not found', link });
			continue;
		}
		const linked = targets.map((path) => notes.find((note) => note.path === path)!);
		const matching = sources.filter((source) => linked.some((target) => fitsLine(notes, source.note, target)));
		const lesser = sources
			.filter((source) => !matching.includes(source))
			.flatMap((source) => {
				const type = linked.map((target) => lesserType(notes, source.note, target)).find(Boolean);
				return type && isStocked(source) ? [{ path: source.note.path, type }] : [];
			});
		const alternatives = lesser.map((item) => item.path);
		// A named bottle or other stock, else the only source that fits.
		const namedSource = linked.filter((target) => target.kind === 'bottle' || target.kind === 'ingredient');
		const used =
			namedSource.length === 1
				? namedSource[0]!.path
				: !namedSource.length && matching.length === 1
					? matching[0]!.note.path
					: undefined;
		const withUse = (line: SkippedLine): SkippedLine => (used ? { ...line, used } : line);
		if (ml === null) {
			skipped.push(withUse({ text, reason: 'No mL or oz amount' }));
			continue;
		}
		if (matching.length && matching.every((source) => source.fields[PROP.stockTracking] === 'status')) {
			skipped.push(withUse({ text, reason: 'Not tracked in mL' }));
			continue;
		}
		// A type line lists its own bottles first, then each subtype's under the subtype's name.
		const byPath = new Map(notes.map((note) => [note.path, note]));
		const subtypeOf = (path: string) => {
			const type = byPath.get(byPath.get(path)?.parents[0] ?? '');
			const parent = parentType(byPath, type);
			return parent && linked.some((target) => target.path === parent.path) ? type : undefined;
		};
		const stocked = matching.filter(isStocked).map((source) => source.note.path);
		const groups = new Map<string, string[]>();
		for (const path of stocked) {
			const type = subtypeOf(path);
			if (type) groups.set(type.name, [...(groups.get(type.name) ?? []), path]);
		}
		const candidates = [...stocked.filter((path) => !subtypeOf(path)), ...[...groups.values()].flat()];
		const named = linked.filter(
			(target) => (target.kind === 'bottle' || target.kind === 'ingredient') && candidates.includes(target.path),
		);
		counted.push({
			id,
			text,
			ml,
			targets,
			candidates,
			alternatives,
			...(lesser.length ? { alternativesLabel: `Other ${lesser[0]!.type.name}` } : {}),
			...(groups.size ? { candidateGroups: [...groups].map(([label, paths]) => ({ label, paths })) } : {}),
			// Nothing in the cabinet stocks this (e.g. fresh juice): default to not subtracting, still adjustable.
			// Catch-all alternatives are never chosen for you, even when the named bottle is out.
			initialSelection:
				!matching.length && !alternatives.length
					? SKIP_LINE
					: named.length === 1
						? named[0]!.path
						: candidates.length === 1
							? candidates[0]!
							: null,
		});
	}
	return { counted, skipped };
}
