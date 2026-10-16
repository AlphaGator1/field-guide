# System Atlas

A plain-English, code-verified map of every system in a repository, built and
kept honest by Claude Code.

An atlas is one JSON file (`docs/atlas/atlas.json`) that puts every file in
your repo into a named **system** and describes each one: what it does, how it
works step by step, its key files, the jobs it runs, the switches that change
its behaviour, what it connects to, the traps to avoid, and the rules and
tests that guard it. It comes with:

- **a one-entry lookup** (`node docs/atlas/atlas.mjs <id | path | word>`), so
  a Claude session reads one system's entry (about 1-3k tokens) instead of
  the whole map or the code cold;
- **a check for CI** (`node docs/atlas/atlas.mjs check`) that fails when a file
  belongs to no system or when anything the atlas names no longer exists;
- **a single-page HTML view** for people (`node docs/atlas/atlas.mjs render`).

This plugin builds the atlas with parallel drafting subagents, then has a
second set of **adversarial** subagents fact-check every claim against the
code before anything is accepted.

> Status: 0.1.0, unreleased. Tested on two outside repositories (below).

## Why not a code graph?

Code-graph tools parse your source into nodes and edges. They are fast,
free to run, and good at one question: "what calls this function?" An atlas
answers a different one: "what is this part of the system for, how does it
work, and what will bite me if I change it?" We tried both on the same code.

| | Code graph (Graphify 0.9.73, code-only mode) | System Atlas |
|---|---|---|
| Unit of answer | a function, class or file node and its edges | a named system, in sentences |
| Covers non-code files (CI, installer scripts, docs, assets) | no: on ParaFlow, 27 of 57 files had no node | yes: the check fails until every file has an owner |
| Crosses language boundaries (React UI to Rust backend) | no: 0 edges on ParaFlow | yes, in `connects` and the journeys |
| Environment switches, scheduled jobs, CI workflows | no: 0 of ParaFlow's 9 `PARAFLOW_*` switches | yes, and the check proves each one still exists |
| "Why" and "watch out" knowledge | no | yes, fact-checked against the code |
| Cost to build | seconds, no tokens | {{COST_SUMMARY}} |
| Stays current | re-run the parser | the check catches files and names; prose is re-checked with `/system-atlas:update` |

On a private TypeScript codebase (732 code files), the graph found 70 of the
74 caller files that grep found for 20 functions, with no false hits: a useful
blast radius. On ParaFlow's Rust, it found 1 of 33 cross-module calls written as
`module::function()`, so its "what is affected if I change `paste()`?" query
returned nothing, though `pipeline.rs` calls it. Use a graph for call sites;
use an atlas to orient. They do not compete, and grep remains the ground truth
for call sites.

## Install

In Claude Code:

```
/plugin marketplace add OWNER/system-atlas
/plugin install system-atlas@system-atlas
```

Or from a shell: `claude plugin marketplace add OWNER/system-atlas`, then
`claude plugin install system-atlas@system-atlas`. To try a local checkout
without installing: `claude --plugin-dir ./system-atlas`.

Requirements: Node 18 or newer (the CLI is one dependency-free file), and git
(the check lists files with `git ls-files`).

## Use

| Command | What it does |
|---|---|
| `/system-atlas:build` | Builds the atlas: inventory, a proposed grouping for you to confirm, parallel drafting, adversarial fact-check, the check, and the wiring you choose (a CLAUDE.md block or a project skill; a GitHub Actions job or a package script). |
| `/system-atlas:update [commit]` | After code changes: lists the systems whose files changed since the atlas was last verified, re-checks those entries against the diff, places new files, re-runs the check. |

Both are user-invoked only: Claude never starts a build on its own, because a
build spends real tokens.

The build vendors the CLI into your repo as `docs/atlas/atlas.mjs`, so CI and
teammates run it with plain `node`, without the plugin:

```
node docs/atlas/atlas.mjs                  # every system, one line each
node docs/atlas/atlas.mjs <id>             # one system in full
node docs/atlas/atlas.mjs <path>           # which system owns a file, and its entry
node docs/atlas/atlas.mjs <word ...>       # systems and glossary terms mentioning every word
node docs/atlas/atlas.mjs check            # every file on the map, every name real
node docs/atlas/atlas.mjs render [out]     # one self-contained HTML page
node docs/atlas/atlas.mjs changed [commit] # systems whose files changed since a commit
```

