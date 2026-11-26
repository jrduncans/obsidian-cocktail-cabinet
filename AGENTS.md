# Cocktail Cabinet

## Project purpose

An Obsidian community plugin for cocktail recipes and bottle inventory, kept as ordinary Markdown notes and core Bases. It began as a replacement for the cocktail skills, scripts, and templates in the author's own vault, `knowledge`, which is still its main real-world cabinet.

- Identity: display name **Cocktail Cabinet**, plugin ID `cocktail-cabinet`, repository `obsidian-cocktail-cabinet`. The repository is public and the plugin is in beta.
- Before changing cabinet setup, hierarchy, note schemas, recipe creation, or ingredient resolution, read [the cabinet design](docs/cabinet-design.md) for agreed behavior, the collection-coherence goal, and current implementation choices. Use [the glossary](GLOSSARY.md) for domain terms. [docs/README.md](docs/README.md) lists the other references and design records.
- When choosing what to work on next, consult [the development roadmap](docs/roadmap.md) for workflow status. It is a plan, not approved scope.

## Workspace

If `AGENTS.local.md` exists (it is ignored by Git), read it: it lists this machine's vaults and their paths. The author works across three folders: this repository, the personal `knowledge` vault, and a `Cocktail Cabinet Dev` vault for experiments.

- Run plugin development commands from the repository. Use absolute paths when working across workspace folders.
- Before working in another folder, read its applicable `AGENTS.md`; this repository's instructions do not automatically govern sibling vaults.
- Use the dev vault for plugin experiments. Make changes to a personal vault only when the task calls for them; use synthetic or deliberately selected data for test fixtures, never personal notes.
- Keep personal details (names, paths, inventory, and journal content from a personal vault) out of committed files. Design records may cite measurements and examples from it.

## Local development setup

- The dev vault's `.obsidian/plugins/cocktail-cabinet` is a symlink to this repository. Builds in the repository therefore supply the plugin files directly to that vault; a separate copy step is unnecessary for this setup.
- Plugin settings written to `data.json` also land in the repository through that symlink. Keep that local state ignored by Git.
- The Hot Reload community plugin is installed in `Cocktail Cabinet Dev` to support development reloads.
- Real vaults get a copy, not a symlink, so it syncs to mobile and only merged work reaches them: `npm run install:vault -- --vault PATH` from a clean `main`. Run it only when the user asks to install or update.

## Development conventions

- Use Node.js 20+, npm, TypeScript, and esbuild. Run development commands from this repository; see `package.json` for scripts.
- Before finishing code changes, run `npm test`, `npm run build`, and `npm run lint`. The hk pre-commit hook (`hk.pkl`) runs eslint, prettier, `tsc`, and `npm test` on commits touching code, and CI (`.github/workflows/lint.yml`) runs build, tests, and lint on pushes to `main`. After changing the starter catalog, run `npm run catalog:docs`; tests check the generated hierarchy for drift.
- Keep `src/main.ts` focused on plugin lifecycle and registration. Put feature logic in focused modules; consider splitting files beyond 200–300 lines. Keep pure cocktail logic separate from Obsidian I/O.
- Use browser-compatible APIs and small dependencies. The plugin supports mobile; keep `minAppVersion` accurate for APIs in use.
- Don't hide or disable features by platform. "Desktop first" in the docs sets testing and layout priority; it doesn't mean gating with `Platform.isMobile`. A rough mobile layout is acceptable, because the feature has to appear on mobile for its issues to be found.
- Register commands with stable IDs. Persist settings with `loadData()` / `saveData()` and keep collection data in vault notes and core Bases.
- Setup creates missing files and preserves existing notes. The Bases in `<root>/Views/` belong to the plugin and are rewritten when their generated content changes; users keep their own in `<root>/Custom views/`. Blank stock amounts mean zero; validate creation inputs.
- Keep startup light, defer vault scans until needed, and use `register*` helpers for listeners and intervals.
- Use sentence case and short, action-oriented UI labels. Prefer “select”; use **Settings → Community plugins** notation in instructions.

## Privacy and releases

- Keep runtime operations local to the selected vault. No telemetry or network services without an explicit feature need, opt-in, and documentation. Follow Obsidian's developer policies and plugin guidelines.
- Keep `node_modules/`, `main.js`, and local `data.json` out of Git. Release artifacts are `main.js`, `manifest.json`, and optional `styles.css` at the plugin root.
- Use `0.x` during early development. Keep `package.json`, `manifest.json`, and `versions.json` aligned; pin the Obsidian development dependency.
- Releases are published from tags by `.github/workflows/release.yml` as drafts; publishing a release and submitting to the community catalog are confirmed with the author each time. When releasing, use the manifest version as the tag without a leading `v`, and attach the release artifacts individually.
