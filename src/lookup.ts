/**
 * The atlas lookups: PURE (no fs, no env, no network). Callers hand in the
 * parsed atlas.json. `atlas <id | path | word>` prints through these, and
 * `atlas check` asserts against the same functions, so the map the check
 * proves and the lookup a session runs cannot disagree.
 */
import { JOB_KIND_LABELS, type Atlas, type System, type Term } from "./types"

/** The section labels renderSystem prints, in order (the check pins each one). */
export const SECTION_LABELS = [
  "How it works:", "Watch out:", "Connected to:", "Key files:", "Jobs:", "Switches:",
  "Data models:", "Rules:", "Checks:", "Owns:",
] as const

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\*]/g, "\\$&")
const cache = new Map<string, RegExp>()

/**
 * Glob syntax for `owns`, `include` and `exclude`, matched against the whole
 * repo-relative path:
 *   *      any characters within one path segment
 *   **     any characters across segments; `** /` (no space) also matches zero folders
 *   ?      one character within a segment
 *   {a,b}  either literal (no wildcards inside the braces)
 * Everything else is literal, including `[id]` and `(group)` folder names.
 */
export function globToRegExp(glob: string): RegExp {
  const hit = cache.get(glob)
  if (hit) return hit
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?"
        i += 2
      } else {
        re += ".*"
        i++
      }
    } else if (c === "*") {
      re += "[^/]*"
    } else if (c === "?") {
      re += "[^/]"
    } else if (c === "{" && glob.indexOf("}", i) > i) {
      const end = glob.indexOf("}", i)
      re += `(?:${glob.slice(i + 1, end).split(",").map(escapeRe).join("|")})`
      i = end
    } else {
      re += escapeRe(c)
    }
  }
  const out = new RegExp(`^${re}$`)
  cache.set(glob, out)
  return out
}

export function matchesAny(globs: string[], path: string): boolean {
  return globs.some((g) => globToRegExp(g).test(path))
}

/** A repo-relative path: forward slashes, no leading "./" or "/". */
export function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "")
}

/** Every system whose `owns` globs claim the path (a file may belong to several). */
export function ownersOf(atlas: Atlas, path: string): System[] {
  const p = normalizePath(path)
  return atlas.systems.filter((s) => matchesAny(s.owns, p))
}

/** One system as plain text: about a third of its JSON's tokens, every field kept. */
export function renderSystem(atlas: Atlas, s: System): string {
  const group = atlas.groups.find((g) => g.id === s.group)?.name ?? s.group
  const name = (id: string) => atlas.systems.find((x) => x.id === id)?.name ?? id
  const list = (label: string, items: string[]) => (items.length ? [label, ...items.map((i) => `  - ${i}`)] : [`${label} none`])
  const inline = (label: string, items: string[]) => `${label} ${items.join(", ") || "none"}`
  return [
    `${s.name} [${s.id}] (${group})`,
    s.oneLiner,
    "",
    s.summary,
    "",
    SECTION_LABELS[0],
    ...s.journey.map((j, i) => `  ${i + 1}. ${j}`),
    ...list(SECTION_LABELS[1], s.watchOuts),
    ...list(SECTION_LABELS[2], s.connects.map((c) => `${name(c.to)} [${c.to}]: ${c.why}`)),
    ...list(SECTION_LABELS[3], s.keyFiles.map((k) => `${k.path} — ${k.what}`)),
    ...list(SECTION_LABELS[4], s.jobs.map((j) => `${j.name} (${j.when}; ${JOB_KIND_LABELS[j.kind] ?? j.kind} ${j.ref}) — ${j.what}`)),
    ...list(SECTION_LABELS[5], s.switches.map((w) => `${w.name} — ${w.what}`)),
    inline(SECTION_LABELS[6], s.models),
    inline(SECTION_LABELS[7], s.rules),
    inline(SECTION_LABELS[8], s.checks),
    inline(SECTION_LABELS[9], s.owns),
  ].join("\n")
}

/** The table of contents: every system on one line, by group. */
export function renderIndex(atlas: Atlas): string {
  const out: string[] = []
  for (const g of atlas.groups) {
    out.push(`${g.name}:`)
    for (const s of atlas.systems.filter((x) => x.group === g.id)) out.push(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
  }
  return out.join("\n")
}

/** The top of the atlas: about, overview and every flow step by step (`atlas overview`). */
export function renderOverview(atlas: Atlas): string {
  const name = (id: string) => atlas.systems.find((x) => x.id === id)?.name ?? id
  const out = [atlas.title, "", atlas.about ?? "", "", atlas.overview ?? ""]
  for (const f of atlas.flows ?? []) {
    out.push("", `Flow: ${f.name}`)
    f.steps.forEach((st, i) => out.push(`  ${i + 1}. ${name(st.system)} [${st.system}]: ${st.text}`))
  }
  out.push("", `Glossary: ${(atlas.glossary ?? []).length} terms (atlas <word> searches them).`)
  return out.join("\n")
}

/** Every string inside a value (strings, arrays, objects), in order. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v]
  if (Array.isArray(v)) return v.flatMap(strings)
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(strings)
  return []
}

/**
 * Everything that contains EVERY word of the query (case-insensitive), so an
 * update can find each place an old value is stated. `systems` matched on the
 * id, name, one-liner or summary; `mentions` matched anywhere else in an entry
 * (steps, watch-outs, links, key files, jobs, switches, models, rules, checks,
 * owns); `top` lists matching lines of the about text, the overview and the
 * flows; `terms` the glossary.
 */
export function search(atlas: Atlas, query: string): { systems: System[]; mentions: System[]; terms: Term[]; top: string[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return { systems: [], mentions: [], terms: [], top: [] }
  const all = (text: string) => {
    const t = text.toLowerCase()
    return words.every((w) => t.includes(w))
  }
  const head = (s: System) => `${s.id} ${s.name} ${s.oneLiner} ${s.summary}`
  const systems = atlas.systems.filter((s) => all(head(s)))
  const mentions = atlas.systems.filter((s) => !systems.includes(s) && all(strings(s).join(" ")))
  const terms = (atlas.glossary ?? []).filter((g) => all(`${g.term} ${g.meaning}`))
  const top = [
    ...(atlas.about && all(atlas.about) ? [`about: ${atlas.about}`] : []),
    ...(atlas.overview && all(atlas.overview) ? [`overview: ${atlas.overview}`] : []),
    ...(atlas.flows ?? []).flatMap((f) => (f.steps ?? []).filter((st) => all(`${f.name} ${st.system} ${st.text}`)).map((st) => `flow "${f.name}", ${st.system}: ${st.text}`)),
  ]
  return { systems, mentions, terms, top }
}
