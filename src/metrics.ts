/**
 * How much code each system owns, for the rendered page's trail map: non-blank
 * code lines, and branch points (decision points). Reads files and runs
 * `git check-attr` only: local, no network. The numbers are approximations
 * that compare systems within one repo; they are not a parser's output.
 */
import { execFileSync } from "child_process"
import { DEFAULT_PROSE } from "./check"
import { matchesAny } from "./lookup"
import { readText, type Ctx } from "./repo"
import type { Config, Guide, Size } from "./types"

/** Extensions of data, config, translation and tool-written project files: they make footprints without adding logic. */
export const DATA_EXTENSIONS: readonly string[] = [
  "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "xml", "plist",
  "csv", "tsv", "svg", "lock", "map", "snap",
  // translation catalogues
  "po", "pot", "resx", "xlf", "xliff", "strings", "stringsdict", "xcstrings", "arb",
  // UI and project files that tools write as XML
  "storyboard", "xib", "pbxproj",
  // data
  "ipynb", "jsonl", "ndjson", "geojson", "properties",
]
/** Lockfiles whose extension says nothing. */
const DATA_BASENAMES: readonly string[] = ["go.sum", "go.work.sum", "Package.resolved", "gradle.lockfile"]

/** Whether a path can be code: not prose, not data or config, not a lockfile. Binary, minified, generated and vendored files are told apart later, by content and by git. */
export function isCodePath(path: string, prose: string[]): boolean {
  if (matchesAny(prose, path)) return false
  const name = path.slice(path.lastIndexOf("/") + 1)
  if (DATA_BASENAMES.includes(name)) return false
  const dot = name.lastIndexOf(".")
  return dot < 0 || !DATA_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
}

// The branch keywords as whole words (not after `.` or `$`, so `.match(` and `obj.case` stay out), `&&`, `||`
// and a ternary `?` with a space either side (so `?.` and `?:` stay out). `else if` counts once, through its `if`.
const BRANCH = /(?<![.$\w])(?:if|elif|for|foreach|while|case|catch|except|when|match)\b|&&|\|\||\s\?\s/g

const MINIFIED_LINE = 3000
const MINIFIED_AVERAGE = 250
const MINIFIED_MIN_LINES = 5

/** Non-blank lines and branch points of one file's text. A minified file (it is not source) counts nothing. */
export function countCode(text: string): { codeLines: number; branchPoints: number; minified: boolean } {
  let codeLines = 0
  let chars = 0
  for (const line of text.split("\n")) {
    if (line.length > MINIFIED_LINE) return { codeLines: 0, branchPoints: 0, minified: true }
    if (line.trim() === "") continue
    codeLines++
    chars += line.length
  }
  if (codeLines >= MINIFIED_MIN_LINES && chars / codeLines > MINIFIED_AVERAGE) return { codeLines: 0, branchPoints: 0, minified: true }
  return { codeLines, branchPoints: text.match(BRANCH)?.length ?? 0, minified: false }
}

/**
 * The paths git marks `linguist-generated` or `linguist-vendored` (set, or
 * =true): code nobody here writes. Empty in walk mode, where there is no git to
 * ask, and when git fails: a size that is too big is better than no map.
 */
export function generatedOrVendored(root: string, paths: string[], mode: Config["files"]): Set<string> {
  const marked = new Set<string>()
  if (mode === "walk" || !paths.length) return marked
  let out: string
  try {
    out = execFileSync("git", ["check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], {
      cwd: root, input: `${paths.join("\0")}\0`, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "ignore"],
    })
  } catch {
    return marked
  }
  // With -z every record is `path NUL attribute NUL value NUL`, one record per path and attribute.
  const parts = out.split("\0")
  for (let i = 0; i + 2 < parts.length; i += 3) if (parts[i + 2] === "set" || parts[i + 2] === "true") marked.add(parts[i])
  return marked
}

/**
 * The size of every system's code, from the files on the map (`files`, already
 * the universe). A file owned by n systems adds 1/n of itself to each; the
 * shares are summed before rounding. A system that owns no code is all zeros,
 * and so is one with no `owns` list (a guide the check never saw).
 */
export function systemSizes(ctx: Ctx, guide: Guide, files: string[]): Map<string, Size> {
  const prose = ctx.config.prose ?? DEFAULT_PROSE
  const owned = files
    .filter((p) => isCodePath(p, prose))
    .map((path) => ({ path, owners: guide.systems.filter((s) => matchesAny(s.owns ?? [], path)) }))
    .filter((f) => f.owners.length > 0)
  const leftOut = generatedOrVendored(ctx.root, owned.map((f) => f.path), ctx.config.files)
  const sums = new Map<string, Size>(guide.systems.map((s) => [s.id, { files: 0, codeLines: 0, branchPoints: 0 }]))
  for (const { path, owners } of owned) {
    if (leftOut.has(path)) continue
    const text = readText(ctx.root, path)
    if (text === undefined) continue
    const code = countCode(text)
    if (code.minified) continue
    for (const s of owners) {
      const sum = sums.get(s.id)!
      sum.files += 1 / owners.length
      sum.codeLines += code.codeLines / owners.length
      sum.branchPoints += code.branchPoints / owners.length
    }
  }
  return new Map([...sums].map(([id, v]) => [id, { files: Math.round(v.files), codeLines: Math.round(v.codeLines), branchPoints: Math.round(v.branchPoints) }]))
}
