/**
 * Everything that touches the disk: finding the atlas folder and the repo
 * root, loading the config, and listing the repo's files. Local only: the one
 * subprocess is `git` (ls-files, rev-parse, diff, log), never the network.
 */
import { execFileSync } from "child_process"
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "fs"
import { dirname, isAbsolute, join, relative, resolve } from "path"
import { matchesAny, normalizePath } from "./lookup"
import type { Atlas, Config } from "./types"

export const CONFIG_FILE = "atlas.config.json"
export const DEFAULT_DIR = "docs/atlas"

export const DEFAULT_CONFIG: Config = {
  atlas: "atlas.json",
  root: "",
  files: "git",
  include: ["**"],
  exclude: [],
  entryMaxChars: 12000,
  addons: {},
}

/** Windows and macOS file systems ignore case by default, so path comparisons must too. */
export const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin"
const fold = (p: string) => (CASE_INSENSITIVE ? p.toLowerCase() : p)

export type Ctx = {
  /** Absolute folder holding atlas.config.json. */
  dir: string
  config: Config
  /** Absolute path of atlas.json. */
  atlasPath: string
  /** Absolute repo root; every path in the atlas is relative to it. */
  root: string
  /** The atlas folder, repo-relative (its own files are never on the map). */
  dirRel: string
  /** True for the atlas's own files: everything in its folder, plus atlas.json and the config wherever they are. */
  isAtlasFile: (repoRelPath: string) => boolean
}

export class UsageError extends Error {}

/** --dir wins; then the folder the script itself sits in (a vendored copy); then docs/atlas under the cwd. */
export function findAtlasDir(argDir: string | undefined, scriptDir: string | undefined): string {
  if (argDir) {
    const d = resolve(argDir)
    if (!existsSync(join(d, CONFIG_FILE))) throw new UsageError(`No ${CONFIG_FILE} in ${d}.`)
    return d
  }
  for (const d of [scriptDir, resolve(DEFAULT_DIR)]) {
    if (d && existsSync(join(d, CONFIG_FILE))) return d
  }
  throw new UsageError(`No ${CONFIG_FILE} found next to this script or in ./${DEFAULT_DIR}. Pass --dir <folder>, or create one with: atlas init`)
}

/** The nearest folder at or above `from` that holds .git (a folder, or a file in a worktree). */
export function findGitRoot(from: string): string | undefined {
  let d = resolve(from)
  for (;;) {
    if (existsSync(join(d, ".git"))) return d
    const up = dirname(d)
    if (up === d) return undefined
    d = up
  }
}

/** A path made repo-relative, or undefined when it lies outside the repo. */
export function repoRelative(root: string, abs: string): string | undefined {
  const r = normalizePath(relative(root, abs))
  return r && !r.startsWith("../") && r !== ".." && !isAbsolute(r) ? r : undefined
}

/**
 * A path argument as a session holds it (absolute, relative to the current
 * folder, Windows-style or ./-prefixed) made repo-relative. Undefined when it
 * points outside the repo.
 */
export function resolveArgPath(root: string, cwd: string, arg: string): string | undefined {
  const a = arg.trim()
  if (!a) return undefined
  if (isAbsolute(a) || /^[A-Za-z]:[\\/]/.test(a)) return repoRelative(root, resolve(a))
  const fromCwd = resolve(cwd, a)
  if (existsSync(fromCwd)) return repoRelative(root, fromCwd)
  return normalizePath(a)
}

export function loadContext(dir: string): Ctx {
  const raw = readJson<Partial<Config>>(join(dir, CONFIG_FILE))
  const config: Config = { ...DEFAULT_CONFIG, ...raw, addons: { ...(raw.addons ?? {}) } }
  const root = config.root ? resolve(dir, config.root) : findGitRoot(dir) ?? process.cwd()
  const dirRel = repoRelative(root, dir)
  if (!dirRel) throw new UsageError(`The atlas folder (${dir}) must be a subfolder of the repo root (${root}): its own files are kept off the map by folder.`)
  const atlasPath = resolve(dir, config.atlas)
  const own = new Set([repoRelative(root, atlasPath), repoRelative(root, join(dir, CONFIG_FILE))].filter((p): p is string => !!p).map(fold))
  const prefix = fold(`${dirRel}/`)
  const isAtlasFile = (p: string) => fold(p).startsWith(prefix) || own.has(fold(p))
  return { dir, config, atlasPath, root, dirRel, isAtlasFile }
}