## Cost

A build is not cheap: each drafting agent reads its systems' code, and each
fact-checker reads it again. Measured builds:

{{COST_TABLE}}

`/system-atlas:update` costs a fraction of that, in proportion to how many
systems changed.

## What the check proves, and what it does not

`atlas check` reads files and runs `git ls-files`. No network, no database,
no environment variables. It fails when:

- a file in scope (`include` minus `exclude` in `atlas.config.json`) is owned
  by no system, or an `owns` glob matches nothing, or an `include` glob
  matches nothing (so a renamed folder cannot make it vacuously green);
- anything the atlas names is gone: a key file, a rule file, a check (a
  package script or a test path), a job (a workflow file, a Vercel cron, a
  package script, a make target, a script file), a switch (its exact
  identifier must still appear in the code), a data model, a connection or a
  flow step pointing at no system;
- an optional stack add-on finds something unclaimed: every data model
  (presets for Prisma, SQL `CREATE TABLE`, Django, SQLAlchemy, or your own
  pattern), every package.json script, every GitHub workflow, every Vercel
  cron, every file in a rules folder;
- a printed entry would be wrong (a field under the wrong label) or longer
  than the `entryMaxChars` ratchet.

**It does not verify the prose.** A system whose behaviour changes without a
file appearing or disappearing keeps passing. That is what the fact-check at
build time and `/system-atlas:update` are for; nothing automatic replaces a
re-read.

Every assertion has a stable code, and the plugin's test suite injects, for
each code, the defect it exists for and requires that exact code to fail
(`npm test`: {{DEFECT_COUNT}} injected defects across all 39 codes). That
discipline found a real hole in the first version: the "sections print in
order" assertion read its label list from the renderer it was checking, so a
reordered renderer stayed green. The check now pins its own copy of the
labels and checks that each field prints under its own label.

## Configuration: `docs/atlas/atlas.config.json`

```json
{
  "atlas": "atlas.json",
  "root": "../..",
  "files": "git",
  "include": ["**"],
  "exclude": [],
  "entryMaxChars": 12000,
  "addons": {
    "models": { "preset": "prisma", "files": ["prisma/schema.prisma"] },
    "packageScripts": { "file": "package.json", "match": ".*" },
    "githubWorkflows": { "dir": ".github/workflows" },
    "vercelCrons": { "file": "vercel.json" },
    "rules": { "dir": ".claude/rules", "glob": "**/*.md" }
  },
  "stats": [{ "label": "API routes", "glob": "src/app/api/**/route.ts" }]
}
```

`/system-atlas:build` writes this for you from what it detects. Globs: `*`
stays in one folder, `**` crosses folders (`**/` also matches none), `?` is one
character, `{a,b}` is either; everything else, including `[id]` and `(group)`
folder names, is literal.

## The atlas format

`atlas.json` holds `title`, `about`, `overview`, `groups` (`id`, `name`,
`blurb`), `systems`, `flows` (end-to-end paths whose steps name systems) and a
`glossary`. Each system has: `id`, `group`, `name`, `oneLiner`, `summary`,
`journey` (steps), `owns` (globs), `keyFiles` (`path`, `what`), `models`,
`jobs` (`name`, `kind`, `ref`, `when`, `what`), `switches` (`name`, `what`),
`connects` (`to`, `why`), `rules`, `checks` and `watchOuts`. The field rules
the drafting agents follow are in
[`skills/build/reference/fields.md`](skills/build/reference/fields.md).

Describe structure and behaviour, never live state, secrets or environment
values: the atlas is committed, and often public.

## Examples

{{EXAMPLES}}

## Limits

- The check covers the map and the names, not the meaning (above).
- A build is only as good as its fact-check; findings are reports, and the
  build skill spot-checks the cited lines before accepting them.
- Glob ownership is by path. A file that serves two systems can be owned by
  both, but the atlas has no finer grain than a file.
- The lookup and the check need Node 18+. A project without Node can still
  keep the atlas, but CI needs a Node step.

## Development

```
npm install
npm run check    # typecheck, dist/atlas.mjs freshness, the test suite
npm run build    # rebuild dist/atlas.mjs after changing src/ or templates/
```

`dist/atlas.mjs` is committed: it is what projects vendor and what the skills
run. `claude plugin validate .claude-plugin/plugin.json` and
`claude plugin validate .` check the manifests.

## License

MIT. See [LICENSE](LICENSE).
