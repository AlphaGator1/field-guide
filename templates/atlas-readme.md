# System Atlas

A plain-English map of every system in this repository: what it does, how it
works, where its code lives, the jobs it runs, the switches that gate it, what
it connects to, and the rules and checks that guard it. It is written for a
person first (an owner, a new contributor) and for an AI coding session second.

- **`atlas.json`** is the source of truth. It is large, so read it through the
  lookup instead of opening it:
  - `node {{DIR}}/atlas.mjs` lists every system, one line each;
  - `node {{DIR}}/atlas.mjs <id>` prints one system in full;
  - `node {{DIR}}/atlas.mjs <path>` names the system that owns a file;
  - `node {{DIR}}/atlas.mjs <word>` finds the systems and glossary terms that
    mention a word.
- **`node {{DIR}}/atlas.mjs check`** fails when a file is claimed by no
  system, or when anything the atlas names (a key file, rule, check, job,
  switch, data model, connection) no longer exists. It also keeps each printed
  entry under a size ratchet (`entryMaxChars`): trim the prose, never raise it.
- **`node {{DIR}}/atlas.mjs render`** writes `atlas.html`, one self-contained
  page to browse the map.
- **`atlas.config.json`** says which files must be on the map (`include`,
  `exclude`) and which stack add-ons the check runs.
- **`atlas.mjs`** is a vendored copy of the System Atlas CLI. Do not edit it;
  replace it with a newer release.

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
3. Run `node {{DIR}}/atlas.mjs check` until it passes.
4. `node {{DIR}}/atlas.mjs changed` lists the systems whose files changed
   since the atlas was last verified; re-read those entries, then
   `node {{DIR}}/atlas.mjs stamp` records the new commit.
