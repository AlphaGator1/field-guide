/**
 * `guide check`: keeps the map honest. Reads files and runs `git ls-files`
 * only: no network, no database, no environment variables.
 *
 * A map that silently misses a new file, or names a deleted one, is worse
 * than none, because it is read as complete. So this fails when:
 *   - a file in the configured universe is claimed by no system's `owns` globs;
 *   - anything the guide NAMES no longer exists: an `owns` glob matching
 *     nothing, a key file, a rule, a check, a job, a switch, a data model, a
 *     connection or flow step pointing at no system;
 *   - an optional stack add-on finds something unclaimed (a data model, a
 *     package.json script, a GitHub workflow, a Vercel cron, a rules file);
 *   - the one-entry lookup would print an entry wrong or too long.
 * It does NOT check that the prose is still true: a system whose behaviour
 * changes without a file appearing or disappearing keeps passing.
 *
 * Every assertion has a stable code (CHECK_CODES). The plugin's own test
 * suite injects, for each code, the defect it exists for and requires that
 * exact code to fail, so no assertion here is vacuous.
 */
import { join } from "path"
import { globToRegExp, matchesAny, normalizePath, ownersOf, renderIndex, renderSystem } from "./lookup"
import { inRepo, listRepoFiles, listUntracked, readJson, readText, resolveArgPath, universe, type Ctx } from "./repo"
import { ARRAY_FIELDS, JOB_KINDS, SUBCOMMANDS, SYSTEM_FIELDS, type Guide, type Config, type System } from "./types"

export type Result = { code: string; section: string; name: string; pass: boolean; detail?: string }

/** Every assertion code this check can emit. The test suite proves each one goes red on its defect. */
export const CHECK_CODES = [
  "shape.title", "shape.nonempty", "shape.group-ids", "shape.system-ids", "shape.id-format", "shape.fields",
  "shape.known-group", "shape.prose", "shape.single-line", "shape.owns-keyfiles", "shape.group-used", "shape.no-todo",
  "coverage.include", "coverage.unowned", "coverage.dead-glob",
  "names.key-files", "names.connects", "names.flows", "names.glossary", "names.rules", "names.checks",
  "names.jobs", "names.switches", "names.models",
  "addon.models.found", "addon.models.claimed", "addon.scripts.found", "addon.scripts.claimed",
  "addon.workflows.found", "addon.workflows.claimed", "addon.crons.found", "addon.crons.claimed",
  "addon.rules.found", "addon.rules.claimed",
  "lookup.entry-sections", "lookup.entry-complete", "lookup.entry-size", "lookup.index", "lookup.owner-path",
] as const

const MODEL_PRESETS: Record<string, { files: string[]; pattern: string; flags: string }> = {
  prisma: { files: ["**/*.prisma"], pattern: "^\\s*model\\s+(\\w+)\\s*\\{", flags: "gm" },
  sql: { files: ["**/*.sql"], pattern: "^\\s*create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:[\\w\"`\\[\\]]+\\.)?[\"`\\[]?(\\w+)", flags: "gim" },
  django: { files: ["**/models.py", "**/models/*.py"], pattern: "^class\\s+(\\w+)\\s*\\([^)]*\\bmodels\\.Model\\b", flags: "gm" },
  sqlalchemy: { files: ["**/*.py"], pattern: "^class\\s+(\\w+)\\s*\\([^)]*\\b(?:Base|DeclarativeBase|db\\.Model)\\b", flags: "gm" },
}

/**
 * How an entry prints, pinned HERE as literals and never imported from the
 * renderer: a check that reads the renderer's own list stays green when the
 * renderer reorders or relabels it (the defect injection found exactly that).
 */
const ENTRY_SECTIONS = [
  "How it works:", "Watch out:", "Connected to:", "Key files:", "Jobs:", "Switches:",
  "Data models:", "Rules:", "Checks:", "Owns:",
] as const
const KIND_LABELS: Record<string, string> = {
  "github-action": "GitHub Action", "vercel-cron": "Vercel Cron", "package-script": "package script",
  "make-target": "make target", file: "script", external: "external",
}

