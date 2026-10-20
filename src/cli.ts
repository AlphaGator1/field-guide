/**
 * Field Guide CLI. Reads files and runs local git only: no network.
 *
 *   guide                       every system, one line each
 *   guide <id>                  one system in full
 *   guide <path>                which system owns a file (and its entry)
 *   guide <word ...>            everything that mentions every word
 *   guide --search <word ...>   the same, even when the first word is a command
 *   guide overview              the about text, the overview and every flow
 *   guide check [--json]        coverage plus existence; exit 1 on any failure
 *   guide render [out.html]     the guide as one self-contained page
 *   guide render --map-only [out.html]
 *                               just the map, the route bar and the entry panel
 *   guide render --guide <file.json> [--root <folder>] [--map-only] <out.html>
 *                               a guide-shaped JSON with no guide.config.json
 *   guide init [--force]        vendor this CLI into ./docs/field-guide and write a config
 *   guide inventory [--unowned] the files on the map, by folder (or the unowned ones)
 *   guide changed [<commit>]    the systems whose files changed since a commit
 *   guide merge <file|folder ...>  fold draft or fact-check output into guide.json
 *   guide stamp                 record HEAD as the commit the guide was verified against
 *
 * Every command takes --dir <folder> (the folder holding guide.config.json), except
 * render --guide, which reads the named JSON and needs no config.
 */
import { existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { CHECK_CODES, formatResults, runCheck } from "./check"
import { init, inventory } from "./init"
import { normalizePath, ownersOf, renderIndex, renderOverview, renderSystem, search } from "./lookup"
import { changed, merge, stamp } from "./maintain"
import { findGuideDir, loadGuide, loadContext, outsideContext, resolveArgPath, UsageError, type Ctx } from "./repo"
import { writePage } from "./render"
import { SUBCOMMANDS, type Guide } from "./types"

const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev"

/** How many positional arguments each command takes after its name: [min, max]. */
const ARITY: Record<string, [number, number]> = {
  check: [0, 0], render: [0, 1], init: [0, 0], inventory: [0, 0], changed: [0, 1],
  merge: [1, Infinity], stamp: [0, 0], overview: [0, 0], help: [0, 0],
}

function parse(argv: string[]) {
  const flags = new Map<string, string | true>()
  const pos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dir" || a === "--depth" || a === "--guide" || a === "--root" || a === "--config") flags.set(a.slice(2), argv[++i] ?? "")
    else if (a === "-s") flags.set("search", true)
    else if (a.startsWith("--")) flags.set(a.slice(2), true)
    else pos.push(a)
  }
  return { flags, pos }
}

function flagValue(flags: Map<string, string | true>, name: string): string | undefined {
  const v = flags.get(name)
  return typeof v === "string" && v ? v : undefined
}

function render(ctx: Ctx, guide: Guide, out: string | undefined, mapOnly: boolean): number {
  const path = writePage(ctx, guide, out, { mapOnly })
  console.log(`Wrote ${path} (${guide.systems.length} systems). It does not validate the guide: run \`guide check\` first.`)
  return 0
}

