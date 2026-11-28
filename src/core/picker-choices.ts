/**
 * Where a picker's "New …" choice goes: first while nothing is typed, so it's seen without scrolling a long list,
 * and after the matches once something is, named from what was typed.
 */
export function placeNewChoice<T>(matches: readonly T[], query: string, choice: (name: string) => T): T[] {
	const name = query.trim();
	return name ? [...matches, choice(name)] : [choice(''), ...matches];
}
