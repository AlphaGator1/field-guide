---
description: Update this repository's System Atlas after code changes - finds the systems whose files changed since the atlas was last verified, re-checks those entries against the code, places new files, and re-runs the coverage check. Run only when asked.
argument-hint: "[commit to compare against] [--dir <atlas folder>]"
disable-model-invocation: true
---

# Update the System Atlas

The atlas is `atlas.json` in the atlas folder: the folder holding
`atlas.config.json`, `docs/atlas` unless `$ARGUMENTS` names another with
`--dir <folder>`. `ATLAS` below means `node <atlas folder>/atlas.mjs`, run
from the repository root, and `PLUGIN` is `${CLAUDE_PLUGIN_ROOT}`. A commit in
`$ARGUMENTS` is the starting point for step 2. If there is no atlas folder,
stop and point the user to `/system-atlas:build`.

Note the start time first; you report wall time and token use at the end.
Name this run's work folder `RUN` = `<atlas folder>/.build/<YYYYMMDD-HHMM>/`
from that time: every file you or an agent writes goes there, and every merge
reads that folder only, because older runs' files stay in `.build/` and
merging one would silently undo newer text.

## 1. Keep the vendored CLI current

Compare `ATLAS --version` with `node "PLUGIN/dist/atlas.mjs" --version`, and
the two files themselves (`git diff --no-index --stat <atlas folder>/atlas.mjs
"PLUGIN/dist/atlas.mjs"`). If the plugin's copy is newer or different, tell
the user and, with their yes, copy `PLUGIN/dist/atlas.mjs` over
`<atlas folder>/atlas.mjs`, then run `ATLAS check` (a newer check can find
more).

## 2. What changed

Run `ATLAS changed [<commit>]`. With no commit it starts from the commit the
atlas was last verified against (`verified.commit`, written by `ATLAS stamp`),
else from the last commit that touched atlas.json; if the verified commit is
not in this clone (a shallow clone, a rewritten branch) it says so and falls
back. It lists, per system, the files added (A), modified (M) and deleted (D)
since then, including uncommitted and untracked ones; the new files no system
owns yet; and deleted files the atlas still names as key files.

Then run `ATLAS check` to see what the map itself is missing.

## 3. Re-check the affected entries

For each listed system, the question is: which sentences in its entry did
these changes make untrue, incomplete or stale?

`changed` maps files to their OWNERS, but other systems' entries, the flows,
the overview and the glossary often repeat a fact (a default, a limit, a flag
name, a file name). So for every value the diff changes or removes, search the
atlas for the OLD value too: `ATLAS --search <old value>` reads every entry
field, the flows, the overview and the glossary. (In testing, a default
changed in settings.rs was also stated in the pipeline's journey and the docs
system's watch-outs, neither of which owns settings.rs.)

- **Four or fewer systems:** do it here. For each one, print the entry
  (`ATLAS <id>`), read `git diff <commit> -- <its changed files>` and the
  changed code, and correct the entry: write `RUN/update.json` (each system's
  id plus only the fields you change, each in full) and run
  `ATLAS merge RUN/update.json`.
- **More than four:** fan out, but first tell the user how many systems
  changed and the estimate (about 100k subagent tokens per batch of 3 to 5
  systems) and get their go-ahead. Then fill
  `PLUGIN/skills/build/reference/factcheck-prompt.md` (every placeholder, as
  in the build skill's step 4; paste `PLUGIN/skills/build/reference/fields.md`
  where it says `{{FIELDS}}`; `{{TOP_LEVEL}}` empty unless a flow or the
  overview repeats a changed value) for batches of 3 to 5 systems, setting
  `{{OUT}}` to `RUN/fix/fix-<n>.json` and `{{SCOPE}}` to: " These files changed
  since <commit>: <the list for the batch>. Read `git diff <commit> -- <file>`
  for each first; the entry must describe the code as it is now." Name the
  instruction files each batch needs. Launch them all in ONE message, then
  `ATLAS merge RUN/fix`. Open the cited lines of at least three WRONG findings
  (all of them when there are ten or fewer) before accepting them.

## 4. Fix the map

- A new file goes into the `owns` of the system it belongs to. If it starts a
  new responsibility, propose a new system to the user before adding it. A
  scratch file the check lists as not yet in git is deleted or gitignored,
  never claimed.
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
