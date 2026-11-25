# Recipe link text and amounts design

Drafted on 2026-11-23 from a conversation on 2026-11-22. Agreed in conversation. Slice 1 built 2026-11-23; slices 2 to 4 built 2026-11-24. It replaces the [link text decision of 2026-11-07](cabinet-design.md#unlinked-lines), which had no setting and kept the recipe's wording by default when linking someone else's text.

## Goal

Recipes should end up in a consistent form: full-path links whose text is the cabinet name, and fluid-ounce amounts written with fraction characters (`1½ oz`). That is the priority order:

1. **Recipes come in that way.** Create, enhance, page and pasted imports, one-off saves, the linking commands, and the import CLI write the preferred form for what they can safely decide.
2. **A recipe you're looking at is easy to fix.** Adopting the cabinet name for a line, or tidying a whole recipe, takes one step.
3. **Across many recipes** comes later, and only if tidying as you go isn't enough.

The plugin never drops recipe wording without asking. What counts as the same ingredient varies by person, so a setting decides how far automatic changes go.

## What the `knowledge` vault looks like

Measured on 2026-11-22 through the running vault, across 2,632 ingredient lines:

- **Link text.** 1,817 links use the exact cabinet name. 45 differ only in case or punctuation, 99 are an alias, 1 is a remembered wording, and 125 really differ (47 distinct pairs, led by `Falernum` → Falernum Syrup ×19 and `Barbados Rum` → Aged Barbados Rum ×12). Some of those are historical mistakes from modeling that has since grown, such as `Rye Whiskey` → Bonded Rye; none are choices to protect.
- **Words outside the link.** 210 lines already keep extra words beside the link: `rum, preferably [[…/Coruba|Coruba]]`, `fresh [[…/Lime Juice|Lime Juice]]`.
- **Short links.** 12 ingredient links lacked a path; they were converted by hand on 2026-11-22.
- **Amounts.** 641 use fraction characters, 484 plain fractions (`3/4`), 90 mixed plain fractions (`1 1/2`), 240 decimals, and 829 whole numbers.

## The setting

**Link text**, in Settings → Cocktail Cabinet, decides when the plugin uses the cabinet name (`cc-name`) without asking:

| Level                     | Uses the cabinet name when the wording is…                     | Example                   |
| ------------------------- | -------------------------------------------------------------- | ------------------------- |
| Keep the recipe's wording | never                                                          | `lime juice` stays        |
| Same name (default)       | the name, ignoring case, accents, punctuation, and spacing     | `lime juice` → Lime Juice |
| Same name or alias        | the name or one of the note's `aliases`, compared the same way | `Strega` → Liquore Strega |

The default is the safest level: it never changes a word, only how it's written. Remembered wordings (`cc-written-as`) never count: they exist because they carry detail, such as `rum, such as Coruba`. No level drops words; "always use the cabinet name" was considered and rejected, because extra words may name a different ingredient.

Comparison uses `ingredientKey` (case, accents, curly apostrophes, spacing) plus punctuation, so `St. Elizabeth Allspice Dram` matches `St Elizabeth Allspice Dram`.

## Linking new wording

When an unlinked wording is linked (a form row, **Review unlinked ingredients**, **Link this ingredient line**, **Link…** in logging and **Can I make this?**, and the `create-recipe` and `link-line` CLI handlers):

1. **The wording is the name, by the setting:** the whole wording becomes the link, with the cabinet name as text.
2. **The wording contains the name or an alias plus other words:** only the name is linked, and the rest stays as plain text beside it. `fresh lime juice` → `fresh [[…/Lime Juice|Lime Juice]]`; `strawberry-infused Campari` → `strawberry-infused [[…/Campari|Campari]]`. Words are never dropped, because a modifier may name a different ingredient; keeping it visible is the cue that it may deserve its own note, which **Create…** from the wording offers. The contained name follows the setting: an alias counts only at the alias level, and the link text is then the cabinet name.
3. **The wording doesn't contain the name** (`Falernum` linked to Falernum Syrup): the wording stays as the link text, as today. Adopting the cabinet name is one step (below).

Where a link step shows the link text choice (labelled **Link shows** since 2026-11-24: the note's name, **As written**, or your own; formerly **Cabinet name** and **Recipe wording**), it starts on what these rules chose, so a different choice is still one click.

The amount, any echoed volume, the list marker, and anything after the wording (a parenthetical, "preferably …") stay as written, as linking does today.

## Adopting the cabinet name as you go

Each of these acts on links that already exist, so the note has already been chosen; dropping words that describe it is safe here, but only when asked.

- **In the forms.** A linked row whose text isn't the cabinet name gets a small **Use "Lime Juice"** button. When the text contains the name plus other words (`[[…/Campari|bitter Amaro Campari]]`), a second button, **Move words out**, gives `bitter Amaro [[…/Campari|Campari]]`. Ignoring both keeps the text.
- **In the note.** With the cursor in an Ingredients link, **Use cabinet name** switches just that link, beside **Edit this ingredient link**. Like the other editor commands it writes through the editor, so undo works. Built: it drops any other words in the link and gives a short link its full path, and appears only when the link's text isn't the cabinet name.
- **For a whole recipe.** **Tidy this recipe**, on recipe notes (file menu, More options, command palette), lists every Ingredients line that would change, before and after, with a checkbox each. Lines whose change the setting would make on its own, short links, and fraction changes start ticked; dropping or moving words starts unticked. It writes the ticked lines, each checked against what was listed, like **Review unlinked ingredients**. **Edit cabinet note** mentions when a recipe has lines to tidy, with a button to open it. Built: the mention counts only lines with a change that starts ticked, so an offer you've passed over (`Falernum`) doesn't keep the mention showing; the button closes the Edit form without saving, since Tidy writes the note itself.

## Fractions

For fluid-ounce amounts only: `1 1/2 oz`, `1 ½ oz`, `1.5 oz`, and `.75 oz` become `1½ oz` and `¾ oz`, with ⅛, ¼, ⅓, ½, ⅔, and ¾ and their whole-number mixes (`2/4` reduces to `½`; a decimal converts only when exact to three places, so `.33` stays). Units written as `ounce`, `ounces`, or `oz.` keep their spelling; only the number changes. Decimals with no exact fraction (`1.3 oz`), ranges, mL and cL amounts, dashes, and barspoons are left alone.

- **Where.** A form's amount field converts when you leave it after typing in it, so typing `1 1/2 oz` gives `1½ oz`; a saved amount you only tab through stays as it is. Pasted, page, and CLI recipes (`create-recipe`) convert as they're read, as do new rows in any form, and **Tidy this recipe** offers the change for saved lines.
- **Setting.** **Fraction characters**, on by default. It changes nothing for recipes measured in mL.
- **Echoed volumes** (`1 oz. / 30 ml.`, `1½ oz · 45 ml`) stay as written. Dropping the second unit was considered; it doesn't hurt to keep, and making it a preference isn't worth the setting.

## Build slices

1. **The setting and linking new wording.** The comparison and contained-name split as pure code with tests; every link step and the CLI handlers use them; link text choices start on the result.
2. **Fractions.** The amount formatter as pure code, the form fields, readers, and CLI, and the setting.
3. **Tidy this recipe**, with the Edit mention.
4. **Adopting as you go:** the form row buttons and the **Use cabinet name** editor command.

Later, and only if needed: something across many recipes, reusing **Tidy this recipe**'s line changes. Still deferred on 2026-11-24; see [upkeep views](cabinet-design.md#upkeep-views) for when to revisit.

## Decisions

1. Agreed 2026-11-22: no automatic word-dropping at any level. Extra words on new wording may describe a different ingredient (`strawberry-infused Campari`); on an existing link they describe the chosen note (`bitter Amaro Campari`), so dropping them is offered there, never automatic.
2. Agreed 2026-11-22: a setting rather than one rule, since whether an alias is "the same name" differs by person.
3. Agreed 2026-11-22: tidying a recipe you're looking at comes before any review across recipes.
4. Agreed 2026-11-22: fraction characters for fluid ounces, on by default with a setting; echoed volumes left alone.
