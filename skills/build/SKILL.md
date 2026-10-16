---
description: Build a System Atlas for this repository - a plain-English, code-verified map of every system (what it does, how it works, key files, jobs, switches, connections, rules, checks), drafted by parallel subagents, fact-checked by adversarial subagents, and guarded by a coverage check. Costs real tokens; run only when asked.
argument-hint: "[atlas folder, default docs/atlas]"
disable-model-invocation: true
---

# Build a System Atlas

You are building a System Atlas for the repository in the current working
directory. The atlas is `atlas.json` in an atlas folder (default `docs/atlas`;
use `$ARGUMENTS` if the user named one). It maps every file to a system and
describes each system in plain English. The bundled CLI checks that every file
is on the map and every name in it is real; it cannot check that the prose is
true, which is why drafting is followed by an adversarial fact-check.

In the steps below, `PLUGIN` is `${CLAUDE_PLUGIN_ROOT}` and `ATLAS` means
`node <atlas folder>/atlas.mjs` run from the repository root (for example
`node docs/atlas/atlas.mjs check`). Quote paths that contain spaces.

Work in this order. Do not skip the confirmation in step 3 or the fact-check
in step 6.

## 0. Preflight

1. Run `node --version`. The CLI needs Node 18 or newer. Stop and say so if it is missing.
2. Confirm the working directory is the repository root (`git rev-parse --show-toplevel`).
3. If `<atlas folder>/atlas.json` already exists, stop: this is an update, so
   tell the user to run `/system-atlas:update` instead (or confirm they want to
   rebuild from scratch).
4. Note the start time (`node -e "console.log(new Date().toISOString())"`). You
   report wall time and token use at the end.

## 1. Vendor the CLI and detect the stack

Run `node "PLUGIN/dist/atlas.mjs" init` (add `--dir <folder>` for a
non-default folder). It copies the CLI into the atlas folder as `atlas.mjs`
(committed with the project, so CI and teammates need no plugin), writes
`atlas.config.json`, `README.md` and a `.gitignore` for `.build/` and
`atlas.html`.

Open `atlas.config.json` and review it:
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

Run `ATLAS inventory` (add `--depth 3` for a deep tree). It prints every
folder's file and line counts and the instruction files: CLAUDE.md, AGENTS.md,
rule folders, README, CONTRIBUTING. Read the instruction files and the README.
Look at the entry points (main, the router, the CLI, the app shell). Do not
read every source file: that is the drafting agents' job.

Tell the user the size (files, lines) and the cost estimate before going
further: see "Cost" at the end of this file. If they have not already agreed
to the cost, ask now.

## 3. Propose the systems, and get them confirmed

