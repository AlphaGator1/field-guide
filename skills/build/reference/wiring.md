Templates for step 8. Replace {{DIR}} with the atlas folder (default docs/atlas).

## A. CLAUDE.md block (append to the project's CLAUDE.md, or AGENTS.md)

```markdown
## System Atlas

`{{DIR}}/atlas.json` maps every system in this repo: what it does, how it
works, its key files, jobs, switches, connections, rules and checks. Before
opening a system's code, print ONE entry; never Read atlas.json whole (it is
large):
- `node {{DIR}}/atlas.mjs` lists every system; `node {{DIR}}/atlas.mjs <id>` prints one;
- `node {{DIR}}/atlas.mjs <path>` names a file's owner; `node {{DIR}}/atlas.mjs --search <words>` searches entries, flows and the glossary.

`node {{DIR}}/atlas.mjs check` keeps every file on the map, not the prose:
when you change how a system works, fix its entry in the same change.
```

## B. Project skill: `.claude/skills/system-atlas/SKILL.md`

```markdown
---
name: system-atlas
description: Use before opening, planning or changing code in this repo. Prints one system's plain-English entry (what it does, how it works, key files, jobs, switches, rules, checks) from the System Atlas, or names the system that owns a file.
---

`{{DIR}}/atlas.json` maps every system in this repo. Never Read it whole (it
is large); print one entry:

- `node {{DIR}}/atlas.mjs`: every system, one line each
- `node {{DIR}}/atlas.mjs <id>`: one system in full
- `node {{DIR}}/atlas.mjs <path>`: the system that owns a file, and its entry
- `node {{DIR}}/atlas.mjs --search <words>`: everything that mentions them (entries, flows, overview, glossary)

`node {{DIR}}/atlas.mjs check` keeps every file on the map, not the prose.
When you change how a system works, re-read its entry and fix the sentences
that moved, in the same change.
```

## C. GitHub Actions workflow: `.github/workflows/atlas.yml`

```yaml
name: System Atlas
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
      - run: node {{DIR}}/atlas.mjs check
```

After adding it, claim it in the atlas: add `.github/workflows/atlas.yml` to
the owns of the system that holds the project's tooling, and add the job
`{ "name": "System Atlas check", "kind": "github-action", "ref": ".github/workflows/atlas.yml", "when": "every push and pull request", "what": "Fails when a file is off the map or a name the atlas uses is gone." }`.

## D. package.json script

`"check:atlas": "node {{DIR}}/atlas.mjs check"`. With the packageScripts
add-on, list `check:atlas` in the tooling system's `checks`.
