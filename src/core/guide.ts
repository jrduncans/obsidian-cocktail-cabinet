import { basePath, GROUPS_BASE } from './bases';
import { IN_STOCK_BASE } from './in-stock';
import { markdown } from './notes';
import { NAVIGATION_BASE } from './navigation';
import { RESTOCK_BASE } from './restock';
import { cabinetFolder, PROP, wikiLink } from './schema';
import type { PlannedFile } from './schema';
import { SHOPPING_NOTE, shoppingNotePath } from './shopping';
import { viewOpenLink } from './view-links';

/**
 * The guide: managed notes in `<root>/Guide/` explaining the cabinet in more depth than the Cocktail
 * Cabinet note, kept in step with the installed version (docs/ownership.md). The Agent Reference is
 * written for AI agents, for a vault's AGENTS.md to link.
 */
export const GUIDE_FOLDER = 'Guide';
export const GUIDE_PAGES = [
	'Getting Started',
	'Recipes',
	'Stock',
	'Making Drinks',
	'Shopping',
	'Hierarchy and Substitutes',
	'Views and Customizing',
] as const;
export const AGENT_REFERENCE = 'Agent Reference';
type Page = (typeof GUIDE_PAGES)[number] | typeof AGENT_REFERENCE;

export function guidePath(root: string, page: Page): string {
	return `${cabinetFolder(root)}/${GUIDE_FOLDER}/${page}.md`;
}

export function guideLink(root: string, page: Page): string {
	return wikiLink(guidePath(root, page), page);
}

interface Context {
	root: string;
	page: (page: Page) => string;
	view: (name: string, section?: string) => string;
}

const CUSTOM_VIEWS = 'Custom views';

