# Development roadmap

Drafted on 2026-11-03 from a review of the plugin at `2d4462f` and of the cocktail workflows the `knowledge` vault uses today. It is written from the user's side: what each workflow needs before it can be called done, and the order that lets the plugin replace the vault's skills soonest. Phases and their contents are a plan, not approved implementation scope; record decisions in [the cabinet design](cabinet-design.md). Phase 1 was revised and agreed on 2026-11-03; see [adoption and logging decisions](cabinet-design.md#adoption-and-logging-decisions). Updated on 2026-11-04 with friction found testing logging in the dev vault: editing, browsing, and the starter's lack of examples.

## Where each workflow stands

Frequency is taken from the `knowledge` vault. In 2026 the daily notes have about 238 "Made a …" entries. Since September, bottle notes were changed in about 236 commits and recipe notes in about 138.

| Workflow | How often today | Status | To call it done |
| --- | --- | --- | --- |
| Log a drink | Several times a week | Built and tested on desktop; retry recovery deferred | Pick recipe and servings, review and adjust bottle choices, preview the mL drawn down, write the daily-note line, and be safe to retry. See [the workflow assessment](workflow-assessment.md#logging-needs-operation-level-retry-protection). |
| Update stock | Weekly | Creation only; hand edits are error-prone | Open a new bottle, restock, adjust level, or mark finished without hand-editing `cc-open-ml` or `cc-unopened`. Switch a source between mL and availability tracking; by hand it is unclear which fields to add, clear, or convert. Shopping flags appear in one combined list. |
| Edit or rename a note | Whenever something is wrong | Not started | Rename a recipe, bottle, or ingredient once and have the file name, H1, `cc-name`, aliases, and incoming links follow; today a recipe rename takes three hand edits. Edit an existing note's fields with the same form that created it. |
| Add a recipe | Weekly | Core works | Prep tags (`#shaken`, `#stirred`, …) and rating during review, a duplicate-recipe check, and the sources actually used: Bevnap CSV and web pages. Relink plain-text ingredients once a matching note exists (for example, the dev vault's Black Manhattan still has plain-text Angostura Bitters). |
| Browse the hierarchy | While browsing | Built for new notes (embedded Bases); the migration script adds it to adopted notes | Each category, family, type, and bottle note shows, in the note itself, its parent, its children (families, types, or bottles), and the recipes that use it, as the vault's DataviewJS blocks do today. Those blocks read the old properties, so they stop working at cutover (about 300 notes). |
| Set up cabinet | Once | Built; no worked example | Done for a new cabinet, but nothing shows how the pieces fit. The starter should include a small working example: limes and lemons as availability-tracked other stock providing Lime Juice and Lemon Juice, a homemade syrup tracked in mL, and one or two recipes they complete. Still needs a check on real iOS and Android devices. |
| Adopt the `knowledge` vault | Once; blocks real use | Not started | Classify everything to match the starter where they overlap, with local types for the rest; migrate bottles, types, and recipe links with a one-off script. Open inputs: the twelve bottle-level decisions in [the bottle coverage review](knowledge-bottle-coverage-review.md#twelve-bottle-level-decisions-before-adoption), the Falernum rename, and recipe links whose meaning changes. |
| What can I make / what am I missing | Inside LLM sessions | Later | One resolver across bottles, other stock, and types that keeps missing separate from untracked; agents call it through a CLI handler. |

## Phases

### 1. Move in: unblock real use and retire `cocktail-inventory-update`

Drink logging must work on the day the `knowledge` vault switches over; bridging the current fraction-based skill is not worth it.

1. **Classification mapping.** One table, approved before any vault write: each old note's new type, family, and filename. It settles the twelve bottle-level decisions and every recipe link whose meaning changes (Falernum, the old Amaro and Other Herbal Liqueur catch-alls, cacao color, syrup concentration, the generic Coconut Rum requirement, FALSE IDOL's Navy Strength). Anything the starter does not cover becomes a local type under an existing starter family where one fits.
2. **Log this cocktail.** A desktop command on the recipe note: servings, a bottle-review screen, mL preview with rollover into unopened bottles, all-or-nothing apply on shortfall, and the daily-note line. Implemented on desktop with measured other-stock sources, explicit alternatives, stale-preview checks, and native Daily notes templates. Operation-level retry protection remains Phase 2; see the decisions for the review screen.
3. **Migration script.** One-off, in this repo, reusing plugin code. Dry-run report, rehearsal on a copy in the dev vault, then `git diff` on the real vault. Rewrites every ingredient link to the plugin's link style.
4. **Cutover.** Run the script; retire `cocktail-inventory-update`, the old Bases, and the templates; update the vault's `AGENTS.md`. Other breakage (the query and import skills, the DataviewJS views) is fixed as it is hit.

Steps 1 and 2 are independent; step 3 needs step 1's table.

Not in this phase: stock-editing actions and renaming (Phase 2), and a general adoption flow (at most building blocks, if ever).

### 2. Live in it: browse and edit without hand edits

Found while testing logging on 2026-11-04. Order within the phase is open. Navigation was built first, because cutover breaks the vault's DataviewJS navigation.

- Built: hierarchy navigation embedded in category, family, type, bottle, and other-stock notes through a shared core Base; see [navigation in notes](cabinet-design.md#navigation-in-notes). The migration script must add the embeds to adopted notes.
- New: **Rename** for cabinet notes, keeping file name, H1, `cc-name`, aliases, and links in step.
- New: **Edit stock** on a bottle or other stock: open a bottle, restock, set the level, mark finished, and switch tracking mode with an explicit conversion (mL to availability keeps nothing numeric; availability to mL asks for the amounts).
- New: a worked example in the starter: Limes and Lemons (availability, providing the juice types), a homemade syrup in mL, and one or two recipes they complete, so a new cabinet can log a drink on day one. Decide whether example stock starts as Unknown or with sample amounts, and how setup treats examples a user deletes.

### 3. Harden logging

- New: each logging operation identified so retries and partial failures are recoverable.
- Finish: a mobile test pass.

### 4. Everyday polish: less command-hunting

- Finish: recipe review adds tags and rating, warns about duplicates, and supports relinking later.
- Finish: the combined shopping-list Base.

### 5. Reach: retire the remaining skills

- New: Bevnap CSV and web-page recipe import, following the source-fidelity rules of `cocktail-recipe-import`.
- New: availability queries (what can I make, what am I missing).
- New: agent integration through a CLI handler; publication remains a separate decision.
