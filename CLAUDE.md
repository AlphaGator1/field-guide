# Field Guide: notes for Claude sessions

This repo is a Claude Code plugin (`.claude-plugin/`, `skills/`) plus the
dependency-free CLI that projects vendor (`dist/guide.mjs`, built from `src/`).
It maps itself: orient with `node dist/guide.mjs --dir docs/field-guide` (the
index), then `... <id>` for one system, instead of reading the code cold.

## Making a change

- Edit `src/` or `templates/`, then `npm run build`. `dist/guide.mjs` is
  committed because projects vendor it; never edit it by hand.
- `npm run check` must pass before every commit: typecheck, dist freshness,
  `test/run.mjs`, and this repo's own guide.
- A new `check` assertion needs a defect in `test/run.mjs` that turns its code
  red; the suite fails on any code no defect kills. A CLI-mutation anchor
  must occur exactly once in the bundle. To prove a new test is not vacuous,
  run it against the previous build: `GUIDE_CLI=<old dist/guide.mjs> node test/run.mjs`.
- The CLI and the check stay local: files and `git` only, no network.
- A file you add must be claimed in `docs/field-guide/guide.json`, and an
  entry whose behaviour you change gets its sentences fixed in the same commit.
- `examples/paraflow/` comes only from a real build at a stated ParaFlow
  commit; never hand-edit it.
- Skill changes: test with a local install (`claude plugin marketplace add
  <this folder>`, `claude plugin install field-guide@field-guide`, then a NEW
  session), and run `claude plugin validate .claude-plugin/plugin.json` and
  `claude plugin validate .`. Remove the local install afterwards.

## Releasing

Users receive a change only when the version changes. Bump `version` in
`package.json`, `.claude-plugin/plugin.json` and the plugin entry in
`.claude-plugin/marketplace.json` together, rebuild (the bundle's banner and
`--version` read `package.json`), run `npm run check`, then commit and push
`main`. Projects that vendored the CLI pick up the new one through
`/field-guide:update`.

## Public repo rules

- Never name a person in commits, files or messages: write "the owner".
- No secrets, keys, local paths or email addresses, here or in examples.
- Commit with `git commit -F <file>`; stage explicit paths, never `git add -A`.
