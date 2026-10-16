/** The shapes of atlas.json and atlas.config.json. */

export type KeyFile = { path: string; what: string }

/**
 * A job is anything that runs on a schedule or on demand. `kind` says how the
 * check proves `ref` is real:
 *   github-action  ref = a workflow file path, which must exist
 *   vercel-cron    ref = a cron path in vercel.json
 *   package-script ref = a package.json script name
 *   make-target    ref = a target defined in the Makefile
 *   file           ref = any repo file that runs it (a cron script, a unit file)
 *   external       ref = free text; configured outside the repo, so unchecked
 */
export type JobKind = "github-action" | "vercel-cron" | "package-script" | "make-target" | "file" | "external"
export const JOB_KINDS: readonly JobKind[] = ["github-action", "vercel-cron", "package-script", "make-target", "file", "external"]
export const JOB_KIND_LABELS: Record<JobKind, string> = {
  "github-action": "GitHub Action",
  "vercel-cron": "Vercel Cron",
  "package-script": "package script",
  "make-target": "make target",
  file: "script",
  external: "external",
}
export type Job = { name: string; kind: JobKind; ref: string; when: string; what: string }
export type Link = { to: string; why: string }
export type Switch = { name: string; what: string }

export type System = {
  id: string
  group: string
  name: string
  oneLiner: string
  summary: string
  journey: string[]
  owns: string[]
  keyFiles: KeyFile[]
  models: string[]
  jobs: Job[]
  switches: Switch[]
  connects: Link[]
  rules: string[]
  checks: string[]
  watchOuts: string[]
}

export type Group = { id: string; name: string; blurb: string }
export type Flow = { name: string; steps: { system: string; text: string }[] }
export type Term = { term: string; meaning: string }

export type Atlas = {
  title: string
  about?: string
  overview?: string
  verified?: { commit: string; date: string }
  groups: Group[]
  systems: System[]
  flows?: Flow[]
  glossary?: Term[]
}

/** Every field a system must carry, in the order the docs describe them. */
export const SYSTEM_FIELDS = [
  "id", "group", "name", "oneLiner", "summary", "journey", "owns", "keyFiles",
  "models", "jobs", "switches", "connects", "rules", "checks", "watchOuts",
] as const
/** CLI subcommands: `atlas <id>` could never print a system with one of these ids. */
export const SUBCOMMANDS = ["check", "render", "init", "inventory", "changed", "merge", "stamp", "help"] as const
export const ARRAY_FIELDS =["journey", "owns", "keyFiles", "models", "jobs", "switches", "connects", "rules", "checks", "watchOuts"] as const

export type Config = {
  /** atlas.json, relative to the config file's folder. */
  atlas: string
  /** The repository root, relative to the config file's folder. */
  root: string
  /** "git": tracked plus untracked-but-not-ignored files; "walk": a directory walk. */
  files: "git" | "walk"
  /** Globs (repo-relative) that every file on the map is drawn from. Each must match at least one file. */
  include: string[]
  /** Globs taken back out of `include`. */
  exclude: string[]
  /** A RATCHET on one printed entry: trim the prose, never raise it to fit. */
  entryMaxChars: number
  /** Optional stack add-ons: each makes the check claim one more kind of thing. */
  addons: {
    models?: { preset?: "prisma" | "sql" | "django" | "sqlalchemy"; files: string[]; pattern?: string }
    packageScripts?: { file?: string; match?: string }
    githubWorkflows?: { dir?: string }
    vercelCrons?: { file?: string }
    rules?: { dir: string; glob?: string }
  }
  /** Extra numbers for the rendered page's header: a label and the glob it counts. */
  stats?: { label: string; glob: string }[]
}
