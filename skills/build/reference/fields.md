ATLAS FIELD RULES (atlas.json; `node <cli> check` enforces the starred ones)

- id*: lowercase-kebab, unique; never one of: check, render, init, inventory, changed, merge, stamp, overview, help.
- name: 1-4 words. oneLiner*: one line, at most 15 words: what it does for the product or its users.
- summary: 2-4 plain sentences: what it is, why it exists, how it works at a high level. Gloss any technical term in passing.
- journey: 3-8 short steps, in order: what happens, told from the user's side where possible ("A user presses the hotkey").
- keyFiles*: 3-10 { "path", "what" }: start-here files first (the entry point, the core logic, the public surface). `path` is repo-relative and must exist; `what` is at most 20 words.
- jobs*: everything this system runs on a schedule, in CI, or as an operational tool someone runs: { "name", "kind", "ref", "when", "what" }.
  kind / ref: github-action / the workflow file path · vercel-cron / the cron path in vercel.json · package-script / the package.json script name · make-target / the Makefile target · file / the script or unit file that runs it · external / where it is configured outside the repo (unchecked).
  `when` in plain words ("every push to main", "daily 03:00 UTC", "on demand"). [] when none.
  When the config has a packageScripts add-on, EVERY matching package.json script must be claimed by some system: as a job (kind package-script) or in `checks`.
- switches*: { "name", "what" } for each environment variable, feature flag, config key or CLI flag that changes behaviour. `name` is the EXACT identifier as spelled in the code (the check searches the repo for it). `what` says what it turns on or off, NEVER its value. [] when none.
- connects*: 1-6 { "to": "<another system id>", "why": "<at most 20 words: what flows between them>" }. Real dependencies only.
- watchOuts: 1-5 plain-English traps, each shaped "Never/Always X, because Y": what an owner or a new contributor must know before changing this system. Prefer traps the instruction files record and code comments that explain a past bug.
- models*: data model or table names this system owns, exactly as the schema spells them (only when the config has a models add-on; otherwise []).
- rules*: instruction or rule files that govern this system (repo-relative paths that exist).
- checks*: the tests or check scripts that pin this system: package.json script names, or test file paths or globs that exist.
- owns*: globs of the files that belong to this system (already set; change them only to fix a wrong placement, and say so). `*` stays in one folder, `**` crosses folders (`**/` also matches none), `?` is one character, `{a,b}` is either; everything else, `[id]` and `(group)` included, is literal.
- glossary (top level): 1-5 terms per system a newcomer would not know, each meaning at most 25 words.

ALWAYS: describe structure and behaviour, never live state ("currently enabled", "on in production"). Never write secrets, keys, environment VALUES, account ids, internal URLs with tokens, or personal data. Every factual claim must be something you checked in the code; when unsure, leave it out. Numbers (limits, timeouts, sizes, schedules) only when read from the code, with units. Short sentences; no jargon without a gloss.
