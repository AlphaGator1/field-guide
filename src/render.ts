/**
 * `atlas render [out.html]`: the atlas as one self-contained web page (no
 * external requests: system fonts, inline script). Reads files and
 * `git rev-parse` only. It does not validate the atlas; run `atlas check` first.
 */
import { writeFileSync } from "fs"
import { relative, resolve } from "path"
import { globToRegExp, normalizePath } from "./lookup"
import { git, listRepoFiles, universe, type Ctx } from "./repo"
import type { Atlas } from "./types"
// esbuild inlines the template as a string (--loader:.html=text), so the bundled CLI is one file.
import template from "../templates/atlas.html"

export const MARKER = "/*ATLAS_DATA*/"

export function renderPage(ctx: Ctx, atlas: Atlas): string {
  if (template.split(MARKER).length !== 2) throw new Error(`the page template must contain ${MARKER} exactly once`)
  const files = universe(ctx, listRepoFiles(ctx.root, ctx.config.files))
  const stats = {
    files: files.length,
    jobs: atlas.systems.reduce((n, s) => n + (s.jobs?.length ?? 0), 0),
    models: new Set(atlas.systems.flatMap((s) => s.models ?? [])).size,
    checks: new Set(atlas.systems.flatMap((s) => s.checks ?? [])).size,
    extra: (ctx.config.stats ?? []).map((x) => ({ label: x.label, value: files.filter((p) => globToRegExp(x.glob).test(p)).length })),
    commit: git(ctx.root, ["rev-parse", "--short", "HEAD"]) ?? "unknown",
    generated: new Date().toISOString().slice(0, 10),
    source: normalizePath(relative(ctx.root, ctx.atlasPath)),
  }
  // `<` is escaped so no string in the data can close the <script> element early.
  const json = JSON.stringify({ ...atlas, stats }).replace(/</g, "\\u003c")
  return template.replace(MARKER, () => json)
}

export function writePage(ctx: Ctx, atlas: Atlas, out?: string): string {
  const path = resolve(out ?? resolve(ctx.dir, "atlas.html"))
  writeFileSync(path, renderPage(ctx, atlas))
  return path
}
