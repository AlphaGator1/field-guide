Templates for step 8. Replace {{DIR}} with the guide folder (default docs/field-guide).

## A. CLAUDE.md block (append to the project's CLAUDE.md, or AGENTS.md)

```markdown
## Field Guide

`{{DIR}}/guide.json` maps every system in this repo: what it does, how it
works, its key files, jobs, switches, connections, rules and checks. Before
you answer a question about a system or change its code, print ONE entry;
never Read guide.json whole (it is large):
- `node {{DIR}}/guide.mjs` lists every system; `node {{DIR}}/guide.mjs <id>` prints one;
- `node {{DIR}}/guide.mjs <path>` names a file's owner; `node {{DIR}}/guide.mjs --search <words>` searches entries, flows and the glossary.

Keep it current in the same change. Before you finish, run
`node {{DIR}}/guide.mjs changed HEAD` (or `changed <commit>` for work already
committed): it lists the systems your changes touch. Fix the sentences in
their entries that the change made untrue, put any new file in a system's
`owns`, and run `node {{DIR}}/guide.mjs check`, which keeps every file on the
map but cannot check the prose.
```

## A2. Compact CLAUDE.md block (for a CLAUDE.md held to a size budget)

Three lines; keep each on one line.

```markdown
## Field Guide
Before you answer a question about a system or change its code, print ONE entry from the map: `node {{DIR}}/guide.mjs <id | path | --search words>` (no argument lists every system). Never Read `{{DIR}}/guide.json` whole (it is large).
Before you finish a change, run `node {{DIR}}/guide.mjs changed HEAD` and fix the entries of the systems it lists in the same change; `node {{DIR}}/guide.mjs check` must pass.
```

## B. Project skill: `.claude/skills/field-guide/SKILL.md`

Not yet measured against A. A pointer outside CLAUDE.md is easy for sessions
to miss, so offer this when the project has no CLAUDE.md or AGENTS.md.

```markdown
---
name: field-guide
description: Use before answering a question about this repo's code, or opening, planning or changing it. Prints one system's plain-English entry (what it does, how it works, key files, jobs, switches, rules, checks) from the Field Guide, or names the system that owns a file.
---

`{{DIR}}/guide.json` maps every system in this repo. Never Read it whole (it
is large); print one entry:

- `node {{DIR}}/guide.mjs`: every system, one line each
- `node {{DIR}}/guide.mjs <id>`: one system in full
- `node {{DIR}}/guide.mjs <path>`: the system that owns a file, and its entry
- `node {{DIR}}/guide.mjs --search <words>`: everything that mentions them (entries, flows, overview, glossary)

Keep it current in the same change. Before you finish, run
`node {{DIR}}/guide.mjs changed HEAD` (or `changed <commit>` for work already
committed): it lists the systems your changes touch. Re-read their entries
and fix the sentences that moved, put any new file in a system's `owns`, and
run `node {{DIR}}/guide.mjs check`, which keeps every file on the map but
cannot check the prose.
```

## C. GitHub Actions workflow: `.github/workflows/guide.yml`

```yaml
name: Field Guide
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node {{DIR}}/guide.mjs check
```

After adding it, claim it in the guide: add `.github/workflows/guide.yml` to
the owns of the system that holds the project's tooling, and add the job
`{ "name": "Field Guide check", "kind": "github-action", "ref": ".github/workflows/guide.yml", "when": "every push and pull request", "what": "Fails when a file is off the map or a name the guide uses is gone." }`.

## D. package.json script

`"check:guide": "node {{DIR}}/guide.mjs check"`. With the packageScripts
add-on, list `check:guide` in the tooling system's `checks`.
