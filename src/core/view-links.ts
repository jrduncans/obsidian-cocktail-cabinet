/**
 * Links that open the plugin's own views, for pages written as Markdown. A view isn't a file, so a
 * wiki link can't reach it; an `obsidian://cocktail-cabinet?open=…` link can. Only these views open
 * this way: any page or app can follow an obsidian:// link, so it never runs anything else.
 */
export const VIEW_LINK_ACTION = 'cocktail-cabinet';

export const LINKED_VIEWS = {
	'can-make': 'What can I make?',
	buy: 'What should I buy?',
	unlinked: 'Review unlinked ingredients',
} as const;
export type LinkedView = keyof typeof LINKED_VIEWS;

export function isLinkedView(value: unknown): value is LinkedView {
	return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LINKED_VIEWS, value);
}

/** A Markdown link opening `view`, its text the command's name. */
export function viewOpenLink(view: LinkedView): string {
	return `[${LINKED_VIEWS[view]}](obsidian://${VIEW_LINK_ACTION}?open=${view})`;
}
