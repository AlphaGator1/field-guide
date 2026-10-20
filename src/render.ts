/**
 * `guide render [--map-only] [out.html]`, and `guide render --guide <file.json>
 * <out.html>` for a guide with no guide.config.json: the guide as one
 * self-contained web page (no external requests: system fonts, inline script).
 * Reads files and local git (`rev-parse`, `check-attr`) only, and writes only
 * the page, never over the guide or the config it reads. It does not validate
 * the guide.
 */
import { writeFileSync } from "fs"
import { relative, resolve } from "path"
import { layoutHills } from "./layout"
import { globToRegExp, normalizePath } from "./lookup"
import { systemSizes } from "./metrics"
import { git, listRepoFiles, samePath, universe, UsageError, type Ctx } from "./repo"
import type { Guide, Hill } from "./types"
// esbuild inlines the template as a string (--loader:.html=text), so the bundled CLI is one file.
import template from "../templates/guide.html"
import mapModule from "../templates/map.html"

export const MARKER = "/*GUIDE_DATA*/"
/** Where the trail map module (templates/map.html: one style and one script element) goes in the page. */
export const MAP_MARKER = "<!--TRAIL_MAP-->"

export type RenderOptions = {
  /** Just the map, the route bar and the entry panel: the page switches the rest off. */
  mapOnly?: boolean
}

/** The page's HTML, and the hills drawn on it. */
export function renderPage(ctx: Ctx, guide: Guide, opts: RenderOptions = {}): { html: string; hills: Hill[] } {
  for (const m of [MARKER, MAP_MARKER]) if (template.split(m).length !== 2) throw new Error(`the page template must contain ${m} exactly once`)
  const files = universe(ctx, listRepoFiles(ctx.root, ctx.config.files, ctx.walkHint))
  const stats = {
    files: files.length,
    jobs: guide.systems.reduce((n, s) => n + (s.jobs?.length ?? 0), 0),
    models: new Set(guide.systems.flatMap((s) => s.models ?? [])).size,
    checks: new Set(guide.systems.flatMap((s) => s.checks ?? [])).size,
    extra: (ctx.config.stats ?? []).map((x) => ({ label: x.label, value: files.filter((p) => globToRegExp(x.glob).test(p)).length })),
    commit: git(ctx.root, ["rev-parse", "--short", "HEAD"]) ?? "unknown",
    generated: new Date().toISOString().slice(0, 10),
    source: normalizePath(relative(ctx.root, ctx.guidePath)),
  }
  const hills = layoutHills(guide, systemSizes(ctx, guide, files))
  // `<` is escaped so no string in the data can close the <script> element early.
  const json = JSON.stringify({ ...guide, stats, map: { hills, mapOnly: !!opts.mapOnly } }).replace(/</g, "\\u003c")
  // The data goes in first: with `<` escaped it cannot hold the map marker, so the module lands where the template put it.
  return { html: template.replace(MARKER, () => json).replace(MAP_MARKER, () => mapModule), hills }
}

/** Writes the page (default: guide.html in the guide folder) and returns its path and hills. Refuses to write over the guide or the config. */
export function writePage(ctx: Ctx, guide: Guide, out?: string, opts?: RenderOptions): { path: string; hills: Hill[] } {
  const path = resolve(out ?? resolve(ctx.dir, "guide.html"))
  for (const [what, input] of [["guide", ctx.guidePath], ["config file", ctx.configPath]] as const) {
    if (input && samePath(path, input)) throw new UsageError(`Refusing to write the page to ${path}: that is the ${what} this render reads. Name another output file.`)
  }
  const { html, hills } = renderPage(ctx, guide, opts)
  writeFileSync(path, html)
  return { path, hills }
}