A system is one responsibility a person would name ("checkout", "audio
capture", "plugin loading", "release packaging"). Aim for roughly one system
per 5 to 40 files of real code, 6 to 30 systems in all, in 3 to 7 groups.
Every file must belong to at least one system; a shared file may belong to
several. Tests, CI, build config, docs and assets belong to systems too
(often a "tooling" or "docs and site" system).

Write the skeleton `atlas.json`:
- `title` ("<Project> System Atlas"), `groups` (`id`, `name`, `blurb`).
- One entry per system with EVERY field: `id`, `group`, `name`, `owns`
  (globs), and `"TODO"` for `oneLiner` and `summary`; `[]` for `journey`,
  `keyFiles`, `jobs`, `switches`, `connects`, `watchOuts`; and `models`,
  `rules`, `checks` filled where the add-ons make them obvious (else `[]`).
- `flows: []`, `glossary: []`.

Glob syntax: `*` stays in one folder, `**` crosses folders (`**/` also matches
none), `?` is one character, `{a,b}` is either; everything else is literal.
Prefer folder globs; list single files only at the root.

Run `ATLAS inventory --unowned` until it reports 0 unowned files and no dead
globs.

Then show the user the proposal as one compact table (group, system id, what
it covers in a few words, file count) and ask them to confirm or change it.
Also ask who the main reader is (default: "a developer new to the repo, and
the project's owner"). Use AskUserQuestion when you have it. If you cannot ask
interactively, end your turn with the table and the question, and continue
when the user replies. Do not start drafting before the user confirms.

## 4. Draft (parallel subagents)

Split the systems into batches of 3 to 5, keeping connected systems together;
use at most 7 batches. Read `PLUGIN/skills/build/reference/drafting-prompt.md`
and `PLUGIN/skills/build/reference/fields.md`. For each batch, fill the prompt:
- `{{INSTRUCTION_FILES}}`: name the instruction and rule files relevant to that
  batch explicitly. Subagents do not load the project's rules on their own.
- `{{CLI}}`: the vendored CLI path; `{{ATLAS_JSON}}`: the atlas path;
  `{{OUT}}`: `<atlas folder>/.build/draft-<n>.json`;
  `{{STACK_HINTS}}`: a sentence on where things live in this stack (for example
  "Rust commands in src-tauri/src are called from the React UI through invoke()").
- `{{FIELDS}}`: paste fields.md verbatim.

Launch every batch's general-purpose subagent in ONE message so they run in
parallel. Record each agent's token usage from its result.

When all are done: `ATLAS merge <atlas folder>/.build/draft-*.json`. Act on
every note it prints: move a file between systems' `owns`, or drop the note.

## 5. The big picture

Write the top level yourself, from the index (`ATLAS`) and the entries
(`ATLAS <id>`), not by reading atlas.json whole:
- `about`: one or two sentences on what the project is.
- `overview`: three to five sentences on how the systems fit together.
- `flows`: two to four end-to-end paths (`name`, `steps` of `{ system, text }`),
  each three to eight steps, every step naming a system.
- The glossary: drop duplicates and terms nobody needs; keep the rest short.
Write these with a small JSON file merged the same way
(`ATLAS merge <atlas folder>/.build/top.json`; it accepts `about`, `overview`,
`title`, `flows` and `glossary`).

## 6. Adversarial fact-check (parallel subagents)

Use 2 or 3 fact-checkers (1 or 2 for fewer than 10 systems). Partition the
systems so that no agent checks a batch it drafted. Fill
`PLUGIN/skills/build/reference/factcheck-prompt.md` the same way (`{{SCOPE}}`
stays empty on a first build; `{{OUT}}` is
`<atlas folder>/.build/fix-<n>.json`) and launch all of them in ONE message.

Then `ATLAS merge <atlas folder>/.build/fix-*.json`. It prints how many fields
changed and the findings by severity: that count is the measure of what the
fact-check caught. A finding is a report, not proof: open the cited
`path:line` for at least three WRONG findings (all of them when there are ten
or fewer) and revert any that does not hold.

## 7. Check until green

Run `ATLAS check` and fix every failure: an unowned file goes into a system's
`owns`; a switch the check cannot find gets its exact identifier or is
dropped; an entry over the size ratchet gets shorter prose (never raise
`entryMaxChars` to fit). Repeat until it passes.

## 8. Wire it in (ask the user)

Ask the user two questions, then do what they choose. The templates are in
`PLUGIN/skills/build/reference/wiring.md`.
1. How should Claude sessions find the atlas? A block in CLAUDE.md
   (recommended when the project has one), a project skill in
   `.claude/skills/system-atlas/`, or nothing.
2. Where should the check run? A GitHub Actions workflow, a package.json
   script, both, or nowhere. Anything you add is itself a file and a job or
   check: claim it in the atlas and re-run `ATLAS check`.

Then run `ATLAS render` (it writes `<atlas folder>/atlas.html`; tell the user
to open it) and `ATLAS stamp` (it records the commit the prose was verified
against, which `/system-atlas:update` starts from). Do not commit unless the
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
  re-read by hand or with `/system-atlas:update`.

## Cost

Each drafting agent reads its systems' code and instruction files, and each
fact-checker reads it again. Measured builds:

| Repository | Files mapped | Systems | Subagents | Subagent tokens | Wall time |
|---|---|---|---|---|---|
| (filled in from the test builds) | | | | | |

As a rule of thumb, expect subagent tokens of roughly 2 to 3 times the
repository's total lines of text, times 1,000 tokens per 100 lines read, and
plan for the main session to add a further 10 to 20 percent.
