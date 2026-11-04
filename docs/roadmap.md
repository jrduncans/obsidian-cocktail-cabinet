# Development roadmap

Drafted on 2026-11-03 from a review of the plugin at `2d4462f` and of the cocktail workflows the `knowledge` vault uses today. It is written from the user's side: what each workflow needs before it can be called done, and the order that lets the plugin replace the vault's skills soonest. Phases and their contents are a plan, not approved implementation scope; record decisions in [the cabinet design](cabinet-design.md).

## Where each workflow stands

Frequency is taken from the `knowledge` vault. In 2026 the daily notes have about 238 "Made a …" entries. Since September, bottle notes were changed in about 236 commits and recipe notes in about 138.

| Workflow | How often today | Status | To call it done |
| --- | --- | --- | --- |
| Log a drink | Several times a week | Not started | Pick recipe and servings, choose bottles (including the Green Chartreuse rule), preview the mL drawn down, write the daily-note line, and be safe to retry. See [the workflow assessment](workflow-assessment.md#logging-needs-operation-level-retry-protection). |
| Update stock | Weekly | Creation only | Open a new bottle, restock, adjust level, or mark finished without hand-editing `cc-open-ml` or `cc-unopened`. Shopping flags appear in one combined list. |
| Add a recipe | Weekly | Core works | Prep tags (`#shaken`, `#stirred`, …) and rating during review, a duplicate-recipe check, and the sources actually used: Bevnap CSV and web pages. Relink plain-text ingredients once a matching note exists (for example, the dev vault's Black Manhattan still has plain-text Angostura Bitters). |
| See related recipes | While browsing | Command only | Shown on the bottle or type note itself, as the vault's DataviewJS block does today, instead of a command to remember. |
| Set up cabinet | Once | Built | Done for a new cabinet. Still needs a check on real iOS and Android devices. |
| Adopt the `knowledge` vault | Once; blocks real use | Not started | Preview, then migrate the 165 bottle notes and the `Subcategory`, `Type`, and `base` conventions into the plugin schema. Open inputs: the twelve bottle-level decisions in [the bottle coverage review](knowledge-bottle-coverage-review.md#twelve-bottle-level-decisions-before-adoption), the Falernum rename, and the remaining substitution question. |
| What can I make / what am I missing | Inside LLM sessions | Later | One resolver across bottles, other stock, and types that keeps missing separate from untracked; agents call it through a CLI handler. |

## Phases

### 1. Move in: unblock real use

- Finish: settle the twelve bottle-level decisions and the open substitution question.
- New: an adoption flow for an existing collection, with a preview of every change before anything is written.
- Finish: stock-editing actions for bottles and other stock (open new, restock, adjust, finished).

### 2. Log drinks: retire `cocktail-inventory-update`

- New: **Log this cocktail**, with servings, bottle choice, an mL preview, and per-bottle draw-down including rollover into unopened bottles.
- New: the daily-note entry, with each logging operation identified so retries and partial failures are recoverable.
- Finish: a mobile test pass, since logging happens while making the drink.

### 3. Everyday polish: less command-hunting

- Finish: related recipes rendered on the ingredient or bottle note.
- Finish: recipe review adds tags and rating, warns about duplicates, and supports relinking later.
- Finish: the combined shopping-list Base.

### 4. Reach: retire the remaining skills

- New: Bevnap CSV and web-page recipe import, following the source-fidelity rules of `cocktail-recipe-import`.
- New: availability queries (what can I make, what am I missing).
- New: agent integration through a CLI handler; publication remains a separate decision.