/** Prose, not code (config `prose` overrides): a switch named only in these files is not "in the code". */
export const DEFAULT_PROSE = [
  "**/*.{md,mdx,markdown,rst,txt,adoc,asciidoc,MD,TXT,RST}",
  "**/{CHANGELOG,CHANGES,HISTORY,AUTHORS,LICENSE,LICENCE,NOTICE,COPYING}*",
]

const ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const str = (v: unknown) => (typeof v === "string" ? v : "")
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const sample = (items: string[], max = 25) => (items.length > max ? `${items.slice(0, max).join(", ")} (+${items.length - max} more)` : items.join(", "))
const dupes = (items: string[]) => items.filter((x, i) => items.indexOf(x) !== i)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A switch name as a whole identifier: FEES_PAUSED does not match FEES_PAUSED_V2 or MY_FEES_PAUSED. */
export function identifierPattern(name: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRe(name)}(?![A-Za-z0-9_])`)
}

/** A copy every later section can walk without crashing: missing arrays become [], missing strings "". */
function normalize(raw: Guide): Guide {
  const systems = arr<System>(raw?.systems).map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const f of SYSTEM_FIELDS) out[f] = (ARRAY_FIELDS as readonly string[]).includes(f) ? arr(o[f]) : str(o[f])
    return out as unknown as System
  })
  return { ...raw, title: str(raw?.title), groups: arr(raw?.groups), systems, flows: arr(raw?.flows), glossary: arr(raw?.glossary) }
}

function readPackageScripts(ctx: Ctx, all: string[], file = "package.json"): Record<string, string> | undefined {
  if (!all.includes(file)) return undefined
  try {
    const pkg = readJson<{ scripts?: Record<string, string> }>(join(ctx.root, file))
    return pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : undefined
  } catch {
    return undefined
  }
}

function readVercelCrons(ctx: Ctx, all: string[], file = "vercel.json"): string[] | undefined {
  if (!all.includes(file)) return undefined
  try {
    const v = readJson<{ crons?: { path?: string }[] }>(join(ctx.root, file))
    return arr<{ path?: string }>(v.crons).map((c) => str(c?.path)).filter(Boolean)
  } catch {
    return undefined
  }
}

/** Targets a Makefile defines, including every name on a multi-target line (`build test: deps`). */
function makeTargets(ctx: Ctx, all: string[]): Set<string> {
  for (const f of ["Makefile", "makefile", "GNUmakefile"]) {
    const text = all.includes(f) ? readText(ctx.root, f) : undefined
    if (text === undefined) continue
    const names = new Set<string>()
    for (const m of text.matchAll(/^([^\s:=#][^:=#]*?)\s*::?(?!=)/gm)) for (const t of m[1].split(/\s+/)) if (t) names.add(t)
    return names
  }
  return new Set()
}

export function modelNames(ctx: Ctx, all: string[], addon: NonNullable<Config["addons"]["models"]>): string[] {
  const preset = addon.preset ? MODEL_PRESETS[addon.preset] : undefined
  const globs = addon.files?.length ? addon.files : preset?.files ?? []
  const re = new RegExp(addon.pattern ?? preset?.pattern ?? "(?!)", addon.pattern ? "gm" : preset?.flags ?? "gm")
  const names = new Set<string>()
  for (const p of all.filter((f) => matchesAny(globs, f))) {
    const text = readText(ctx.root, p) ?? ""
    for (const m of text.matchAll(re)) if (m[1]) names.add(m[1])
  }
  return [...names].sort()
}

export function runCheck(ctx: Ctx, raw: Guide): Result[] {
  const results: Result[] = []
  let section = ""
  const ok = (code: (typeof CHECK_CODES)[number], name: string, pass: boolean, detail?: string) =>
    results.push({ code, section, name, pass, detail: pass ? undefined : detail })

  const guide = normalize(raw)
  const cfg = ctx.config
  const all = listRepoFiles(ctx.root, cfg.files)
  const files = universe(ctx, all)
  const ids = guide.systems.map((s) => s.id)
  const systems = guide.systems

  // ---------------------------------------------------------------- shape
  section = "shape"
  ok("shape.title", "the guide has a title", nonEmpty(raw?.title))
  ok("shape.nonempty", "the guide has groups and systems", guide.groups.length > 0 && systems.length > 0)
  const groupIds = guide.groups.map((g) => str(g?.id))
  ok("shape.group-ids", "group ids are present and unique", groupIds.every(nonEmpty) && dupes(groupIds).length === 0, sample(dupes(groupIds)) || "a group has no id")
  ok("shape.system-ids", "system ids are unique", dupes(ids).length === 0, sample(dupes(ids)))
  const badIds = ids.filter((id) => !ID_FORMAT.test(id) || (SUBCOMMANDS as readonly string[]).includes(id))
  ok("shape.id-format", "system ids are lowercase-kebab and not a CLI command (they become URLs and arguments)", badIds.length === 0, sample(badIds.map((i) => JSON.stringify(i))))
  const badFields = arr<Record<string, unknown>>(raw?.systems).flatMap((s, i) => {
    const o = s && typeof s === "object" ? s : {}
    const id = str(o.id) || `#${i}`
    const missing = SYSTEM_FIELDS.filter((f) => !Object.prototype.hasOwnProperty.call(o, f))
    const wrong = SYSTEM_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(o, f) && ((ARRAY_FIELDS as readonly string[]).includes(f) ? !Array.isArray(o[f]) : typeof o[f] !== "string"))
    return [...missing.map((f) => `${id}: missing ${f}`), ...wrong.map((f) => `${id}: ${f} has the wrong type`)]
  })
  ok("shape.fields", "every system has every field, with the right type", badFields.length === 0, sample(badFields))
  const groupSet = new Set(groupIds)
  const orphans = systems.filter((s) => !groupSet.has(s.group))
  ok("shape.known-group", "every system belongs to a known group", orphans.length === 0, sample(orphans.map((s) => `${s.id} -> ${JSON.stringify(s.group)}`)))
  const noProse = systems.filter((s) => ![s.name, s.oneLiner, s.summary].every(nonEmpty))
  ok("shape.prose", "every system has a name, a one-liner and a summary", noProse.length === 0, sample(noProse.map((s) => s.id)))
  const multi = [
    ...systems.filter((s) => /[\r\n]/.test(s.name + s.oneLiner)).map((s) => s.id),
    ...guide.groups.filter((g) => /[\r\n]/.test(str(g?.name))).map((g) => `group ${str(g?.id)}`),
  ]
  ok("shape.single-line", "names and one-liners fit on one line (the index prints one line per system)", multi.length === 0, sample(multi))
  const thin = systems.filter((s) => s.owns.length === 0 || s.keyFiles.length === 0)
  ok("shape.owns-keyfiles", "every system owns at least one glob and names at least one key file", thin.length === 0, sample(thin.map((s) => s.id)))
  const empty = guide.groups.filter((g) => !systems.some((s) => s.group === str(g?.id)))
  ok("shape.group-used", "every group has at least one system", empty.length === 0, sample(empty.map((g) => str(g?.id))))
  // The skeleton's placeholder is exactly "TODO"; real prose that merely starts with the word is fine.
  const todos = JSON.stringify(raw ?? {}).match(/"\s*TODO\s*"/g)?.length ?? 0
  ok("shape.no-todo", "no TODO placeholder is left", todos === 0, `${todos} left`)

  // ------------------------------------------------------------- coverage
  section = "coverage"
  // Include globs are tested before excludes but never against the guide's own files, so a renamed
  // folder cannot stay green on the strength of the guide folder inside it.
  const candidates = all.filter((p) => !ctx.isGuideFile(p))
  const deadInclude = cfg.include.filter((g) => !candidates.some((p) => globToRegExp(g).test(p)))
  ok("coverage.include", `every include glob matches a file, and the map has files to cover (${files.length})`, deadInclude.length === 0 && files.length > 0,
    deadInclude.length ? `matches nothing (renamed or deleted folder?): ${sample(deadInclude)}` : "include minus exclude left no files")
  const untracked = listUntracked(ctx.root, cfg.files)
  const unowned = files.filter((p) => ownersOf(guide, p).length === 0)
  const unownedTracked = unowned.filter((p) => !untracked.has(p))
  const unownedNew = unowned.filter((p) => untracked.has(p))
  ok("coverage.unowned", `every file is owned by a system (${files.length} files)`, unowned.length === 0,
    [unownedTracked.length ? `unowned: ${sample(unownedTracked, 40)}` : "", unownedNew.length ? `unowned and not yet in git (claim the real ones; delete or gitignore scratch files, never claim them): ${sample(unownedNew, 40)}` : ""].filter(Boolean).join("\n        "))
  const dead = systems.flatMap((s) => s.owns.filter((g) => !files.some((p) => globToRegExp(g).test(p))).map((g) => `${s.id}: ${g}`))
  ok("coverage.dead-glob", "every owns glob matches at least one file on the map", dead.length === 0, sample(dead))

  // ---------------------------------------------------------------- names
  section = "names"
  const badKeys = systems.flatMap((s) => s.keyFiles.filter((k) => !nonEmpty(k?.path) || !inRepo(all, k.path) || !nonEmpty(k?.what)).map((k) => `${s.id}: ${str(k?.path)}`))
  ok("names.key-files", "every key file is in the repo (exact case) and says what it is", badKeys.length === 0, sample(badKeys))
  const badLinks = systems.flatMap((s) => s.connects.filter((l) => !ids.includes(str(l?.to)) || l.to === s.id || !nonEmpty(l?.why)).map((l) => `${s.id} -> ${str(l?.to)}`))
  ok("names.connects", "every connection points at another system and says why", badLinks.length === 0, sample(badLinks))
  const flows = arr<{ name?: string; steps?: unknown }>(guide.flows)
  const badSteps = flows.flatMap((f) => {
    const steps = arr<{ system?: string; text?: string }>(f?.steps)
    const bad = steps.filter((st) => !ids.includes(str(st?.system)) || !nonEmpty(st?.text)).map((st) => `${str(f?.name)}: ${str(st?.system)}`)
    return !nonEmpty(f?.name) || steps.length === 0 ? [`${str(f?.name) || "(unnamed flow)"}: no name or no steps`, ...bad] : bad
  })
  ok("names.flows", "the big-picture flows exist and every step names a system", flows.length > 0 && badSteps.length === 0, flows.length ? sample(badSteps) : "no flows")
  const terms = arr<{ term?: string; meaning?: string }>(guide.glossary)
  const badTerms = terms.filter((g) => !nonEmpty(g?.term) || !nonEmpty(g?.meaning)).map((g) => str(g?.term) || "(empty term)")
  const termDupes = dupes(terms.map((g) => str(g?.term).trim().toLowerCase()))
  ok("names.glossary", "every glossary entry has a term and a meaning, and no term repeats", badTerms.length === 0 && termDupes.length === 0, sample([...badTerms, ...termDupes.map((t) => `repeated: ${t}`)]))
  const badRules = systems.flatMap((s) => s.rules.filter((r) => !nonEmpty(r) || !inRepo(all, r)).map((r) => `${s.id}: ${r}`))
  ok("names.rules", "every rule or instruction file the guide names is in the repo", badRules.length === 0, sample(badRules))

  const scripts = readPackageScripts(ctx, all, cfg.addons.packageScripts?.file) ?? readPackageScripts(ctx, all) ?? {}
  const checkResolves = (c: string) =>
    Object.prototype.hasOwnProperty.call(scripts, c) || (nonEmpty(c) && (inRepo(all, c) || all.some((p) => globToRegExp(normalizePath(c)).test(p))))
  const badChecks = systems.flatMap((s) => s.checks.filter((c) => !checkResolves(str(c))).map((c) => `${s.id}: ${c}`))
  ok("names.checks", "every check is a package.json script or a test file/glob in the repo", badChecks.length === 0, sample(badChecks))

  const crons = readVercelCrons(ctx, all, cfg.addons.vercelCrons?.file) ?? []
  const targets = makeTargets(ctx, all)
  const badJobs = systems.flatMap((s) =>
    s.jobs.filter((j) => {
      if (![j?.name, j?.when, j?.what, j?.ref].every(nonEmpty)) return true
      switch (j.kind) {
        case "github-action": return !all.includes(normalizePath(j.ref))
        case "vercel-cron": return !crons.includes(j.ref)
        case "package-script": return !Object.prototype.hasOwnProperty.call(scripts, j.ref)
        case "make-target": return !targets.has(j.ref)
        case "file": return !all.includes(normalizePath(j.ref))
        case "external": return false
        default: return true
      }
    }).map((j) => `${s.id}: ${str(j?.kind)} ${str(j?.ref)}`))
  ok("names.jobs", `every job has a name, when and what, and a real ref for its kind (${JOB_KINDS.join(" | ")})`, badJobs.length === 0, sample(badJobs))

  // A switch must still appear, as a whole identifier, in the CODE it gates: the files on the map
  // minus prose (docs, changelogs, instruction files). The guide's own files and any rendered page
  // are never searched: they name every switch, so searching them would make this vacuous.
  const emptySwitch = systems.flatMap((s) => s.switches.filter((w) => !nonEmpty(w?.name) || !nonEmpty(w?.what)).map(() => `${s.id}: a switch with no name or no what`))
  const pending = new Map([...new Set(systems.flatMap((s) => s.switches.map((w) => str(w?.name))))].filter(nonEmpty).map((n) => [n, identifierPattern(n)] as const))
  const prose = cfg.prose ?? DEFAULT_PROSE
  for (const p of files) {
    if (!pending.size) break
    if (matchesAny(prose, p)) continue
    const text = readText(ctx.root, p)
    if (text === undefined || text.includes('id="guide-data"')) continue
    for (const [n, re] of [...pending]) if (re.test(text)) pending.delete(n)
  }
  ok("names.switches", "every switch is named in the code (its exact identifier appears in a non-doc file on the map)", pending.size === 0 && emptySwitch.length === 0,
    sample([...emptySwitch, ...[...pending.keys()].map((n) => `not found in code: ${n}`)]))

  const modelsAddon = cfg.addons.models
  const models = modelsAddon ? modelNames(ctx, all, modelsAddon) : []
  const claimedModels = [...new Set(systems.flatMap((s) => s.models.map(str)))]
  const ghostModels = claimedModels.filter((m) => !models.includes(m))
  ok("names.models", "every data model the guide names exists (configure addons.models to name any)", ghostModels.length === 0,
    modelsAddon ? `not found: ${sample(ghostModels)}` : `models are named but no models add-on can verify them: ${sample(ghostModels)}`)

  // --------------------------------------------------------------- add-ons
  section = "add-ons"
  if (modelsAddon) {
    ok("addon.models.found", `the data-model parse found models (${models.length})`, models.length > 0, "configured, but no file matched the pattern: fix addons.models or remove it")
    const unclaimed = models.filter((m) => !claimedModels.includes(m))
    ok("addon.models.claimed", "every data model is claimed by a system", unclaimed.length === 0, sample(unclaimed))
  }
  const ps = cfg.addons.packageScripts
  if (ps) {
    const pkgScripts = readPackageScripts(ctx, all, ps.file)
    const re = new RegExp(ps.match ?? ".*")
    const names = Object.keys(pkgScripts ?? {}).filter((k) => re.test(k))
    ok("addon.scripts.found", `${ps.file ?? "package.json"} has scripts matching /${ps.match ?? ".*"}/ (${names.length})`, names.length > 0, "none found: fix addons.packageScripts or remove it")
    const named = new Set([...systems.flatMap((s) => s.checks), ...systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "package-script").map((j) => j.ref))])
    const unclaimed = names.filter((n) => !named.has(n))
    ok("addon.scripts.claimed", "every package script is a check or a package-script job of some system", unclaimed.length === 0, sample(unclaimed))
  }
  const gw = cfg.addons.githubWorkflows
  if (gw) {
    const dir = normalizePath(gw.dir ?? ".github/workflows")
    const wf = all.filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/") && /\.ya?ml$/.test(p))
    ok("addon.workflows.found", `${dir} has workflows (${wf.length})`, wf.length > 0, "none found: fix addons.githubWorkflows or remove it")
    const jobRefs = new Set(systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "github-action").map((j) => normalizePath(str(j.ref)))))
    const unclaimed = wf.filter((p) => !jobRefs.has(p))
    ok("addon.workflows.claimed", "every workflow is a github-action job of some system", unclaimed.length === 0, sample(unclaimed))
  }
  const vc = cfg.addons.vercelCrons
  if (vc) {
    const list = readVercelCrons(ctx, all, vc.file) ?? []
    ok("addon.crons.found", `${vc.file ?? "vercel.json"} has crons (${list.length})`, list.length > 0, "none found: fix addons.vercelCrons or remove it")
    const jobRefs = new Set(systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "vercel-cron").map((j) => j.ref)))
    const unclaimed = list.filter((c) => !jobRefs.has(c))
    ok("addon.crons.claimed", "every Vercel cron is a vercel-cron job of some system", unclaimed.length === 0, sample(unclaimed))
  }
  const ru = cfg.addons.rules
  if (ru) {
    const dir = normalizePath(ru.dir)
    const glob = globToRegExp(ru.glob ?? "**/*.md")
    const ruleFiles = all.filter((p) => p.startsWith(`${dir}/`) && glob.test(p.slice(dir.length + 1)))
    ok("addon.rules.found", `${dir} has rule files (${ruleFiles.length})`, ruleFiles.length > 0, "none found: fix addons.rules or remove it")
    const claimed = new Set(systems.flatMap((s) => s.rules.map((r) => normalizePath(str(r)))))
    const unclaimed = ruleFiles.filter((r) => !claimed.has(r))
    ok("addon.rules.claimed", "every rule file is claimed by a system", unclaimed.length === 0, sample(unclaimed))
  }

  // ---------------------------------------------------------------- lookup
  // A session reads ONE entry through `guide <id>` instead of the whole file, so the printed entry
  // must carry every field, exactly, under its own label; stay cheap; and find owners the way coverage does.
  section = "lookup"
  const badSections: string[] = []
  const incomplete: string[] = []
  const tooLong: string[] = []
  const sysName = (id: string) => systems.find((x) => x.id === id)?.name ?? id
  for (const s of systems) {
    const text = renderSystem(guide, s)
    const at = ENTRY_SECTIONS.map((l) => text.indexOf(`\n${l}`))
    const ordered = at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]))
    if (!text.startsWith(`${s.name} [${s.id}]`) || !ordered) {
      badSections.push(s.id)
      continue
    }
    // Every item's WHOLE line, built from this check's own templates, must sit under its own label.
    const linesOf = (k: number) => new Set(text.slice(at[k] + 1, k + 1 < at.length ? at[k + 1] : text.length).split("\n"))
    const listed = (k: number, items: string[]) => (items.length ? items.map((i) => `  - ${i}`) : [`${ENTRY_SECTIONS[k]} none`])
    const inline = (k: number, items: string[]) => [`${ENTRY_SECTIONS[k]} ${items.join(", ") || "none"}`]
    const expected: [number, string[]][] = [
      [0, s.journey.map((j, i) => `  ${i + 1}. ${j}`)],
      [1, listed(1, s.watchOuts)],
      [2, listed(2, s.connects.map((c) => `${sysName(str(c?.to))} [${str(c?.to)}]: ${str(c?.why)}`))],
      [3, listed(3, s.keyFiles.map((k) => `${str(k?.path)} — ${str(k?.what)}`))],
      [4, listed(4, s.jobs.map((j) => `${str(j?.name)} (${str(j?.when)}; ${KIND_LABELS[str(j?.kind)] ?? str(j?.kind)} ${str(j?.ref)}) — ${str(j?.what)}`))],
      [5, listed(5, s.switches.map((w) => `${str(w?.name)} — ${str(w?.what)}`))],
      [6, inline(6, s.models)], [7, inline(7, s.rules)], [8, inline(8, s.checks)], [9, inline(9, s.owns)],
    ]
    const head = text.slice(0, at[0])
    const missing = [
      ...[s.oneLiner, s.summary].filter((t) => nonEmpty(t) && !head.includes(t)).map((t) => `header: ${t.slice(0, 40)}`),
      ...expected.flatMap(([k, lines]) => {
        const have = linesOf(k)
        return lines.filter((l) => !have.has(l)).map((l) => `${ENTRY_SECTIONS[k]} ${l.trim().slice(0, 60)}`)
      }),
    ]
    if (missing.length) incomplete.push(`${s.id}: ${sample(missing, 3)}`)
    if (text.length > cfg.entryMaxChars) tooLong.push(`${s.id} (${text.length})`)
  }
  ok("lookup.entry-sections", "every entry opens with its name and id and prints every section in order", badSections.length === 0, sample(badSections))
  ok("lookup.entry-complete", "every entry prints every step, watch-out, link, key file, job, switch, model, rule, check and glob in full, under its own label", incomplete.length === 0, sample(incomplete, 10))
  ok("lookup.entry-size", `every entry stays under ${cfg.entryMaxChars} characters (a ratchet: trim the prose, never raise it to fit)`, tooLong.length === 0, sample(tooLong))
  const index = renderIndex(guide)
  const misIndexed = systems.filter((s) => index.split(`\n  ${s.id} — `).length !== 2)
  ok("lookup.index", "the index lists every system exactly once", misIndexed.length === 0, sample(misIndexed.map((s) => s.id)))
  // Sessions pass paths as they hold them: Windows-style, ./-prefixed, or absolute.
  const lost = systems.flatMap((s) => {
    const p = files.find((f) => matchesAny(s.owns, f))
    if (!p) return []
    const forms = [`.\\${p.replace(/\//g, "\\")}`, join(ctx.root, p)]
    return forms.filter((f) => !ownersOf(guide, resolveArgPath(ctx.root, ctx.root, f) ?? f).some((o) => o.id === s.id)).map((f) => `${s.id}: ${f}`)
  })
  ok("lookup.owner-path", "a Windows, ./-prefixed or absolute path finds the same owner as the map", lost.length === 0, sample(lost))

  return results
}

export function formatResults(results: Result[], header: string): string {
  const out = [header]
  let section = ""
  for (const r of results) {
    if (r.section !== section) {
      section = r.section
      out.push("", section)
    }
    out.push(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass || !r.detail ? "" : `\n        ${r.detail}`}`)
  }
  const failed = results.filter((r) => !r.pass).length
  out.push("", `${results.length - failed} passed, ${failed} failed`)
  if (failed === 0) out.push("The check proves every file is on the map and every name is real. It does not prove the prose: when a system's behaviour changes, re-read its entry.")
  return out.join("\n")
}
