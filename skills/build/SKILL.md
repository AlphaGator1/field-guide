---
description: Build a Field Guide for this repository - a plain-English, code-verified map of every system (what it does, how it works, key files, jobs, switches, connections, rules, checks), drafted by parallel subagents, fact-checked by adversarial subagents, and guarded by a coverage check. Costs real tokens; run only when asked.
argument-hint: "[guide folder, default docs/field-guide]"
disable-model-invocation: true
---

# Build a Field Guide

You are building a Field Guide for the repository in the current working
directory. The guide is `guide.json` in a guide folder (default `docs/field-guide`;
use `$ARGUMENTS` if the user named one). It maps every file to a system and
describes each system in plain English. The bundled CLI checks that every file
is on the map and every name in it is real; it cannot check that the prose is
true, which is why drafting is followed by an adversarial fact-check.

In the steps below, `PLUGIN` is `${CLAUDE_PLUGIN_ROOT}` and `GUIDE` means
`node <guide folder>/guide.mjs` run from the repository root (for example
`node docs/field-guide/guide.mjs check`). Quote paths that contain spaces.

Work in this order. Do not skip the confirmation in step 3 or the fact-check
in step 6.

## 0. Preflight

1. Run `node --version`. The CLI needs Node 18 or newer. Stop and say so if it is missing.
2. Confirm the working directory is the repository root (`git rev-parse --show-toplevel`).
3. If `<guide folder>/guide.json` already exists, stop: this is an update, so
   tell the user to run `/field-guide:update` instead (or confirm they want to
   rebuild from scratch).
4. Note the start time (`node -e "console.log(new Date().toISOString())"`). You
   report wall time and token use at the end.
5. Name this run's work folder `RUN` = `<guide folder>/.build/<YYYYMMDD-HHMM>/`
   from that time. Every agent writes there and every merge reads that folder
   only: `.build/` survives between sessions (it is gitignored), and merging an
   older run's files would silently undo newer text.

## 1. Vendor the CLI and detect the stack

Run `node "PLUGIN/dist/guide.mjs" init` (add `--dir <folder>` for a
non-default folder). It copies the CLI into the guide folder as `guide.mjs`
(committed with the project, so CI and teammates need no plugin), writes
`guide.config.json`, `README.md` and a `.gitignore` for `.build/` and
`guide.html`.

Open `guide.config.json` and review it:
- `include` / `exclude`: by default every tracked file must be on the map.
  Keep it that way unless a tree is not the project's own code (vendored
  third-party sources, generated output that is committed); exclude those and
  tell the user. Lockfiles, icons and config files stay in: a tooling system
  owns them with one glob.
- `addons`: `init` detected them. Each makes the check claim one more kind of
  thing: `models` (data models; presets prisma, sql, django, sqlalchemy, or
  your own `pattern` with one capture group), `packageScripts`,
  `githubWorkflows`, `vercelCrons`, `rules` (a folder of rule files). Add one
  the project needs, remove one that does not fit.
- `stats`: optional extra counts for the rendered page, such as
  `{ "label": "API routes", "glob": "src/app/api/**/route.ts" }`.

## 2. Inventory

Run `GUIDE inventory` (add `--depth 3` for a deep tree). It prints every
folder's file and line counts and the instruction files: CLAUDE.md, AGENTS.md,
rule folders, README, CONTRIBUTING. Read the instruction files and the README.
Look at the entry points (main, the router, the CLI, the app shell). Do not
read every source file: that is the drafting agents' job.

