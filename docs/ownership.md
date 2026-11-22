# Plugin and user ownership

Drafted on 2026-11-21, after the **What can I make?** release added a sentence to `Cocktail Cabinet.md` that existing cabinets never receive. Revised the same day with plans for guide, agent, and skill notes, and with the freedom of an unreleased plugin: the only real cabinet is `knowledge`, which the plugin can simply overwrite to fit whatever is chosen. [Open questions](#open-questions) records the decisions. Slice 1 built 2026-11-21.

Earlier docs call `Cocktail Cabinet.md` "the cabinet home", a term never defined. Decided 2026-11-21: no separate name; it's the **Cocktail Cabinet** note, and docs and code drop "home".

## Problem

Setup writes some files once and never again. That suits notes people fill in, but `Cocktail Cabinet.md` and `Shopping list.md` are mostly the plugin's explanation and wiring, and each release that changes them leaves existing cabinets behind. So far the fix has been a hand-edit paragraph in the design docs (kitchen staples, the availability commands).

It will get worse. Three kinds of plugin-written content are coming:

- **A guide**: several pages expanding what `Cocktail Cabinet.md` explains, kept in step with the installed version, readable offline and on mobile, and linkable from the user's own notes.
- **Agent reference notes**: what an `AGENTS.md` needs to use the cabinet well (schema, rules, CLI commands), so a vault's `AGENTS.md` can link to them instead of copying, as `knowledge`'s does today.
- **Possibly agent skills**: the query skill, and later import, as skills matching the installed plugin.

All of these change with releases, and some users will edit them. Location shouldn't decide ownership: hiding the guide in `Views/` to keep one folder rule would make it harder to find.

## What the plugin writes today

| What                                                                                            | Today                                                                          | Problem                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Bases in `Views/`                                                                               | Rewritten when a release changes one; copies in `Custom views/` are the user's | None. Obsidian rewrites a Base when a column is resized, so Bases can't use the edit check below. |
| Derived recipe properties and log bookkeeping (`cc-ingredients`, `cc-est-*`, `cc-last-made`, …) | Kept current inside user notes                                                 | None                                                                                              |
| `Cocktail Cabinet.md`, `Shopping list.md`                                                       | Written once                                                                   | Release changes never arrive                                                                      |
| Navigation embeds in ingredient notes (`![[Views/Related.base#…]]`)                             | Written when a note is created                                                 | A new section (Subtypes) reaches only notes created afterward                                     |
| Starter catalog notes, by `cc-catalog-id`                                                       | Written once                                                                   | Typical ABVs, catch-all flags, subtypes reach `knowledge` only by one-off passes                  |
| Worked example                                                                                  | Written once with a new cabinet, never restored                                | None; the user's from the start                                                                   |

## Proposal

### Managed notes: updated unless you've changed them

A **managed note** is a Markdown note the plugin writes and keeps current: `Cocktail Cabinet.md`, `Shopping list.md`, the guide pages, and the agent notes. Each says so in a property, `cc-managed`, holding a fingerprint of the content the plugin last wrote. On startup (after a release) and on **Refresh cabinet notes**, for each managed note:

- **Unchanged since the plugin wrote it** (its content matches the fingerprint): replaced with the current version, silently.
- **Changed by you**: left alone and listed in **Review cabinet updates**, which shows your version beside the new one and offers **Use new version** (with a choice to save yours beside it as `<name> (your version).md` or discard it), **Keep mine** (the note stops being managed: `cc-managed` is removed), or **Later**.
- **Missing**: created again only if it was never deleted on purpose; deleting a managed note is recorded in settings and respected.
- **No `cc-managed`**: yours. The plugin never touches it, so removing the property is how to take a note over.

The fingerprint covers the body and every property except bookkeeping the plugin itself writes, so the shopping list's own header actions don't count as edits. A visible property was chosen over a record in plugin settings: it travels with the note, shows the reader which notes the plugin keeps current, and gives a one-step opt-out.

### Where things live

Managed notes go where people will look for them, not where a folder rule is tidiest:

- `Cocktails/Cocktail Cabinet.md`: as now, linking to everything below.
- `Cocktails/Shopping list.md`: as now.
- `Cocktails/Guide/`: guide pages (Getting started, Recipes, Stock, Logging, Shopping, Hierarchy and substitutes, Views and customizing).
- `Cocktails/Guide/Agent Reference.md`: the agent reference, one note for a vault's `AGENTS.md` to link (`See [[Cocktails/Guide/Agent Reference]] for the cocktail cabinet.`). Plain Markdown with vault-relative paths, so an agent reading the file directly needs nothing else.
- `Views/` stays the plugin's folder for Bases, rewritten as now; `Custom views/` stays the user's.

### Plugin-maintained lines in your notes

Navigation embeds are kept present like derived properties: a startup check adds any embed a note's kind needs and lacks, in the kind's order, and never removes or reorders what's there.

### Catalog notes: silent when untouched, offered when edited

Starter notes are the user's, but most are never edited. The catalog keeps each entry's earlier values (descriptions and catalog properties such as `cc-abv-typical`, `cc-catch-all`, parents). A field still matching any earlier catalog value is updated silently; one the user changed is offered in **Review cabinet updates** beside managed notes. New catalog entries the cabinet lacks are offered there too. This replaces the one-off passes.

### Skills

Deferred (decided 2026-11-21): no skills for now. Recorded so the plan leaves room for them later.

Agent skills are folders with a `SKILL.md`, found in tool-specific places (`.agents/skills/`, `.claude/skills/`) outside the cabinet. Two ways to keep them in step with the plugin:

- **Install skills**, a command that writes the skill folders into a location the user picks, managed with the same fingerprint check, so later releases update unedited skills and offer the rest.
- Publish them separately (a repository people install from), version-matched by convention only.

Writing into hidden agent folders is outside what Obsidian plugins usually do, so it needs explicit consent each time and never happens on its own. Symlinks were considered and rejected: they don't sync through iCloud or work on mobile, and Obsidian ignores them inconsistently.

### Moving `knowledge`

Unreleased, so no migration machinery and nothing by hand (decided 2026-11-21): `knowledge`'s `Cocktail Cabinet.md` and `Shopping list.md` are simply overwritten with the managed versions when slice 1 is installed. Anything different in them came from the plugin or from hand-edit paragraphs that the plugin should have applied, and Git keeps the old versions. The vault's `AGENTS.md` cocktail section becomes a link to the agent note in slice 4. Released cabinets get the general path above from the start, since every managed note will carry `cc-managed`.

## Suggested slices

1. Built 2026-11-21. Managed notes: `cc-managed`, the startup check, **Review cabinet updates**, **Refresh cabinet notes** (replacing **Refresh cabinet views**, and covering Bases). `Cocktail Cabinet.md` and `Shopping list.md` become managed; `knowledge`'s two notes are overwritten.
2. Built 2026-11-21. Navigation embeds kept present.
3. Built 2026-11-22. Catalog updates, with earlier values kept in the catalog: `src/catalog/history.json`, generated by `npm run catalog:docs` (first built from every committed catalog version) and checked by `npm test`. Fields: description, preparation, parent, provides, typical ABV, catch-all, and sugar ratio. A field missing from the history has only ever been empty; a value the catalog never had, where it has none now, is the user's and never offered. **Keep mine** records the catalog value it was kept against, **Skip** the entry, both in plugin data.
4. Built 2026-11-22. The guide pages (Getting Started, Recipes, Stock, Making Drinks, Shopping, Hierarchy and Substitutes, Views and Customizing; Making Drinks covers What can I make? beside logging) and the Agent Reference, all managed notes with `cc-kind: guide`, linked from a Guide section in the Cocktail Cabinet note. `knowledge`'s `AGENTS.md` cocktail section becomes a link when installed.
5. Skills, deferred.

## Open questions

Decided 2026-11-21:

1. **Name**: no separate name; it's the **Cocktail Cabinet** note.
2. **Marker**: the visible `cc-managed` property.
3. **Your version on "Use new version"**: the user chooses each time between saving it as `<name> (your version).md` and discarding it.
4. **Guide**: `Cocktails/Guide/`, about seven pages, linked from the Cocktail Cabinet note.
5. **Agent reference**: one note, `Agent Reference.md`.
6. **Skills**: none for now; revisit later.
7. **Catalog history**: earlier values kept in the catalog for each changed field, so untouched notes update silently.
