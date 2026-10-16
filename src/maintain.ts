/**
 * The build and update helpers:
 *   merge    folds drafting or fact-check output into atlas.json and counts the fields that changed;
 *   changed  maps the files changed since a commit to the systems that own them;
 *   stamp    records the commit the atlas was last verified against.
 * Local only: git and the filesystem.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { join, relative } from "path"
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
  /** Glossary terms and flow names to delete (merge cannot otherwise drop a duplicate or a renamed flow). */
  remove?: { glossary?: string[]; flows?: string[] }
  findings?: Finding[]
  notes?: string[]
}

/**
 * Writes atlas.json the way it was read: 2-space JSON, its own line endings, a final newline.
 * The file is machine-written: keep it out of a formatter (e.g. .prettierignore).
 */
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

/** Each argument is a JSON file, or a folder whose *.json files are read in name order (no shell globbing needed). */
function expandInputs(inputs: string[]): string[] {
  return inputs.flatMap((p) => {
    let st
    try {
      st = statSync(p)
    } catch {
      throw new UsageError(`No such file or folder: ${p}`)
    }
    if (!st.isDirectory()) return [p]
    const files = readdirSync(p).filter((f) => f.endsWith(".json")).sort().map((f) => join(p, f))
    if (!files.length) throw new UsageError(`${p} holds no .json files.`)
    return files
  })
}

export function merge(ctx: Ctx, atlas: Atlas, inputs: string[], dryRun: boolean): string {
  if (!inputs.length) throw new UsageError("atlas merge <file|folder ...>: name at least one.")
  const files = expandInputs(inputs)
  const changed = new Map<string, string[]>()
  const unknown: string[] = []
  const findings: Finding[] = []
  const notes: string[] = []
  let termsAdded = 0
  let termsChanged = 0
  let termsRemoved = 0
  let topChanged = 0
  for (const file of files) {
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
    for (const term of draft.remove?.glossary ?? []) {
      const before = atlas.glossary?.length ?? 0
      atlas.glossary = (atlas.glossary ?? []).filter((g) => g.term.trim().toLowerCase() !== term.trim().toLowerCase())
      termsRemoved += before - atlas.glossary.length
    }
    for (const name of draft.remove?.flows ?? []) {
      const before = atlas.flows?.length ?? 0
      atlas.flows = (atlas.flows ?? []).filter((f) => f.name !== name)
      topChanged += before - atlas.flows.length
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
  const out = [`${dryRun ? "Would change" : "Changed"} ${fields} system fields across ${changed.size} systems; glossary +${termsAdded} new, ${termsChanged} reworded, ${termsRemoved} removed; ${topChanged} flows/title/overview updates (from ${files.length} file${files.length === 1 ? "" : "s"}).`]
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

/** `git diff -z --name-status` records: STATUS NUL path NUL, or R/C<score> NUL old NUL new NUL. */
function parseNameStatusZ(out: string): Change[] {
  const parts = out.split("\0")
  const changes: Change[] = []
  for (let i = 0; i < parts.length && parts[i]; ) {
    const status = parts[i]
    if (/^[RC]/.test(status)) {
      if (status[0] === "R") changes.push({ status: "D", path: normalizePath(parts[i + 1]) })
      changes.push({ status: "A", path: normalizePath(parts[i + 2]) })
      i += 3
    } else {
      changes.push({ status: status[0], path: normalizePath(parts[i + 1]) })
      i += 2
    }
  }
  return changes
}

const commitExists = (root: string, ref: string) => git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== undefined

/** Files changed since `ref` (committed, staged, unstaged and untracked), each mapped to its owners. */
export function changed(ctx: Ctx, atlas: Atlas, refArg: string | undefined, asJson: boolean): string {
  const atlasRel = normalizePath(relative(ctx.root, ctx.atlasPath))
  const lastTouch = () => git(ctx.root, ["log", "-1", "--format=%H", "--", atlasRel]) || undefined
  const notes: string[] = []
  let ref = refArg ?? atlas.verified?.commit ?? lastTouch()
  if (!ref) throw new UsageError("atlas changed <commit>: no commit given, atlas.json has no verified.commit, and git has no commit touching it (run `atlas stamp` after a build or update).")
  if (!commitExists(ctx.root, ref)) {
    // A shallow clone, a squash-merged branch or a teammate's fresh clone may not hold the verified commit.
    const fallback = refArg ? undefined : lastTouch()
    if (!fallback || !commitExists(ctx.root, fallback)) throw new UsageError(`${ref} is not a commit in this repository (a shallow clone or a rewritten branch?). Pass a commit: atlas changed <commit>.`)
    notes.push(`verified.commit ${ref.slice(0, 12)} is not in this repository; starting from the last commit that touched atlas.json instead (${fallback.slice(0, 12)}).`)
    ref = fallback
  }
  // --relative and the "." pathspec keep paths relative to the root, and inside it, when the atlas lives in a monorepo package.
  const changes = parseNameStatusZ(git(ctx.root, ["diff", "-z", "--relative", "--name-status", "-M", ref, "--", "."]) ?? "")
  const untracked = (git(ctx.root, ["ls-files", "-z", "--others", "--exclude-standard", "--", "."]) ?? "").split("\0").filter(Boolean).map(normalizePath)
  for (const p of untracked) if (!changes.some((c) => c.path === p)) changes.push({ status: "A", path: p })

  const files = new Set(universe(ctx, listRepoFiles(ctx.root, ctx.config.files)))
  const relevant = changes.filter((c) => !ctx.isAtlasFile(c.path))
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
  if (asJson) return JSON.stringify({ ref, notes, systems: Object.fromEntries(bySystem), unowned, deletedKeyFiles: namedGone }, null, 2)

  const out = [...notes, `${relevant.length} files changed since ${ref}; ${bySystem.size} of ${atlas.systems.length} systems own at least one.`]
  for (const s of atlas.systems) {
    const list = bySystem.get(s.id)
    if (!list) continue
    out.push("", `${s.id} — ${s.name} (${list.length})`, ...list.map((c) => `  ${c.status} ${c.path}`))
  }
  if (unowned.length) out.push("", `New files no system owns yet (${unowned.length}):`, ...unowned.map((c) => `  ${c.status} ${c.path}`))
  if (namedGone.length) out.push("", "Deleted files still named as key files:", ...namedGone.map((n) => `  ${n}`))
  out.push("", `Review each listed system: \`git diff ${ref} -- <its files>\`, then fix the sentences that moved. Search the atlas for every old value the diff replaced, too: other entries may repeat it.`)
  return out.join("\n")
}

export function stamp(ctx: Ctx, atlas: Atlas): string {
  const commit = git(ctx.root, ["rev-parse", "HEAD"])
  if (!commit) throw new UsageError("Not a git repository with a commit: nothing to stamp.")
  const dirty = [
    ...(git(ctx.root, ["diff", "-z", "--relative", "--name-only", "HEAD", "--", "."]) ?? "").split("\0"),
    ...(git(ctx.root, ["ls-files", "-z", "--others", "--exclude-standard", "--", "."]) ?? "").split("\0"),
  ].filter((p) => p && !ctx.isAtlasFile(normalizePath(p))).length
  atlas.verified = { commit, date: new Date().toISOString().slice(0, 10) }
  saveAtlas(ctx.atlasPath, atlas)
  return `Stamped atlas.json as verified against ${commit.slice(0, 12)}${dirty ? ` (note: ${dirty} uncommitted changes outside the atlas folder; stamp again after committing them)` : ""}.`
}
