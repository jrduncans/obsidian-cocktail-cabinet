import { FIRST_LINE_WARNING, parseRecipeText } from './recipe-import';
import type { RecipeImport } from './recipe-import';
import { splitIngredient } from './recipe-amount';

/**
 * Reading a recipe from a fetched web page (docs/import.md#web-pages). The page is parsed, never run:
 * schema.org Recipe data (JSON-LD or microdata) first, then the page's visible text, combined. Only what
 * the page says is kept; nothing is filled from elsewhere.
 */

/** A schema.org Recipe's parts that count as the recipe: keywords, yield, nutrition, and ratings don't. */
export interface StructuredRecipe {
	name: string;
	ingredients: string[];
	instructions: string[];
	description: string;
}

export interface WebRecipe {
	recipe: RecipeImport;
	/** What was read from the page, for the review's Original text. */
	original: string;
}

/** The text is a single http(s) URL, and nothing else. */
export function recipeUrl(text: string): URL | null {
	const value = text.trim();
	if (!/^https?:\/\/\S+$/i.test(value)) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
	} catch {
		return null;
	}
}

const TRACKING =
	/^(?:utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|igsh|_ga|_gl|mkt_tok)$/i;

/**
 * The page's canonical URL when it names one on the same site, else the URL as given, without tracking
 * parameters or a fragment.
 */
export function sourceUrl(given: string, canonical?: string | null): string {
	let url = new URL(given);
	if (canonical) {
		try {
			const named = new URL(canonical, url);
			const site = (host: string) => host.replace(/^www\./, '');
			if (/^https?:$/.test(named.protocol) && site(named.hostname) === site(url.hostname)) url = named;
		} catch {
			// An unreadable canonical link is ignored.
		}
	}
	for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
	url.hash = '';
	return url.toString();
}

const isRecipeType = (value: unknown) => value === 'Recipe' || (Array.isArray(value) && value.includes('Recipe'));

/** Parse HTML into an inert document: the browser's DOMParser in Obsidian. */
export type ParseHtml = (html: string) => Document;

/** Plain text from a schema.org string, which may carry entities or markup. */
function plain(parse: ParseHtml, value: unknown): string {
	if (typeof value !== 'string') return '';
	return (parse(`<!doctype html><html><body>${value}</body></html>`).body?.textContent ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** recipeInstructions: a string, a list of strings, HowToStep objects, or HowToSections of them. */
function instructionLines(parse: ParseHtml, value: unknown): string[] {
	if (typeof value === 'string')
		return value
			.split(/\n+/)
			.map((line) => plain(parse, line))
			.filter(Boolean);
	if (Array.isArray(value)) return value.flatMap((item) => instructionLines(parse, item));
	if (value && typeof value === 'object') {
		const item = value as Record<string, unknown>;
		if (item.itemListElement !== undefined) {
			const steps = instructionLines(parse, item.itemListElement);
			const heading = plain(parse, item.name);
			return heading && steps.length ? [`${heading}:`, ...steps] : steps;
		}
		return instructionLines(parse, item.text ?? item.name);
	}
	return [];
}

function findRecipe(value: unknown): Record<string, unknown> | undefined {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findRecipe(item);
			if (found) return found;
		}
		return undefined;
	}
	if (!value || typeof value !== 'object') return undefined;
	const item = value as Record<string, unknown>;
	if (isRecipeType(item['@type'])) return item;
	return findRecipe(item['@graph']) ?? findRecipe(item.mainEntity);
}

function jsonLdRecipe(doc: Document, parse: ParseHtml): StructuredRecipe | null {
	for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
		let data: unknown;
		try {
			data = JSON.parse(script.textContent ?? '');
		} catch {
			continue;
		}
		const recipe = findRecipe(data);
		if (!recipe) continue;
		const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
			.map((line: unknown) => plain(parse, line))
			.filter(Boolean);
		return {
			name: plain(parse, recipe.name),
			ingredients,
			instructions: instructionLines(parse, recipe.recipeInstructions),
			description: plain(parse, recipe.description),
		};
	}
	return null;
}

/** The microdata Recipe element: the first item whose type is schema.org's Recipe. */
function microdataRoot(doc: Document): Element | null {
	return (
		Array.from(doc.querySelectorAll('[itemscope][itemtype]')).find((el) =>
			/^https?:\/\/schema\.org\/Recipe$/i.test((el.getAttribute('itemtype') ?? '').trim()),
		) ?? null
	);
}

