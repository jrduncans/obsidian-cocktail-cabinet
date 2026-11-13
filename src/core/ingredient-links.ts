/** The parts of Obsidian's metadata cache this reads, so it stays testable without Obsidian. */
interface Positioned {
	position: { start: { offset: number } };
}
export interface LinkCache {
	headings?: (Positioned & { heading: string; level: number })[];
	links?: (Positioned & { link: string })[];
}

/** A link's target without its heading, block, or display text. */
export function linkTarget(link: string): string {
	return link
		.replace(/^\[\[|\]\]$/g, '')
		.split('|')[0]!
		.split('#')[0]!
		.trim();
}

/**
 * Link targets in a recipe's Ingredients section, in order, each once: from the Ingredients heading to the next
 * heading at its level or higher. Embeds and property links aren't in the cache's `links`, so they don't count.
 */
export function ingredientLinkTargets(cache: LinkCache): string[] {
	const headings = cache.headings ?? [];
	const index = headings.findIndex((heading) => heading.heading.trim().toLowerCase() === 'ingredients');
	if (index < 0) return [];
	const heading = headings[index]!;
	const start = heading.position.start.offset;
	const end =
		headings.slice(index + 1).find((other) => other.level <= heading.level)?.position.start.offset ?? Infinity;
	const targets: string[] = [];
	for (const link of cache.links ?? []) {
		const at = link.position.start.offset;
		const target = linkTarget(link.link);
		if (at > start && at < end && target && !targets.includes(target)) targets.push(target);
	}
	return targets;
}

/** Whether two lists name the same notes, ignoring order and repeats; each entry is already a comparable key. */
export function sameKeys(left: readonly string[], right: readonly string[]): boolean {
	const a = new Set(left);
	const b = new Set(right);
	return a.size === b.size && [...a].every((key) => b.has(key));
}
