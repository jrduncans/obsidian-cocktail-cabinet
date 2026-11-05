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

## Explicit decisions

Some source notes may need decisions the mapping does not cover, such as a positive remaining fraction without bottle volume, an unsupported filename, or a collision after folding accents. The script reports these and does not infer a solution. Provide approved decisions in a private JSON file with `--decisions '/private/path/decisions.json'`:

```json
{
  "filenames": {
    "Cocktails/Recipes/Example #2.md": "Example No 2"
  },
  "volumes": {
    "Cocktails/Bottles/Example bottle.md": 500
  }
}
```

Keys are exact source-vault-relative paths. Filename values are plain Latin names without the `.md` extension. They change the filename, retaining the original name in `cc-name`, the heading, and aliases. Volumes are positive mL values used only for the converted copy. Each override is listed in the report; stale paths and unknown decision keys are errors. Keep private decisions outside the repository and use the same file for dry run and apply.

## Live verification

Select the rehearsal cabinet in Cocktail Cabinet settings. Open its resource Bases, a category/family/type/bottle note, and Shopping list to check rendered results. Run **Log this cocktail** on several migrated recipes, review stock choices and mL deductions, and clear the daily-note toggle for rehearsal logging. Any inventory changes must stay inside the rehearsal folder. Verify the source vault remains unchanged before committing the implementation. Rehearsal does not authorize cutover.
