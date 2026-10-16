---
description: Update this repository's System Atlas after code changes - finds the systems whose files changed since the atlas was last verified, re-checks those entries against the code, places new files, and re-runs the coverage check. Run only when asked.
argument-hint: "[commit to compare against; default: the atlas's verified commit]"
disable-model-invocation: true
---

# Update the System Atlas

The atlas is `atlas.json` in the atlas folder (default `docs/atlas`, the
folder holding `atlas.config.json`). `ATLAS` below means
`node <atlas folder>/atlas.mjs`, run from the repository root, and `PLUGIN` is
`${CLAUDE_PLUGIN_ROOT}`. If there is no atlas folder, stop and point the user
to `/system-atlas:build`.

Note the start time first; you report wall time and token use at the end.

## 1. Keep the vendored CLI current

Compare `ATLAS --version` with `node "PLUGIN/dist/atlas.mjs" --version`, and
the two files themselves (`git diff --no-index --stat <atlas folder>/atlas.mjs
"PLUGIN/dist/atlas.mjs"`). If the plugin's copy is newer or different, tell
the user and, with their yes, copy `PLUGIN/dist/atlas.mjs` over
`<atlas folder>/atlas.mjs`, then run `ATLAS check` (a newer check can find
more).

## 2. What changed

Run `ATLAS changed $ARGUMENTS`. With no argument it starts from the commit the
atlas was last verified against (`verified.commit`, written by `ATLAS stamp`),
else from the last commit that touched atlas.json. It lists, per system, the
files added (A), modified (M) and deleted (D) since then, including
uncommitted and untracked ones; the new files no system owns yet; and deleted
files the atlas still names as key files.

Then run `ATLAS check` to see what the map itself is missing.

## 3. Re-check the affected entries

For each listed system, the question is: which sentences in its entry did
these changes make untrue, incomplete or stale?

- **Four or fewer systems:** do it here. For each one, print the entry
  (`ATLAS <id>`), read `git diff <commit> -- <its changed files>` and the
  changed code, and correct the entry: an edit to that one entry in
  atlas.json, or a small JSON file merged with
  `ATLAS merge <atlas folder>/.build/update.json` (the id plus only the fields
  you change, each in full).
- **More than four:** fan out. Fill
  `PLUGIN/skills/build/reference/factcheck-prompt.md` (paste
  `PLUGIN/skills/build/reference/fields.md` where it says `{{FIELDS}}`) for
  batches of 3 to 5 systems, setting `{{SCOPE}}` to: " These files changed
  since <commit>: <the list for the batch>. Read `git diff <commit> -- <file>`
  for each first; the entry must describe the code as it is now." Name the
  instruction files each batch needs. Launch them all in ONE message, then
  `ATLAS merge <atlas folder>/.build/fix-*.json`. Spot-check at least three
  WRONG findings against the cited lines before accepting them.

## 4. Fix the map

- A new file goes into the `owns` of the system it belongs to. If it starts a
  new responsibility, propose a new system to the user before adding it.
- A deleted file comes out of `keyFiles`; a glob that now matches nothing
  comes out of `owns`.
- New jobs, switches, data models, scripts and rule files get claimed (the
  check names each one).

Run `ATLAS check` until it passes, then `ATLAS render`, then `ATLAS stamp`.
Do not commit unless the user asks.

## 5. Report

Briefly: the systems re-checked, the fields changed (the merge prints the
count), any code issues found on the way (for the user to triage, not fixed
unasked), wall time and subagent tokens. Remind the user that the check
covers the map and the names, not the prose: entries of systems whose code
changed without a file being added or removed are only as fresh as this
re-check.
