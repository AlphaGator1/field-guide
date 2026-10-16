/**
 * `guide init` vendors this CLI into the project and writes a starting config
 * from what it detects; `guide inventory` prints the file universe by folder
 * so a session can propose systems without opening every file.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, relative, resolve } from "path"
import { fileURLToPath } from "url"
import { globToRegExp, normalizePath, ownersOf } from "./lookup"
import { CONFIG_FILE, DEFAULT_CONFIG, DEFAULT_DIR, findGitRoot, listRepoFiles, readJson, universe, type Ctx } from "./repo"
import type { Guide, Config } from "./types"
import readmeTemplate from "../templates/guide-readme.md"

/** Instruction files a drafting agent should read before the code (the project's curated knowledge). */
const INSTRUCTION_GLOBS = [
  "CLAUDE.md", "**/CLAUDE.md", "AGENTS.md", "**/AGENTS.md", ".claude/rules/**", ".cursor/rules/**", ".cursorrules",
  ".github/copilot-instructions.md", ".windsurfrules", "CONTRIBUTING.md", "ARCHITECTURE.md", "docs/architecture/**", "README.md",
]

export function instructionFiles(all: string[]): string[] {
  return all.filter((p) => INSTRUCTION_GLOBS.some((g) => globToRegExp(g).test(p)) && /\.(md|mdc|txt)$|^\.[a-z]+rules$/i.test(p))
}

export function detectAddons(root: string, all: string[]): Config["addons"] {
  const addons: Config["addons"] = {}
  // The preset's own glob, never a frozen file list: a new schema file must be read too.
  if (all.some((p) => p.endsWith(".prisma"))) addons.models = { preset: "prisma", files: ["**/*.prisma"] }
  else if (all.includes("manage.py") && all.some((p) => /(^|\/)models(\.py|\/[^/]+\.py)$/.test(p))) addons.models = { preset: "django", files: ["**/models.py", "**/models/*.py"] }
  if (all.includes("package.json")) {
    try {
      const pkg = readJson<{ scripts?: Record<string, string> }>(join(root, "package.json"))
      if (pkg.scripts && Object.keys(pkg.scripts).length) addons.packageScripts = { file: "package.json", match: ".*" }
    } catch {
      // Unreadable package.json: no add-on; the build will notice.
    }
  }
  if (all.some((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))) addons.githubWorkflows = { dir: ".github/workflows" }
  if (all.includes("vercel.json")) {
    try {
      const v = readJson<{ crons?: unknown[] }>(join(root, "vercel.json"))
      if (Array.isArray(v.crons) && v.crons.length) addons.vercelCrons = { file: "vercel.json" }
    } catch {
      // No crons add-on.
    }
  }
  if (all.some((p) => p.startsWith(".claude/rules/") && p.endsWith(".md"))) addons.rules = { dir: ".claude/rules", glob: "**/*.md" }
  return addons
}

export function init(dirArg: string | undefined, force: boolean): string {
  const dir = resolve(dirArg ?? DEFAULT_DIR)
  const root = findGitRoot(process.cwd())
  const out: string[] = []
  if (!root) out.push(`Note: ${process.cwd()} is not inside a git repository; the config uses "files": "walk".`)
  const repoRoot = root ?? process.cwd()
  mkdirSync(dir, { recursive: true })

  const self = fileURLToPath(import.meta.url)
  const vendored = join(dir, "guide.mjs")
  if (resolve(self) !== resolve(vendored)) {
    copyFileSync(self, vendored)
    out.push(`Vendored the CLI to ${rel(repoRoot, vendored)} (commit it: CI and teammates run it with plain node, no install).`)
  }

  const configPath = join(dir, CONFIG_FILE)
  if (existsSync(configPath) && !force) {
    out.push(`Kept the existing ${rel(repoRoot, configPath)} (--force rewrites it).`)
  } else {
    const all = listRepoFiles(repoRoot, root ? "git" : "walk")
    const config: Config = {
      ...DEFAULT_CONFIG,
      root: normalizePath(relative(dir, repoRoot)) || ".",
      files: root ? "git" : "walk",
      addons: detectAddons(repoRoot, all),
    }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    const found = Object.keys(config.addons)
    const own = `${rel(repoRoot, dir)}/`
    out.push(`Wrote ${rel(repoRoot, configPath)}: ${all.filter((p) => !p.startsWith(own)).length} files to map; add-ons detected: ${found.length ? found.join(", ") : "none"}.`)
  }

  const ignore = join(dir, ".gitignore")
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "# Drafts and fact-check output from a guide build.\n.build/\n# The rendered page: regenerate it with `node guide.mjs render`.\nguide.html\n")
    out.push(`Wrote ${rel(repoRoot, ignore)} (.build/ and guide.html are not committed).`)
  }
  const readme = join(dir, "README.md")
  if (!existsSync(readme)) {
    writeFileSync(readme, readmeTemplate.split("{{DIR}}").join(rel(repoRoot, dir)))
    out.push(`Wrote ${rel(repoRoot, readme)}.`)
  }
  return out.join("\n")
}

function rel(root: string, p: string): string {
  return normalizePath(relative(root, p))
}

/** The universe by folder (to `depth` segments), with file and line counts, plus the instruction files. */
export function inventory(ctx: Ctx, guide: Guide | undefined, depth: number, unownedOnly: boolean): string {
  const all = listRepoFiles(ctx.root, ctx.config.files)
  const files = universe(ctx, all)
  if (unownedOnly) {
    if (!guide) return "No guide.json yet: every file is unowned."
    const unowned = files.filter((p) => ownersOf(guide, p).length === 0)
    const dead = guide.systems.flatMap((s) => (s.owns ?? []).filter((g) => !files.some((p) => globToRegExp(g).test(p))).map((g) => `${s.id}: ${g}`))
    const out = [`${unowned.length} of ${files.length} files are owned by no system.`, ...unowned.map((p) => `  ${p}`)]
    if (dead.length) out.push("", `${dead.length} owns globs match no file:`, ...dead.map((d) => `  ${d}`))
    return out.join("\n")
  }
  const buckets = new Map<string, { files: number; lines: number }>()
  for (const p of files) {
    const parts = p.split("/")
    const key = parts.length > depth ? `${parts.slice(0, depth).join("/")}/` : parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "(root files)"
    const b = buckets.get(key) ?? { files: 0, lines: 0 }
    b.files++
    b.lines += lineCount(join(ctx.root, p))
    buckets.set(key, b)
  }
  const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const totalLines = rows.reduce((n, [, b]) => n + b.lines, 0)
  const out = [`${files.length} files on the map, ~${totalLines.toLocaleString("en-US")} lines of text, by folder:`]
  for (const [k, b] of rows) out.push(`  ${k.padEnd(48)} ${String(b.files).padStart(5)} files ${String(b.lines).padStart(8)} lines`)
  const instr = instructionFiles(all)
  out.push("", `Instruction and rule files (name these in every drafting agent's prompt): ${instr.length ? "" : "none found"}`)
  for (const p of instr) out.push(`  ${p}`)
  out.push("", `Add-ons in ${CONFIG_FILE}: ${Object.keys(ctx.config.addons).join(", ") || "none"}`)
  return out.join("\n")
}

function lineCount(path: string): number {
  try {
    const buf = readFileSync(path)
    if (buf.subarray(0, 8000).includes(0)) return 0
    let n = 0
    for (const b of buf) if (b === 10) n++
    return n
  } catch {
    return 0
  }
}
