/**
 * The build and update helpers:
 *   merge    folds drafting or fact-check output into atlas.json and counts the fields that changed;
 *   changed  maps the files changed since a commit to the systems that own them;
 *   stamp    records the commit the atlas was last verified against.
 * Local only: git and the filesystem.
 */
import { readFileSync, writeFileSync } from "fs"
import { relative } from "path"
import { normalizePath, ownersOf } from "./lookup"
import { git, listRepoFiles, readJson, universe, UsageError, type Ctx } from "./repo"
import { SYSTEM_FIELDS, type Atlas, type Flow, type System, type Term } from "./types"

type Finding = { id?: string; field?: string; severity?: string; claim?: string; actual?: string; evidence?: string }
type Draft = {
  systems?: Partial<System>[]
  glossary?: Term[]
  flows?: Flow[]
  overview?: string
  about?: string
  title?: string
  findings?: Finding[]
  notes?: string[]
}

/** Writes atlas.json the way it was read: 2-space JSON, its own line endings, a final newline. */
export function saveAtlas(path: string, atlas: Atlas): void {
  let eol = "\n"
  try {
    if (readFileSync(path, "utf8").includes("\r\n")) eol = "\r\n"
  } catch {
    // New file.
  }
  writeFileSync(path, `${JSON.stringify(atlas, null, 2)}\n`.replace(/\n/g, eol))
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function merge(ctx: Ctx, atlas: Atlas, inputs: string[], dryRun: boolean): string {
  if (!inputs.length) throw new UsageError("atlas merge <draft.json ...>: name at least one file.")
  const changed = new Map<string, string[]>()
  const unknown: string[] = []
  const findings: Finding[] = []
  const notes: string[] = []
  let termsAdded = 0
  let termsChanged = 0
  let topChanged = 0
  for (const file of inputs) {
    const raw = readJson<Draft | Partial<System>[]>(file)
    const draft: Draft = Array.isArray(raw) ? { systems: raw } : raw
    for (const d of draft.systems ?? []) {
      const s = atlas.systems.find((x) => x.id === d.id)
      if (!s) {
        unknown.push(`${file}: ${String(d.id)}`)
        continue
      }
      const rec = s as unknown as Record<string, unknown>
      const dRec = d as unknown as Record<string, unknown>
      for (const f of SYSTEM_FIELDS) {
        if (f === "id" || !(f in dRec)) continue
        if (!same(rec[f], dRec[f])) {
          rec[f] = dRec[f]
          changed.set(s.id, [...(changed.get(s.id) ?? []), f])
        }
      }
      const extra = dRec.ownershipNotes
      if (Array.isArray(extra)) notes.push(...extra.map((n) => `${s.id}: ${String(n)}`))
    }
    for (const t of draft.glossary ?? []) {
      atlas.glossary ??= []
      const hit = atlas.glossary.find((g) => g.term.trim().toLowerCase() === String(t.term).trim().toLowerCase())
      if (!hit) {
        atlas.glossary.push({ term: t.term, meaning: t.meaning })
        termsAdded++
      } else if (hit.meaning !== t.meaning) {
        hit.meaning = t.meaning
        termsChanged++
      }
    }
    for (const fl of draft.flows ?? []) {
      atlas.flows ??= []
      const i = atlas.flows.findIndex((x) => x.name === fl.name)
      if (i < 0) atlas.flows.push(fl)
      else if (!same(atlas.flows[i], fl)) atlas.flows[i] = fl
      else continue
      topChanged++
    }
    for (const k of ["title", "about", "overview"] as const) {
      if (typeof draft[k] === "string" && draft[k] !== atlas[k]) {
        atlas[k] = draft[k] as string
        topChanged++
      }
    }
    findings.push(...(draft.findings ?? []))
    notes.push(...(draft.notes ?? []))
  }
  if (!dryRun) saveAtlas(ctx.atlasPath, atlas)

  const fields = [...changed.values()].reduce((n, f) => n + f.length, 0)
  const out = [`${dryRun ? "Would change" : "Changed"} ${fields} system fields across ${changed.size} systems; glossary +${termsAdded} new, ${termsChanged} reworded; ${topChanged} flows/title/overview updates.`]
  for (const [id, f] of changed) out.push(`  ${id}: ${f.join(", ")}`)
  if (findings.length) {
    const by = new Map<string, number>()
    for (const f of findings) by.set(String(f.severity ?? "UNTAGGED").toUpperCase(), (by.get(String(f.severity ?? "UNTAGGED").toUpperCase()) ?? 0) + 1)
    out.push("", `Findings: ${findings.length} (${[...by.entries()].map(([k, n]) => `${k} ${n}`).join(", ")})`)
  }
  if (unknown.length) out.push("", `Not merged, no such system id (fix the id or add the system first): ${unknown.join("; ")}`)
  if (notes.length) out.push("", "Notes from the agents (act on each: move a file, fix a rule, or drop it):", ...notes.map((n) => `  - ${n}`))
  return out.join("\n")
}

export type Change = { status: string; path: string }

/** Files changed since `ref` (committed, staged, unstaged and untracked), each mapped to its owners. */
export function changed(ctx: Ctx, atlas: Atlas, refArg: string | undefined, asJson: boolean): string {
  const lastTouch = () => git(ctx.root, ["log", "-1", "--format=%H", "--", normalizePath(relative(ctx.root, ctx.atlasPath))]) || undefined
  const ref = refArg ?? atlas.verified?.commit ?? lastTouch()
  if (!ref) throw new UsageError("atlas changed <commit>: no commit given, atlas.json has no verified.commit, and git has no commit touching it (run `atlas stamp` after a build or update).")
  if (git(ctx.root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) === undefined) throw new UsageError(`${ref} is not a commit in this repository.`)
  const diff = git(ctx.root, ["diff", "--name-status", "-M", ref, "--"]) ?? ""
  const changes: Change[] = []
  for (const line of diff.split("\n").filter(Boolean)) {
    const [status, a, b] = line.split("\t")
    if (status.startsWith("R")) {
      changes.push({ status: "D", path: normalizePath(a) }, { status: "A", path: normalizePath(b) })
    } else {
      changes.push({ status: status[0], path: normalizePath(a) })
    }
  }
  const tracked = new Set((git(ctx.root, ["ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter(Boolean).map(normalizePath))
  for (const p of tracked) if (!changes.some((c) => c.path === p)) changes.push({ status: "A", path: p })

  const files = new Set(universe(ctx, listRepoFiles(ctx.root, ctx.config.files)))
  const own = ctx.dirRel ? `${ctx.dirRel}/` : "\0"
  const relevant = changes.filter((c) => !c.path.startsWith(own))
  const bySystem = new Map<string, Change[]>()
  const unowned: Change[] = []
  for (const c of relevant) {
    const owners = ownersOf(atlas, c.path)
    if (!owners.length) {
      if (c.status !== "D" && files.has(c.path)) unowned.push(c)
      continue
    }
    for (const s of owners) bySystem.set(s.id, [...(bySystem.get(s.id) ?? []), c])
  }
  const namedGone = atlas.systems.flatMap((s) => (s.keyFiles ?? []).filter((k) => relevant.some((c) => c.status === "D" && c.path === normalizePath(k.path))).map((k) => `${s.id}: ${k.path}`))
  if (asJson) return JSON.stringify({ ref, systems: Object.fromEntries(bySystem), unowned, deletedKeyFiles: namedGone }, null, 2)

  const out = [`${relevant.length} files changed since ${ref}; ${bySystem.size} of ${atlas.systems.length} systems own at least one.`]
  for (const s of atlas.systems) {
    const list = bySystem.get(s.id)
    if (!list) continue
    out.push("", `${s.id} — ${s.name} (${list.length})`, ...list.map((c) => `  ${c.status} ${c.path}`))
  }
  if (unowned.length) out.push("", `New files no system owns yet (${unowned.length}):`, ...unowned.map((c) => `  ${c.status} ${c.path}`))
  if (namedGone.length) out.push("", "Deleted files still named as key files:", ...namedGone.map((n) => `  ${n}`))
  out.push("", `Review each listed system: \`git diff ${ref} -- <its files>\`, then fix the sentences that moved.`)
  return out.join("\n")
}

export function stamp(ctx: Ctx, atlas: Atlas): string {
  const commit = git(ctx.root, ["rev-parse", "HEAD"])
  if (!commit) throw new UsageError("Not a git repository with a commit: nothing to stamp.")
  const dirty = (git(ctx.root, ["status", "--porcelain"]) ?? "").split("\n").filter((l) => l && !l.slice(3).startsWith(ctx.dirRel)).length
  atlas.verified = { commit, date: new Date().toISOString().slice(0, 10) }
  saveAtlas(ctx.atlasPath, atlas)
  return `Stamped atlas.json as verified against ${commit.slice(0, 12)}${dirty ? ` (note: ${dirty} uncommitted changes outside the atlas folder; stamp again after committing them)` : ""}.`
}
