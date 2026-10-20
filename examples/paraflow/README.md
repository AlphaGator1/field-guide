# Example: ParaFlow's field guide

[ParaFlow](https://github.com/AlphaGator1/ParaFlow) is an open-source push-to-talk
dictation app for Windows: a Tauri desktop app with a Rust backend, a
React/TypeScript front end, PowerShell scripts and an NSIS installer hook.
This folder holds the field guide `/field-guide:build` produced for it, at
ParaFlow commit `ecfdf66`, and the page rendered from it.

- **[`guide.html`](guide.html)**: the rendered page, which opens on the trail
  map. Download it and open it in a browser; it makes no network requests. It
  was rendered with `guide render` at ParaFlow commit `043aaeb`: the build
  commit `ecfdf66` plus the files that build added. The hills' sizes are
  counted from the code at that commit.
- **`guide.json`**: the guide itself: 13 systems in 4 groups, 3 end-to-end
  flows and 45 glossary terms, covering all 57 files at that commit plus the
  two the build added (a project skill and a CI workflow).
- **`guide.config.json`**: what the check covers in ParaFlow (every tracked
  file; the package-scripts and GitHub-workflows add-ons).

In ParaFlow these files live in `docs/field-guide/`, beside the vendored CLI
(`guide.mjs`) and a README from the plugin's template. The build also added
`.claude/skills/field-guide/SKILL.md` and `.github/workflows/field-guide.yml`
(templates in [`skills/build/reference/wiring.md`](../../skills/build/reference/wiring.md)).
`node docs/field-guide/guide.mjs check` passed 33 of 33 assertions when the
build ran. ParaFlow's own commit `043aaeb` names the workflow file `guide.yml`,
not `field-guide.yml`, so with these files in it, 2 of the 33 fail there: the
job's reference to the workflow, and the workflow no system claims.

## How it was made

- 3 drafting subagents, then 3 adversarial fact-check subagents: 1,381,950
  subagent tokens and 21 minutes of wall time.
- The fact-check made 47 changes from 65 findings (3 claims wrong, 39
  misleading, 17 omissions, 6 style). Each wrong claim was checked against
  the cited code before it was accepted.
- The grouping was confirmed by hand before drafting.

## Things to try

```
node docs/field-guide/guide.mjs                         # the 13 systems, one line each
node docs/field-guide/guide.mjs injection               # how text reaches the focused app
node docs/field-guide/guide.mjs src-tauri/src/setup.rs  # which system owns the first-run downloader
node docs/field-guide/guide.mjs --search idle timeout   # every place the mic timeout is described
node docs/field-guide/guide.mjs overview                # the three end-to-end flows
```

The prose describes the code at `ecfdf66`. Later ParaFlow changes are
reflected only after `/field-guide:update`. To regenerate the page, check
out ParaFlow at `043aaeb`, copy this folder's `guide.json` and
`guide.config.json` over the ones in its `docs/field-guide/`, and run
`guide render` there.