function guideNote(root: string, page: Page, body: (context: Context) => string): PlannedFile {
	const context: Context = {
		root,
		page: (target) => guideLink(root, target),
		view: (name, section) => wikiLink(`${basePath(root, name)}${section ? `#${section}` : ''}`, section ?? name),
	};
	const contents = GUIDE_PAGES.map((item) => (item === page ? item : context.page(item))).join(' · ');
	const nav =
		page === AGENT_REFERENCE
			? `For people, see the guide: ${context.page('Getting Started')}.`
			: `Guide: ${contents} · Back to ${wikiLink(`${root}/Cocktail Cabinet.md`, 'Cocktail Cabinet')}`;
	return {
		path: guidePath(root, page),
		kind: 'guide',
		content: markdown(
			{ [PROP.kind]: 'guide', [PROP.name]: page },
			`# ${page}\n\n${nav}\n\n${body(context).trim()}`,
		),
	};
}

const PAGES: Record<Page, (context: Context) => string> = {
	'Getting Started': ({ root, page, view }) => `
Cocktail Cabinet keeps your bottles, other ingredients, and cocktail recipes as ordinary notes in the **${root}** folder, and adds commands that create, link, and update them. Find every command by opening the command palette and typing **Cocktail Cabinet**. Commands about one note are also in that note's **More options** menu (⋯) and its file menu.

## What's where

- **Bottles** and **Ingredients** hold your stock: named bottles, and other stock such as fresh fruit, juice, syrups, and kitchen staples.
- **Recipes** holds your cocktails.
- **Types**, **Families**, and **Categories** describe what recipes call for, from narrow (London Dry Gin) to broad (Gin, then Spirit). See ${page('Hierarchy and Substitutes')}.
- **Views** holds the tables that list everything; **${CUSTOM_VIEWS}** holds your own. See ${page('Views and Customizing')}.
- **Guide** holds these pages.

Notes, links, and properties are the system: they stay readable and editable with the plugin turned off, and the tables need only Obsidian's core **Bases** plugin.

## First steps

1. Open ${view('Other stock', 'Kitchen staples')}, walk through your kitchen, and set what you have: Have, Low, or Out.
2. Record your bottles. Starter bottles and types start as Unknown; set the stock on a note you have, or use **Add a bottle** for one that's missing. See ${page('Stock')}.
3. Add a favorite recipe with **Add recipe**, or paste one from a website. See ${page('Recipes')}.
4. Run ${viewOpenLink('can-make')} to see what your cabinet makes now, then make one and run **Log this cocktail** on its recipe. See ${page('Making Drinks')}.

## Yours and the plugin's

Your bottles, stock, recipes, and the notes you create are yours. The starter notes are yours too, but the plugin brings catalog improvements to the parts you haven't changed. The tables in **Views**, these guide pages, the Cocktail Cabinet note, and the ${SHOPPING_NOTE} note belong to the plugin and are kept current with each release. ${page('Views and Customizing')} explains how to change or take over any of them.
`,

	Recipes: ({ root, page, view }) => `
${view('Recipes')} lists your recipes; its **Latest** view shows the newest first, and **Recently made** what you've had lately.

## Adding recipes

- **Add recipe**: paste a recipe copied from a website, or the page's address on its own, with **Paste a recipe…**, or read a page with **Read recipe page…** (or its address in **Source**, then **Read page**), or fill in the form by hand. A page is fetched and read; nothing is filled in from anywhere else, and **Original text** shows what was read. Pages behind a sign-in can't be read: copy the text instead. Check the name, source, ingredients, method, rating, and tags before saving. Amounts and wording are kept as written.
- **Convert note to recipe**: turn a note that isn't part of the cabinet yet into a recipe, keeping its properties. A note outside the cabinet moves into **Recipes**.

A recipe has **Ingredients**, **Method**, **Description**, and optionally **Tasting Notes** sections. Its rating is a whole number from 1 to 5.

## Linking ingredients

Each ingredient line links the note it calls for, which is what lets the cabinet tell whether you can make it and subtract what you pour. As you type an ingredient, matching notes drop down; anything you don't pick stays plain text.

Link what the recipe asks for, no narrower: a type such as London Dry Gin when any will do, a family such as rum for a broad call, a bottle only when the recipe names one. The **Link text** setting decides the link's text: by default, the cabinet name when the wording is the same name written differently (\`lime juice\` becomes \`[[${root}/Types/Lime Juice|Lime Juice]]\`), with other words kept beside the link (\`fresh [[${root}/Types/Lime Juice|Lime Juice]]\`); other wording stays as the recipe wrote it. You can always choose different text when linking. With the **Fraction characters** setting on (the default), fluid-ounce amounts are written with fraction characters: \`1½ oz\`, \`¾ oz\`, not \`1 1/2 oz\` or \`.75 oz\`.

- ${viewOpenLink('unlinked')} gathers measured lines with no link, grouped by wording, and links a wording across every recipe at once.
- **Link this ingredient line**, **Edit this ingredient link**, and **Insert ingredient link** work in a recipe's editor, from the command palette or the right-click menu.
- **Create** items in an ingredient row's ⋯ menu add a missing type, bottle, or other stock without losing your draft.
- **Remember** a wording when you link it, such as “rum, such as Coruba” for Aged Jamaican Rum. The next recipe with the same wording comes into review already linked, marked as remembered, and you can unlink it. Remembered wordings are kept in the note's \`${PROP.writtenAs}\` property; edit or remove them there.

## Tags

Tags are yours: the plugin defines none. The recipe form offers the tags already on your recipes and saves them in the \`tags\` property, where Obsidian's search, tag pane, and Bases see them. Nest them, such as \`#cocktail/tiki\`, to keep them apart from the rest of your vault.

## Changing recipes

- **Edit cabinet note** (also a button in the note's header) changes the source, rating, tags, ingredients, method, and description.
- **Rename cabinet note** changes the name everywhere, keeping links working. Renaming the file in Obsidian does the same, but a filename can't hold every character: for a name such as Tuxedo #2, use Rename cabinet note.
- **Tidy ingredient lines** brings the lines to the cabinet name, full-path links, and fraction characters your settings choose.

Each recipe also gets an alcohol estimate; see ${page('Making Drinks')}.
`,

	Stock: ({ page, view }) => `
Stock is what you have: named bottles, and other stock such as fresh fruit, juice, syrups, and kitchen staples. An ingredient type alone means nothing is in stock; it describes what a recipe calls for.

## Bottles

${view('Bottles')} lists your bottles. **Add a bottle** records one: its type, size, ABV, and stock. One note covers an open bottle and any sealed bottles of the same size and strength. Starter bottles start as Unknown; record stock on the existing note when you have that bottle.

## Other stock

${view('Other stock')} lists everything else. **Add other stock** records a source and the types it provides: limes provide lime juice and lime peel. Homemade syrups and prepared juice are named “House …” by default. On a type note, **Add a bottle of this type** and **Add other stock for this type** start with the type filled in.

## Kitchen staples

Everyday things such as salt, mint, and saline solution are kitchen staples: one note each, tracked by availability, linked directly from recipes. ${view('Other stock', 'Kitchen staples')} lists them. **Add other stock** with the **Kitchen staple** form adds one.

## Amount or availability

Each bottle and other stock tracks one of two ways:

- **Amount (mL)**: how much is left. Logging subtracts each pour. A bottle records its open bottle's mL and a count of sealed bottles; other stock records total mL. Blank means none.
- **Availability**: Have, Low, Out, or Unknown. Logging never changes it. Use it for things you don't measure, such as fresh fruit.

Unknown means you haven't said, and never counts as in stock.

## Keeping stock current

- **Edit stock** (the gauge in the note's header) sets the level as percent full or mL, records **Bought more** or **Finished**, and switches between amount and availability.
- ${view(IN_STOCK_BASE)} shows everything on hand; its **Least used** view puts what has sat longest first.
- Logging records **Last used**, and buying records **Last purchased**. See ${page('Making Drinks')} and ${page('Shopping')}.
`,

	'Making Drinks': ({ page }) => `
## What can I make?

${viewOpenLink('can-make')} opens a pane beside your notes listing every recipe by how close it is:

- **Can make**: everything is on hand, some perhaps Low.
- **With a substitute**: makeable with a likely substitute, such as another amaro for a named one. A suggestion, not a match.
- **Check stock**: something is Unknown; go and look.
- **Missing one** and **Missing more**: what's missing, short of a pour, or not linked.

Filter by an ingredient, rating, or tag. Within each group, your highest-rated recipes you haven't made lately come first. **What should I buy?** is in ${page('Shopping')}.

On a bottle, other stock, type, or family, **What can I make with this?** narrows the list to recipes using it. On a recipe, **Can I make this?** checks each line, with buttons to fix stock or link a line.

## Logging a drink

On a recipe, **Log this cocktail** (the glass in the note's header) records that you made it:

- For each measured, linked line, pick the bottle or other stock you poured; a single match is picked for you. **Don't subtract** skips a line.
- A line giving both ounces and mL, such as “1 oz (30 ml)” or “1 oz / 30 ml”, pours the ounces. The **Amounts given in oz and mL** setting can choose mL instead.
- The stock table shows what each bottle loses and keeps. The open bottle is used first, then a sealed one. If a bottle's stock is out of date, fix it from the table without leaving.
- Choose the date (today by default) and servings. Logging adds “Made a Daiquiri.” to that day's daily note, using the Daily notes core plugin's settings.
- It records **Last used** on what you poured and **Last made** and **Times made** on the recipe.

**Undo last log**, or **Undo** in the notice after logging, puts back what the last log changed. The last 10 logs are kept.

## One-off drinks

For a drink with no recipe, run **Log a one-off**, or **Riff on this cocktail** on a recipe to start from its ingredients. No recipe note is made: the daily note gets “Made a one-off (Name):” with the ingredients listed under it. If it's a keeper, run **Save one-off as recipe** on that daily note, or right-click the one-off's line.

## Alcohol estimates

Each recipe carries an estimate of one serving's alcohol, ABV as served, and volume, which the plugin keeps current. **Recipes → Lower alcohol** lists the gentlest first. ABVs come from the bottle a recipe names, else your bottles of that type in stock, else the type's **Typical ABV**, else bottles of it you've had, else its family; chilling adds water by preparation. **Recipes → Partial estimates** shows what keeps an estimate partial: a note without an ABV, or a line to link; a partial recipe's \`cc-est-missing\` says the same. **Bottles → Missing ABV** lists bottles whose ABV you can fill in from the label. Settings choose US or UK standard drinks, and whether logging records alcohol in the daily note.
`,

	Shopping: ({ root, page, view }) => `
## The shopping list

${wikiLink(shoppingNotePath(root), SHOPPING_NOTE)} lists everything marked **Add to shopping list**: bottles, types (when any bottle of that type will do), and other stock. Tick the checkbox in a table or on the note's properties.

## Deciding what to buy

- ${view(RESTOCK_BASE)} lists stock running low, out, or not yet filled in, each with a **Shopping list** checkbox. Running low means the last bottle at or under 10% full, or 70 mL; both are settings.
- ${viewOpenLink('buy')} lists the missing ingredients that would unlock the most recipes, with a button to add each to the list. See ${page('Making Drinks')}.

## After shopping

**Record purchases** (the cart in the shopping list's header) records what you bought: sealed bottles added, amounts added, availability set to Have, prices and bottle sizes updated. For a type, pick which bottle, or add a new one. **Add something else…** covers anything that wasn't on the list. Bought items leave the list, and each records **Last purchased**.
`,

	'Hierarchy and Substitutes': ({ view }) => `
Recipes call for ingredients at different levels, and the cabinet's ingredient hierarchy matches them:

- **Types** are what a recipe usually names: London Dry Gin, Aged Jamaican Rum, Lime Juice. ${view('Ingredient types')}; its **Browse** view groups them.
- **Subtypes** narrow a type: Bonded Bourbon is a kind of Bourbon. A type with subtypes lists them on its note.
- **Families** group related types: Gin, Rum. ${view(GROUPS_BASE, 'Families')}.
- **Categories** group families: Spirit, Liqueur. ${view(GROUPS_BASE, 'Categories')}.

Families and categories are optional; a type can stand alone. Each note has at most one parent. **Add ingredient type** adds any of the three: choose its **Level**.

## What fills a recipe line

- A **bottle** line wants that bottle, or another bottle of the same type.
- A **type** line takes any bottle or other stock of that type or its subtypes.
- A **family** or **category** line takes anything under it.

Narrow never broadens: a London Dry Gin line isn't filled by an Old Tom Gin, even though both are gin. Types exist because their bottles aren't swaps; link the family when any will do.

## Substitutes

Some substitutions are likely but not certain, so the cabinet suggests them without counting them as a match:

- A **catch-all type** (such as Amaro or Specialty Bitters, marked with **Catch-all**) groups bottles that differ. A recipe naming one amaro suggests your other amari as substitutes, and logging lists them separately rather than picking one.
- A **subtype** line can suggest a bottle of its parent type.

## Related sections

Each type, family, category, bottle, and other-stock note shows sections from the shared ${view(NAVIGATION_BASE)} view: the types in a family, the stock under a type, other bottles of the same type, and the recipes that use the note or something under it, or that it can fill.
`,

	'Views and Customizing': ({ root, page, view }) => `
## Views

The tables in **Views** are core Obsidian Bases: ${view('Recipes')}, ${view('Bottles')}, ${view('Other stock')}, ${view(IN_STOCK_BASE)}, ${view(RESTOCK_BASE)}, ${view('Ingredient types')}, ${view(GROUPS_BASE)}, and the ${SHOPPING_NOTE} tables. Edit properties directly in a table cell. ${view(NAVIGATION_BASE)} supplies the sections inside notes; there's no need to open it.

They belong to the plugin, which updates them in new releases. Column widths and sorting you change stay until a release changes that view. To make lasting changes, copy a view into **${CUSTOM_VIEWS}** and edit the copy; the plugin never touches that folder.

## Plugin pages

The Cocktail Cabinet note, the ${SHOPPING_NOTE} note, and these guide pages are kept current with each release. Their \`${PROP.managed}\` property records the version the plugin last wrote.

- If you edit one, the plugin leaves your version alone and offers the new one in **Review cabinet updates**, which shows the difference. **Use new version** replaces yours, optionally saving it beside the note as “(your version)”; **Keep mine** makes the page yours.
- To make a page yours from the start, delete its \`${PROP.managed}\` property. The plugin never changes it again.
- A plugin page you delete stays deleted until **Refresh cabinet notes**.

## Starter notes

The starter types, families, categories, bottles, and staples are yours, but when a release improves one, such as a clearer description or a typical ABV, the change arrives silently wherever you haven't edited that part. Parts you've changed are offered in **Review cabinet updates** with **Use catalog's** or **Keep mine**, New starter notes in a release are added for you, and one you delete stays deleted. Keep a starter note's \`${PROP.catalogId}\` property so the plugin recognizes it.

## Refresh

**Refresh cabinet notes** (also in the plugin's settings) restores the original views, any plugin page you haven't edited or have deleted, missing sections in your notes, and catalog improvements, then opens **Review cabinet updates** if anything needs you.

## For AI agents

${page(AGENT_REFERENCE)} describes the cabinet for AI agents. Link it from your vault's \`AGENTS.md\` or \`CLAUDE.md\`: \`See [[${root}/${GUIDE_FOLDER}/${AGENT_REFERENCE}]] for the cocktail cabinet.\`
`,

	'Agent Reference': ({ root }) => `
This vault's cocktail cabinet is managed by the Cocktail Cabinet Obsidian plugin. These rules keep it consistent with what the plugin writes and reads. The plugin keeps this note current; don't edit it.

## Layout

Everything is under \`${root}/\`. A note takes part only when it has a \`${PROP.kind}\` property:

| Folder | \`${PROP.kind}\` | Holds |
| --- | --- | --- |
| \`${root}/Recipes/\` | \`recipe\` | Cocktail recipes |
| \`${root}/Bottles/\` | \`bottle\` | Named bottles and their stock |
| \`${root}/Ingredients/\` | \`ingredient\` | Other stock: fresh fruit, juice, syrups, kitchen staples |
| \`${root}/Types/\` | \`type\` | What recipes call for: London Dry Gin, Lime Juice |
| \`${root}/Families/\` | \`family\` | Groups of types: Gin, Rum |
| \`${root}/Categories/\` | \`category\` | Groups of families: Spirit |

\`${root}/Views/\` holds the plugin's Bases; never edit them (the plugin overwrites them). The user's own Bases go in \`${root}/${CUSTOM_VIEWS}/\`. Notes with \`${PROP.managed}\` (the Cocktail Cabinet note, \`${SHOPPING_NOTE}.md\`, and \`${root}/${GUIDE_FOLDER}/\`) are rewritten by the plugin; don't edit them.

## Notes

- Every cabinet note has \`${PROP.kind}\` and \`${PROP.name}\`, the proper name, which may differ from the filename (\`Vieux Carre.md\` is Vieux Carré). Filenames are plain Latin; don't rename notes to normalize them.
- Links are path links with the display name: \`[[${root}/Types/Rye Whiskey|Rye Whiskey]]\`. In frontmatter they're quoted strings.
- One parent per note: \`${PROP.type}\` on a bottle (and on a subtype, naming its type), \`${PROP.family}\` on a type, \`${PROP.category}\` on a family. Other stock lists the types it supplies in \`${PROP.provides}\` (a list).
- Keep the \`![[${root}/Views/${NAVIGATION_BASE}.base#…]]\` embeds in type, family, category, bottle, and other-stock notes; they render the note's sections.
- Keep \`${PROP.catalogId}\` on starter notes.
- Don't remove empty properties.

## Stock

- \`${PROP.stockTracking}\` is \`volume\` or \`status\`. Write only the active mode's fields; never infer an amount from a status or a status from an amount. Change modes only when asked.
- Volume, in mL: bottles use \`${PROP.open}\` (open bottle) and \`${PROP.unopened}\` (count of sealed bottles); other stock uses \`${PROP.remaining}\`. Empty or \`null\` means 0.
- Status: \`${PROP.availability}\` is \`Unknown\`, \`Have\`, \`Low\`, or \`Out\`. Unknown, or a missing \`${PROP.stockTracking}\`, means unknown, never in stock.
- \`${PROP.abv}\` and \`${PROP.abvTypical}\` are fractions: \`0.4\` is 40%.
- \`${PROP.lastPurchasePrice}\` is a plain number. \`${PROP.shoppingList}: true\` only when the user wants it bought.

## Recipes

- Properties: \`${PROP.kind}: recipe\`, \`${PROP.name}\`, \`created\`, \`rating\` (a whole number 1–5, or empty), \`source\`, and \`tags\`. The plugin maintains \`${PROP.ingredients}\`, the \`cc-est-\` estimates, \`${PROP.lastMade}\`, and \`${PROP.timesMade}\`; don't write them.
- Sections, as applicable: \`### Ingredients\`, \`### Method\`, \`### Description\`, \`### Tasting Notes\`.
- Link each ingredient at the level the recipe asks for: a bottle only when it names one, otherwise the type, or the family for a broad call such as “rum”. Keep the recipe's wording as the display text. Leave a line unlinked when nothing fits.
- \`${PROP.writtenAs}\` on an ingredient note lists recipe wordings the user linked to it before. A wording listed on exactly one note links to that note; one listed on several is the user's choice. Add to it only when asked.
- Keep recipe names and ingredient wording unless correcting a clear error.
- When a line gives both oz and mL (\`1 oz (30 ml)\`, \`1 oz / 30 ml\`), keep both. Logging, availability, and estimates use one of them, chosen in the plugin's settings (US fluid ounces by default).

## Making drinks

To bring a recipe's ingredient lines to the preferred form (cabinet-name link text, full-path links, fraction characters), point the user to **Tidy ingredient lines** on the recipe note, or **Use cabinet name** with the cursor in one link, rather than rewriting the lines yourself.

When the user made a cocktail, point them to **Log this cocktail** on the recipe note: it subtracts stock and writes the daily-note line. For a drink with no recipe note, **Log a one-off**, or **Riff on this cocktail** when it varies a recipe. Don't edit stock by hand for a logged drink, and don't create a recipe note for a one-off unless asked.

A one-off's daily-note entry is a \`Made a one-off (Name):\` line, optionally ending \`, a riff on\` and a link to the recipe, followed by its ingredients as a list. **Save one-off as recipe** reads that format, so keep it intact.

## Adding recipes

Create recipe notes through the plugin, not by writing files, so the filename, properties, and remembered wordings follow the cabinet's rules:

\`\`\`bash
obsidian cocktail-cabinet:create-recipe text="<recipe text>" [name=<name>] [source=<url or label>] [rating=<1-5>]
obsidian cocktail-cabinet:link-line path="<recipe>" line=<n> target=<note> [text=<link text>] [remember]
\`\`\`

- \`text\` is the recipe as the source writes it: name, ingredient lines, then Method or Directions and Description headings. Write \`\\n\` for a newline. Put in only what the source says.
- \`create-recipe\` refuses a filename that already exists and lists recipes with a similar name as \`duplicates\`. It links only wordings listed in exactly one note's \`${PROP.writtenAs}\`; every other line comes back with \`link: null\` and up to three \`suggestions\`.
- \`link-line\` links one line of the Ingredients list, numbered from 1 as \`create-recipe\` reports it, choosing the link text as the **Link text** setting does (the cabinet name for a name it counts, other words kept beside the link, else the recipe's wording) unless \`text\` is given, which links the whole wording. It refuses a line that's already linked. \`remember\` adds the wording to the note's \`${PROP.writtenAs}\`: only when the user asks.
- Both write to the vault, so expect the user to approve each call.

## Linking existing recipes

To work through recipe lines that link to nothing:

\`\`\`bash
obsidian cocktail-cabinet:unlinked [recipe=<path>] [garnishes] [limit=<n>]
obsidian cocktail-cabinet:add-bottle name=<name> [type=<type note>] [abv=<percent>] [volume=<mL>] [open=<mL>] [unopened=<n>] [aliases=<a,b>] [description=<text>]
\`\`\`

- \`unlinked\` lists what **Review unlinked ingredients** shows, grouped by wording, most widely used first: each line's recipe \`path\` and \`line\` as \`link-line\` takes it, and up to three \`suggestions\` per wording. \`lines\` counts every line, even past \`limit\`. Link each with \`link-line\`, at the level the recipe asks for.
- \`add-bottle\` creates a bottle as **Add a bottle** does, in volume tracking with nothing open unless \`open\` or \`unopened\` is given, for a bottle a recipe names that has no note yet. \`abv\` is a percent. It refuses a name already in use. It writes to the vault, so expect the user to approve each call.

## Asking the cabinet

With Obsidian running and its command line enabled, these commands print JSON computed by the plugin's own matching rules. Use them instead of reading Bases or scanning notes:

\`\`\`bash
obsidian cocktail-cabinet:can-make path="${root}/Recipes/Last Word.md"
obsidian cocktail-cabinet:makeable [uses=<note>] [status=<s1,s2>] [min-rating=<1-5>] [tag=<tag>] [limit=<n>]
obsidian cocktail-cabinet:to-buy [limit=<n>]
\`\`\`

- Recipe \`status\`, best first: \`can-make\`, \`substitute\` (only with a likely substitute; a suggestion, not a match), \`check-stock\` (something Unknown), \`missing-one\`, \`missing-more\`. Call a recipe makeable only when it's \`can-make\`.
- Line \`state\` in \`can-make\`: \`have\`, \`low\`, \`substitute\`, \`unknown\`, \`short\` (less than one pour), \`missing\` (\`out\` names empty sources to rebuy), \`unlinked\`. Garnishes never lower a status.
- \`uses\` takes a path or note name and finds recipes naming it, anything under it, anything above it, or another bottle of its type.
- \`to-buy\` lists missing ingredients with the recipes each alone would \`unlock\`. Don't set \`${PROP.shoppingList}\` without the user's approval.
- The commands never suggest a sibling type for a missing one. You may, labeled as your own judgment.
`,
};

/** Every guide page and the Agent Reference, as planned files for managed notes. */
export function guideNotes(folder: string): PlannedFile[] {
	const root = cabinetFolder(folder);
	const pages: Page[] = [...GUIDE_PAGES, AGENT_REFERENCE];
	return pages.map((page) => guideNote(root, page, PAGES[page]));
}