function microdataRecipe(root: Element): StructuredRecipe | null {
	// Only the recipe's own properties, not those of items inside it (an author's name).
	const props = (name: string) =>
		Array.from(root.querySelectorAll(`[itemprop~="${name}"]`)).filter(
			(el) => el.parentElement?.closest('[itemscope]') === root,
		);
	const text = (el: Element) => (el.getAttribute('content') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
	const ingredients = [...props('recipeIngredient'), ...props('ingredients')].map(text).filter(Boolean);
	if (!ingredients.length) return null;
	return {
		name: props('name').map(text).find(Boolean) ?? '',
		ingredients,
		instructions: props('recipeInstructions').flatMap((el) =>
			el.querySelector('li')
				? Array.from(el.querySelectorAll('li')).map(text).filter(Boolean)
				: [text(el)].filter(Boolean),
		),
		description: props('description').map(text).find(Boolean) ?? '',
	};
}

/** schema.org Recipe data on the page: JSON-LD, else microdata. */
export function structuredRecipe(doc: Document, parse: ParseHtml): StructuredRecipe | null {
	const fromJson = jsonLdRecipe(doc, parse);
	if (fromJson && (fromJson.ingredients.length || fromJson.instructions.length)) return fromJson;
	const root = microdataRoot(doc);
	return (root && microdataRecipe(root)) || fromJson;
}

const REMOVED =
	'script, style, noscript, template, svg, iframe, object, nav, footer, form, button, dialog, select, img, picture, video, audio';
/** Kept as their text: links and emphasis would otherwise become Markdown inside ingredient wording. */
const UNWRAPPED = 'a, strong, b, em, i, u, mark';

function isHidden(el: Element): boolean {
	if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
	const style = (el.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '');
	return /(?:^|;)(?:display:none|visibility:hidden)/.test(style);
}

/** Common containers for a post's own text in blog and CMS themes. */
const POST_BODY = '[itemprop~="articleBody"], .entry-content, .post-body, .post-content, .article-body';
/** A recipe-like amount, such as "1 1/2 oz" or "30 ml". */
const AMOUNT = /\d\s*(?:oz|ml|cl|ounces?|dash(?:es)?|tsp|barspoons?)\b/i;

/**
 * The part of the page a reader sees, without scripts, navigation, forms, or elements hidden inline. Taken
 * from the microdata recipe, else a post body or article that reads like a recipe, else `main`, else the body
 * (not just any article: on some pages those are reader comments).
 */
export function visibleContent(doc: Document, parse: ParseHtml): Element | null {
	const recipeLike = (el: Element) =>
		/\bingredients?\b/i.test(el.textContent ?? '') || AMOUNT.test(el.textContent ?? '');
	const articles = Array.from(doc.querySelectorAll('article'));
	const root =
		microdataRoot(doc) ??
		Array.from(doc.querySelectorAll(POST_BODY)).find(recipeLike) ??
		articles.find(recipeLike) ??
		doc.querySelector('main') ??
		doc.body;
	if (!root) return null;
	const copy = root.cloneNode(true) as Element;
	for (const el of Array.from(copy.querySelectorAll(REMOVED))) el.remove();
	for (const el of Array.from(copy.querySelectorAll('*'))) if (isHidden(el)) el.remove();
	for (const el of Array.from(copy.querySelectorAll(UNWRAPPED))) el.replaceWith(...Array.from(el.childNodes));
	// Ingredient tables (Difford's) read as one line per row, not Markdown table syntax.
	for (const table of Array.from(copy.querySelectorAll('table'))) {
		const rows = Array.from(table.querySelectorAll('tr'))
			.map((row) =>
				Array.from(row.querySelectorAll('th, td'))
					.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
					.filter(Boolean)
					.join(' '),
			)
			.filter(Boolean);
		// Parsed rather than made with createElement, which Obsidian's lint keeps for its createEl helpers;
		// those make elements in Obsidian's window, and this is an inert copy of the page.
		const block = parse(`<!doctype html><html><body><div>${'<p></p>'.repeat(rows.length)}</div></body></html>`).body
			.firstElementChild!;
		rows.forEach((row, index) => (block.children[index]!.textContent = row));
		table.replaceWith(block);
	}
	return copy;
}

/**
 * A "Garnish:" line in the page text when the structured lines have none, such as Punch's, which sits
 * below its ingredient list. A "Garnish:" label alone takes the next line as its value.
 */
function garnishLines(markdown: string, structured: readonly string[]): string[] {
	if (structured.some((line) => /\bgarnish/i.test(line))) return [];
	const lines = markdown
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
				.replace(/\*\*/g, '')
				.trim(),
		)
		.filter(Boolean);
	for (const [index, line] of lines.entries()) {
		const match = line.match(/^garnish(?:es)?\s*:\s*(.*)$/i);
		if (!match) continue;
		const value = match[1] || lines[index + 1] || '';
		return value && !/^#/.test(value) ? [`Garnish: ${value}`] : [];
	}
	return [];
}

