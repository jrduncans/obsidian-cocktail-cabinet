# Cocktail workflow assessment

Captured on 2026-10-29 from [Assess cocktail workflow automation](thread://01a189d2-6af0-74f3-9ebb-859418fe6291?hostId=local). This records the earlier analysis and recommendations for future planning. The user's confirmed project choices are recorded in `AGENTS.md`; the architecture and implementation order below remain proposals.

## Why build a plugin

The existing skills already encode enough rules to move matching, arithmetic, validation, and writes into deterministic code. A plugin could make frequent actions available while reading a recipe and eventually support those actions on mobile. An LLM would remain useful for conversational requests, unfamiliar recipe sources, uncertain ingredient mappings, and taste or substitution discussions.

Routine bookkeeping and availability checks can work through ordinary controls and explicit choices. Embedded LLM assistance can be considered later; it is not a prerequisite for the core workflows.

## Proposed architecture

- Share TypeScript cocktail logic between Obsidian controls and structured commands callable by a desktop agent. Keep parsing, ingredient resolution, stock calculations, and plan validation reusable across those interfaces.
- Keep Markdown notes, frontmatter, wiki links, taxonomy, and Bases as the persistent source of truth. Any index should be rebuildable from that data.
- Port the behavior of the Python inventory helper into mobile-compatible logic rather than requiring Python as a plugin runtime dependency. Supporting scripts can still serve batch or desktop workflows.
- Have agent skills interpret requests and invoke validated operations. Both agent and UI entry points should use the same rules for proposals and writes.
- Retain the existing desktop-agent workflow for conversational work and difficult imports initially. Occasional batch imports can remain scripts while frequent actions move into the plugin.

The installed `obsidian` type definitions were checked when capturing this note: they expose `Plugin.registerCliHandler`, `requestUrl`, and `SecretStorage`. These are integration candidates; verify runtime support and the required `minAppVersion` before using them. The earlier chat reported Obsidian 1.14.5, which is historical context rather than a compatibility guarantee.

## Existing behavior to preserve deliberately

The [approved stock design](cabinet-design.md#approved-stock-and-purchasing-design) now selects mL storage and per-record volume or status tracking for the plugin. Fraction-based storage below describes the source workflow and does not override that newer schema decision.

Paths below are relative to the `knowledge` vault; read the current sources before implementing a port.

| Source | Behavior or reference value |
| --- | --- |
| `.agents/skills/cocktail-inventory-query/SKILL.md` | Live stock query, exact/type/subcategory/substitution matching, recommendation ranking, and distinction between missing and untracked ingredients. |
| `.agents/skills/cocktail-inventory-update/SKILL.md` | Bottle selection, mandatory Green Chartreuse check, preview and confirmation, daily-note logging, and inventory-only requests. |
| `.agents/skills/cocktail-inventory-update/scripts/update_inventory.py` | Amount parsing, conversion, aggregation, bottle rollover, and proposed inventory changes. |
| `.agents/skills/cocktail-inventory-update/scripts/test_update_inventory.py` | Regression examples for mutually exclusive ingredient alternatives. |
| `.agents/skills/cocktail-recipe-import/SKILL.md` | Source fidelity, approved mappings, Bevnap block CSV conventions, duplicate handling, and note creation rules. |
| `Templates/Cocktails/` | Recipe, bottle, ingredient-source, and taxonomy note shapes. |
| `Cocktails/Views/IngredientAvailability/view.js` | Source notes providing ingredients through `Provides`, with `Have`, `Low`, and `Out` availability. |
| `Cocktails/Views/RelatedRecipes/view.js` | Relationships among bottles, types, subcategories, substitutions, and recipes. |
| `Cocktails/*.base` | Existing inventory and taxonomy views, especially `Bottles.base` → `Liquor Cabinet`. |

Important porting cases:

- Stock requires a positive remaining-open fraction or a positive unopened count; empty fields do not establish availability.
- For Green Chartreuse, the current workflow always asks which bottle was actually used, even when only one match exists. Other ambiguous bottle selections also require a choice. Treat this as an existing personal policy to represent explicitly when designing plugin settings.
- Prefer an explicit milliliter amount; otherwise convert US fluid ounces using `29.5735295625 mL` per ounce. Multiply by servings, aggregate pours into the same bottle, consume open stock first, and roll into unopened bottles as needed. Insufficient stock or unusable bottle volume prevents the update.
- An explicit `A or B` ingredient line represents one pour and requires exactly one selected alternative. Unsupported or imprecise amounts need an explicit skipped/review result.
- Current logging decrements precise linked bottle pours; it skips fresh juice, garnishes, ice, dashes, barspoons, and other untracked or imprecise ingredients. Availability and consumption are separate questions.
- Current imports preserve source content and omissions, use bare ingredient links, retain `rating` and `source`, and protect existing curated recipes. A conflicting Bevnap import uses the `(Bevnap)` suffix. Approved ingredient mappings vary by source; consult the import skill rather than inventing replacements.
- Current agent-driven recipe creation uses Obsidian's template creation flow so variables resolve. A native plugin implementation needs to preserve template semantics when choosing its creation mechanism.
- Current skills keep private vault data out of external services. Any future model integration needs explicit context selection and privacy design; public recipe extraction and personal inventory access have different data needs.

## Gaps identified in the assessment

### Ingredient rules have diverged

The query skill checks bottles, while ingredient-source notes can supply types through `Provides`. For example, a fresh-fruit source can provide a juice type. The ingredient availability view understands that relation; the query skill does not yet combine it with bottle availability. This divergence was rechecked in the current sources when capturing this note.

Proposed improvement: one resolver that reports exact, type, subcategory, explicit substitute, and ingredient-source matches with their reasons. Preserve missing and unknown/untracked states, and decide how `Low` affects recipe availability. Do not assume untracked pantry items are present.

### Logging needs operation-level retry protection

The current workflow detects an existing daily-note sentence, but that does not establish whether the corresponding inventory decrement already happened. Repeating a request can decrement stock again; two intentional rounds of the same recipe should still be distinct events.

Proposed improvement: identify each logging operation, track its progress across bottle updates and the daily note, and provide recovery for partial completion. Coordinating multiple note writes needs explicit handling even when individual file updates are protected.

### Approval should identify the actual changes

The inventory helper recomputes its plan when applying. Changes between preview and apply could therefore produce a different result from the reviewed proposal.

Proposed improvement: bind approval to the proposed changes and expected source state; require a fresh preview if that state changed. Test retries, partial failures, stock changes after preview, ambiguous selections, mutually exclusive alternatives, and bottle rollover.

## Candidate first features

Suggested order from the earlier assessment, subject to a concrete implementation plan:

1. Shared recipe parsing and ingredient resolution.
2. Reliable logging and inventory planning, including recovery and retry behavior.
3. A small Obsidian interface for frequent actions, with the same core available to agents.
4. Broader import tooling and optional embedded LLM assistance as needed.

Candidate commands are **Log this cocktail**, **What can I make?**, **What am I missing for this recipe?**, and **Review this recipe import**. These are proposed labels, not registered command IDs.

The proposed logging flow asks for servings, resolves bottle choices, previews consumption and remaining stock, applies approved changes, records the drink, and offers recovery if a step fails.

Before implementing, decide which existing personal rules should become configurable, the first supported Obsidian version and platforms, and the smallest useful feature scope. No model provider, new database, or final command API has been selected.
