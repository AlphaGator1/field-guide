// Bundles src/cli.ts (with the page template inlined) into ONE file, dist/guide.mjs,
// that runs on plain Node 18+ with no install: projects vendor that file.
//   node scripts/build.mjs            write dist/guide.mjs
//   node scripts/build.mjs --verify   fail if the committed dist/guide.mjs is stale
import { build } from "esbuild"
import { mkdirSync, readFileSync, writeFileSync } from "fs"

const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const verify = process.argv.includes("--verify")
const OUT = "dist/guide.mjs"

const result = await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  loader: { ".html": "text", ".md": "text" },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: [
      "#!/usr/bin/env node",
      `// Field Guide CLI ${pkg.version}. Generated from src/ by scripts/build.mjs: do not edit by hand.`,
      "// A project vendors this one file (guide init); replace it with a newer release to upgrade.",
      "// Reads files and runs local git only: no network. License: MIT.",
    ].join("\n"),
  },
  legalComments: "none",
  write: false,
})
const text = result.outputFiles[0].text

if (verify) {
  const current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")
  if (current !== text.replace(/\r\n/g, "\n")) {
    console.error(`${OUT} is stale: run npm run build and commit it.`)
    process.exit(1)
  }
  console.log(`${OUT} matches src/ (${text.length} bytes).`)
} else {
  mkdirSync("dist", { recursive: true })
  writeFileSync(OUT, text)
  console.log(`Wrote ${OUT} (${text.length} bytes).`)
}
