# Cocktail Cabinet

## Project purpose and workspace

Turn the cocktail workflows already implemented as skills, scripts, and templates in the `knowledge` vault into an Obsidian community plugin. Use those workflows as the starting reference when designing plugin features.

- Chosen identity: display name **Cocktail Cabinet**, plugin ID `cocktail-cabinet`, repository `obsidian-cocktail-cabinet`. The repository is intended to remain private for now; publication is a later decision.
- This repository is also the intended home for the supporting cocktail scripts as they are migrated from the vault.
- Before planning ingredient resolution, logging, imports, or agent integration, read [the workflow assessment](docs/workflow-assessment.md) for existing behavior, known gaps, and proposed architecture. Its recommendations are proposals, not an approved implementation scope.
- Before changing cabinet setup, hierarchy, or note schemas, read [the cabinet design](docs/cabinet-design.md) for agreed behavior and the current implementation choices. Use [the glossary](GLOSSARY.md) for domain terms.

This project spans three workspace folders:

| Folder | Role | Local path |
| --- | --- | --- |
| `obsidian-cocktail-cabinet` | Plugin source, build tooling, and project guidance | `/Users/jrduncans/workspace/personal/obsidian-cocktail-cabinet` |
| `knowledge` | Personal vault containing the existing cocktail workflows and real data | `/Users/jrduncans/Library/Mobile Documents/iCloud~md~obsidian/Documents/knowledge` |
| `Cocktail Cabinet Dev` | Vault for plugin development and testing | `/Users/jrduncans/Library/Mobile Documents/iCloud~md~obsidian/Documents/Cocktail Cabinet Dev` |

- Run plugin development commands from the repository. Use absolute paths when working across workspace folders.
- Keep shared project context here. Before working in another folder, read its applicable `AGENTS.md`; this repository's instructions do not automatically govern sibling vaults.
- Use `knowledge` as reference material and `Cocktail Cabinet Dev` for plugin experiments. Make changes to the personal vault only when the task calls for them; use synthetic or deliberately selected data for test fixtures.
- When porting a workflow, inspect the relevant sources under `knowledge`: `.agents/skills/cocktail-inventory-query/`, `.agents/skills/cocktail-inventory-update/`, `.agents/skills/cocktail-recipe-import/`, `Templates/Cocktails/`, and `Cocktails/Views/`. Each skill's `SKILL.md` describes its workflow and supporting scripts. `Cocktails/` also contains the note schema, taxonomy, and Bases views the plugin must account for.

## Local development setup

- The dev vault's `.obsidian/plugins/cocktail-cabinet` is a symlink to this repository. Builds in the repository therefore supply the plugin files directly to that vault; a separate copy step is unnecessary for this setup.
- Plugin settings written to `data.json` also land in the repository through that symlink. Keep that local state ignored by Git.
- The Hot Reload community plugin is installed in `Cocktail Cabinet Dev` to support development reloads.


## Development conventions

- Use Node.js 20+, npm, TypeScript, and esbuild. Run development commands from this repository; see `package.json` for scripts.
- Before finishing code changes, run `npm test`, `npm run build`, and `npm run lint`. After changing the starter catalog, run `npm run catalog:docs`; tests check the generated hierarchy for drift.
- Keep `src/main.ts` focused on plugin lifecycle and registration. Put feature logic in focused modules; consider splitting files beyond 200–300 lines. Keep pure cocktail logic separate from Obsidian I/O.
- Use browser-compatible APIs and small dependencies. The plugin supports mobile; keep `minAppVersion` accurate for APIs in use.
- Register commands with stable IDs. Persist settings with `loadData()` / `saveData()` and keep collection data in vault notes and core Bases.
- Setup creates missing files and preserves existing notes and customized Bases. Keep unknown quantities distinct from zero and validate creation inputs.
- Keep startup light, defer vault scans until needed, and use `register*` helpers for listeners and intervals.
- Use sentence case and short, action-oriented UI labels. Prefer “select”; use **Settings → Community plugins** notation in instructions.

## Privacy and releases

- Keep runtime operations local to the selected vault. No telemetry or network services without an explicit feature need, opt-in, and documentation. Follow Obsidian's developer policies and plugin guidelines.
- Keep `node_modules/`, `main.js`, and local `data.json` out of Git. Release artifacts are `main.js`, `manifest.json`, and optional `styles.css` at the plugin root.
- Use `0.x` during early development. Keep `package.json`, `manifest.json`, and `versions.json` aligned; pin the Obsidian development dependency.
- Publication remains a separate decision. When releasing, use the manifest version as the tag without a leading `v`, and attach the release artifacts individually.