Tell the user the size (files, lines) and the cost estimate before going
further: see "Cost" at the end of this file. If they have not already agreed
to the cost, ask now. If they decline, offer to delete what `init` wrote (the
guide folder's `guide.mjs`, `guide.config.json`, `README.md`, `.gitignore`).

The guide folder must be a subfolder of the repository (the CLI refuses the
root), and `guide.json` is machine-written: if the project runs a formatter
over JSON, add the guide folder to its ignore file (for example
`.prettierignore`), or every merge will look like a reformat.

## 3. Propose the systems, and get them confirmed

A system is one responsibility a person would name ("checkout", "audio
capture", "plugin loading", "release packaging"). Aim for roughly one system
per 5 to 40 files of real code, 6 to 30 systems in all, in 3 to 7 groups.
Every file must belong to at least one system; a shared file may belong to
several. Tests, CI, build config, docs and assets belong to systems too
(often a "tooling" or "docs and site" system).

Write the skeleton `guide.json`:
- `title` ("<Project> Field Guide"), `groups` (`id`, `name`, `blurb`).
- One entry per system with EVERY field: `id`, `group`, `name`, `owns`
  (globs), and `"TODO"` for `oneLiner` and `summary`; `[]` for `journey`,
  `keyFiles`, `jobs`, `switches`, `connects`, `watchOuts`; and `models`,
  `rules`, `checks` filled where the add-ons make them obvious (else `[]`).
- `flows: []`, `glossary: []`.

Glob syntax: `*` stays in one folder, `**` crosses folders (`**/` also matches
none), `?` is one character, `{a,b}` is either; everything else is literal.
Prefer folder globs; list single files only at the root.

Run `GUIDE inventory --unowned` until it reports 0 unowned files and no dead
globs. The file list includes files git does not track yet. A real new file
gets claimed; a scratch file (notes, a local dump) must be deleted or
gitignored, never claimed: its glob would match nothing in a clean clone and
fail the check in CI.

Then show the user the proposal as one compact table (group, system id, what
it covers in a few words, file count) and ask them to confirm or change it.
Also ask who the main reader is (default: "a developer new to the repo, and
the project's owner"). Use AskUserQuestion when you have it. If you cannot ask
interactively, end your turn with the table and the question, and continue
when the user replies. Do not start drafting before the user confirms.

## 4. Draft (parallel subagents)

Split the systems into batches of 3 to 5, keeping connected systems together;
use at most 7 batches. Read `PLUGIN/skills/build/reference/drafting-prompt.md`
and `PLUGIN/skills/build/reference/fields.md`. For each batch, fill every
placeholder (use absolute paths: subagents may run from another folder):
- `{{PROJECT}}`: the project's name; `{{ONE_LINE}}`: what it is, in one line;
  `{{ROOT}}`: the repository root; `{{READER}}`: the main reader the user named.
- `{{IDS}}`: this batch's system ids; `{{ALL_IDS}}`: every system id.
- `{{PREASSIGNED}}`: what the skeleton already fills for this batch, as a
  clause (", plus pre-assigned `checks` for x and y"), or nothing; and any
  add-on duty (for example "claim every package.json script as a job").
- `{{INSTRUCTION_FILES}}`: name the instruction and rule files relevant to that
  batch explicitly, with the sections that matter for a very long one.
  Subagents do not load the project's rules on their own.
- `{{CLI}}`: the vendored CLI's path; `{{GUIDE_JSON}}`: guide.json's path;
  `{{OUT}}`: `RUN/draft-<n>.json`;
  `{{STACK_HINTS}}`: a sentence on where things live in this stack (for example
  "Rust commands in src-tauri/src are called from the React UI through invoke()").
- `{{FIELDS}}`: paste fields.md verbatim.

Launch every batch's general-purpose subagent in ONE message so they run in
parallel. Record each agent's token usage from its result.

When all are done: `GUIDE merge RUN` (a folder argument merges its .json files
in name order; never pass a shell wildcard, which PowerShell does not expand).
Act on every note it prints: move a file between systems' `owns`, or drop the
note.

## 5. The big picture

Write the top level yourself, from the index (`GUIDE`) and the entries
(`GUIDE <id>`), not by reading guide.json whole:
- `about`: one or two sentences on what the project is.
- `overview`: three to five sentences on how the systems fit together.
- `flows`: two to four end-to-end paths (`name`, `steps` of `{ system, text }`),
  each three to eight steps, every step naming a system.
- The glossary: drop duplicates and terms nobody needs; keep the rest short.
Write these as `RUN/top.json` and merge just that file
(`GUIDE merge RUN/top.json`). It accepts `about`, `overview`, `title`, `flows`,
`glossary`, and `remove: { "glossary": [terms], "flows": [names] }` to delete
a duplicate term or a renamed flow.

## 6. Adversarial fact-check (parallel subagents)

Use 2 or 3 fact-checkers (1 or 2 for fewer than 10 systems). Partition the
systems so that no agent checks a batch it drafted. Fill
`PLUGIN/skills/build/reference/factcheck-prompt.md` the same way (`{{SCOPE}}`
stays empty on a first build; `{{OUT}}` is
`RUN/fix/fix-<n>.json`; for ONE of the agents, `{{TOP_LEVEL}}` asks it
to check `about`, `overview` and the flows too, printed by `GUIDE overview`, and to
put a corrected top-level `flows`, `about` or `overview` in its output; for the
others it stays empty) and launch all of them in ONE message.

Then `GUIDE merge RUN/fix`. It prints how many fields
changed and the findings by severity: that count is the measure of what the
fact-check caught. A finding is a report, not proof: open the cited
`path:line` for at least three WRONG findings (all of them when there are ten
or fewer) and revert any that does not hold.

## 7. Check until green

Run `GUIDE check` and fix every failure: an unowned file goes into a system's
`owns` (or, if the check lists it as not yet in git and it is scratch, gets
deleted or gitignored); a switch the check cannot find in the code gets its
exact identifier, or moves into the prose if only a dependency or the docs
read it; an entry over the size ratchet gets shorter prose (never raise
`entryMaxChars` to fit). Repeat until it passes.

## 8. Wire it in (ask the user)

Ask the user two questions, then do what they choose. The templates are in
`PLUGIN/skills/build/reference/wiring.md`.
1. How should Claude sessions find the guide? A block in CLAUDE.md
   (recommended: it is the wiring that was measured), the compact 3-line
   block, a project skill in `.claude/skills/field-guide/` (unmeasured; for a
   project with no CLAUDE.md or AGENTS.md), or nothing. Before appending a
   block, tell the user how many lines and bytes it adds once `{{DIR}}` is
   replaced, and ask whether their CLAUDE.md is held to a size limit; if it
   is, offer the compact block.
2. Where should the check run? A GitHub Actions workflow, a package.json
   script, both, or nowhere. Anything you add is itself a file and a job or
   check: claim it in the guide and re-run `GUIDE check`.

Then run `GUIDE render` (it writes `<guide folder>/guide.html`; tell the user
to open it) and `GUIDE stamp` (it records the commit the prose was verified
against, which `/field-guide:update` starts from). Do not commit unless the
user asks.

## 9. Report

Tell the user, briefly:
- systems, groups and files mapped, and that the check passes;
- what the fact-check changed: fields changed, systems touched, findings by severity;
- code issues the agents raised (likely bugs, stale comments, rule/code
  contradictions), as a list for the user to triage. Do not fix them unasked;
- cost: wall time from start to finish, the number of subagents, and the sum
  of their reported tokens;
- the limit: the check proves every file is on the map and every name is real;
  it does not prove the prose. When a system's behaviour changes, its entry is
  re-read by hand or with `/field-guide:update`.

## Cost

Each drafting agent reads its systems' code and instruction files, and each
fact-checker reads it again. Measured builds:

| Repository | Files mapped | Lines (inventory) | Systems | Subagents | Subagent tokens | Wall time |
|---|---|---|---|---|---|---|
| ParaFlow (Rust + React, Tauri) | 59 | ~17k | 13 | 6 | 1,381,950 | 21 min |
| httpie/cli (Python) | 267 | ~28k | 18 | 8 | 2,219,440 | 26 min |

Estimate before asking for the go-ahead: about **80 subagent tokens per line**
that `GUIDE inventory` reports (both builds landed within a few percent of
it), or 100 to 125k per system. The main session adds its own share on top.
Tell the user the estimate in tokens, and that most are cached re-reads whose
price depends on their plan.
