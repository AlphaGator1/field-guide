/**
 * System Atlas CLI. Reads files and runs local git only: no network.
 *
 *   atlas                       every system, one line each
 *   atlas <id>                  one system in full
 *   atlas <path>                which system owns a file (and its entry)
 *   atlas <word ...>            systems and glossary terms mentioning every word
 *   atlas overview              the about text, the overview and every flow
 *   atlas check [--json]        coverage plus existence; exit 1 on any failure
 *   atlas render [out.html]     the atlas as one self-contained page
 *   atlas init [--force]        vendor this CLI into ./docs/atlas and write a config
 *   atlas inventory [--unowned] the files on the map, by folder (or the unowned ones)
 *   atlas changed [<commit>]    the systems whose files changed since a commit
 *   atlas merge <file ...>      fold draft or fact-check output into atlas.json
 *   atlas stamp                 record HEAD as the commit the atlas was verified against
 *
 * Every command takes --dir <folder> (the folder holding atlas.config.json).
 */
import { dirname } from "path"
import { fileURLToPath } from "url"
import { CHECK_CODES, formatResults, runCheck } from "./check"
import { init, inventory } from "./init"
import { normalizePath, ownersOf, renderIndex, renderOverview, renderSystem, search } from "./lookup"
import { changed, merge, stamp } from "./maintain"
import { findAtlasDir, loadAtlas, loadContext, UsageError } from "./repo"
import { writePage } from "./render"
import { SUBCOMMANDS, type Atlas } from "./types"

const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev"

function parse(argv: string[]) {
  const flags = new Map<string, string | true>()
  const pos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dir" || a === "--depth") flags.set(a.slice(2), argv[++i] ?? "")
    else if (a.startsWith("--")) flags.set(a.slice(2), true)
    else pos.push(a)
  }
  return { flags, pos }
}

function main(argv: string[]): number {
  const { flags, pos } = parse(argv)
  const cmd = pos[0]
  if (flags.has("version")) {
    console.log(VERSION)
    return 0
  }
  if (flags.has("help") || cmd === "help") {
    console.log(HELP)
    return 0
  }
  const dirFlag = typeof flags.get("dir") === "string" ? (flags.get("dir") as string) : undefined
  if (cmd === "init") {
    console.log(init(dirFlag, flags.has("force")))
    return 0
  }
  const ctx = loadContext(findAtlasDir(dirFlag, dirname(fileURLToPath(import.meta.url))))

  if (cmd === "inventory") {
    let atlas: Atlas | undefined
    try {
      atlas = loadAtlas(ctx)
    } catch {
      atlas = undefined
    }
    console.log(inventory(ctx, atlas, Number(flags.get("depth")) || 2, flags.has("unowned")))
    return 0
  }

  const atlas = loadAtlas(ctx)
  switch (cmd) {
    case "check": {
      const results = runCheck(ctx, atlas)
      const failed = results.filter((r) => !r.pass).length
      if (flags.has("json")) console.log(JSON.stringify({ passed: results.length - failed, failed, codes: CHECK_CODES, results }, null, 2))
      else console.log(formatResults(results, `System Atlas check (atlas ${VERSION}): ${normalizePath(ctx.atlasPath.slice(ctx.root.length + 1))}, ${atlas.systems?.length ?? 0} systems`))
      return failed ? 1 : 0
    }
    case "render": {
      const path = writePage(ctx, atlas, pos[1])
      console.log(`Wrote ${path} (${atlas.systems.length} systems). It does not validate the atlas: run \`atlas check\` first.`)
      return 0
    }
    case "merge":
      console.log(merge(ctx, atlas, pos.slice(1), flags.has("dry-run")))
      return 0
    case "changed":
      console.log(changed(ctx, atlas, pos[1], flags.has("json")))
      return 0
    case "stamp":
      console.log(stamp(ctx, atlas))
      return 0
    case "overview":
      console.log(renderOverview(atlas))
      return 0
  }

  // Lookup: an id, then a path, then words.
  const arg = pos.join(" ").trim()
  if (!arg) {
    console.log(renderIndex(atlas))
    console.log("\nOne system: atlas <id> · a file's owner: atlas <path> · a word: atlas <word> · atlas help")
    return 0
  }
  const system = atlas.systems.find((s) => s.id === arg)
  if (system) {
    // --json prints the entry as atlas.json holds it: what a fact-check agent copies and corrects.
    console.log(flags.has("json") ? JSON.stringify(system, null, 2) : renderSystem(atlas, system))
    return 0
  }
  const owners = ownersOf(atlas, arg)
  const looksLikePath = /[\\/]/.test(arg) || /\.[A-Za-z0-9]+$/.test(arg)
  if (owners.length || (looksLikePath && pos.length === 1)) {
    const p = normalizePath(arg)
    if (owners.length === 0) {
      console.log(`No system owns ${p}. Paths are repo-relative; a new file goes into a system's "owns" in atlas.json (atlas check fails until it does).`)
      return 1
    }
    if (owners.length === 1) {
      console.log(`${p} belongs to ${owners[0].id}.\n`)
      console.log(renderSystem(atlas, owners[0]))
      return 0
    }
    console.log(`${p} belongs to ${owners.length} systems; print the one you need with atlas <id>:`)
    for (const s of owners) console.log(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
    return 0
  }
  const hits = search(atlas, arg)
  if (!hits.systems.length && !hits.mentions.length && !hits.terms.length) {
    console.log(`Nothing in the atlas mentions "${arg}". Run with no argument for the list of systems.`)
    return 1
  }
  for (const s of hits.systems) console.log(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
  if (hits.mentions.length) {
    console.log(hits.systems.length ? "\nAlso mentioned in:" : "Mentioned in:")
    for (const s of hits.mentions) console.log(`  ${s.id} — ${s.name}: ${s.oneLiner}`)
  }
  if (hits.terms.length) {
    console.log(hits.systems.length || hits.mentions.length ? "\nGlossary:" : "Glossary:")
    for (const t of hits.terms) console.log(`  ${t.term} — ${t.meaning}`)
  }
  return 0
}

const HELP = `System Atlas ${VERSION}: a plain-English map of every system in this repo.

  atlas                       every system, one line each
  atlas <id> [--json]         one system in full (--json: as atlas.json holds it)
  atlas <path>                which system owns a file (and its entry)
  atlas <word ...>            systems and glossary terms mentioning every word
  atlas overview              the about text, the overview and every flow, step by step
  atlas check [--json]        every file on the map, every name real; exit 1 on failure
  atlas render [out.html]     one self-contained page (default: <atlas folder>/atlas.html)
  atlas init [--force]        vendor this CLI into ./docs/atlas and detect a config
  atlas inventory [--unowned] [--depth N]
                              the files on the map by folder, or the ones no system owns
  atlas changed [<commit>]    systems whose files changed since a commit
                              (default: verified.commit, else the last commit that touched atlas.json)
  atlas merge <file ...> [--dry-run]
                              fold draft or fact-check JSON into atlas.json; counts changed fields
  atlas stamp                 record HEAD as the commit the atlas was verified against

  --dir <folder>              the folder holding atlas.config.json (default: this script's folder, then ./docs/atlas)

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
