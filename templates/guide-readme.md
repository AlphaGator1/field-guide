# Field Guide

A plain-English map of every system in this repository: what it does, how it
works, where its code lives, the jobs it runs, the switches that gate it, what
it connects to, and the rules and checks that guard it. It is written for a
person first (an owner, a new contributor) and for an AI coding session second.

- **`guide.json`** is the source of truth. It is large, so read it through the
  lookup instead of opening it:
  - `node {{DIR}}/guide.mjs` lists every system, one line each;
  - `node {{DIR}}/guide.mjs <id>` prints one system in full;
  - `node {{DIR}}/guide.mjs <path>` names the system that owns a file;
  - `node {{DIR}}/guide.mjs --search <words>` finds everything that mentions
    them: entries, flows, the overview and the glossary.
- **`node {{DIR}}/guide.mjs check`** fails when a file is claimed by no
  system, or when anything the guide names (a key file, rule, check, job,
  switch, data model, connection) no longer exists. It also keeps each printed
  entry under a size ratchet (`entryMaxChars`): trim the prose, never raise it.
- **`node {{DIR}}/guide.mjs render`** writes `guide.html`, one self-contained
  page to browse the map.
- **`guide.config.json`** says which files must be on the map (`include`,
  `exclude`) and which stack add-ons the check runs.
- **`guide.mjs`** is a vendored copy of the Field Guide CLI. Do not edit it;
  replace it with a newer release.
- `guide.json` is machine-written (merges rewrite it as 2-space JSON): keep
  this folder out of JSON formatters such as Prettier.

## What the check cannot see

It proves that every file is on the map and every name is real. It does not
prove that the prose is still true. A system whose behaviour changes without a
file appearing or disappearing keeps passing, so **when you change how a
system works, re-read its entry and fix the sentences that moved.**

## Updating it

1. A new file goes into the `owns` globs of the system it belongs to. Globs
   are matched against the repo-relative path: `*` stays inside one folder,
   `**` crosses folders (`**/` also matches no folder), `?` is one character,
   `{a,b}` is either; everything else, `[id]` and `(group)` included, is literal.
2. Describe structure and behaviour, never live state ("currently enabled"),
   and never secrets, environment values or account ids.
3. Run `node {{DIR}}/guide.mjs check` until it passes.
4. `node {{DIR}}/guide.mjs changed` lists the systems whose files changed
   since the guide was last verified; re-read those entries, then
   `node {{DIR}}/guide.mjs stamp` records the new commit.
