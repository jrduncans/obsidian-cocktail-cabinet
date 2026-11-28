# Recipe import design

Drafted on 2026-11-22 from the [roadmap's Phase 5](roadmap.md#5-reach-retire-the-remaining-skills) and the `knowledge` vault's `cocktail-recipe-import` skill. Reviewed the same day: the [decisions](#decisions) record what was agreed. Slice 1, remembered wordings, built 2026-11-22 and installed in `knowledge` with its starting entries (`Cocchi Americano`, not the skill's `Cocchi American`). Slice 2, web pages, built 2026-11-22; see [as built](#as-built). Slice 3, the CLI handlers, built 2026-11-22 and installed in `knowledge`, whose import skill now calls them; see [agents](#agents).

## Goal

Get a recipe from where it was found into the cabinet with its links right, keeping only what the source says. It retires the `cocktail-recipe-import` skill, which today writes the note shape, filename, and links by hand from prose rules.

**Add recipe** already reads pasted text into the recipe review, with suggestions, tags, rating, and the duplicate warning. Import builds on that review rather than beside it. What's missing:

1. **Fetching a page.** Today the review says "pages are not fetched"; you copy the text yourself, and on most recipe sites that copy is messy.
2. **Remembering wordings.** Each "rum, such as Coruba" or "Vermouth (Sweet)" is linked again by hand every time. The skill keeps a few of these as prose defaults.
3. **Agents.** The skill writes files directly. It should hand the text to the plugin, which knows the schema.
4. **Batches.** A Bevnap export holds dozens of recipes; one review each is too slow.

## Where recipes come from

From `knowledge` (517 recipes, about 25 a month lately):

| Source                            | Recipes   | Notes                                                                                                               |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| Web pages                         | about 340 | Punch 108, cocktailvirgin 37, Anatomy of a Drink 28, Daniel Zajic 19, Liber & Co 17, liquor.com 16, Difford's 13, … |
| Social posts (Threads, Instagram) | about 25  | Behind a login; can't be fetched                                                                                    |
| Bevnap                            | 91        | 83 in one batch on 2026-07-03; 8 since                                                                              |
| Books, LLM chats, own drinks      | about 60  | Typed or pasted                                                                                                     |

So web pages matter most, and Bevnap is mostly a one-time migration: for this vault it's done, but it's the path a new user coming from Bevnap would take.

Sampled on 2026-11-22, what the top sites publish:

- **Structured recipe data** (schema.org `Recipe` as JSON-LD): Difford's and Daniel Zajic, with clean ingredient lines and steps.
- **Microdata**: Punch marks each ingredient (`itemprop="recipeIngredient"`), but not the directions, and repeats each line in a hidden element (`display:none`), so a plain text copy has every ingredient twice.
- **Nothing structured**: cocktailvirgin (a blog post with the recipe in prose), Liber & Co, Shaker of Spirits.
- **Refused**: liquor.com answered 403 to a plain request.

## Web pages

**Add recipe** takes a URL as well as text: a URL alone in the field fetches that page instead of reading it as text.

### Fetching

- `requestUrl` (works on mobile and isn't subject to CORS), once, for the URL given. Nothing else is fetched: no images, no linked pages, no search, no second try at another URL.
- Network use is new for the plugin. It happens only when you paste a URL and select **Read recipe**, **Read page**, or **Read recipe page…**, sends nothing but that request, and is described in the README, as Obsidian's developer policies require. No setting gates it ([decision 1](#decisions)).
- On failure (an error status, a login page, nothing recipe-like found) the review says so and keeps the URL as the source: "Couldn't read a recipe from this page. Copy the recipe text from it and paste it below." Nothing is filled from elsewhere.

### Reading the page

The page is parsed with `DOMParser`, never run. In order:

1. **Structured data.** A schema.org `Recipe`, from JSON-LD or microdata: name, ingredient lines, instructions, description. Author-written data on the page itself, so it counts as the source ([decision 2](#decisions)). Keywords, categories, yield, nutrition, and ratings are left out: they're the site's tagging, not the recipe.
2. **Visible text.** Scripts, styles, navigation, forms, and elements hidden inline (`hidden`, `aria-hidden="true"`, `display:none`) are removed; the page's `article` or `main` (else `body`) goes through Obsidian's `htmlToMarkdown`, then the existing `parseRecipeText`.
3. **Combined.** Structured lines win where present; any part they lack comes from the text. Punch gives ingredients from microdata and Method from its Directions heading.

The review opens as for pasted text, with the warnings it gives today, and **Original text** shows what was read from the page, so a fidelity check needs no second window. Glass, ice, and garnish have no fields; they stay where the source put them, in Method or Description, except for the lines read out of Ingredients described under [as built](#as-built).

### Source

`source` is the page's canonical URL (`<link rel="canonical">`, else the URL as given), with tracking parameters (`utm_*`, `fbclid`, and similar) removed. Today's `knowledge` has several with Instagram campaign strings attached.

### As built

Checked on 2026-11-22 against saved copies of the sampled pages, then in the dev vault. Beyond the plan above:

- **Where the text comes from.** The microdata recipe element, else a common post-body container (`articleBody`, `.entry-content`, `.post-body`, `.post-content`, `.article-body`) or an article that mentions ingredients or has recipe-like amounts, else `main`. A blog's sidebar of ingredient labels (cocktailvirgin's) is left out that way.
- **Name.** The structured name, else the first top-level heading in that text, else the post title (hAtom `entry-title`/`post-title`), else the page's first heading or title. Text before the first top-level heading is dropped, so navigation such as "Back to Recipes" isn't taken as the name.
- **Garnish.** A "Garnish:" line in the page text is added to structured ingredients that have none (Punch keeps it outside its marked-up list).
- **Echoed volumes.** `1 oz · 30 ml pineapple rum` (Daniel Zajic) keeps `· 30 ml` with the amount in the review, as `/ 30 ml.` already was elsewhere, so the wording linked and remembered is just the ingredient.
- **Page text.** Images are dropped, links and emphasis keep only their text (Liber & Co's ingredient was a bold link), and table rows become one line each (Difford's ingredient table). Not every article counts: on Difford's they're reader comments, so without a post body or recipe-like article the body is read.
- **Sites vary by client.** Obsidian was served a version of Difford's with no recipe data, which curl got, and liquor.com answered Obsidian though it refused curl. Testing a site means testing it in Obsidian.
- **Fraction slash.** Amounts accept `2⁄3` (U+2044) as well as `2/3`.
- **Spaced fractions, qualifiers, and other echoes** (2026-11-25, from the unlinked lines in `knowledge`). `1 ½ oz` reads like `1½ oz`; it had been left whole as the wording, so logging skipped the gin in three recipes. A qualifier before the amount (`heavy ¾ oz`, `a scant 1 oz`, also generous, short, healthy, full, heaping, rounded, bare, barely) stays with the amount, which remains unmeasured. An echo may be a range or another volume unit (`1 barspoon / 1 tsp`, `⅓–½ oz. / 10–15 ml.`), so it no longer ends up in the wording.
- **Labels and stray lines in Ingredients** (2026-11-25, from cleaning up imported recipes in `knowledge`). A bare `Garnish:` line with its items on the lines below (Liber & Co) gives one `Garnish: <item>` line per item, so each reads as a garnish; an inline `Garnish: …` line stays as written. `Glass:` with its value below, a line naming only glassware ("Pearl Diver Glass", "Cocktail Coupe"), and `Tools: …` move to the top of Method, as written. Alcohol-content lines ("Alcohol content:", "1.6 standard drinks", "22.96% alc./vol.", "23 grams of pure alcohol") move to Description as one sentence; dropping them was rejected, since they're the source's words. A web link in an ingredient line keeps only its text, and a hashtag left on its own line (`#2`) joins the line above: Wix blogs such as Shaker of Spirits link "#2" in "Don's Spices #2" to a hashtag page.
- **Failure.** The text field is left as `Source: <url>` and a blank line, so pasting the recipe below keeps the source. Shaker of Spirits builds its page with scripts and lands here.

### Not supported

- Social posts and anything behind a login: paste the text.
- Video: never played or transcribed, as in the skill.
- Site-specific adapters. Added only for a site the generic reading gets wrong and that is used often ([decision 3](#decisions)).

## Remembered wordings

When a line is linked in the review, in **Review unlinked ingredients**, or with **Link this ingredient line**, the plugin offers to remember the wording for that note. The next recipe with the same wording, compared as the duplicate check compares names (case, accents, punctuation), comes into the review already linked, marked "Remembered", with one control to unlink it.

- Stored on the ingredient note as `cc-written-as` (a list of strings), not `aliases` ([decision 4](#decisions)). "rum, such as Coruba" isn't a name for anything, and aliases feed Obsidian's link autocomplete.
- Only an exact wording is remembered and applied; partial matches stay suggestions, as now.
- A wording remembered for two notes is a suggestion, not a link, with both offered.
- The skill's approved defaults become starting entries in `knowledge`: `Gin` and `Gin (London Dry)` on London Dry Gin, `Cocchi American` on Cocchi Americano Bianco, `Vermouth (Sweet)` on Sweet Vermouth, `Rye (Bonded)` on Rye Whiskey. Simple syrup "2:1 or rich" stays a suggestion: it's a rule about wordings, not one wording.
- The review's line "Nothing is linked automatically" changes to say which lines were linked from remembered wordings.
- **Review unlinked ingredients** chooses nothing in advance (decided 2026-11-25): it suggests a note remembering the wording first, marked remembered. Choosing it in advance ticked every recipe's line at once, skipping the look at each recipe the review is for (plain `gin` is usually London Dry Gin, sometimes better the Gin family), made those cards start differently from the rest, and brought a cancelled choice back on every read.

This also helps pasted recipes and one-offs, and it's what makes batches workable.

## Batches: Bevnap exports

**Import recipes from a file**, a command:

1. Pick a file. Bevnap's block format: a recipe name, metadata rows, then `INGREDIENTS`, `DIRECTIONS`, `NOTES`, and `ABV` blocks. A real export is needed before building ([decision 5](#decisions)).
2. A list of the recipes found, each ticked, with the duplicate check beside it. A recipe whose name is taken offers **Skip** (the default) or **Import as "<name> (Bevnap)"**, the skill's convention.
3. **Import** writes the ticked recipes, linking only remembered wordings, with `source: Bevnap` and the skill's layout: notes or history in Description, numbered directions in Method, the category, method, glass, ice, garnish, and ABV metadata as `Key: value` lines after the description, and ingredient amounts as exported (`¾ oz (22.5 ml)`).
4. Then **Review unlinked ingredients** opens on just the imported recipes: wordings grouped across the batch, most-used first, each linked once for all of them, and remembered if you choose.

Writing first and linking after reuses the review built for exactly this, instead of a second grouped-linking screen inside the import. An imported recipe with unlinked lines is valid and shows as Not linked in availability until linked.

## Agents

A CLI handler that creates a recipe from text, so the skill fetches and reads (it already handles Threads, rate limits, and the in-app browser) and the plugin writes:

`cocktail-cabinet:create-recipe text=<recipe text> [source=<url or label>] [rating=<1-5>]`

- Reads the text with `parseRecipeText`, links remembered wordings only, applies the filename and duplicate rules, and writes the note as **Add recipe** would. Refuses a filename clash; a name match with a different filename is created and reported, as the review warns.
- Returns JSON: the path, each line with its link or "not linked" and up to three suggestions, and any duplicates. The agent can then link lines through a second handler, `cocktail-cabinet:link-line path=<recipe> line=<n> target=<note> [text=<display>]`, which writes as **Link this ingredient line** does.
- Writes, unlike the availability handlers. In `knowledge` both go in the "ask" group of `.claude/settings.json` and the Codex rules, so the native approval prompt is the check.
- The skill shrinks to source fidelity (what may be taken from a page), retrieval, and calling these.

As built on 2026-11-22:

- **Line numbers.** `line` is the ingredient's position in the Ingredients list, from 1, not its line in the file: the plugin adds `cc-ingredients` and estimates to a new recipe's frontmatter moments after it's written, which shifted file line numbers between the two calls.
- **Newlines.** The `obsidian` CLI passes `\n` through to plugin handlers literally, so `create-recipe` reads `\n` and `\t` as its own `content=` values do (`\\` for a backslash).
- **`name=`** names a recipe whose text doesn't start with its name; `link-line` takes `remember` to add the wording to `cc-written-as`, refused silently (`remembered: false`) when the note already recognizes it.
- **Tags** ending Tasting Notes move into `tags`, as in the recipe form.

Added 2026-11-25, from a long agent session linking unlinked lines in `knowledge`, where the agent rebuilt the review's list from the plugin's source and wrote about 40 bottle notes by hand:

- **`cocktail-cabinet:unlinked [recipe=<path>] [garnishes] [limit=<n>]`** prints what **Review unlinked ingredients** shows, grouped by wording, with each line's position as `link-line` takes it and up to three suggestions. Read-only.
- **`cocktail-cabinet:add-bottle name=<name> [type=…] [abv=<percent>] [volume=<mL>] [open=<mL>] [unopened=<n>] [aliases=<a,b>] [description=…]`** creates a bottle as **Add stock** does for a bottle, in volume tracking, with nothing open unless given, and refuses a name in use. It writes, so it belongs in the "ask" group with `create-recipe` and `link-line`. Status tracking and other stock stay in the form.

## Suggested slices

1. **Remembered wordings.** `cc-written-as`, the offer to remember in the three linking places, pre-linking in the review, and the `knowledge` starting entries. Useful at once for pasted recipes.
2. **Web pages.** URL in **Add recipe**: fetch, structured data, visible text, canonical source, README note. Tests use small synthetic pages shaped like each sampled site (JSON-LD, microdata with hidden duplicates, prose blog), not saved copies.
3. **CLI handlers**, `create-recipe` and `link-line`, then rewrite the `knowledge` skill around them.
4. **Bevnap files**, once a sample export is in hand.

Slices 1–3 are independent; 1 makes 3 and 4 much better, so it goes first.

## Decisions

Agreed on 2026-11-22, taking the recommendation on each.

1. **Network use.** No setting: fetching happens only on an explicit paste-and-review of a URL, and the README discloses it. A setting off by default was rejected; most users would never find it.
2. **Structured data as source.** Accepted, though JSON-LD isn't visible on the page: the site's author wrote it, it's usually cleaner than the visible text, and **Original text** shows it. Visible text only was rejected: it repeats each Punch line twice and loses Difford's numbered steps.
3. **Site adapters.** None in the first build; one is added only when a frequently used site reads wrong. cocktailvirgin is the likely first (its recipes are prose with an ingredient list at the end), but its pages may read well enough as text for review.
4. **`cc-written-as`, not aliases.** A new property, for the reasons under [remembered wordings](#remembered-wordings). Aliases only would need no new schema but would put odd entries in link autocomplete.
5. **Bevnap last.** Built only with a real export to test against: it's low use for `knowledge` now, and the format is known only from the skill's description. Without one it waits until publication makes it matter.
