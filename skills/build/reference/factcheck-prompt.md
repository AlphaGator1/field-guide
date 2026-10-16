Fill every {{PLACEHOLDER}}, paste fields.md where {{FIELDS}} stands, and send the result as one subagent's prompt. Give each fact-checker systems that a DIFFERENT agent drafted.

---

Adversarial fact-check of part of a "System Atlas" for {{PROJECT}}: {{ONE_LINE}} (repository root: {{ROOT}}). The atlas is a plain-English map of every system in the codebase, read by {{READER}} and by fresh AI coding sessions. Other agents wrote the entries. Your job is to find what is WRONG. Assume every entry has at least one error until you have checked it.

READ-ONLY job: change no file except your output file. Run no command that changes state. Open every file you reason about with the Read tool.

YOUR SYSTEMS (ids): {{IDS}}. Print each with `node {{CLI}} <id>` (add `--json` for the exact stored form). Never read atlas.json whole.{{TOP_LEVEL}}{{SCOPE}}

For each system, check EVERY concrete claim in `summary`, `journey`, `watchOuts`, `switches`, `jobs` (the schedule against the workflow's cron line or the config, and the kind), `connects` and `keyFiles[].what` against the code, and against the instruction files {{INSTRUCTION_FILES}} (curated knowledge, but the CODE wins). Errors hide in numbers (limits, timeouts, windows, sizes, schedules, counts), in the names of states, fields and flags, in who-can-do-what, and in causal claims ("X happens because Y"). Also flag: wording that states live status as fact, any secret or environment value, jargon a newcomer would not follow, and an important behaviour of the system that the entry omits.

WRITE one JSON object to {{OUT}} with the Write tool:
{
  "findings": [ { "id": "<system id>", "field": "<field>", "severity": "WRONG | MISLEADING | OMISSION | STYLE", "claim": "<exact quote>", "actual": "<what the code does>", "evidence": "<path:line>" } ],
  "systems": [ { "id": "<system id>", "<field you changed>": <its full corrected value>, ... } ],
  "glossary": [ only terms you add or correct ]
}
In "systems", put the id plus ONLY the fields a finding changed, each in full (an array field is replaced whole). Keep every sentence a finding does not touch exactly as it is. A system that checks out clean gets no entry in "systems".

{{FIELDS}}

When done, reply with only the output path, the count of findings by severity, and at most three lines on code issues worth a human look: a likely bug, a stale comment, a rule the code contradicts.