/**
 * Read a recipe from a fetched page: structured lines win where present, and any part they lack comes
 * from the visible text, read as pasted text is. `toMarkdown` is Obsidian's `htmlToMarkdown`.
 */
export function readRecipePage(
	html: string,
	url: string,
	{ parse, toMarkdown }: { parse: ParseHtml; toMarkdown: (el: Element) => string },
): WebRecipe {
	const doc = parse(html);
	const canonical = doc.querySelector('link[rel~="canonical"]')?.getAttribute('href');
	const source = sourceUrl(url, canonical);
	const structured = structuredRecipe(doc, parse);
	const content = visibleContent(doc, parse);
	const markdown = content ? fromFirstHeading(toMarkdown(content).trim()) : '';
	const text = parseRecipeText(markdown);
	const original = [
		structured
			? [
					'Recipe data on the page:',
					structured.name && `Name: ${structured.name}`,
					...structured.ingredients.map((line) => `- ${line}`),
					...structured.instructions.map((line, index) => `${index + 1}. ${line}`),
					structured.description && `Description: ${structured.description}`,
				]
					.filter(Boolean)
					.join('\n')
			: '',
		markdown && `Text on the page:\n${markdown}`,
	]
		.filter(Boolean)
		.join('\n\n');
	if (!structured?.ingredients.length) {
		const fromText = { ...text, source };
		if (structured) {
			fromText.name ||= structured.name;
			if (!fromText.method && structured.instructions.length) fromText.method = numbered(structured.instructions);
		}
		// A guess from the first line is worse than the page's own title.
		const guessed = fromText.warnings.indexOf(FIRST_LINE_WARNING);
		if (guessed >= 0 || !fromText.name) {
			fromText.name = pageTitle(doc) || fromText.name;
			if (guessed >= 0) fromText.warnings.splice(guessed, 1);
		}
		return { recipe: inert(fromText), original };
	}
	const warnings: string[] = [];
	const garnishes = garnishLines(markdown, structured.ingredients);
	const method = structured.instructions.length ? numbered(structured.instructions) : text.method;
	if (!method) warnings.push('The page has no method that could be read. Add it from the page if it has one.');
	return {
		recipe: inert({
			name: structured.name || text.name || pageTitle(doc),
			source,
			ingredients: [...structured.ingredients, ...garnishes].map((line) => splitIngredient(line)),
			method,
			description: structured.description,
			tastingNotes: '',
			warnings,
		}),
		original,
	};
}

/** An HTML tag's opening `<`, with what precedes it: what Obsidian would render as HTML in a note unless escaped. */
const TAG_START = /(^|[^\\])<(?=[A-Za-z!/?])/g;

/**
 * A page's text kept as text in the note: HTML a page smuggles into its recipe (such as a double-escaped
 * `<img>`) would otherwise render in the note and load something from the web whenever it's viewed. The
 * name, which becomes a filename, loses tags and any stray `<`; other text shows them as written.
 */
export function inert(recipe: RecipeImport): RecipeImport {
	const escape = (text: string) => text.replace(TAG_START, '$1&lt;');
	return {
		...recipe,
		// Whole tags go, then any "<" an unclosed tag leaves behind.
		name: recipe.name
			.replace(/<[^>]*>/g, '')
			.replace(/</g, '')
			.replace(/\s+/g, ' ')
			.trim(),
		ingredients: recipe.ingredients.map((line) => ({ amount: escape(line.amount), text: escape(line.text) })),
		method: escape(recipe.method),
		description: escape(recipe.description),
		tastingNotes: escape(recipe.tastingNotes),
	};
}

function numbered(lines: readonly string[]): string {
	return lines.length === 1 ? lines[0]! : lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

/** Text before the first top-level heading is navigation and sharing links, when there is such a heading. */
function fromFirstHeading(markdown: string): string {
	const index = markdown.search(/^# /m);
	return index > 0 ? markdown.slice(index) : markdown;
}

/** The post's title (hAtom `entry-title` or `post-title`), else the first heading, else the page title. */
function pageTitle(doc: Document): string {
	const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	return text(doc.querySelector('.entry-title, .post-title')) || text(doc.querySelector('h1')) || doc.title.trim();
}
