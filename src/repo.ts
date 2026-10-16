/**
 * Everything that touches the disk: finding the atlas folder and the repo
 * root, loading the config, and listing the repo's files. Local only: the one
 * subprocess is `git` (ls-files, rev-parse, diff), never the network.
 */
import { execFileSync } from "child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { dirname, join, relative, resolve } from "path"
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

export function loadContext(dir: string): Ctx {
  const raw = readJson<Partial<Config>>(join(dir, CONFIG_FILE))
  const config: Config = { ...DEFAULT_CONFIG, ...raw, addons: { ...(raw.addons ?? {}) } }
  const root = config.root ? resolve(dir, config.root) : findGitRoot(dir) ?? process.cwd()
  return { dir, config, atlasPath: resolve(dir, config.atlas), root, dirRel: normalizePath(relative(root, dir)) }
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

/**
 * Every file in the repo, repo-relative. "git" mode lists tracked files plus
 * untracked ones that .gitignore does not exclude, so a new file is on the
 * check's radar before it is committed; deleted-but-unstaged files drop out.
 */
export function listRepoFiles(root: string, mode: Config["files"]): string[] {
  let paths: string[]
  if (mode === "walk") {
    paths = walk(root, "")
  } else {
    let out: string
    try {
      out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
        cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"],
      })
    } catch {
      throw new UsageError(`git ls-files failed in ${root}. Is it a git repository? Set "files": "walk" in ${CONFIG_FILE} to walk the folder instead.`)
    }
    paths = out.split("\0").filter(Boolean).map(normalizePath)
  }
  return [...new Set(paths)].filter((p) => isFile(join(root, p))).sort()
}

function walk(root: string, rel: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, rel))) {
    if (WALK_SKIP.has(name)) continue
    const p = rel ? `${rel}/${name}` : name
    if (statSync(join(root, p)).isDirectory()) out.push(...walk(root, p))
    else out.push(p)
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

export function exists(root: string, rel: string): boolean {
  return existsSync(join(root, normalizePath(rel)))
}

/** The files the map must cover: include, minus exclude, minus the atlas folder itself. */
export function universe(ctx: Ctx, all: string[]): string[] {
  const own = ctx.dirRel ? `${ctx.dirRel}/` : null
  return all.filter((p) => (!own || !p.startsWith(own)) && matchesAny(ctx.config.include, p) && !matchesAny(ctx.config.exclude, p))
}

export function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim()
  } catch {
    return undefined
  }
}
