// The plugin's own test suite. Pure and local: temp folders, `git init`, no network.
//   node test/run.mjs
// 1. The fixture passes `atlas check` with every assertion code present.
// 2. DEFECT INJECTION: for every assertion code, at least one injected defect
//    (in the data, the repo, the config or the CLI's own code) turns THAT code red.
//    A code no defect can kill is reported as unproven and fails the suite.
// 3. The lookup, render, init, inventory, merge, changed and stamp commands.
import { spawnSync } from "child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, renameSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { dirname, join, resolve } from "path"
import { atlas as baseAtlas, files as baseFiles } from "./fixture.mjs"

// ATLAS_CLI runs the suite against another build (e.g. an older one, to prove a new test goes red on the old bug).
const CLI = resolve(process.env.ATLAS_CLI ?? "dist/atlas.mjs")
const CLI_TEXT = readFileSync(CLI, "utf8")
const temps = []
let pass = 0
let fail = 0
function t(name, cond, detail) {
  if (cond) pass++
  else fail++
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `\n        ${String(detail).slice(0, 1500)}`}`)
}

function git(dir, args) {
  return spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", ...args], { cwd: dir, encoding: "utf8" })
}

/** The fixture in a fresh temp git repo, with optional mutations of the atlas, config and files. */
function makeRepo({ atlas, config, files, commit, after } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-test-"))
  temps.push(dir)
  const fs = { ...baseFiles }
  const a = structuredClone(baseAtlas)
  const cfg = JSON.parse(fs["docs/atlas/atlas.config.json"])
  atlas?.(a)
  config?.(cfg)
  fs["docs/atlas/atlas.config.json"] = JSON.stringify(cfg, null, 2)
  fs["docs/atlas/atlas.json"] = JSON.stringify(a, null, 2)
  files?.(fs)
  for (const [p, c] of Object.entries(fs)) {
    if (c === undefined) continue
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
  git(dir, ["init", "-q"])
  if (commit) {
    git(dir, ["add", "-A"])
    git(dir, ["commit", "-q", "-m", "fixture"])
  }
  // Files written AFTER the commit: really untracked.
  const later = {}
  after?.(later)
  for (const [p, c] of Object.entries(later)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
  return dir
}

function run(dir, args, cli = CLI, cwd = dir) {
  const r = spawnSync(process.execPath, [cli, "--dir", join(dir, "docs/atlas"), ...args], { cwd, encoding: "utf8" })
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout }
}

function check(dir, cli) {
  const r = run(dir, ["check", "--json"], cli)
  try {
    return { code: r.code, ...JSON.parse(r.stdout) }
  } catch {
    return { code: r.code, results: [], codes: [], raw: r.out }
  }
}

/** Replace a UNIQUE anchor in the bundled CLI; an anchor found 0 or 2+ times is itself a failure. */
function mutateCli(from, to) {
  const n = CLI_TEXT.split(from).length - 1
  if (n !== 1) throw new Error(`CLI mutation anchor found ${n} times (must be exactly 1): ${from}`)
  const dir = mkdtempSync(join(tmpdir(), "atlas-cli-"))
  temps.push(dir)
  const p = join(dir, "atlas.mjs")
  writeFileSync(p, CLI_TEXT.replace(from, () => to))
  return p
}

const sys = (a, id) => a.systems.find((s) => s.id === id)

// ---------------------------------------------------------------- 1. baseline
console.log("\n--- 1. the fixture passes, and every assertion code runs ---")
const base = check(makeRepo())
t("the fixture passes atlas check with no failure", base.code === 0 && base.failed === 0, base.raw ?? JSON.stringify(base.results?.filter((r) => !r.pass)))
const ran = new Set((base.results ?? []).map((r) => r.code))
const ALL = base.codes ?? []
t(`every assertion code ran on the fixture (${ALL.length} codes)`, ALL.length > 30 && ALL.every((c) => ran.has(c)), ALL.filter((c) => !ran.has(c)).join(", "))

// ------------------------------------------------------- 2. defect injection
console.log("\n--- 2. every assertion goes red on the defect it exists for ---")
const DEFECTS = [
  ["shape.title", "the title is empty", { atlas: (a) => { a.title = "" } }],
  ["shape.nonempty", "there are no systems", { atlas: (a) => { a.systems = [] } }],
  ["shape.group-ids", "two groups share an id", { atlas: (a) => { a.groups.push({ id: "commerce", name: "Again", blurb: "x" }) } }],
  ["shape.group-ids", "a group has no id", { atlas: (a) => { a.groups.push({ name: "Nameless", blurb: "x" }) } }],
  ["shape.system-ids", "two systems share an id", { atlas: (a) => { a.systems.push(structuredClone(sys(a, "accounts"))) } }],
  ["shape.id-format", "an id is not kebab-case", { atlas: (a) => { sys(a, "accounts").id = "Accounts_Main" } }],
  ["shape.id-format", "an id is a CLI command", { atlas: (a) => { sys(a, "tooling").id = "check" } }],
  ["shape.fields", "a system lacks watchOuts", { atlas: (a) => { delete sys(a, "accounts").watchOuts } }],
  ["shape.fields", "journey is a string, not a list", { atlas: (a) => { sys(a, "accounts").journey = "sign in" } }],
  ["shape.known-group", "a system names an unknown group", { atlas: (a) => { sys(a, "accounts").group = "nope" } }],
  ["shape.prose", "a summary is blank", { atlas: (a) => { sys(a, "accounts").summary = "  " } }],
  ["shape.single-line", "a one-liner spans two lines", { atlas: (a) => { sys(a, "accounts").oneLiner = "Signs people in\nand out" } }],
  ["shape.owns-keyfiles", "a system names no key file", { atlas: (a) => { sys(a, "accounts").keyFiles = [] } }],
  ["shape.group-used", "a group has no system", { atlas: (a) => { a.groups.push({ id: "empty", name: "Empty", blurb: "x" }) } }],
  ["shape.no-todo", "a TODO placeholder is left", { atlas: (a) => { sys(a, "accounts").summary = "TODO" } }],
  ["coverage.include", "an include folder was renamed (src/ -> app/)", { files: (f) => { for (const k of Object.keys(f)) if (k.startsWith("src/")) { f[`app/${k.slice(4)}`] = f[k]; delete f[k] } } }],
  ["coverage.include", "exclude removes every file", { config: (c) => { c.exclude = ["**"] } }],
  ["coverage.unowned", "a new file belongs to no system", { files: (f) => { f["src/lib/new-thing.ts"] = "export {}\n" } }],
  ["coverage.unowned", "an untracked (not yet committed) new file", { commit: true, after: (f) => { f["scripts/later.js"] = "1\n" } }],
  ["coverage.include", "the only files an include glob matches are the atlas's own", { config: (c) => { c.include.push("docs/**") } }],
  ["coverage.dead-glob", "an owns glob matches nothing", { atlas: (a) => { sys(a, "orders").owns.push("src/legacy/**") } }],
  ["coverage.dead-glob", "an owns glob matches only an excluded file", { atlas: (a) => { sys(a, "orders").owns.push("README.md") } }],
  ["names.key-files", "a key file was deleted", { atlas: (a) => { sys(a, "orders").keyFiles.push({ path: "src/lib/gone.ts", what: "Gone." }) } }],
  ["names.key-files", "a key file says nothing", { atlas: (a) => { sys(a, "orders").keyFiles[0].what = "" } }],
  ["names.key-files", "a key file named with the wrong case (passes on Windows disks, fails on Linux CI)", { atlas: (a) => { sys(a, "fees-tax").keyFiles[0].path = "SRC/LIB/FEES.TS" } }],
  ["names.key-files", "a key file that is gitignored build output", {
    atlas: (a) => { sys(a, "tooling").keyFiles.push({ path: "dist/bundle.js", what: "Built." }) },
    files: (f) => { f[".gitignore"] = "dist/\n"; f["dist/bundle.js"] = "1\n" },
  }],
  ["names.connects", "a connection points at no system", { atlas: (a) => { sys(a, "orders").connects.push({ to: "nope", why: "x" }) } }],
  ["names.connects", "a system connects to itself", { atlas: (a) => { sys(a, "orders").connects.push({ to: "orders", why: "x" }) } }],
  ["names.connects", "a connection gives no reason", { atlas: (a) => { sys(a, "orders").connects[0].why = "" } }],
  ["names.flows", "there are no flows", { atlas: (a) => { a.flows = [] } }],
  ["names.flows", "a flow step names no system", { atlas: (a) => { a.flows[0].steps.push({ system: "nope", text: "x" }) } }],
  ["names.flows", "a flow has no steps", { atlas: (a) => { a.flows.push({ name: "Empty", steps: [] }) } }],
  ["names.glossary", "a glossary term repeats (any case)", { atlas: (a) => { a.glossary.push({ term: "sweep", meaning: "Again." }) } }],
  ["names.glossary", "a glossary meaning is blank", { atlas: (a) => { a.glossary[0].meaning = "" } }],
  ["names.rules", "a rule file was deleted", { atlas: (a) => { sys(a, "orders").rules.push(".claude/rules/gone.md") } }],
  ["names.checks", "a check names no script or file", { atlas: (a) => { sys(a, "fees-tax").checks.push("check:gone") } }],
  ["names.jobs", "a workflow job's file is gone", { atlas: (a) => { sys(a, "tooling").jobs.push({ name: "x", kind: "github-action", ref: ".github/workflows/gone.yml", when: "x", what: "x" }) } }],
  ["names.jobs", "a cron job's path is not in vercel.json", { atlas: (a) => { sys(a, "orders").jobs[0].ref = "/api/cron/gone" } }],
  ["names.jobs", "a package-script job names no script", { atlas: (a) => { sys(a, "orders").jobs[1].ref = "gone" } }],
  ["names.jobs", "a make-target job names no target", { atlas: (a) => { sys(a, "tooling").jobs[2].ref = "deploy" } }],
  ["names.jobs", "a file job's script is gone", { atlas: (a) => { sys(a, "tooling").jobs[4].ref = "scripts/gone.js" } }],
  ["names.jobs", "a job has an unknown kind", { atlas: (a) => { sys(a, "tooling").jobs[3].kind = "cron-job" } }],
  ["names.jobs", "a job has no 'when'", { atlas: (a) => { sys(a, "tooling").jobs[3].when = "" } }],
  ["names.switches", "a switch was renamed in the code", { files: (f) => { f["src/lib/fees.ts"] = f["src/lib/fees.ts"].replace("FEES_PAUSED", "FEES_HALTED") } }],
  ["names.switches", "a switch named only in the atlas folder and a rendered page", {
    atlas: (a) => { sys(a, "fees-tax").switches.push({ name: "GHOST_SWITCH", what: "x" }) },
    files: (f) => { f["docs/atlas/README.md"] = "GHOST_SWITCH\n"; f["docs/page.html"] = '<script id="atlas-data">GHOST_SWITCH</script>\n' },
  }],
  ["names.switches", "a switch renamed to a longer identifier in the code (FEES_PAUSED_V2)", { files: (f) => { f["src/lib/fees.ts"] = f["src/lib/fees.ts"].replace("FEES_PAUSED", "FEES_PAUSED_V2") } }],
  ["names.switches", "a switch gone from the code but still in docs on the map", {
    files: (f) => { f["src/lib/fees.ts"] = f["src/lib/fees.ts"].replace("process.env.FEES_PAUSED", "false"); f["scripts/CHANGELOG.md"] = "Added FEES_PAUSED.\n"; f["src/README.md"] = "Set FEES_PAUSED to pause fees.\n" },
  }],
  ["names.switches", "a switch has no description", { atlas: (a) => { sys(a, "fees-tax").switches[0].what = "" } }],
  ["names.models", "a model the atlas names is not in the schema", { atlas: (a) => { sys(a, "orders").models.push("Invoice") } }],
  ["names.models", "models are named but no add-on can verify them", { config: (c) => { delete c.addons.models } }],
  ["addon.models.found", "the model parse finds nothing", { config: (c) => { c.addons.models.files = ["nowhere/*.prisma"] } }],
  ["addon.models.claimed", "a new model belongs to no system", { files: (f) => { f["prisma/schema.prisma"] += "\nmodel Refund {\n  id String @id\n}\n" } }],
  ["addon.scripts.found", "the script pattern matches nothing", { config: (c) => { c.addons.packageScripts.match = "^zzz" } }],
  ["addon.scripts.claimed", "a new package script belongs to no system", { files: (f) => { const p = JSON.parse(f["package.json"]); p.scripts.lint = "eslint ."; f["package.json"] = JSON.stringify(p) } }],
  ["addon.workflows.found", "the workflows folder is wrong", { config: (c) => { c.addons.githubWorkflows.dir = ".github/nope" } }],
  ["addon.workflows.claimed", "a new workflow is no system's job", { files: (f) => { f[".github/workflows/release.yml"] = "name: Release\n" } }],
  ["addon.crons.found", "vercel.json has no crons", { files: (f) => { f["vercel.json"] = "{}" } }],
  ["addon.crons.claimed", "a new cron is no system's job", { files: (f) => { f["vercel.json"] = JSON.stringify({ crons: [{ path: "/api/cron/expire" }, { path: "/api/cron/new" }] }) } }],
  ["addon.rules.found", "the rules folder is wrong", { config: (c) => { c.addons.rules.dir = ".claude/nope" } }],
  ["addon.rules.claimed", "a new rule file belongs to no system", { files: (f) => { f[".claude/rules/new.md"] = "# New\n" } }],
  ["lookup.entry-size", "an entry outgrows the ratchet", { atlas: (a) => { sys(a, "accounts").summary = "word ".repeat(2600) } }],
  ["lookup.entry-sections", "the CLI's entry header drops the id", { cli: ["`${s.name} [${s.id}] (${group})`", "`${s.name} (${group})`"] }],
  ["lookup.entry-sections", "the CLI prints Watch out after Connected to", { cli: ['var SECTION_LABELS = [\n  "How it works:",\n  "Watch out:",\n  "Connected to:"', 'var SECTION_LABELS = [\n  "How it works:",\n  "Connected to:",\n  "Watch out:"'] }],
  ["lookup.entry-complete", "the CLI prints rules under Checks and checks under Rules", { cli: ["inline(SECTION_LABELS[7], s.rules),\n    inline(SECTION_LABELS[8], s.checks),", "inline(SECTION_LABELS[7], s.checks),\n    inline(SECTION_LABELS[8], s.rules),"] }],
  ["lookup.entry-complete", "the CLI stops printing watch-outs", { cli: ["...list(SECTION_LABELS[1], s.watchOuts)", "...list(SECTION_LABELS[1], [])"] }],
  ["lookup.entry-complete", "the CLI stops printing switches", { cli: ["s.switches.map((w) => `${w.name} \\u2014 ${w.what}`)", "[]"] }],
  ["lookup.entry-complete", "the CLI prints key files without what they are", { cli: ["s.keyFiles.map((k) => `${k.path} \\u2014 ${k.what}`)", "s.keyFiles.map((k) => k.path)"] }],
  ["lookup.entry-complete", "the CLI prints connections without the system they go to", { cli: ["s.connects.map((c) => `${name(c.to)} [${c.to}]: ${c.why}`)", "s.connects.map((c) => c.why)"] }],
  ["lookup.entry-complete", "the CLI prints only each job's ref", { cli: ["s.jobs.map((j) => `${j.name} (${j.when}; ${JOB_KIND_LABELS[j.kind] ?? j.kind} ${j.ref}) \\u2014 ${j.what}`)", "s.jobs.map((j) => j.ref)"] }],
  ["lookup.owner-path", "the CLI stops resolving absolute paths", { cli: ["if (isAbsolute(a) || /^[A-Za-z]:[\\\\/]/.test(a)) return repoRelative(root, resolve(a));", "if (isAbsolute(a)) return normalizePath(a);"] }],
  ["lookup.index", "the CLI's index prints a system twice", { cli: ["for (const s of atlas.systems.filter((x) => x.group === g.id)) out.push(", "for (const s of atlas.systems.filter((x) => x.group === g.id).flatMap((x) => [x, x])) out.push("] }],
  ["lookup.owner-path", "the CLI stops normalising Windows paths", { cli: ["return p.trim().replace(/\\\\/g, \"/\")", "return p.trim()"] }],
]

const killed = new Set()
for (const [code, name, d] of DEFECTS) {
  let cli
  try {
    cli = d.cli ? mutateCli(...d.cli) : undefined
  } catch (e) {
    t(`${code}: ${name}`, false, e.message)
    continue
  }
  const r = check(makeRepo(d), cli)
  const target = (r.results ?? []).find((x) => x.code === code)
  const red = r.code === 1 && target && !target.pass
  if (red) killed.add(code)
  t(`${code} goes red: ${name}`, red, r.raw ?? `exit ${r.code}; ${target ? JSON.stringify(target) : "code not emitted"}`)
}
const unproven = ALL.filter((c) => !killed.has(c))
t(`every assertion code is killed by an injected defect (${killed.size}/${ALL.length})`, unproven.length === 0, `unproven: ${unproven.join(", ")}`)

// ------------------------------------------------- 2b. no false alarms
console.log("\n--- 2b. valid repos the check must not fail ---")
const green = (name, opts, extra = () => true) => {
  const dir = makeRepo(opts)
  const r = check(dir)
  t(name, r.code === 0 && r.failed === 0 && extra(dir), r.raw ?? JSON.stringify(r.results?.filter((x) => !x.pass)))
}
green("prose that merely starts with the word TODO", { atlas: (a) => { sys(a, "tooling").watchOuts.push("TODO markers in code are fine; never leave one in the atlas.") } })
green("a make target on a multi-target line (release test:)", {
  atlas: (a) => { sys(a, "tooling").jobs.push({ name: "Tests", kind: "make-target", ref: "test", when: "on demand", what: "Runs the tests." }) },
  files: (f) => { f.Makefile = "release test:\n\tnpm run build\n" },
})
green("a switch named only in a UTF-16 file (a Windows script)", {
  files: (f) => { f["src/lib/auth.ts"] = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("export const ttl = Number(process.env.SESSION_TTL_HOURS ?? 24)\n", "utf16le")]) },
})
green("a switch spelled as a flag or with a $ prefix", {
  atlas: (a) => { sys(a, "tooling").switches.push({ name: "--dry-run", what: "Reports only." }, { name: "$UpdateMode", what: "Set on upgrades." }) },
  files: (f) => { f["scripts/sweep.js"] = "if (process.argv.includes('--dry-run')) {}\n// ${If} $UpdateMode == 1\n" },
})
{
  const dir = makeRepo()
  const rootCfg = JSON.parse(readFileSync(join(dir, "docs/atlas/atlas.config.json"), "utf8"))
  writeFileSync(join(dir, "atlas.config.json"), JSON.stringify({ ...rootCfg, root: ".", atlas: "docs/atlas/atlas.json" }))
  const r = spawnSync(process.execPath, [CLI, "--dir", dir, "check"], { cwd: dir, encoding: "utf8" })
  t("an atlas folder at the repo root is refused (its own files could not be kept off the map)", r.status === 2 && /must be a subfolder of the repo root/.test(r.stderr), r.stdout + r.stderr)
}
if (process.platform === "win32" || process.platform === "darwin") {
  const dir = makeRepo({
    atlas: (a) => { sys(a, "fees-tax").switches.push({ name: "GHOST_SWITCH", what: "x" }) },
    files: (f) => { f["docs/atlas/notes.ts"] = "GHOST_SWITCH\n" },
  })
  const r = spawnSync(process.execPath, [CLI, "--dir", join(dir, "Docs", "Atlas"), "check", "--json"], { cwd: dir, encoding: "utf8" })
  const sw = JSON.parse(r.stdout || "{}").results?.find((x) => x.code === "names.switches")
  t("the atlas folder is skipped whatever case --dir uses (case-insensitive disks)", sw && !sw.pass, r.stdout.slice(0, 300) + r.stderr)
}

// ---------------------------------------------------------------- 3. lookup
console.log("\n--- 3. the lookup ---")
const repo = makeRepo()
let r = run(repo, [])
t("no argument prints the index by group", r.code === 0 && r.out.includes("Commerce:") && r.out.includes("  fees-tax — Fees and tax: "), r.out)
r = run(repo, ["fees-tax"])
t("an id prints that entry in full", r.code === 0 && r.out.startsWith("Fees and tax [fees-tax] (Commerce)") && r.out.includes("FEES_PAUSED — Charges no fee") && r.out.includes("Owns: src/lib/fees.ts"), r.out)
r = run(repo, ["fees-tax", "--json"])
t("an id with --json prints the entry as atlas.json holds it", r.code === 0 && JSON.parse(r.stdout).switches[0].name === "FEES_PAUSED", r.out)
r = run(repo, ["src/lib/fees.ts"])
t("a path names its owner and prints the entry", r.code === 0 && r.out.startsWith("src/lib/fees.ts belongs to fees-tax."), r.out)
r = run(repo, [".\\src\\lib\\fees.ts"])
t("a Windows ./ path finds the same owner", r.code === 0 && r.out.startsWith("src/lib/fees.ts belongs to fees-tax."), r.out)
r = run(repo, ["src/app/api/orders/[id]/route.ts"])
t("[id] in a path is literal", r.code === 0 && r.out.includes("belongs to orders."), r.out)
r = run(repo, ["Makefile"])
t("a root file without a slash finds its owner", r.code === 0 && r.out.includes("Makefile belongs to tooling."), r.out)
r = run(repo, ["src/lib/nothing.ts"])
t("a path that is neither owned nor mentioned exits 1 and says so", r.code === 1 && r.out.startsWith('Nothing in the atlas mentions "src/lib/nothing.ts", and no file at that path'), r.out)
const gapRepo = makeRepo({ files: (f) => { f["src/lib/gap.ts"] = "1\n" } })
r = run(gapRepo, ["src/lib/gap.ts"])
t("a real file no system owns exits 1 and names the coverage gap", r.code === 1 && r.out.startsWith("No system owns src/lib/gap.ts"), r.out)
r = run(repo, [join(repo, "src", "lib", "fees.ts")])
t("an absolute path finds its owner", r.code === 0 && r.out.startsWith("src/lib/fees.ts belongs to fees-tax."), r.out)
r = run(repo, ["lib/fees.ts"], CLI, join(repo, "src"))
t("a path relative to the current folder finds its owner", r.code === 0 && r.out.startsWith("src/lib/fees.ts belongs to fees-tax."), r.out)
r = run(repo, ["fee", "is", "taken"])
t("search reaches flow steps", r.code === 0 && r.out.includes('flow "A sale", fees-tax: The fee is taken.'), r.out)
r = run(repo, ["03:00"])
t("search reaches a job's schedule", r.code === 0 && r.out.includes("tooling — "), r.out)
r = run(repo, ["every", "order", "takes"])
t("search reaches a connection's reason", r.code === 0 && r.out.includes("orders — "), r.out)
r = run(repo, ["tooling", "builds", "and", "ships"])
t("search reaches the overview", r.code === 0 && r.out.includes("overview: Orders take a fee"), r.out)
r = run(repo, ["0.07"])
t("a dotted value is searched, not taken for a path", r.code === 1 && r.out.startsWith('Nothing in the atlas mentions "0.07"'), r.out)
const stampRepo = makeRepo({ commit: true })
r = run(stampRepo, ["stamp", "duty"])
t("a command refuses stray words instead of acting (stamp duty)", r.code === 2 && r.out.includes("atlas --search stamp duty") && !JSON.parse(readFileSync(join(stampRepo, "docs/atlas/atlas.json"), "utf8")).verified, r.out)
r = run(repo, ["render", "pipeline", "extra"])
t("render refuses a second stray word", r.code === 2 && !existsSync(join(repo, "pipeline")), r.out)
r = run(repo, ["--search", "check"])
t("--search searches even when the first word is a command", r.code === 0 && r.out.includes("tooling — "), r.out)
r = run(repo, ["escrowed"])
t("a word found only in a summary finds the system", r.code === 0 && r.out.includes("fees-tax — "), r.out)
r = run(repo, ["escrow"])
t("a word finds glossary terms", r.code === 0 && r.out.includes("Escrow — Money held until delivery."), r.out)
r = run(repo, ["stale", "cron"])
t("several words must all match (stale + cron -> orders only)", r.code === 0 && r.out.includes("orders — ") && !r.out.includes("fees-tax — "), r.out)
r = run(repo, ["round", "once"])
t("a word only in a watch-out is listed under 'Mentioned in'", r.code === 0 && r.out.startsWith("Mentioned in:") && r.out.includes("fees-tax — "), r.out)
r = run(repo, ["overview"])
t("overview prints the about text and every flow step with its system", r.code === 0 && r.out.includes("A fake shop") && r.out.includes("Flow: A sale") && r.out.includes("  2. Fees and tax [fees-tax]: The fee is taken."), r.out)
r = run(repo, ["zzzz"])
t("a word nothing mentions exits 1", r.code === 1, r.out)
r = spawnSync(process.execPath, [CLI, "check"], { cwd: tmpdir(), encoding: "utf8" })
t("with no atlas folder it explains and exits 2", r.status === 2 && /No atlas\.config\.json/.test(r.stderr), r.stderr)

// Glob semantics, through the lookup a session runs.
const globRepo = makeRepo({
  atlas: (a) => { sys(a, "accounts").owns = ["src/lib/auth.ts", "src/pages/**", "**/*.prisma", "src/{lib,pages}/h?me.tsx"] },
  files: (f) => { f["src/lib/home.tsx"] = "1\n"; f["top.prisma"] = "model X {}\n" },
})
t("**/ matches zero folders (top.prisma)", run(globRepo, ["top.prisma"]).out.includes("belongs to"), run(globRepo, ["top.prisma"]).out)
t("{a,b} and ? match (src/lib/home.tsx)", run(globRepo, ["src/lib/home.tsx"]).out.includes("belongs to accounts."), run(globRepo, ["src/lib/home.tsx"]).out)
t("* stays inside one folder (src/*.ts does not claim src/lib/fees.ts)", (() => {
  const g = makeRepo({ atlas: (a) => { sys(a, "fees-tax").owns = ["src/*.ts", "scripts/check-fees.js"] } })
  return check(g).results.find((x) => x.code === "coverage.unowned")?.pass === false
})())

// ---------------------------------------------------------------- 4. render
console.log("\n--- 4. render ---")
const rRepo = makeRepo({ atlas: (a) => { sys(a, "accounts").summary = "Ends with </script><script>alert(1)</script>" } })
r = run(rRepo, ["render"])
const html = existsSync(join(rRepo, "docs/atlas/atlas.html")) ? readFileSync(join(rRepo, "docs/atlas/atlas.html"), "utf8") : ""
t("render writes a complete page", r.code === 0 && html.startsWith("<!doctype html>") && html.includes("</html>"), r.out)
t("the data replaced the marker", !html.includes("/*ATLAS_DATA*/") && html.includes('"Fixture Atlas"'), html.slice(0, 200))
t("a </script> inside the data cannot close the script element", !html.includes("</script><script>alert(1)") && html.includes("\\u003c/script>"))
t("the page counts files and the configured extra stats", /"files":\d+/.test(html) && html.includes('"label":"API routes","value":2'), html.match(/"stats":\{[^}]*\}/)?.[0])
t("the page makes no network request (no http(s) src or href)", !/(src|href)=["']https?:/i.test(html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, "")))

// ---------------------------------------------------------------- 5. init and inventory
console.log("\n--- 5. init and inventory ---")
const fresh = makeRepo({ files: (f) => { for (const k of Object.keys(f)) if (k.startsWith("docs/atlas/")) delete f[k] } })
r = spawnSync(process.execPath, [CLI, "init"], { cwd: fresh, encoding: "utf8" })
const cfg = existsSync(join(fresh, "docs/atlas/atlas.config.json")) ? JSON.parse(readFileSync(join(fresh, "docs/atlas/atlas.config.json"), "utf8")) : {}
t("init vendors the CLI byte for byte", r.status === 0 && existsSync(join(fresh, "docs/atlas/atlas.mjs")) && readFileSync(join(fresh, "docs/atlas/atlas.mjs"), "utf8") === CLI_TEXT, r.stdout + r.stderr)
t("init detects all five add-ons", ["models", "packageScripts", "githubWorkflows", "vercelCrons", "rules"].every((k) => cfg.addons?.[k]), JSON.stringify(cfg.addons))
t("init reads Prisma models by glob, so a new schema file is covered too", JSON.stringify(cfg.addons?.models?.files) === '["**/*.prisma"]', JSON.stringify(cfg.addons?.models))
t("init points root at the repo and writes the README and .gitignore", cfg.root === "../.." && existsSync(join(fresh, "docs/atlas/README.md")) && readFileSync(join(fresh, "docs/atlas/.gitignore"), "utf8").includes(".build/"))
r = spawnSync(process.execPath, [join(fresh, "docs/atlas/atlas.mjs"), "inventory"], { cwd: fresh, encoding: "utf8" })
t("the vendored copy finds its own folder; inventory lists folders and instruction files", r.status === 0 && r.stdout.includes("src/app/") && r.stdout.includes(".claude/rules/money.md") && r.stdout.includes("CLAUDE.md"), r.stdout + r.stderr)
r = run(makeRepo({ files: (f) => { f["src/lib/new-thing.ts"] = "1\n" } }), ["inventory", "--unowned"])
t("inventory --unowned lists exactly the unowned file", r.code === 0 && r.out.includes("1 of ") && r.out.includes("  src/lib/new-thing.ts"), r.out)

// ---------------------------------------------------------------- 6. merge
console.log("\n--- 6. merge ---")
const mRepo = makeRepo()
mkdirSync(join(mRepo, "docs/atlas/.build"), { recursive: true })
writeFileSync(join(mRepo, "docs/atlas/.build/draft.json"), JSON.stringify({
  systems: [{ id: "accounts", summary: "Sessions last SESSION_TTL_HOURS hours.", watchOuts: ["Never log a session token."], ownershipNotes: ["src/pages/home.tsx may belong to a site system"] }, { id: "ghost", summary: "x" }],
  glossary: [{ term: "Session", meaning: "A signed-in visit." }, { term: "sweep", meaning: "A job that tidies stale records." }],
  findings: [{ id: "accounts", field: "summary", severity: "WRONG" }, { id: "accounts", field: "watchOuts", severity: "omission" }],
}))
r = run(mRepo, ["merge", "docs/atlas/.build/draft.json"])
const merged = JSON.parse(readFileSync(join(mRepo, "docs/atlas/atlas.json"), "utf8"))
t("merge counts the changed fields", r.code === 0 && r.out.startsWith("Changed 2 system fields across 1 systems; glossary +1 new, 0 reworded"), r.out)
t("merge reports unknown ids, findings and notes", r.out.includes("ghost") && r.out.includes("WRONG 1, OMISSION 1") && r.out.includes("src/pages/home.tsx may belong"), r.out)
t("merge wrote the fields and kept the rest", sys(merged, "accounts").summary === "Sessions last SESSION_TTL_HOURS hours." && sys(merged, "accounts").owns.length === 2 && merged.glossary.length === 3)
r = run(mRepo, ["merge", "docs/atlas/.build/draft.json"])
t("merging the same draft again changes nothing", r.out.startsWith("Changed 0 system fields"), r.out)
t("the merged atlas still passes", check(mRepo).failed === 0)
mkdirSync(join(mRepo, "docs/atlas/.build/run-2"), { recursive: true })
writeFileSync(join(mRepo, "docs/atlas/.build/run-2/fix-1.json"), JSON.stringify({ systems: [{ id: "accounts", oneLiner: "Signs people in." }] }))
writeFileSync(join(mRepo, "docs/atlas/.build/run-2/fix-2.json"), JSON.stringify({ remove: { glossary: ["SESSION"], flows: ["A sale"] }, flows: [{ name: "A purchase", steps: [{ system: "orders", text: "Stored." }] }] }))
r = run(mRepo, ["merge", "docs/atlas/.build/run-2"])
const m2 = JSON.parse(readFileSync(join(mRepo, "docs/atlas/atlas.json"), "utf8"))
t("merge takes a folder (no shell globbing) and reads only that run's files", r.code === 0 && r.out.includes("(from 2 files)") && sys(m2, "accounts").oneLiner === "Signs people in.", r.out)
t("merge removes glossary terms (any case) and flows by name", !m2.glossary.some((g) => g.term === "Session") && m2.flows.length === 1 && m2.flows[0].name === "A purchase" && r.out.includes("1 removed"), r.out)

// ---------------------------------------------------------------- 7. changed and stamp
console.log("\n--- 7. changed and stamp ---")
const cRepo = makeRepo({ commit: true })
r = run(cRepo, ["stamp"])
const stamped = JSON.parse(readFileSync(join(cRepo, "docs/atlas/atlas.json"), "utf8"))
t("stamp records HEAD", r.code === 0 && /^[0-9a-f]{40}$/.test(stamped.verified?.commit ?? ""), r.out)
git(cRepo, ["add", "-A"])
git(cRepo, ["commit", "-q", "-m", "stamp"])
writeFileSync(join(cRepo, "src/lib/fees.ts"), "export const paused = process.env.FEES_PAUSED === '1'\n")
writeFileSync(join(cRepo, "src/lib/brand-new.ts"), "export {}\n")
renameSync(join(cRepo, "scripts/sweep.js"), join(cRepo, "scripts/sweep2.js"))
git(cRepo, ["add", "-A"])
git(cRepo, ["commit", "-q", "-m", "work"])
writeFileSync(join(cRepo, "src/pages/home.tsx"), "export default function Home() { return 1 }\n")
unlinkSync(join(cRepo, "src/app/api/orders/[id]/route.ts"))
r = run(cRepo, ["changed"])
t("changed defaults to verified.commit and maps files to systems", r.code === 0 && r.out.includes("fees-tax — Fees and tax (1)") && r.out.includes("accounts — Accounts (1)"), r.out)
t("changed lists a renamed file as delete + add", r.out.includes("D scripts/sweep.js") && r.out.includes("A scripts/sweep2.js"), r.out)
t("changed lists new unowned files", r.out.includes("New files no system owns yet (2)") && r.out.includes("A src/lib/brand-new.ts"), r.out)
t("changed flags a deleted key file", r.out.includes("orders: src/app/api/orders/[id]/route.ts"), r.out)
const uRepo = makeRepo({ commit: true })
writeFileSync(join(uRepo, "src/lib/auth.ts"), "export const ttl = Number(process.env.SESSION_TTL_HOURS ?? 12)\n")
r = run(uRepo, ["changed"])
t("with no verified.commit, changed starts from the last commit that touched atlas.json", r.code === 0 && r.out.includes("accounts — Accounts (1)"), r.out)
{
  // A non-ASCII file name: git quotes it unless the diff is read with -z.
  const u = makeRepo({ commit: true, files: (f) => { f["src/lib/café.ts"] = "1\n" }, atlas: (a) => { sys(a, "fees-tax").owns.push("src/lib/café.ts") } })
  run(u, ["stamp"])
  writeFileSync(join(u, "src/lib/café.ts"), "2\n")
  r = run(u, ["changed"])
  t("changed maps a non-ASCII file name to its owner", r.code === 0 && r.out.includes("fees-tax — Fees and tax (1)") && r.out.includes("M src/lib/café.ts"), r.out)
}
{
  // A monorepo: the atlas maps packages/app only; git paths are relative to the top level.
  const mono = mkdtempSync(join(tmpdir(), "atlas-mono-"))
  temps.push(mono)
  const app = join(mono, "packages", "app")
  const a = structuredClone(baseAtlas)
  const fsm = { ...baseFiles, "docs/atlas/atlas.json": JSON.stringify(a, null, 2) }
  for (const [p, c] of Object.entries(fsm)) {
    mkdirSync(dirname(join(app, p)), { recursive: true })
    writeFileSync(join(app, p), c)
  }
  mkdirSync(join(mono, "packages", "other"), { recursive: true })
  writeFileSync(join(mono, "packages", "other", "x.ts"), "1\n")
  git(mono, ["init", "-q"])
  git(mono, ["add", "-A"])
  git(mono, ["commit", "-q", "-m", "mono"])
  const runApp = (args) => spawnSync(process.execPath, [CLI, "--dir", join(app, "docs/atlas"), ...args], { cwd: app, encoding: "utf8" })
  runApp(["stamp"])
  writeFileSync(join(app, "src/lib/fees.ts"), "export const paused = process.env.FEES_PAUSED === '1'\n")
  writeFileSync(join(mono, "packages", "other", "x.ts"), "2\n")
  const ra = runApp(["changed"])
  t("changed works when the atlas maps a monorepo package (root below the git top level)", ra.status === 0 && ra.stdout.includes("fees-tax — Fees and tax (1)") && ra.stdout.startsWith("1 files changed") && !ra.stdout.includes("other/x.ts"), ra.stdout + ra.stderr)
  t("check works in the monorepo package", JSON.parse(runApp(["check", "--json"]).stdout).failed === 0)
}
{
  // verified.commit missing locally (shallow clone, rewritten branch): fall back, and say so.
  const g = makeRepo({ commit: true, atlas: (a) => { a.verified = { commit: "0123456789abcdef0123456789abcdef01234567", date: "2026-01-01" } } })
  writeFileSync(join(g, "src/lib/auth.ts"), "export const ttl = 1\n")
  r = run(g, ["changed"])
  t("changed falls back to the last commit that touched atlas.json when verified.commit is gone", r.code === 0 && r.out.includes("is not in this repository; starting from the last commit") && r.out.includes("accounts — Accounts (1)"), r.out)
}
r = run(cRepo, ["changed", "nope123"])
t("changed refuses an unknown commit", r.code === 2 && r.out.includes("not a commit"), r.out)

// ---------------------------------------------------------------- done
for (const d of temps) {
  try {
    rmSync(d, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    // A locked temp folder on Windows is harmless.
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exitCode = 1