export function readJson<T>(path: string): T {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    throw new UsageError(`Cannot read ${path}.`)
  }
  try {
    return JSON.parse(text.replace(/^﻿/, "")) as T
  } catch (e) {
    throw new UsageError(`${path} is not valid JSON: ${(e as Error).message}`)
  }
}

export function loadAtlas(ctx: Ctx): Atlas {
  return readJson<Atlas>(ctx.atlasPath)
}

const WALK_SKIP = new Set([".git", "node_modules"])

function gitList(root: string, args: string[]): string[] {
  let out: string
  try {
    out = execFileSync("git", ["ls-files", "-z", ...args], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] })
  } catch {
    throw new UsageError(`git ls-files failed in ${root}. Is it a git repository? Set "files": "walk" in ${CONFIG_FILE} to walk the folder instead.`)
  }
  return out.split("\0").filter(Boolean).map(normalizePath)
}

/**
 * Every file in the repo, relative to the root. "git" mode lists tracked files
 * plus untracked ones that .gitignore does not exclude, so a new file is on the
 * check's radar before it is committed; deleted-but-unstaged files drop out.
 * Paths keep their exact case: they are what "exists" is checked against.
 */
export function listRepoFiles(root: string, mode: Config["files"]): string[] {
  const paths = mode === "walk" ? walk(root, "") : gitList(root, ["--cached", "--others", "--exclude-standard"])
  return [...new Set(paths)].filter((p) => isFile(join(root, p))).sort()
}

/** Files git does not track yet (empty in walk mode). */
export function listUntracked(root: string, mode: Config["files"]): Set<string> {
  return new Set(mode === "walk" ? [] : gitList(root, ["--others", "--exclude-standard"]))
}

function walk(root: string, rel: string): string[] {
  const out: string[] = []
  let names: string[]
  try {
    names = readdirSync(join(root, rel))
  } catch {
    return out
  }
  for (const name of names) {
    if (WALK_SKIP.has(name)) continue
    const p = rel ? `${rel}/${name}` : name
    try {
      // lstat: a link is listed as a file at most, never followed (a junction to a parent would loop).
      const st = lstatSync(join(root, p))
      if (st.isDirectory()) out.push(...walk(root, p))
      else if (st.isFile()) out.push(p)
    } catch {
      // A dangling entry: skip it.
    }
  }
  return out
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Whether a path the atlas names is in the repo: a listed file (exact case, so
 * a case-only typo fails on Windows as it would on Linux CI), or a folder that
 * holds one. A gitignored build output does not count.
 */
export function inRepo(all: string[], rel: string): boolean {
  const p = normalizePath(rel).replace(/\/+$/, "")
  if (!p) return false
  return all.includes(p) || all.some((f) => f.startsWith(`${p}/`))
}

/** The files the map must cover: include, minus exclude, minus the atlas's own files. */
export function universe(ctx: Ctx, all: string[]): string[] {
  return all.filter((p) => !ctx.isAtlasFile(p) && matchesAny(ctx.config.include, p) && !matchesAny(ctx.config.exclude, p))
}

export function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim()
  } catch {
    return undefined
  }
}

/** Text of a repo file, or undefined for a binary or oversized one. UTF-16 (common for Windows scripts) is decoded. */
export function readText(root: string, rel: string, maxBytes = 2_000_000): string | undefined {
  try {
    const p = join(root, rel)
    if (statSync(p).size > maxBytes) return undefined
    const buf = readFileSync(p)
    if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le")
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.from(buf.subarray(2))
      swapped.swap16()
      return swapped.toString("utf16le")
    }
    if (buf.subarray(0, 8000).includes(0)) return undefined
    return buf.toString("utf8")
  } catch {
    return undefined
  }
}
