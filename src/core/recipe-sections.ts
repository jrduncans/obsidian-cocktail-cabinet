import { frontmatterOf } from './rename';

/** The recipe sections the edit form rewrites, in note order. */
export const RECIPE_SECTIONS = {
	ingredients: 'Ingredients',
	method: 'Method',
	description: 'Description',
	tastingNotes: 'Tasting Notes',
} as const;
export type RecipeSection = keyof typeof RECIPE_SECTIONS;
const ORDER = Object.keys(RECIPE_SECTIONS) as RecipeSection[];

interface Located {
	/** Where the heading line starts. */
	start: number;
	/** Where the section's text starts, after the heading line. */
	body: number;
	/** Where the next heading of the same or a higher level starts, or the end of the note. */
	end: number;
	level: number;
}

export interface RecipeSections {
	/** Ingredient lines without their list markers, as written. */
	ingredients: string[];
	/** False when the Ingredients section has anything but a flat list, which the form can't keep. */
	ingredientsEditable: boolean;
	method: string;
	description: string;
	tastingNotes: string;
}

/** Headings outside code fences, with their offsets in the note. */
function headings(content: string): { start: number; body: number; level: number; title: string }[] {
	const found: { start: number; body: number; level: number; title: string }[] = [];
	let offset = frontmatterOf(content).length;
	let fence = '';
	for (const line of content.slice(offset).split('\n')) {
		const start = offset;
		offset += line.length + 1;
		const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence) {
			if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = '';
			continue;
		}
		if (marker) {
			fence = marker[1]!;
			continue;
		}
		const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t\r]*$/);
		if (heading)
			found.push({
				start,
				body: Math.min(offset, content.length),
				level: heading[1]!.length,
				title: heading[2]!.trim(),
			});
	}
	return found;
}

function locate(content: string): Partial<Record<RecipeSection, Located>> {
	const all = headings(content);
	const result: Partial<Record<RecipeSection, Located>> = {};
	for (const key of ORDER) {
		const index = all.findIndex((heading) => heading.title.toLowerCase() === RECIPE_SECTIONS[key].toLowerCase());
		if (index < 0) continue;
		const heading = all[index]!;
		const next = all.slice(index + 1).find((other) => other.level <= heading.level);
		result[key] = {
			start: heading.start,
			body: heading.body,
			end: next?.start ?? content.length,
			level: heading.level,
		};
	}
	return result;
}

export function readRecipeSections(content: string): RecipeSections {
	const sections = locate(content);
	const text = (key: RecipeSection) => {
		const section = sections[key];
		return section ? content.slice(section.body, section.end).replace(/\r/g, '').trim() : '';
	};
	const ingredients: string[] = [];
	let ingredientsEditable = true;
	for (const line of text('ingredients').split('\n')) {
		if (!line.trim()) continue;
		const item = line.match(/^(?:[-*+]|\d+[.)])[ \t]+(.*?)[ \t]*$/);
		if (item?.[1]) ingredients.push(item[1]);
		else ingredientsEditable = false;
	}
	return {
		ingredients,
		ingredientsEditable,
		method: text('method'),
		description: text('description'),
		tastingNotes: text('tastingNotes'),
	};
}

/** Ingredient lines as the Ingredients section's list. */
export function ingredientList(lines: readonly string[]): string {
	return lines.map((line) => `- ${line}`).join('\n');
}

/**
 * Replace the given sections' text and leave everything else in the note as it is:
 * other headings, embeds, and extra sections. A missing section with text is added
 * after the section that precedes it. Null removes a section, heading and all.
 */
export function replaceRecipeSections(content: string, changes: Partial<Record<RecipeSection, string | null>>): string {
	let result = content;
	for (const key of ORDER) {
		const value = changes[key];
		if (value === undefined) continue;
		const sections = locate(result);
		const section = sections[key];
		if (value === null) {
			if (section) {
				const head = result.slice(0, section.start).replace(/\n*$/, '');
				const tail = result.slice(section.end).replace(/^\n*/, '');
				result = head && tail ? `${head}\n\n${tail}` : head ? `${head}\n` : tail;
			}
			continue;
		}
		const text = value.replace(/\r/g, '').trim();
		if (section) {
			const following = section.end < result.length;
			const lead = result[section.body - 1] === '\n' ? '' : '\n';
			result =
				result.slice(0, section.body) +
				lead +
				(text ? `\n${text}\n` : '') +
				(following ? '\n' : '') +
				result.slice(section.end);
			continue;
		}
		if (!text) continue;
		const present = ORDER.map((other) => sections[other]).filter((other): other is Located => other !== undefined);
		const level = present[0]?.level ?? 3;
		const block = `${'#'.repeat(level)} ${RECIPE_SECTIONS[key]}\n\n${text}\n`;
		const before = ORDER.slice(0, ORDER.indexOf(key))
			.map((other) => sections[other])
			.filter((other): other is Located => other !== undefined)
			.at(-1);
		const after = ORDER.slice(ORDER.indexOf(key) + 1)
			.map((other) => sections[other])
			.find((other): other is Located => other !== undefined);
		const at = before ? before.end : after ? after.start : result.length;
		const head = result.slice(0, at).replace(/\n*$/, '');
		const tail = result.slice(at).replace(/^\n*/, '');
		result = `${head}${head ? '\n\n' : ''}${block}${tail ? `\n${tail}` : ''}`;
	}
	return result;
}
