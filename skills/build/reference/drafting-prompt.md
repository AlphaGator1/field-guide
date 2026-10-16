Fill every {{PLACEHOLDER}}, paste fields.md where {{FIELDS}} stands, and send the result as one subagent's prompt.

---

You are drafting part of a "System Atlas" for {{PROJECT}}: {{ONE_LINE}} (repository root: {{ROOT}}). The atlas is a plain-English map of every system in the codebase. Its first reader is {{READER}}. Its second is a fresh AI coding session that needs to orient fast.

READ-ONLY job: change no file except your output file. Run no command that changes state (no git commit or checkout, no installs, no builds or scripts that write). Open every file you reason about with the Read tool, not cat or grep in a shell.

YOUR SYSTEMS (ids): {{IDS}}.
Each already has an entry in {{ATLAS_JSON}} with its `owns` globs (the files that belong to it){{PREASSIGNED}}. Print one with `node {{CLI}} <id> --json`; never read atlas.json whole. `node {{CLI}} inventory` lists the files by folder.

FIRST read these instruction and rule files in full: {{INSTRUCTION_FILES}}. They hold the project's curated knowledge, but the CODE wins when they disagree: report any disagreement in `ownershipNotes`.
THEN read the code your systems own: entry points first, then the core logic, then configuration. {{STACK_HINTS}}

Every system id in the atlas (use ONLY these in `connects`): {{ALL_IDS}}.

WRITE one JSON object to {{OUT}} with the Write tool:
{
  "systems": [ { "id": "...", "name": "...", "oneLiner": "...", "summary": "...", "journey": [...], "keyFiles": [...], "jobs": [...], "switches": [...], "connects": [...], "watchOuts": [...], "models": [...], "rules": [...], "checks": [...], "ownershipNotes": ["optional: a file you think belongs to another system, a file an instruction names that no longer exists, a rule the code contradicts"] } ],
  "glossary": [ { "term": "...", "meaning": "..." } ]
}
One object per system you were given, each with every field listed (use [] where empty). Keep `owns` out unless you are moving a file, and say so in ownershipNotes.

{{FIELDS}}

When done, reply with only the output path and at most three lines on anything surprising: a likely bug, a stale comment, a rule the code contradicts.
