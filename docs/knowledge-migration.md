# Knowledge migration rehearsal

`npm run migrate:knowledge` runs the one-off Phase 1 migration. It reads the tables in [the approved mapping](knowledge-adoption-mapping.md) and reuses the plugin's catalog, rendering, links, stock units, ratings, and generated Bases. Transform code lives in `scripts/knowledge/`; filesystem access is isolated in `io.ts`.

Run from the repository with Node.js 20 or later:

```sh
npm run migrate:knowledge -- \
  --source-vault '/path/to/source-vault' \
  --root 'Knowledge rehearsal'
```

This is a dry run. It prints a private Markdown report grouped by file operation and issue category, with counts. Use `--report '/private/path/report.md'` to save it to a new file instead. No cabinet files are written. Reports include private source paths and unconvertible values; keep them outside this repository. Conversion errors produce a nonzero exit status and prevent apply. Unmapped notes and links are preserved and reported.

For apply, supply a separate vault:

```sh
npm run migrate:knowledge -- \
  --source-vault '/path/to/source-vault' \
  --target-vault '/path/to/dev-vault' \
  --root 'Knowledge rehearsal' \
  --report '/private/path/apply-report.md' \
  --apply
```

The destination must be absent or an exact, unchanged copy of the source `Cocktails/` folder. Apply creates a complete staged copy before replacing the destination, rechecks source and target snapshots, and restores the original copy if installation fails. Existing edited rehearsals are refused; choose a new folder. Apply to the `knowledge` vault is always forbidden, including aliases resolved through symlinks. Source and target vaults must be separate. Symlinks inside the source cabinet and destination cabinet path are refused. Daily notes and templates are outside the migration.

The report lists every create, rewrite, rename, and retirement. Renames may also change content. Multiple old classifications can merge into one target; their authored bodies, aliases, and shopping flags are retained. Conflicting metadata and authored content on a retired note require review. Generated Views and Shopping list are added; old views and unmapped resources remain for the later cutover. `Shopping.md` is replaced in the rehearsal.

## Source fixes, not overrides

Anything the mapping and naming rules can't convert is a conversion error that blocks apply. Fix it in the source vault (for example, a missing bottle volume) or add a rule to the mapping and script; there is no per-note override file.

## Before cutover

The migration renames or retires about 90 notes, mostly where accents fold into plain filenames (Vieux Carré → `Vieux Carre.md`). As of 2026-11-04, 15 links outside `Cocktails/` point at them: 14 in daily notes and 1 in a template. Aliases don't make Obsidian resolve those links, so cutover must update them, either by renaming through Obsidian (which rewrites links) or by a link-only rewrite of those lines with the user's explicit approval, since daily notes are personal journal content.

## Live verification

Select the rehearsal cabinet in Cocktail Cabinet settings. Open its resource Bases, a category/family/type/bottle note, and Shopping list to check rendered results. Run **Log this cocktail** on several migrated recipes, review stock choices and mL deductions, and clear the daily-note toggle for rehearsal logging. Any inventory changes must stay inside the rehearsal folder. Verify the source vault remains unchanged before committing the implementation. Rehearsal does not authorize cutover.
