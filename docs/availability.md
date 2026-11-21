# Availability design

Drafted on 2026-11-21 from the [roadmap's Phase 5](roadmap.md#5-reach-retire-the-remaining-skills) and the [workflow assessment's resolver proposal](workflow-assessment.md#ingredient-rules-have-diverged). Reviewed the same day: the [decisions](#decisions) record what was agreed. Not yet built.

## Goal

Answer three questions from the cabinet itself, the same way in Obsidian and for agents:

1. **Can I make this?** One recipe, line by line, with the reason for each answer.
2. **What can I make?** Every recipe, sorted by how close it is, optionally narrowed to a bottle, a type, a rating, or a tag.
3. **What should I buy?** The missing ingredients that would unlock the most recipes, especially recipes one ingredient away.

It replaces the `knowledge` vault's `cocktail-inventory-query` skill, which reimplements the matching rules in prose over four Base queries. The plugin already has those rules in code for logging (`fitsLine`, `lesserType`, `swapTypes`, `relatedTargets`); the resolver reuses them, so a recipe that availability says you can make is one logging can fill.

## Availability is not consumption

Logging asks which bottle to draw down for a measured pour. Availability asks whether you have something that fits every line, measured or not. So the resolver differs from logging in three ways:

- **Unmeasured lines count.** Two dashes of Angostura, a sprig of mint, an egg white: logging skips them, but you can't make the drink without them.
- **Status-tracked stock counts.** Have and Low are in stock, as in the In stock Base (`hasStock`), not only positive mL (`isStocked`).
- **No choices.** It reports what fits; it never selects a bottle.

## Line states

Each Ingredients line gets one state, from the links on it (any link on the line is an alternative, as in logging):

| State          | Meaning                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Have**       | A stocked source fits the line, by the logging rules: the named bottle or other stock, a same-type bottle (not within a catch-all), any bottle or other stock under a linked type, subtype, family, or category.    |
| **Low**        | Only sources that are Low fit: availability Low, or mL under the Restock thresholds (the existing settings, 10% and 70 mL by default). Counts as Have, flagged.                                                     |
| **Short**      | Volume-tracked sources fit, but together hold less than one serving's pour (10 mL of Campari for a 30 mL line). Only measured lines can be short.                                                                   |
| **Substitute** | Nothing fits, but a likely substitute is stocked: another bottle of a named bottle's catch-all type, or a parent-type bottle for a subtype line. Named, never counted as Have, the same as logging's "Other Amaro". |
| **Unknown**    | The only fitting sources have availability Unknown or no tracking mode. Named, so you can go and look.                                                                                                              |
| **Missing**    | Nothing that fits is stocked or Unknown. A fitting source at zero or Out is named ("Out: Campari"), since it's what you'd rebuy.                                                                                    |
| **Not linked** | No link, or a link to a missing note. Never assumed on hand. Review unlinked ingredients is the fix.                                                                                                                |

Families and categories never broaden a type line, and a type line never broadens to its siblings; [recipe specificity](cabinet-design.md#recipe-specificity-and-hierarchy) already settles that. Unlike the skill, a missing type line doesn't suggest stocked bottles of sibling types ([decision 4](#decisions)).

## Recipe status

A recipe takes its worst line, leaving out marked garnishes, in this order (best first):

1. **Can make**: every line Have or Low.
2. **With a substitute**: the rest Have, at least one Substitute.
3. **Check stock**: at least one Unknown, nothing worse.
4. **Missing one**: exactly one line Short, Missing, or Not linked.
5. **Missing more**: two or more.

Within a status, recipes sort by rating (highest first, unrated last), then by least recently made, so a favorite you haven't had in a while comes first. Low lines and garnishes ([decision 2](#decisions)) show as caveats on each row, for example "Low: Campari · Unknown: Mint".

## What to buy

From the same pass: each missing requirement (a type, bottle, or staple as linked) with the recipes it would move to Can make if bought, counting only recipes missing nothing else, and then the recipes it would bring one step closer. "Buy Orgeat: unlocks Mai Tai, Army & Navy, Japanese Cocktail." Rows can be added to the shopping list (`cc-shopping-list: true` on the type, bottle, or staple), each ticked by you; nothing is flagged automatically.

## Where it shows

- **What can I make?** A command, and a button on the cabinet home's text. Opens a side pane, not a modal, so recipes open beside it: sections by recipe status, filters for rating, tag, and "uses" (a bottle, type, or family), and a **What to buy** tab. Refreshes when cabinet notes change, debounced like recipe sync.
- **What can I make with this?** On bottle, other-stock, type, and family notes (file menu and More options, not the header): opens the pane filtered to recipes that use the note, by the [Recipes rule](cabinet-design.md#navigation-in-notes).
- **Can I make this?** On recipe notes (file menu and More options): the line table above in a small modal, with **Log this cocktail** and **Edit stock** for a Low, Short, or Out source, and **Link…** for an unlinked line.
- **Agents**: CLI handlers (below).

The Recipes sections embedded in notes are core Bases and can't call the resolver; see [decision 1](#decisions).

## Agents: CLI handlers

Registered with `registerCliHandler` (Obsidian 1.12.2) when the method exists, so `minAppVersion` stays 1.9.10 and older apps simply lack the commands. Mobile has no CLI, so nothing is hidden there. Read-only, JSON by default:

- `cocktail-cabinet:can-make path=<recipe>`: the recipe status and each line's state, sources, and reason.
- `cocktail-cabinet:makeable [uses=<note>] [status=…] [min-rating=…] [tag=…]`: recipes with status and caveats.
- `cocktail-cabinet:to-buy`: the What to buy list.

Paths in and out are vault-relative, as the Bases return them. The `knowledge` skill becomes a thin wrapper: run these, present the result, keep the response format and the privacy note. Writing (shopping flags) stays in Obsidian.

## Not stored

Availability is computed when asked and never written to recipe frontmatter. Stock changes several times a week, and a stored `cc-can-make` on 500 recipes would rewrite hundreds of synced, Git-tracked notes after every log. One pass over the cabinet is cheap: the store already holds every note's properties, and recipe lines come from `cc-ingredients` plus the Ingredients section, read only for recipes in view.

## Suggested slices

1. **Resolver as pure code.** `core/availability.ts`: line states and recipe status from notes, stock fields, and recipe text, reusing the logging rules and `hasStock`. Tests cover each state, alternatives on one line, catch-alls, subtypes, staples, other stock through Provides, and Short with several bottles.
2. **CLI handlers**, then rewrite the `knowledge` skill around them. The fastest way to retire the skill and to check the resolver against real data before any UI.
3. **Can I make this?** on recipes.
4. **What can I make?** pane with filters and What to buy, and **What can I make with this?** on ingredient notes.

## Decisions

Agreed on 2026-11-21, taking the recommendation on each.

1. **Bases.** The roadmap's [custom view](cabinet-design.md#navigation-in-notes) idea: a plugin-registered Bases view (`registerBasesView`, Obsidian 1.10) could show a status column in Recipes and in each note's Recipes section, but renders nothing with the plugin off and would raise `minAppVersion`. Skipped for now; the pane covers it. Revisit once the pane has been used for a while.
2. **Garnishes.** Lines marked as garnish ("Garnish:", "to garnish"). They never lower a recipe's status; they show as caveats ("No orange peel"). Many home bartenders skip garnishes, and the unlinked review already hides them by default.
3. **Not linked lines.** They count as Missing in the status (a recipe with an unlinked line can't be called makeable), with "not linked" as the reason, so linking fixes it. A separate caveat that doesn't affect status was rejected: it would make older, partly linked recipes look better than they are.
4. **Sibling suggestions.** The skill suggests stocked bottles of sibling types for a missing type (Rhum Agricole for a missing Aged Martinique Rum). Left out. Types exist because siblings aren't swaps, catch-alls and subtypes already cover the likely substitutes, and the agent can still suggest siblings in conversation.
5. **Servings.** Availability is for one serving. Short already catches the case that matters, and logging checks the real amount.
6. **Low.** Low counts as Can make, flagged. Treating it as Check stock would demote most of a well-used cabinet.