function main(argv: string[]): number {
  const { flags, pos } = parse(argv)
  const searching = flags.has("search")
  const cmd = searching ? undefined : pos[0]
  if (flags.has("version")) {
    console.log(VERSION)
    return 0
  }
  if (flags.has("help") || cmd === "help") {
    console.log(HELP)
    return 0
  }
  // A command never swallows stray words: `guide stamp duty` must not move the update baseline.
  if (cmd && ARITY[cmd]) {
    const [min, max] = ARITY[cmd]
    const n = pos.length - 1
    if (n < min || n > max) {
      throw new UsageError(`guide ${cmd} takes ${max === 0 ? "no arguments" : min === max ? `${min} argument${min === 1 ? "" : "s"}` : max === Infinity ? `at least ${min}` : `at most ${max}`}; got ${n}. To search for words, use: guide --search ${pos.join(" ")}`)
    }
  }
  const dirFlag = typeof flags.get("dir") === "string" ? (flags.get("dir") as string) : undefined
  if (flags.has("guide")) {
    // An outside guide has no config to find, so this branch comes before the context is loaded.
    const file = flags.get("guide")
    if (cmd !== "render") throw new UsageError("--guide goes with render only: guide render --guide <file.json> <out.html>")
    if (typeof file !== "string" || !file) throw new UsageError("--guide needs the guide's JSON file: guide render --guide <file.json> <out.html>")
    if (!pos[1]) throw new UsageError("guide render --guide <file.json> needs an output path, so nothing is written next to that guide by accident.")
    const ctx = outsideContext(file, flagValue(flags, "root"), flagValue(flags, "config"))
    return render(ctx, loadGuide(ctx), pos[1], flags.has("map-only"))
  }
  if (cmd === "init") {
    console.log(init(dirFlag, flags.has("force")))
    return 0
  }
  const ctx = loadContext(findGuideDir(dirFlag, dirname(fileURLToPath(import.meta.url))))

  if (cmd === "inventory") {
    let guide: Guide | undefined
    try {
      guide = loadGuide(ctx)
    } catch {
      guide = undefined
    }
    console.log(inventory(ctx, guide, Number(flags.get("depth")) || 2, flags.has("unowned")))
    return 0
  }

  const guide = loadGuide(ctx)
  switch (cmd) {
    case "check": {
      const results = runCheck(ctx, guide)
      const failed = results.filter((r) => !r.pass).length
      if (flags.has("json")) console.log(JSON.stringify({ passed: results.length - failed, failed, codes: CHECK_CODES, results }, null, 2))
      else console.log(formatResults(results, `Field Guide check (guide ${VERSION}): ${normalizePath(ctx.guidePath.slice(ctx.root.length + 1))}, ${guide.systems?.length ?? 0} systems`))
      return failed ? 1 : 0
    }
    case "render":
      return render(ctx, guide, pos[1], flags.has("map-only"))
    case "merge":
      console.log(merge(ctx, guide, pos.slice(1), flags.has("dry-run")))
      return 0
    case "changed":
      console.log(changed(ctx, guide, pos[1], flags.has("json")))
      return 0
    case "stamp":
      console.log(stamp(ctx, guide))
      return 0
    case "overview":
      console.log(renderOverview(guide))
      return 0
  }

  // Lookup: an id, then a path (as the session holds it), then words.
  const arg = pos.join(" ").trim()
  if (!arg) {
    console.log(renderIndex(guide))
    console.log("\nOne system: guide <id> · a file's owner: guide <path> · words: guide <word> (or guide --search <words>) · guide help")
    return 0
  }
  if (!searching) {
    const system = guide.systems.find((s) => s.id === arg)
    if (system) {
      // --json prints the entry as guide.json holds it: what a fact-check agent copies and corrects.
      console.log(flags.has("json") ? JSON.stringify(system, null, 2) : renderSystem(guide, system))
      return 0
    }
    if (pos.length === 1) {
      const rel = resolveArgPath(ctx.root, process.cwd(), arg)
      const owners = rel ? ownersOf(guide, rel) : []
      if (rel && owners.length === 1) {
        console.log(`${rel} belongs to ${owners[0].id}.\n`)
        console.log(renderSystem(guide, owners[0]))
        return 0
      }
      if (rel && owners.length > 1) {
        console.log(`${rel} belongs to ${owners.length} systems; print the one you need with guide <id>:`)
        for (const s of owners) console.log(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
        return 0
      }
      // A real file or folder that no system owns is a coverage gap, not a search.
      if (rel && existsSync(join(ctx.root, rel))) {
        console.log(`No system owns ${rel}. A new file goes into a system's "owns" in guide.json (guide check fails until it does).`)
        return 1
      }
    }
  }
  const hits = search(guide, arg)
  if (!hits.systems.length && !hits.mentions.length && !hits.terms.length && !hits.top.length) {
    console.log(`Nothing in the guide mentions "${arg}"${/[\\/]/.test(arg) ? ", and no file at that path is owned by a system" : ""}. Run with no argument for the list of systems.`)
    return 1
  }
  const out: string[] = []
  for (const s of hits.systems) out.push(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
  if (hits.mentions.length) {
    out.push(out.length ? "\nAlso mentioned in:" : "Mentioned in:")
    for (const s of hits.mentions) out.push(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
  }
  if (hits.top.length) {
    out.push(out.length ? "\nOverview and flows:" : "Overview and flows:")
    for (const t of hits.top) out.push(`  ${t}`)
  }
  if (hits.terms.length) {
    out.push(out.length ? "\nGlossary:" : "Glossary:")
    for (const t of hits.terms) out.push(`  ${t.term} — ${t.meaning}`)
  }
  console.log(out.join("\n"))
  return 0
}

const HELP = `Field Guide ${VERSION}: a plain-English map of every system in this repo.

  guide                       every system, one line each
  guide <id> [--json]         one system in full (--json: as guide.json holds it)
  guide <path>                which system owns a file (and its entry); absolute paths work
  guide <word ...>            everything that mentions every word: entries, flows, overview, glossary
  guide --search <word ...>   the same, even when the first word is a command name
  guide overview              the about text, the overview and every flow, step by step
  guide check [--json]        every file on the map, every name real; exit 1 on failure
  guide render [out.html]     one self-contained page (default: <guide folder>/guide.html)
  guide render --map-only [out.html]
                              just the map, the route bar and the entry panel
  guide render --guide <file.json> [--root <folder>] [--map-only] <out.html>
                              a guide-shaped JSON that has no guide.config.json; reads it, writes only
                              <out.html>. The repo root defaults to the git top level of the JSON's folder;
                              --config <file> supplies include, exclude and prose (a guide.config.json)
  guide init [--force]        vendor this CLI into ./docs/field-guide and detect a config
  guide inventory [--unowned] [--depth N]
                              the files on the map by folder, or the ones no system owns
  guide changed [<commit>]    systems whose files changed since a commit
                              (default: verified.commit, else the last commit that touched guide.json)
  guide merge <file|folder ...> [--dry-run]
                              fold draft or fact-check JSON into guide.json; counts changed fields
  guide stamp                 record HEAD as the commit the guide was verified against

  --dir <folder>              the folder holding guide.config.json (default: this script's folder, then ./docs/field-guide)

Reserved words that cannot be system ids: ${SUBCOMMANDS.join(", ")}.`

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  if (e instanceof UsageError) {
    console.error(e.message)
    process.exitCode = 2
  } else {
    throw e
  }
}
