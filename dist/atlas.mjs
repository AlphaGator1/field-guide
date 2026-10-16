#!/usr/bin/env node
// System Atlas CLI 0.1.0. Generated from src/ by scripts/build.mjs: do not edit by hand.
// A project vendors this one file (atlas init); replace it with a newer release to upgrade.
// Reads files and runs local git only: no network. License: MIT.

// src/cli.ts
import { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/check.ts
import { readFileSync as readFileSync2, statSync as statSync2 } from "fs";
import { join as join2 } from "path";

// src/types.ts
var JOB_KINDS = ["github-action", "vercel-cron", "package-script", "make-target", "file", "external"];
var JOB_KIND_LABELS = {
  "github-action": "GitHub Action",
  "vercel-cron": "Vercel Cron",
  "package-script": "package script",
  "make-target": "make target",
  file: "script",
  external: "external"
};
var SYSTEM_FIELDS = [
  "id",
  "group",
  "name",
  "oneLiner",
  "summary",
  "journey",
  "owns",
  "keyFiles",
  "models",
  "jobs",
  "switches",
  "connects",
  "rules",
  "checks",
  "watchOuts"
];
var SUBCOMMANDS = ["check", "render", "init", "inventory", "changed", "merge", "stamp", "help"];
var ARRAY_FIELDS = ["journey", "owns", "keyFiles", "models", "jobs", "switches", "connects", "rules", "checks", "watchOuts"];

// src/lookup.ts
var SECTION_LABELS = [
  "How it works:",
  "Watch out:",
  "Connected to:",
  "Key files:",
  "Jobs:",
  "Switches:",
  "Data models:",
  "Rules:",
  "Checks:",
  "Owns:"
];
var escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
var cache = /* @__PURE__ */ new Map();
function globToRegExp(glob) {
  const hit = cache.get(glob);
  if (hit) return hit;
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i++;
      }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{" && glob.indexOf("}", i) > i) {
      const end = glob.indexOf("}", i);
      re += `(?:${glob.slice(i + 1, end).split(",").map(escapeRe).join("|")})`;
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  const out = new RegExp(`^${re}$`);
  cache.set(glob, out);
  return out;
}
function matchesAny(globs, path) {
  return globs.some((g) => globToRegExp(g).test(path));
}
function normalizePath(p) {
  return p.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}
function ownersOf(atlas, path) {
  const p = normalizePath(path);
  return atlas.systems.filter((s) => matchesAny(s.owns, p));
}
function renderSystem(atlas, s) {
  const group = atlas.groups.find((g) => g.id === s.group)?.name ?? s.group;
  const name = (id) => atlas.systems.find((x) => x.id === id)?.name ?? id;
  const list = (label, items) => items.length ? [label, ...items.map((i) => `  - ${i}`)] : [`${label} none`];
  const inline = (label, items) => `${label} ${items.join(", ") || "none"}`;
  return [
    `${s.name} [${s.id}] (${group})`,
    s.oneLiner,
    "",
    s.summary,
    "",
    SECTION_LABELS[0],
    ...s.journey.map((j, i) => `  ${i + 1}. ${j}`),
    ...list(SECTION_LABELS[1], s.watchOuts),
    ...list(SECTION_LABELS[2], s.connects.map((c) => `${name(c.to)} [${c.to}]: ${c.why}`)),
    ...list(SECTION_LABELS[3], s.keyFiles.map((k) => `${k.path} \u2014 ${k.what}`)),
    ...list(SECTION_LABELS[4], s.jobs.map((j) => `${j.name} (${j.when}; ${JOB_KIND_LABELS[j.kind] ?? j.kind} ${j.ref}) \u2014 ${j.what}`)),
    ...list(SECTION_LABELS[5], s.switches.map((w) => `${w.name} \u2014 ${w.what}`)),
    inline(SECTION_LABELS[6], s.models),
    inline(SECTION_LABELS[7], s.rules),
    inline(SECTION_LABELS[8], s.checks),
    inline(SECTION_LABELS[9], s.owns)
  ].join("\n");
}
function renderIndex(atlas) {
  const out = [];
  for (const g of atlas.groups) {
    out.push(`${g.name}:`);
    for (const s of atlas.systems.filter((x) => x.group === g.id)) out.push(`  ${s.id} \u2014 ${s.name}: ${s.oneLiner}`);
  }
  return out.join("\n");
}
function search(atlas, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { systems: [], mentions: [], terms: [] };
  const all = (text) => {
    const t = text.toLowerCase();
    return words.every((w) => t.includes(w));
  };
  const head = (s) => `${s.id} ${s.name} ${s.oneLiner} ${s.summary}`;
  const deep = (s) => [
    ...s.journey,
    ...s.watchOuts,
    ...s.keyFiles.map((k) => `${k.path} ${k.what}`),
    ...s.jobs.map((j) => `${j.name} ${j.ref} ${j.what}`),
    ...s.switches.map((w) => `${w.name} ${w.what}`),
    ...s.models
  ].join(" ");
  const systems = atlas.systems.filter((s) => all(head(s)));
  const mentions = atlas.systems.filter((s) => !systems.includes(s) && all(`${head(s)} ${deep(s)}`));
  const terms = (atlas.glossary ?? []).filter((g) => all(`${g.term} ${g.meaning}`));
  return { systems, mentions, terms };
}

// src/repo.ts
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
var CONFIG_FILE = "atlas.config.json";
var DEFAULT_DIR = "docs/atlas";
var DEFAULT_CONFIG = {
  atlas: "atlas.json",
  root: "",
  files: "git",
  include: ["**"],
  exclude: [],
  entryMaxChars: 12e3,
  addons: {}
};
var UsageError = class extends Error {
};
function findAtlasDir(argDir, scriptDir) {
  if (argDir) {
    const d = resolve(argDir);
    if (!existsSync(join(d, CONFIG_FILE))) throw new UsageError(`No ${CONFIG_FILE} in ${d}.`);
    return d;
  }
  for (const d of [scriptDir, resolve(DEFAULT_DIR)]) {
    if (d && existsSync(join(d, CONFIG_FILE))) return d;
  }
  throw new UsageError(`No ${CONFIG_FILE} found next to this script or in ./${DEFAULT_DIR}. Pass --dir <folder>, or create one with: atlas init`);
}
function findGitRoot(from) {
  let d = resolve(from);
  for (; ; ) {
    if (existsSync(join(d, ".git"))) return d;
    const up = dirname(d);
    if (up === d) return void 0;
    d = up;
  }
}
function loadContext(dir) {
  const raw = readJson(join(dir, CONFIG_FILE));
  const config = { ...DEFAULT_CONFIG, ...raw, addons: { ...raw.addons ?? {} } };
  const root = config.root ? resolve(dir, config.root) : findGitRoot(dir) ?? process.cwd();
  return { dir, config, atlasPath: resolve(dir, config.atlas), root, dirRel: normalizePath(relative(root, dir)) };
}
function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError(`Cannot read ${path}.`);
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new UsageError(`${path} is not valid JSON: ${e.message}`);
  }
}
function loadAtlas(ctx) {
  return readJson(ctx.atlasPath);
}
var WALK_SKIP = /* @__PURE__ */ new Set([".git", "node_modules"]);
function listRepoFiles(root, mode) {
  let paths;
  if (mode === "walk") {
    paths = walk(root, "");
  } else {
    let out;
    try {
      out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      throw new UsageError(`git ls-files failed in ${root}. Is it a git repository? Set "files": "walk" in ${CONFIG_FILE} to walk the folder instead.`);
    }
    paths = out.split("\0").filter(Boolean).map(normalizePath);
  }
  return [...new Set(paths)].filter((p) => isFile(join(root, p))).sort();
}
function walk(root, rel2) {
  const out = [];
  for (const name of readdirSync(join(root, rel2))) {
    if (WALK_SKIP.has(name)) continue;
    const p = rel2 ? `${rel2}/${name}` : name;
    if (statSync(join(root, p)).isDirectory()) out.push(...walk(root, p));
    else out.push(p);
  }
  return out;
}
function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function exists(root, rel2) {
  return existsSync(join(root, normalizePath(rel2)));
}
function universe(ctx, all) {
  const own = ctx.dirRel ? `${ctx.dirRel}/` : null;
  return all.filter((p) => (!own || !p.startsWith(own)) && matchesAny(ctx.config.include, p) && !matchesAny(ctx.config.exclude, p));
}
function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim();
  } catch {
    return void 0;
  }
}

// src/check.ts
var CHECK_CODES = [
  "shape.title",
  "shape.nonempty",
  "shape.group-ids",
  "shape.system-ids",
  "shape.id-format",
  "shape.fields",
  "shape.known-group",
  "shape.prose",
  "shape.single-line",
  "shape.owns-keyfiles",
  "shape.group-used",
  "shape.no-todo",
  "coverage.include",
  "coverage.unowned",
  "coverage.dead-glob",
  "names.key-files",
  "names.connects",
  "names.flows",
  "names.glossary",
  "names.rules",
  "names.checks",
  "names.jobs",
  "names.switches",
  "names.models",
  "addon.models.found",
  "addon.models.claimed",
  "addon.scripts.found",
  "addon.scripts.claimed",
  "addon.workflows.found",
  "addon.workflows.claimed",
  "addon.crons.found",
  "addon.crons.claimed",
  "addon.rules.found",
  "addon.rules.claimed",
  "lookup.entry-sections",
  "lookup.entry-complete",
  "lookup.entry-size",
  "lookup.index",
  "lookup.owner-path"
];
var MODEL_PRESETS = {
  prisma: { files: ["**/*.prisma"], pattern: "^\\s*model\\s+(\\w+)\\s*\\{", flags: "gm" },
  sql: { files: ["**/*.sql"], pattern: 'create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:[\\w"`\\[\\]]+\\.)?["`\\[]?(\\w+)', flags: "gim" },
  django: { files: ["**/models.py", "**/models/*.py"], pattern: "^class\\s+(\\w+)\\s*\\([^)]*\\bmodels\\.Model\\b", flags: "gm" },
  sqlalchemy: { files: ["**/*.py"], pattern: "^class\\s+(\\w+)\\s*\\([^)]*\\b(?:Base|DeclarativeBase|db\\.Model)\\b", flags: "gm" }
};
var ENTRY_SECTIONS = [
  "How it works:",
  "Watch out:",
  "Connected to:",
  "Key files:",
  "Jobs:",
  "Switches:",
  "Data models:",
  "Rules:",
  "Checks:",
  "Owns:"
];
var ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var MAX_TEXT_BYTES = 2e6;
var str = (v) => typeof v === "string" ? v : "";
var nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
var arr = (v) => Array.isArray(v) ? v : [];
var sample = (items, max = 25) => items.length > max ? `${items.slice(0, max).join(", ")} (+${items.length - max} more)` : items.join(", ");
var dupes = (items) => items.filter((x, i) => items.indexOf(x) !== i);
function normalize(raw) {
  const systems = arr(raw?.systems).map((s) => {
    const o = s && typeof s === "object" ? s : {};
    const out = {};
    for (const f of SYSTEM_FIELDS) out[f] = ARRAY_FIELDS.includes(f) ? arr(o[f]) : str(o[f]);
    return out;
  });
  return { ...raw, title: str(raw?.title), groups: arr(raw?.groups), systems, flows: arr(raw?.flows), glossary: arr(raw?.glossary) };
}
function readText(root, rel2) {
  try {
    const p = join2(root, rel2);
    if (statSync2(p).size > MAX_TEXT_BYTES) return void 0;
    const buf = readFileSync2(p);
    if (buf.subarray(0, 8e3).includes(0)) return void 0;
    return buf.toString("utf8");
  } catch {
    return void 0;
  }
}
function readPackageScripts(root, file = "package.json") {
  if (!exists(root, file)) return void 0;
  try {
    const pkg = readJson(join2(root, file));
    return pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : void 0;
  } catch {
    return void 0;
  }
}
function readVercelCrons(root, file = "vercel.json") {
  if (!exists(root, file)) return void 0;
  try {
    const v = readJson(join2(root, file));
    return arr(v.crons).map((c) => str(c?.path)).filter(Boolean);
  } catch {
    return void 0;
  }
}
function makeTargets(root) {
  for (const f of ["Makefile", "makefile", "GNUmakefile"]) {
    const text = exists(root, f) ? readText(root, f) : void 0;
    if (text !== void 0) return new Set([...text.matchAll(/^([A-Za-z0-9_.\-/]+)\s*:(?!=)/gm)].map((m) => m[1]));
  }
  return /* @__PURE__ */ new Set();
}
function modelNames(ctx, all, addon) {
  const preset = addon.preset ? MODEL_PRESETS[addon.preset] : void 0;
  const globs = addon.files?.length ? addon.files : preset?.files ?? [];
  const re = new RegExp(addon.pattern ?? preset?.pattern ?? "(?!)", addon.pattern ? "gm" : preset?.flags ?? "gm");
  const names = /* @__PURE__ */ new Set();
  for (const p of all.filter((f) => matchesAny(globs, f))) {
    const text = readText(ctx.root, p) ?? "";
    for (const m of text.matchAll(re)) if (m[1]) names.add(m[1]);
  }
  return [...names].sort();
}
function runCheck(ctx, raw) {
  const results = [];
  let section = "";
  const ok = (code, name, pass, detail) => results.push({ code, section, name, pass, detail: pass ? void 0 : detail });
  const atlas = normalize(raw);
  const cfg = ctx.config;
  const all = listRepoFiles(ctx.root, cfg.files);
  const files = universe(ctx, all);
  const ids = atlas.systems.map((s) => s.id);
  const systems = atlas.systems;
  section = "shape";
  ok("shape.title", "the atlas has a title", nonEmpty(raw?.title));
  ok("shape.nonempty", "the atlas has groups and systems", atlas.groups.length > 0 && systems.length > 0);
  const groupIds = atlas.groups.map((g) => str(g?.id));
  ok("shape.group-ids", "group ids are present and unique", groupIds.every(nonEmpty) && dupes(groupIds).length === 0, sample(dupes(groupIds)) || "a group has no id");
  ok("shape.system-ids", "system ids are unique", dupes(ids).length === 0, sample(dupes(ids)));
  const badIds = ids.filter((id) => !ID_FORMAT.test(id) || SUBCOMMANDS.includes(id));
  ok("shape.id-format", "system ids are lowercase-kebab and not a CLI command (they become URLs and arguments)", badIds.length === 0, sample(badIds.map((i) => JSON.stringify(i))));
  const badFields = arr(raw?.systems).flatMap((s, i) => {
    const o = s && typeof s === "object" ? s : {};
    const id = str(o.id) || `#${i}`;
    const missing = SYSTEM_FIELDS.filter((f) => !Object.prototype.hasOwnProperty.call(o, f));
    const wrong = SYSTEM_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(o, f) && (ARRAY_FIELDS.includes(f) ? !Array.isArray(o[f]) : typeof o[f] !== "string"));
    return [...missing.map((f) => `${id}: missing ${f}`), ...wrong.map((f) => `${id}: ${f} has the wrong type`)];
  });
  ok("shape.fields", "every system has every field, with the right type", badFields.length === 0, sample(badFields));
  const groupSet = new Set(groupIds);
  const orphans = systems.filter((s) => !groupSet.has(s.group));
  ok("shape.known-group", "every system belongs to a known group", orphans.length === 0, sample(orphans.map((s) => `${s.id} -> ${JSON.stringify(s.group)}`)));
  const noProse = systems.filter((s) => ![s.name, s.oneLiner, s.summary].every(nonEmpty));
  ok("shape.prose", "every system has a name, a one-liner and a summary", noProse.length === 0, sample(noProse.map((s) => s.id)));
  const multi = [
    ...systems.filter((s) => /[\r\n]/.test(s.name + s.oneLiner)).map((s) => s.id),
    ...atlas.groups.filter((g) => /[\r\n]/.test(str(g?.name))).map((g) => `group ${str(g?.id)}`)
  ];
  ok("shape.single-line", "names and one-liners fit on one line (the index prints one line per system)", multi.length === 0, sample(multi));
  const thin = systems.filter((s) => s.owns.length === 0 || s.keyFiles.length === 0);
  ok("shape.owns-keyfiles", "every system owns at least one glob and names at least one key file", thin.length === 0, sample(thin.map((s) => s.id)));
  const empty = atlas.groups.filter((g) => !systems.some((s) => s.group === str(g?.id)));
  ok("shape.group-used", "every group has at least one system", empty.length === 0, sample(empty.map((g) => str(g?.id))));
  const todos = JSON.stringify(raw ?? {}).match(/"TODO\b/g)?.length ?? 0;
  ok("shape.no-todo", "no TODO placeholder is left", todos === 0, `${todos} left`);
  section = "coverage";
  const deadInclude = cfg.include.filter((g) => !all.some((p) => globToRegExp(g).test(p)));
  ok(
    "coverage.include",
    `every include glob matches a file, and the map has files to cover (${files.length})`,
    deadInclude.length === 0 && files.length > 0,
    deadInclude.length ? `matches nothing (renamed or deleted folder?): ${sample(deadInclude)}` : "include minus exclude left no files"
  );
  const unowned = files.filter((p) => ownersOf(atlas, p).length === 0);
  ok("coverage.unowned", `every file is owned by a system (${files.length} files)`, unowned.length === 0, `unowned: ${sample(unowned, 40)}`);
  const dead = systems.flatMap((s) => s.owns.filter((g) => !files.some((p) => globToRegExp(g).test(p))).map((g) => `${s.id}: ${g}`));
  ok("coverage.dead-glob", "every owns glob matches at least one file on the map", dead.length === 0, sample(dead));
  section = "names";
  const badKeys = systems.flatMap((s) => s.keyFiles.filter((k) => !nonEmpty(k?.path) || !exists(ctx.root, k.path) || !nonEmpty(k?.what)).map((k) => `${s.id}: ${str(k?.path)}`));
  ok("names.key-files", "every key file exists and says what it is", badKeys.length === 0, sample(badKeys));
  const badLinks = systems.flatMap((s) => s.connects.filter((l) => !ids.includes(str(l?.to)) || l.to === s.id || !nonEmpty(l?.why)).map((l) => `${s.id} -> ${str(l?.to)}`));
  ok("names.connects", "every connection points at another system and says why", badLinks.length === 0, sample(badLinks));
  const flows = arr(atlas.flows);
  const badSteps = flows.flatMap((f) => {
    const steps = arr(f?.steps);
    const bad = steps.filter((st) => !ids.includes(str(st?.system)) || !nonEmpty(st?.text)).map((st) => `${str(f?.name)}: ${str(st?.system)}`);
    return !nonEmpty(f?.name) || steps.length === 0 ? [`${str(f?.name) || "(unnamed flow)"}: no name or no steps`, ...bad] : bad;
  });
  ok("names.flows", "the big-picture flows exist and every step names a system", flows.length > 0 && badSteps.length === 0, flows.length ? sample(badSteps) : "no flows");
  const terms = arr(atlas.glossary);
  const badTerms = terms.filter((g) => !nonEmpty(g?.term) || !nonEmpty(g?.meaning)).map((g) => str(g?.term) || "(empty term)");
  const termDupes = dupes(terms.map((g) => str(g?.term).trim().toLowerCase()));
  ok("names.glossary", "every glossary entry has a term and a meaning, and no term repeats", badTerms.length === 0 && termDupes.length === 0, sample([...badTerms, ...termDupes.map((t) => `repeated: ${t}`)]));
  const badRules = systems.flatMap((s) => s.rules.filter((r) => !nonEmpty(r) || !exists(ctx.root, r)).map((r) => `${s.id}: ${r}`));
  ok("names.rules", "every rule or instruction file the atlas names exists", badRules.length === 0, sample(badRules));
  const scripts = readPackageScripts(ctx.root, cfg.addons.packageScripts?.file) ?? readPackageScripts(ctx.root) ?? {};
  const checkResolves = (c) => Object.prototype.hasOwnProperty.call(scripts, c) || nonEmpty(c) && (exists(ctx.root, c) || all.some((p) => globToRegExp(normalizePath(c)).test(p)));
  const badChecks = systems.flatMap((s) => s.checks.filter((c) => !checkResolves(str(c))).map((c) => `${s.id}: ${c}`));
  ok("names.checks", "every check is a package.json script or a test file/glob that exists", badChecks.length === 0, sample(badChecks));
  const crons = readVercelCrons(ctx.root, cfg.addons.vercelCrons?.file) ?? [];
  const targets = makeTargets(ctx.root);
  const badJobs = systems.flatMap((s) => s.jobs.filter((j) => {
    if (![j?.name, j?.when, j?.what, j?.ref].every(nonEmpty)) return true;
    switch (j.kind) {
      case "github-action":
        return !exists(ctx.root, j.ref);
      case "vercel-cron":
        return !crons.includes(j.ref);
      case "package-script":
        return !Object.prototype.hasOwnProperty.call(scripts, j.ref);
      case "make-target":
        return !targets.has(j.ref);
      case "file":
        return !exists(ctx.root, j.ref);
      case "external":
        return false;
      default:
        return true;
    }
  }).map((j) => `${s.id}: ${str(j?.kind)} ${str(j?.ref)}`));
  ok("names.jobs", `every job has a name, when and what, and a real ref for its kind (${JOB_KINDS.join(" | ")})`, badJobs.length === 0, sample(badJobs));
  const switchNames = [...new Set(systems.flatMap((s) => s.switches.map((w) => str(w?.name))))];
  const emptySwitch = systems.flatMap((s) => s.switches.filter((w) => !nonEmpty(w?.name) || !nonEmpty(w?.what)).map(() => `${s.id}: a switch with no name or no what`));
  const pending = new Set(switchNames.filter(nonEmpty));
  if (pending.size) {
    const own = ctx.dirRel ? `${ctx.dirRel}/` : "\0";
    for (const p of all) {
      if (!pending.size) break;
      if (p.startsWith(own)) continue;
      const text = readText(ctx.root, p);
      if (text === void 0 || text.includes('id="atlas-data"')) continue;
      for (const n of [...pending]) if (text.includes(n)) pending.delete(n);
    }
  }
  ok("names.switches", "every switch is named in the code (its exact identifier appears in a repo file)", pending.size === 0 && emptySwitch.length === 0, sample([...emptySwitch, ...[...pending].map((n) => `not found: ${n}`)]));
  const modelsAddon = cfg.addons.models;
  const models = modelsAddon ? modelNames(ctx, all, modelsAddon) : [];
  const claimedModels = [...new Set(systems.flatMap((s) => s.models.map(str)))];
  const ghostModels = claimedModels.filter((m) => !models.includes(m));
  ok(
    "names.models",
    "every data model the atlas names exists (configure addons.models to name any)",
    ghostModels.length === 0,
    modelsAddon ? `not found: ${sample(ghostModels)}` : `models are named but no models add-on can verify them: ${sample(ghostModels)}`
  );
  section = "add-ons";
  if (modelsAddon) {
    ok("addon.models.found", `the data-model parse found models (${models.length})`, models.length > 0, "configured, but no file matched the pattern: fix addons.models or remove it");
    const unclaimed = models.filter((m) => !claimedModels.includes(m));
    ok("addon.models.claimed", "every data model is claimed by a system", unclaimed.length === 0, sample(unclaimed));
  }
  const ps = cfg.addons.packageScripts;
  if (ps) {
    const pkgScripts = readPackageScripts(ctx.root, ps.file);
    const re = new RegExp(ps.match ?? ".*");
    const names = Object.keys(pkgScripts ?? {}).filter((k) => re.test(k));
    ok("addon.scripts.found", `${ps.file ?? "package.json"} has scripts matching /${ps.match ?? ".*"}/ (${names.length})`, names.length > 0, "none found: fix addons.packageScripts or remove it");
    const named = /* @__PURE__ */ new Set([...systems.flatMap((s) => s.checks), ...systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "package-script").map((j) => j.ref))]);
    const unclaimed = names.filter((n) => !named.has(n));
    ok("addon.scripts.claimed", "every package script is a check or a package-script job of some system", unclaimed.length === 0, sample(unclaimed));
  }
  const gw = cfg.addons.githubWorkflows;
  if (gw) {
    const dir = normalizePath(gw.dir ?? ".github/workflows");
    const wf = all.filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/") && /\.ya?ml$/.test(p));
    ok("addon.workflows.found", `${dir} has workflows (${wf.length})`, wf.length > 0, "none found: fix addons.githubWorkflows or remove it");
    const jobRefs = new Set(systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "github-action").map((j) => normalizePath(str(j.ref)))));
    const unclaimed = wf.filter((p) => !jobRefs.has(p));
    ok("addon.workflows.claimed", "every workflow is a github-action job of some system", unclaimed.length === 0, sample(unclaimed));
  }
  const vc = cfg.addons.vercelCrons;
  if (vc) {
    const list = readVercelCrons(ctx.root, vc.file) ?? [];
    ok("addon.crons.found", `${vc.file ?? "vercel.json"} has crons (${list.length})`, list.length > 0, "none found: fix addons.vercelCrons or remove it");
    const jobRefs = new Set(systems.flatMap((s) => s.jobs.filter((j) => j?.kind === "vercel-cron").map((j) => j.ref)));
    const unclaimed = list.filter((c) => !jobRefs.has(c));
    ok("addon.crons.claimed", "every Vercel cron is a vercel-cron job of some system", unclaimed.length === 0, sample(unclaimed));
  }
  const ru = cfg.addons.rules;
  if (ru) {
    const dir = normalizePath(ru.dir);
    const glob = globToRegExp(ru.glob ?? "**/*.md");
    const ruleFiles = all.filter((p) => p.startsWith(`${dir}/`) && glob.test(p.slice(dir.length + 1)));
    ok("addon.rules.found", `${dir} has rule files (${ruleFiles.length})`, ruleFiles.length > 0, "none found: fix addons.rules or remove it");
    const claimed = new Set(systems.flatMap((s) => s.rules.map((r) => normalizePath(str(r)))));
    const unclaimed = ruleFiles.filter((r) => !claimed.has(r));
    ok("addon.rules.claimed", "every rule file is claimed by a system", unclaimed.length === 0, sample(unclaimed));
  }
  section = "lookup";
  const badSections = [];
  const incomplete = [];
  const tooLong = [];
  for (const s of systems) {
    const text = renderSystem(atlas, s);
    const at = ENTRY_SECTIONS.map((l) => text.indexOf(`
${l}`));
    const ordered = at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]));
    if (!text.startsWith(`${s.name} [${s.id}]`) || !ordered) {
      badSections.push(s.id);
      continue;
    }
    const slice = (k) => text.slice(at[k], k + 1 < at.length ? at[k + 1] : text.length);
    const expected = [
      [-1, [s.oneLiner, s.summary]],
      [0, s.journey],
      [1, s.watchOuts],
      [2, s.connects.map((c) => str(c?.why))],
      [3, s.keyFiles.map((k) => str(k?.path))],
      [4, s.jobs.map((j) => str(j?.ref))],
      [5, s.switches.map((w) => str(w?.name))],
      [6, s.models],
      [7, s.rules],
      [8, s.checks],
      [9, s.owns]
    ];
    const missing = expected.flatMap(([k, items]) => items.filter((t) => nonEmpty(t) && !(k < 0 ? text.slice(0, at[0]) : slice(k)).includes(t)).map((t) => `${k < 0 ? "header" : ENTRY_SECTIONS[k]} ${t}`));
    if (missing.length) incomplete.push(`${s.id}: ${sample(missing, 3)}`);
    if (text.length > cfg.entryMaxChars) tooLong.push(`${s.id} (${text.length})`);
  }
  ok("lookup.entry-sections", "every entry opens with its name and id and prints every section in order", badSections.length === 0, sample(badSections));
  ok("lookup.entry-complete", "every entry prints every step, watch-out, link, key file, job, switch, model, rule, check and glob under its own label", incomplete.length === 0, sample(incomplete, 10));
  ok("lookup.entry-size", `every entry stays under ${cfg.entryMaxChars} characters (a ratchet: trim the prose, never raise it to fit)`, tooLong.length === 0, sample(tooLong));
  const index = renderIndex(atlas);
  const misIndexed = systems.filter((s) => index.split(`
  ${s.id} \u2014 `).length + (index.startsWith(`  ${s.id} \u2014 `) ? 1 : 0) !== 2);
  ok("lookup.index", "the index lists every system exactly once", misIndexed.length === 0, sample(misIndexed.map((s) => s.id)));
  const lost = systems.flatMap((s) => {
    const p = files.find((f) => matchesAny(s.owns, f));
    if (!p) return [];
    const winPath = `.\\${p.replace(/\//g, "\\")}`;
    return ownersOf(atlas, winPath).some((o) => o.id === s.id) ? [] : [`${s.id}: ${winPath}`];
  });
  ok("lookup.owner-path", "a Windows or ./-prefixed path finds the same owner as the map", lost.length === 0, sample(lost));
  return results;
}
function formatResults(results, header) {
  const out = [header];
  let section = "";
  for (const r of results) {
    if (r.section !== section) {
      section = r.section;
      out.push("", section);
    }
    out.push(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass || !r.detail ? "" : `
        ${r.detail}`}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  out.push("", `${results.length - failed} passed, ${failed} failed`);
  if (failed === 0) out.push("The check proves every file is on the map and every name is real. It does not prove the prose: when a system's behaviour changes, re-read its entry.");
  return out.join("\n");
}

// src/init.ts
import { copyFileSync, existsSync as existsSync2, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "fs";
import { join as join3, relative as relative2, resolve as resolve2 } from "path";
import { fileURLToPath } from "url";

// templates/atlas-readme.md
var atlas_readme_default = '# System Atlas\n\nA plain-English map of every system in this repository: what it does, how it\nworks, where its code lives, the jobs it runs, the switches that gate it, what\nit connects to, and the rules and checks that guard it. It is written for a\nperson first (an owner, a new contributor) and for an AI coding session second.\n\n- **`atlas.json`** is the source of truth. It is large, so read it through the\n  lookup instead of opening it:\n  - `node {{DIR}}/atlas.mjs` lists every system, one line each;\n  - `node {{DIR}}/atlas.mjs <id>` prints one system in full;\n  - `node {{DIR}}/atlas.mjs <path>` names the system that owns a file;\n  - `node {{DIR}}/atlas.mjs <word>` finds the systems and glossary terms that\n    mention a word.\n- **`node {{DIR}}/atlas.mjs check`** fails when a file is claimed by no\n  system, or when anything the atlas names (a key file, rule, check, job,\n  switch, data model, connection) no longer exists. It also keeps each printed\n  entry under a size ratchet (`entryMaxChars`): trim the prose, never raise it.\n- **`node {{DIR}}/atlas.mjs render`** writes `atlas.html`, one self-contained\n  page to browse the map.\n- **`atlas.config.json`** says which files must be on the map (`include`,\n  `exclude`) and which stack add-ons the check runs.\n- **`atlas.mjs`** is a vendored copy of the System Atlas CLI. Do not edit it;\n  replace it with a newer release.\n\n## What the check cannot see\n\nIt proves that every file is on the map and every name is real. It does not\nprove that the prose is still true. A system whose behaviour changes without a\nfile appearing or disappearing keeps passing, so **when you change how a\nsystem works, re-read its entry and fix the sentences that moved.**\n\n## Updating it\n\n1. A new file goes into the `owns` globs of the system it belongs to. Globs\n   are matched against the repo-relative path: `*` stays inside one folder,\n   `**` crosses folders (`**/` also matches no folder), `?` is one character,\n   `{a,b}` is either; everything else, `[id]` and `(group)` included, is literal.\n2. Describe structure and behaviour, never live state ("currently enabled"),\n   and never secrets, environment values or account ids.\n3. Run `node {{DIR}}/atlas.mjs check` until it passes.\n4. `node {{DIR}}/atlas.mjs changed` lists the systems whose files changed\n   since the atlas was last verified; re-read those entries, then\n   `node {{DIR}}/atlas.mjs stamp` records the new commit.\n';

// src/init.ts
var INSTRUCTION_GLOBS = [
  "CLAUDE.md",
  "**/CLAUDE.md",
  "AGENTS.md",
  "**/AGENTS.md",
  ".claude/rules/**",
  ".cursor/rules/**",
  ".cursorrules",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  "CONTRIBUTING.md",
  "ARCHITECTURE.md",
  "docs/architecture/**",
  "README.md"
];
function instructionFiles(all) {
  return all.filter((p) => INSTRUCTION_GLOBS.some((g) => globToRegExp(g).test(p)) && /\.(md|mdc|txt)$|^\.[a-z]+rules$/i.test(p));
}
function detectAddons(root, all) {
  const addons = {};
  if (all.some((p) => p.endsWith(".prisma"))) addons.models = { preset: "prisma", files: all.filter((p) => p.endsWith(".prisma")) };
  else if (all.includes("manage.py") && all.some((p) => /(^|\/)models(\.py|\/[^/]+\.py)$/.test(p))) addons.models = { preset: "django", files: ["**/models.py", "**/models/*.py"] };
  if (all.includes("package.json")) {
    try {
      const pkg = readJson(join3(root, "package.json"));
      if (pkg.scripts && Object.keys(pkg.scripts).length) addons.packageScripts = { file: "package.json", match: ".*" };
    } catch {
    }
  }
  if (all.some((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))) addons.githubWorkflows = { dir: ".github/workflows" };
  if (all.includes("vercel.json")) {
    try {
      const v = readJson(join3(root, "vercel.json"));
      if (Array.isArray(v.crons) && v.crons.length) addons.vercelCrons = { file: "vercel.json" };
    } catch {
    }
  }
  if (all.some((p) => p.startsWith(".claude/rules/") && p.endsWith(".md"))) addons.rules = { dir: ".claude/rules", glob: "**/*.md" };
  return addons;
}
function init(dirArg, force) {
  const dir = resolve2(dirArg ?? DEFAULT_DIR);
  const root = findGitRoot(process.cwd());
  const out = [];
  if (!root) out.push(`Note: ${process.cwd()} is not inside a git repository; the config uses "files": "walk".`);
  const repoRoot = root ?? process.cwd();
  mkdirSync(dir, { recursive: true });
  const self = fileURLToPath(import.meta.url);
  const vendored = join3(dir, "atlas.mjs");
  if (resolve2(self) !== resolve2(vendored)) {
    copyFileSync(self, vendored);
    out.push(`Vendored the CLI to ${rel(repoRoot, vendored)} (commit it: CI and teammates run it with plain node, no install).`);
  }
  const configPath = join3(dir, CONFIG_FILE);
  if (existsSync2(configPath) && !force) {
    out.push(`Kept the existing ${rel(repoRoot, configPath)} (--force rewrites it).`);
  } else {
    const all = listRepoFiles(repoRoot, root ? "git" : "walk");
    const config = {
      ...DEFAULT_CONFIG,
      root: normalizePath(relative2(dir, repoRoot)) || ".",
      files: root ? "git" : "walk",
      addons: detectAddons(repoRoot, all)
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}
`);
    const found = Object.keys(config.addons);
    out.push(`Wrote ${rel(repoRoot, configPath)}: ${all.length} files; add-ons detected: ${found.length ? found.join(", ") : "none"}.`);
  }
  const ignore = join3(dir, ".gitignore");
  if (!existsSync2(ignore)) {
    writeFileSync(ignore, "# Drafts and fact-check output from an atlas build.\n.build/\n# The rendered page: regenerate it with `node atlas.mjs render`.\natlas.html\n");
    out.push(`Wrote ${rel(repoRoot, ignore)} (.build/ and atlas.html are not committed).`);
  }
  const readme = join3(dir, "README.md");
  if (!existsSync2(readme)) {
    writeFileSync(readme, atlas_readme_default.split("{{DIR}}").join(rel(repoRoot, dir)));
    out.push(`Wrote ${rel(repoRoot, readme)}.`);
  }
  return out.join("\n");
}
function rel(root, p) {
  return normalizePath(relative2(root, p));
}
function inventory(ctx, atlas, depth, unownedOnly) {
  const all = listRepoFiles(ctx.root, ctx.config.files);
  const files = universe(ctx, all);
  if (unownedOnly) {
    if (!atlas) return "No atlas.json yet: every file is unowned.";
    const unowned = files.filter((p) => ownersOf(atlas, p).length === 0);
    const dead = atlas.systems.flatMap((s) => (s.owns ?? []).filter((g) => !files.some((p) => globToRegExp(g).test(p))).map((g) => `${s.id}: ${g}`));
    const out2 = [`${unowned.length} of ${files.length} files are owned by no system.`, ...unowned.map((p) => `  ${p}`)];
    if (dead.length) out2.push("", `${dead.length} owns globs match no file:`, ...dead.map((d) => `  ${d}`));
    return out2.join("\n");
  }
  const buckets = /* @__PURE__ */ new Map();
  for (const p of files) {
    const parts = p.split("/");
    const key = parts.length > depth ? `${parts.slice(0, depth).join("/")}/` : parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "(root files)";
    const b = buckets.get(key) ?? { files: 0, lines: 0 };
    b.files++;
    b.lines += lineCount(join3(ctx.root, p));
    buckets.set(key, b);
  }
  const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const totalLines = rows.reduce((n, [, b]) => n + b.lines, 0);
  const out = [`${files.length} files on the map, ~${totalLines.toLocaleString("en-US")} lines of text, by folder:`];
  for (const [k, b] of rows) out.push(`  ${k.padEnd(48)} ${String(b.files).padStart(5)} files ${String(b.lines).padStart(8)} lines`);
  const instr = instructionFiles(all);
  out.push("", `Instruction and rule files (name these in every drafting agent's prompt): ${instr.length ? "" : "none found"}`);
  for (const p of instr) out.push(`  ${p}`);
  out.push("", `Add-ons in ${CONFIG_FILE}: ${Object.keys(ctx.config.addons).join(", ") || "none"}`);
  return out.join("\n");
}
function lineCount(path) {
  try {
    const buf = readFileSync3(path);
    if (buf.subarray(0, 8e3).includes(0)) return 0;
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return n;
  } catch {
    return 0;
  }
}

// src/maintain.ts
import { readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "fs";
import { relative as relative3 } from "path";
function saveAtlas(path, atlas) {
  let eol = "\n";
  try {
    if (readFileSync4(path, "utf8").includes("\r\n")) eol = "\r\n";
  } catch {
  }
  writeFileSync2(path, `${JSON.stringify(atlas, null, 2)}
`.replace(/\n/g, eol));
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge(ctx, atlas, inputs, dryRun) {
  if (!inputs.length) throw new UsageError("atlas merge <draft.json ...>: name at least one file.");
  const changed2 = /* @__PURE__ */ new Map();
  const unknown = [];
  const findings = [];
  const notes = [];
  let termsAdded = 0;
  let termsChanged = 0;
  let topChanged = 0;
  for (const file of inputs) {
    const raw = readJson(file);
    const draft = Array.isArray(raw) ? { systems: raw } : raw;
    for (const d of draft.systems ?? []) {
      const s = atlas.systems.find((x) => x.id === d.id);
      if (!s) {
        unknown.push(`${file}: ${String(d.id)}`);
        continue;
      }
      const rec = s;
      const dRec = d;
      for (const f of SYSTEM_FIELDS) {
        if (f === "id" || !(f in dRec)) continue;
        if (!same(rec[f], dRec[f])) {
          rec[f] = dRec[f];
          changed2.set(s.id, [...changed2.get(s.id) ?? [], f]);
        }
      }
      const extra = dRec.ownershipNotes;
      if (Array.isArray(extra)) notes.push(...extra.map((n) => `${s.id}: ${String(n)}`));
    }
    for (const t of draft.glossary ?? []) {
      atlas.glossary ??= [];
      const hit = atlas.glossary.find((g) => g.term.trim().toLowerCase() === String(t.term).trim().toLowerCase());
      if (!hit) {
        atlas.glossary.push({ term: t.term, meaning: t.meaning });
        termsAdded++;
      } else if (hit.meaning !== t.meaning) {
        hit.meaning = t.meaning;
        termsChanged++;
      }
    }
    for (const fl of draft.flows ?? []) {
      atlas.flows ??= [];
      const i = atlas.flows.findIndex((x) => x.name === fl.name);
      if (i < 0) atlas.flows.push(fl);
      else if (!same(atlas.flows[i], fl)) atlas.flows[i] = fl;
      else continue;
      topChanged++;
    }
    for (const k of ["title", "about", "overview"]) {
      if (typeof draft[k] === "string" && draft[k] !== atlas[k]) {
        atlas[k] = draft[k];
        topChanged++;
      }
    }
    findings.push(...draft.findings ?? []);
    notes.push(...draft.notes ?? []);
  }
  if (!dryRun) saveAtlas(ctx.atlasPath, atlas);
  const fields = [...changed2.values()].reduce((n, f) => n + f.length, 0);
  const out = [`${dryRun ? "Would change" : "Changed"} ${fields} system fields across ${changed2.size} systems; glossary +${termsAdded} new, ${termsChanged} reworded; ${topChanged} flows/title/overview updates.`];
  for (const [id, f] of changed2) out.push(`  ${id}: ${f.join(", ")}`);
  if (findings.length) {
    const by = /* @__PURE__ */ new Map();
    for (const f of findings) by.set(String(f.severity ?? "UNTAGGED").toUpperCase(), (by.get(String(f.severity ?? "UNTAGGED").toUpperCase()) ?? 0) + 1);
    out.push("", `Findings: ${findings.length} (${[...by.entries()].map(([k, n]) => `${k} ${n}`).join(", ")})`);
  }
  if (unknown.length) out.push("", `Not merged, no such system id (fix the id or add the system first): ${unknown.join("; ")}`);
  if (notes.length) out.push("", "Notes from the agents (act on each: move a file, fix a rule, or drop it):", ...notes.map((n) => `  - ${n}`));
  return out.join("\n");
}
function changed(ctx, atlas, refArg, asJson) {
  const lastTouch = () => git(ctx.root, ["log", "-1", "--format=%H", "--", normalizePath(relative3(ctx.root, ctx.atlasPath))]) || void 0;
  const ref = refArg ?? atlas.verified?.commit ?? lastTouch();
  if (!ref) throw new UsageError("atlas changed <commit>: no commit given, atlas.json has no verified.commit, and git has no commit touching it (run `atlas stamp` after a build or update).");
  if (git(ctx.root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) === void 0) throw new UsageError(`${ref} is not a commit in this repository.`);
  const diff = git(ctx.root, ["diff", "--name-status", "-M", ref, "--"]) ?? "";
  const changes = [];
  for (const line of diff.split("\n").filter(Boolean)) {
    const [status, a, b] = line.split("	");
    if (status.startsWith("R")) {
      changes.push({ status: "D", path: normalizePath(a) }, { status: "A", path: normalizePath(b) });
    } else {
      changes.push({ status: status[0], path: normalizePath(a) });
    }
  }
  const tracked = new Set((git(ctx.root, ["ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter(Boolean).map(normalizePath));
  for (const p of tracked) if (!changes.some((c) => c.path === p)) changes.push({ status: "A", path: p });
  const files = new Set(universe(ctx, listRepoFiles(ctx.root, ctx.config.files)));
  const own = ctx.dirRel ? `${ctx.dirRel}/` : "\0";
  const relevant = changes.filter((c) => !c.path.startsWith(own));
  const bySystem = /* @__PURE__ */ new Map();
  const unowned = [];
  for (const c of relevant) {
    const owners = ownersOf(atlas, c.path);
    if (!owners.length) {
      if (c.status !== "D" && files.has(c.path)) unowned.push(c);
      continue;
    }
    for (const s of owners) bySystem.set(s.id, [...bySystem.get(s.id) ?? [], c]);
  }
  const namedGone = atlas.systems.flatMap((s) => (s.keyFiles ?? []).filter((k) => relevant.some((c) => c.status === "D" && c.path === normalizePath(k.path))).map((k) => `${s.id}: ${k.path}`));
  if (asJson) return JSON.stringify({ ref, systems: Object.fromEntries(bySystem), unowned, deletedKeyFiles: namedGone }, null, 2);
  const out = [`${relevant.length} files changed since ${ref}; ${bySystem.size} of ${atlas.systems.length} systems own at least one.`];
  for (const s of atlas.systems) {
    const list = bySystem.get(s.id);
    if (!list) continue;
    out.push("", `${s.id} \u2014 ${s.name} (${list.length})`, ...list.map((c) => `  ${c.status} ${c.path}`));
  }
  if (unowned.length) out.push("", `New files no system owns yet (${unowned.length}):`, ...unowned.map((c) => `  ${c.status} ${c.path}`));
  if (namedGone.length) out.push("", "Deleted files still named as key files:", ...namedGone.map((n) => `  ${n}`));
  out.push("", `Review each listed system: \`git diff ${ref} -- <its files>\`, then fix the sentences that moved.`);
  return out.join("\n");
}
function stamp(ctx, atlas) {
  const commit = git(ctx.root, ["rev-parse", "HEAD"]);
  if (!commit) throw new UsageError("Not a git repository with a commit: nothing to stamp.");
  const dirty = (git(ctx.root, ["status", "--porcelain"]) ?? "").split("\n").filter((l) => l && !l.slice(3).startsWith(ctx.dirRel)).length;
  atlas.verified = { commit, date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) };
  saveAtlas(ctx.atlasPath, atlas);
  return `Stamped atlas.json as verified against ${commit.slice(0, 12)}${dirty ? ` (note: ${dirty} uncommitted changes outside the atlas folder; stamp again after committing them)` : ""}.`;
}

// src/render.ts
import { writeFileSync as writeFileSync3 } from "fs";
import { relative as relative4, resolve as resolve3 } from "path";

// templates/atlas.html
var atlas_default = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>System Atlas</title>
<style>
/* A neutral page: a masthead band, then a two-pane atlas (system tiles by group on the
   left, the selected system's dossier pinned on the right, stacked on phones), then the
   jobs table and the glossary. System fonts only: the page makes no network request. */
:root {
  --bg: #fbfbfa; --surface: #f1f1ef; --raised: #ffffff; --fg: #1c1c1a; --muted: #62625d;
  --border: #e2e1dc; --accent: #2b59c3; --accent-soft: color-mix(in oklab, #2b59c3 9%, transparent);
  --warn: #9a5b00; --warn-soft: color-mix(in oklab, #b26a00 10%, transparent);
  --mast: #1f2328; --on-mast: #f3f3f1; --on-mast-muted: #a9adb3; --mast-input: #2b3036; --mast-border: #3d434a;
  --g0: #2b59c3; --g1: #a3511f; --g2: #2f7d4f; --g3: #8a3fa8; --g4: #a8326a; --g5: #1f7f8c; --g6: #7a6a12; --g7: #5d6470;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace;
  --radius: 10px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #141414; --surface: #1c1c1c; --raised: #232323; --fg: #ecebe8; --muted: #a3a29c;
    --border: #34332f; --accent: #7aa2ff; --accent-soft: color-mix(in oklab, #7aa2ff 16%, transparent);
    --warn: #f2b84b; --warn-soft: color-mix(in oklab, #f2b84b 12%, transparent);
    --mast: #0d0d0d; --mast-input: #1d1d1d; --mast-border: #34332f;
    --g0: #7aa2ff; --g1: #f0a06e; --g2: #6fcf97; --g3: #c99bf0; --g4: #f28cb8; --g5: #6fd0dc; --g6: #e0cd6a; --g7: #a5acb8;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #141414; --surface: #1c1c1c; --raised: #232323; --fg: #ecebe8; --muted: #a3a29c;
  --border: #34332f; --accent: #7aa2ff; --accent-soft: color-mix(in oklab, #7aa2ff 16%, transparent);
  --warn: #f2b84b; --warn-soft: color-mix(in oklab, #f2b84b 12%, transparent);
  --mast: #0d0d0d; --mast-input: #1d1d1d; --mast-border: #34332f;
  --g0: #7aa2ff; --g1: #f0a06e; --g2: #6fcf97; --g3: #c99bf0; --g4: #f28cb8; --g5: #6fd0dc; --g6: #e0cd6a; --g7: #a5acb8;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font-body); font-size: 15px; line-height: 1.55; }
.wrap { max-width: 1320px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
code, .mono { font-family: var(--font-mono); font-size: 0.86em; }
h1, h2, h3 { text-wrap: balance; margin: 0; }
a { color: var(--accent); }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.mast { background: var(--mast); color: var(--on-mast); }
.mast .wrap { padding-block: 28px 22px; display: grid; gap: 16px; }
.eyebrow { font-size: 0.85rem; color: var(--on-mast-muted); letter-spacing: 0.02em; }
.mast h1 { font-size: clamp(1.8rem, 3.4vw, 2.5rem); font-weight: 700; letter-spacing: -0.01em; line-height: 1.12; }
.mast p { margin: 0; max-width: 72ch; color: var(--on-mast-muted); }
.stats { display: flex; flex-wrap: wrap; gap: 8px 28px; font-variant-numeric: tabular-nums; }
.stat b { display: block; font-size: 1.3rem; font-weight: 600; color: var(--on-mast); }
.stat span { font-size: 0.82rem; color: var(--on-mast-muted); }
.searchbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.searchbar input { flex: 1 1 320px; min-width: 0; background: var(--mast-input); color: var(--on-mast); border: 1px solid var(--mast-border); border-radius: 8px; padding: 10px 14px; font: inherit; }
.searchbar input::placeholder { color: var(--on-mast-muted); }
.searchbar .hint { font-size: 0.82rem; color: var(--on-mast-muted); }

.panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 470px); gap: 28px; padding-block: 26px 10px; align-items: start; }
@media (max-width: 1000px) { .panes { grid-template-columns: minmax(0, 1fr); } }
.lane { display: grid; gap: 10px; margin-bottom: 22px; }
.lane-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.lane-head h2 { font-size: 1.02rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.lane-head h2::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--lane); flex: none; }
.lane-head p { margin: 0; font-size: 0.86rem; color: var(--muted); min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: 10px; }
.tile { text-align: left; background: var(--raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 13px 11px; cursor: pointer; display: grid; gap: 4px; align-content: start; border-top: 3px solid var(--lane); transition: border-color .15s, background .15s, opacity .15s; min-width: 0; }
.tile:hover { border-color: var(--accent); border-top-color: var(--lane); }
.tile .t-name { font-weight: 600; font-size: 0.97rem; }
.tile .t-line { font-size: 0.84rem; color: var(--muted); line-height: 1.4; }
.tile .t-meta { font-size: 0.76rem; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 4px; }
.tile[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); border-top-color: var(--lane); }
.tile.linked { border-color: var(--lane); }
.tile .t-link { display: none; font-size: 0.76rem; color: var(--fg); line-height: 1.35; padding-top: 4px; border-top: 1px dashed var(--border); margin-top: 4px; }
.tile.linked .t-link { display: block; }
.tile.dim { opacity: 0.32; }

.dossier { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 12px); max-height: calc(100vh - 24px); overflow: auto; background: var(--surface); border-radius: 14px; padding: 20px 20px 22px; display: grid; gap: 18px; min-width: 0; }
@media (max-width: 1000px) { .dossier { position: static; max-height: none; } }
.d-eyebrow { font-size: 0.8rem; color: var(--muted); display: flex; gap: 8px; align-items: center; }
.d-eyebrow::before { content: ""; width: 9px; height: 9px; border-radius: 3px; background: var(--lane); }
.dossier h2 { font-size: 1.42rem; font-weight: 700; line-height: 1.2; }
.d-line { margin: 4px 0 0; color: var(--muted); }
.d-summary { margin: 0; max-width: 65ch; }
.sec { display: grid; gap: 8px; }
.sec h3 { font-size: 0.86rem; font-weight: 600; color: var(--muted); letter-spacing: 0.01em; }
ol.journey { margin: 0; padding-left: 1.3em; display: grid; gap: 4px; }
ol.journey li::marker { color: var(--muted); font-variant-numeric: tabular-nums; }
.files { display: grid; gap: 7px; }
.file { display: grid; gap: 1px; min-width: 0; }
.file code { color: var(--fg); overflow-wrap: anywhere; }
.file span, .switch span { font-size: 0.86rem; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-family: var(--font-mono); font-size: 0.78rem; background: var(--raised); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; overflow-wrap: anywhere; }
.links { display: grid; gap: 6px; }
.linkrow { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: baseline; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
.linkrow b { color: var(--accent); font-weight: 600; white-space: nowrap; }
.linkrow span { font-size: 0.88rem; color: var(--muted); }
.linkrow:hover b { text-decoration: underline; }
.jobs-mini { display: grid; gap: 8px; }
.job, .switch { display: grid; gap: 1px; }
.job .when { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.watch { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.watch li { background: var(--warn-soft); border-left: 3px solid var(--warn); padding: 8px 11px; border-radius: 0 8px 8px 0; font-size: 0.92rem; }
.flows { display: grid; gap: 20px; }
.flows h3 { font-size: 1rem; color: var(--fg); margin-bottom: 8px; }
.flow { margin: 0; padding: 0; list-style: none; display: grid; counter-reset: step; }
.flow li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; padding-bottom: 12px; position: relative; counter-increment: step; }
.flow li::before { content: counter(step); width: 24px; height: 24px; border-radius: 50%; background: var(--raised); border: 1px solid var(--border); display: grid; place-items: center; font-size: 0.78rem; font-variant-numeric: tabular-nums; color: var(--muted); }
.flow li:not(:last-child)::after { content: ""; position: absolute; left: 12px; top: 26px; bottom: 2px; width: 1px; background: var(--border); }
.flow button { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 600; cursor: pointer; text-align: left; }
.flow p { margin: 1px 0 0; font-size: 0.9rem; }
.empty-note { font-size: 0.9rem; color: var(--muted); margin: 0; }

.lower { padding-block: 18px 40px; display: grid; gap: 34px; }
.lower h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: 4px; }
.lower .sub { margin: 0 0 12px; color: var(--muted); font-size: 0.9rem; max-width: 70ch; }
.tablewrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
table { border-collapse: collapse; width: 100%; min-width: 640px; font-size: 0.9rem; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 0.82rem; background: var(--surface); }
tr:last-child td { border-bottom: 0; }
td.when { white-space: nowrap; font-variant-numeric: tabular-nums; }
.kind { font-size: 0.75rem; border-radius: 5px; padding: 1px 6px; white-space: nowrap; border: 1px solid var(--border); color: var(--muted); }
td .sysbtn { background: none; border: 0; padding: 0; cursor: pointer; color: var(--accent); font-weight: 500; text-align: left; }
.gloss { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px 28px; margin: 0; }
.gloss div { min-width: 0; }
.gloss dt { font-weight: 600; }
.gloss dd { margin: 2px 0 0; color: var(--muted); font-size: 0.92rem; }
.foot { font-size: 0.82rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 14px; }
.foot p { margin: 0 0 4px; max-width: 86ch; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
</style>
</head>
<body>
<header class="mast">
  <div class="wrap">
    <div class="eyebrow">System Atlas \xB7 how this project is built</div>
    <h1 id="title">System Atlas</h1>
    <p id="about"></p>
    <div class="stats" id="stats"></div>
    <div class="searchbar">
      <label for="q" class="sr-only">Search the atlas</label>
      <input id="q" type="search" placeholder="Search a system, file path, job, switch or term" autocomplete="off">
      <span class="hint" id="qstatus" aria-live="polite">Pick a system to see how it works.</span>
    </div>
  </div>
</header>

<main class="wrap">
  <div class="panes">
    <div id="map"></div>
    <aside class="dossier" id="dossier" aria-live="polite"></aside>
  </div>
  <div class="lower">
    <section id="jobs-sec">
      <h2>Everything that runs on a schedule or on demand</h2>
      <p class="sub">Each job, the system that owns it, and what starts it.</p>
      <div class="tablewrap"><table id="jobs"></table></div>
    </section>
    <section id="gloss-sec">
      <h2>Glossary</h2>
      <p class="sub">The terms the entries use, in plain English.</p>
      <dl class="gloss" id="gloss"></dl>
    </section>
    <footer class="foot" id="foot"></footer>
  </div>
</main>

<script type="application/json" id="atlas-data">/*ATLAS_DATA*/</script>
<script>
(function () {
  var A = JSON.parse(document.getElementById("atlas-data").textContent);
  var KIND = { "github-action": "GitHub Action", "vercel-cron": "Vercel Cron", "package-script": "package script", "make-target": "make target", "file": "script", "external": "external" };
  var byId = {}, groupById = {}, laneById = {};
  A.systems.forEach(function (s) { byId[s.id] = s; });
  A.groups.forEach(function (g, i) { groupById[g.id] = g; laneById[g.id] = "var(--g" + (i % 8) + ")"; });
  var selected = null;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lane(id) { return laneById[id] || "var(--g7)"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  // The same glob rules as the CLI: * within a segment, ** across, **/ also zero folders, ? one char, {a,b}.
  function globRe(glob) {
    var re = "";
    for (var i = 0; i < glob.length; i++) {
      var c = glob[i];
      if (c === "*" && glob[i + 1] === "*") { if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i++; } }
      else if (c === "*") re += "[^/]*";
      else if (c === "?") re += "[^/]";
      else if (c === "{" && glob.indexOf("}", i) > i) { var end = glob.indexOf("}", i); re += "(?:" + glob.slice(i + 1, end).split(",").map(function (a) { return a.replace(/[.+?^\${}()|[\\]\\\\*]/g, "\\\\$&"); }).join("|") + ")"; i = end; }
      else re += c.replace(/[.+?^\${}()|[\\]\\\\*]/g, "\\\\$&");
    }
    return new RegExp("^" + re + "$");
  }

  document.title = A.title || "System Atlas";
  document.getElementById("title").textContent = A.title || "System Atlas";
  document.getElementById("about").textContent = A.about || "";
  var st = A.stats || {};
  var statList = [[A.systems.length, "systems"], [A.groups.length, "groups"], [st.files, "files mapped"], [st.jobs || null, "jobs"], [st.models || null, "data models"], [st.checks || null, "checks named"]];
  (st.extra || []).forEach(function (x) { statList.push([x.value, x.label]); });
  document.getElementById("stats").innerHTML = statList.filter(function (x) { return x[0] != null; }).map(function (x) {
    return '<div class="stat"><b>' + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div>";
  }).join("");

  var map = document.getElementById("map");
  map.innerHTML = A.groups.map(function (g) {
    var tiles = A.systems.filter(function (s) { return s.group === g.id; }).map(function (s) {
      var meta = [plural(s.keyFiles.length, "key file", "key files"), s.jobs.length ? plural(s.jobs.length, "job", "jobs") : null, s.models.length ? plural(s.models.length, "model", "models") : null].filter(Boolean).join(" \xB7 ");
      return '<button class="tile" type="button" id="tile-' + esc(s.id) + '" data-id="' + esc(s.id) + '" aria-pressed="false" style="--lane:' + lane(g.id) + '">' +
        '<span class="t-name">' + esc(s.name) + '</span><span class="t-line">' + esc(s.oneLiner) + '</span><span class="t-meta">' + esc(meta) + '</span><span class="t-link"></span></button>';
    }).join("");
    return '<section class="lane" style="--lane:' + lane(g.id) + '"><div class="lane-head"><h2>' + esc(g.name) + "</h2><p>" + esc(g.blurb) + '</p></div><div class="tiles">' + tiles + "</div></section>";
  }).join("");
  map.addEventListener("click", function (e) { var t = e.target.closest(".tile"); if (t) select(t.getAttribute("data-id"), true); });

  function overview() {
    var flows = (A.flows || []).map(function (f) {
      return "<div><h3>" + esc(f.name) + '</h3><ol class="flow">' + f.steps.map(function (s2) {
        var s = byId[s2.system];
        return '<li><div><button type="button" data-go="' + esc(s2.system) + '">' + esc(s ? s.name : s2.system) + "</button><p>" + esc(s2.text) + "</p></div></li>";
      }).join("") + "</ol></div>";
    }).join("");
    return '<div class="d-eyebrow" style="--lane:var(--accent)">Start here</div><h2>The big picture</h2>' +
      (A.overview ? '<p class="d-summary">' + esc(A.overview) + "</p>" : "") + '<div class="flows">' + flows + "</div>" +
      '<p class="empty-note">Pick any tile to open that system. Its connected systems light up on the map.</p>';
  }

  function dossier(s) {
    var g = groupById[s.group] || { id: s.group, name: s.group };
    var h = '<div><div class="d-eyebrow" style="--lane:' + lane(g.id) + '">' + esc(g.name) + "</div><h2>" + esc(s.name) + '</h2><p class="d-line">' + esc(s.oneLiner) + "</p></div>";
    h += '<p class="d-summary">' + esc(s.summary) + "</p>";
    if (s.journey.length) h += '<div class="sec"><h3>How it works</h3><ol class="journey">' + s.journey.map(function (j) { return "<li>" + esc(j) + "</li>"; }).join("") + "</ol></div>";
    if (s.watchOuts.length) h += '<div class="sec"><h3>Watch out</h3><ul class="watch">' + s.watchOuts.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>";
    if (s.connects.length) h += '<div class="sec"><h3>Connected to</h3><div class="links">' + s.connects.map(function (c) {
      var o = byId[c.to];
      return '<button class="linkrow" type="button" data-go="' + esc(c.to) + '"><b>' + esc(o ? o.name : c.to) + "</b><span>" + esc(c.why) + "</span></button>";
    }).join("") + "</div></div>";
    h += '<div class="sec"><h3>Where the code lives</h3><div class="files">' + s.keyFiles.map(function (k) {
      return '<div class="file"><code>' + esc(k.path) + "</code><span>" + esc(k.what) + "</span></div>";
    }).join("") + "</div></div>";
    if (s.jobs.length) h += '<div class="sec"><h3>Jobs</h3><div class="jobs-mini">' + s.jobs.map(function (j) {
      return '<div class="job"><b>' + esc(j.name) + '</b><span class="when">' + esc(j.when) + " \xB7 " + esc(KIND[j.kind] || j.kind) + "</span><span>" + esc(j.what) + "</span></div>";
    }).join("") + "</div></div>";
    if (s.switches.length) h += '<div class="sec"><h3>Switches</h3>' + s.switches.map(function (w) {
      return '<div class="switch"><code>' + esc(w.name) + "</code><span>" + esc(w.what) + "</span></div>";
    }).join("") + "</div>";
    if (s.models.length) h += '<div class="sec"><h3>Data models</h3><div class="chips">' + s.models.map(function (m) { return '<span class="chip">' + esc(m) + "</span>"; }).join("") + "</div></div>";
    var rc = s.rules.concat(s.checks);
    if (rc.length) h += '<div class="sec"><h3>Rules and checks that guard it</h3><div class="chips">' + rc.map(function (r) { return '<span class="chip">' + esc(r) + "</span>"; }).join("") + "</div></div>";
    h += '<div class="sec"><h3>Every file it owns</h3><div class="chips">' + s.owns.map(function (o) { return '<span class="chip">' + esc(o) + "</span>"; }).join("") + "</div></div>";
    return h;
  }

  var dos = document.getElementById("dossier");
  dos.addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) select(b.getAttribute("data-go"), true); });

  function select(id, scroll) {
    selected = byId[id] ? id : null;
    var s = selected ? byId[selected] : null;
    document.querySelectorAll(".tile").forEach(function (t) {
      var tid = t.getAttribute("data-id");
      t.setAttribute("aria-pressed", String(tid === selected));
      var link = s ? s.connects.filter(function (c) { return c.to === tid; })[0] : null;
      var back = s ? byId[tid].connects.filter(function (c) { return c.to === selected; })[0] : null;
      var why = link || back;
      t.classList.toggle("linked", !!why && tid !== selected);
      t.querySelector(".t-link").textContent = why && tid !== selected ? why.why : "";
    });
    dos.innerHTML = s ? dossier(s) : overview();
    dos.scrollTop = 0;
    try { history.replaceState(null, "", selected ? "#" + selected : location.pathname + location.search); } catch (e) {}
    if (scroll && s && window.matchMedia("(max-width: 1000px)").matches) dos.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  var q = document.getElementById("q"), qs = document.getElementById("qstatus");
  function haystack(s) {
    return [s.id, s.name, s.oneLiner, s.summary, s.journey.join(" "), s.watchOuts.join(" "), s.models.join(" "), s.rules.join(" "), s.checks.join(" "),
      s.keyFiles.map(function (k) { return k.path + " " + k.what; }).join(" "), s.jobs.map(function (j) { return j.name + " " + j.ref + " " + j.what; }).join(" "),
      s.switches.map(function (w) { return w.name + " " + w.what; }).join(" ")].join(" ").toLowerCase();
  }
  q.addEventListener("input", function () {
    var v = q.value.trim().toLowerCase().replace(/\\\\/g, "/").replace(/^\\.\\//, "");
    var hits = [];
    A.systems.forEach(function (s) {
      var m = !v || haystack(s).indexOf(v) >= 0 || (/[\\/.]/.test(v) && s.owns.some(function (o) { return globRe(o.toLowerCase()).test(v); }));
      document.getElementById("tile-" + s.id).classList.toggle("dim", !m);
      if (m && v) hits.push(s);
    });
    qs.textContent = !v ? "Pick a system to see how it works." : hits.length ? plural(hits.length, "system matches", "systems match") + (hits.length === 1 ? ": " + hits[0].name : "") : "No system matches. Try a file path from the repo root.";
    if (hits.length === 1) select(hits[0].id, false);
  });

  var allJobs = [];
  A.systems.forEach(function (s) { s.jobs.forEach(function (j) { allJobs.push({ j: j, s: s }); }); });
  allJobs.sort(function (a, b) { return (KIND[a.j.kind] || "").localeCompare(KIND[b.j.kind] || "") || a.j.name.localeCompare(b.j.name); });
  if (!allJobs.length) document.getElementById("jobs-sec").hidden = true;
  document.getElementById("jobs").innerHTML = '<thead><tr><th scope="col">Job</th><th scope="col">When</th><th scope="col">Runs as</th><th scope="col">System</th><th scope="col">What it does</th></tr></thead><tbody>' +
    allJobs.map(function (x) {
      return "<tr><td><b>" + esc(x.j.name) + '</b></td><td class="when">' + esc(x.j.when) + '</td><td><span class="kind">' + esc(KIND[x.j.kind] || x.j.kind) + '</span></td><td><button class="sysbtn" type="button" data-go="' + esc(x.s.id) + '">' + esc(x.s.name) + "</button></td><td>" + esc(x.j.what) + "</td></tr>";
    }).join("") + "</tbody>";
  document.getElementById("jobs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (b) { select(b.getAttribute("data-go"), false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });

  var gloss = (A.glossary || []).slice().sort(function (a, b) { return a.term.localeCompare(b.term); });
  if (!gloss.length) document.getElementById("gloss-sec").hidden = true;
  document.getElementById("gloss").innerHTML = gloss.map(function (g) { return "<div><dt>" + esc(g.term) + "</dt><dd>" + esc(g.meaning) + "</dd></div>"; }).join("");

  var v = A.verified ? " The prose was last verified against commit <code>" + esc(String(A.verified.commit).slice(0, 12)) + "</code> on " + esc(A.verified.date) + "." : "";
  document.getElementById("foot").innerHTML = "<p>Generated from <code>" + esc(st.source || "atlas.json") + "</code> at commit <code>" + esc(st.commit || "?") + "</code> on " + esc(st.generated || "?") + "." + v + "</p>" +
    "<p><code>atlas check</code> fails when a file belongs to no system or a name the atlas uses no longer exists. It does not verify the prose: when a system changes how it works, its entry is re-read by hand.</p>";

  var start = (location.hash || "").replace("#", "");
  select(byId[start] ? start : null, false);
})();
</script>
</body>
</html>
`;

// src/render.ts
var MARKER = "/*ATLAS_DATA*/";
function renderPage(ctx, atlas) {
  if (atlas_default.split(MARKER).length !== 2) throw new Error(`the page template must contain ${MARKER} exactly once`);
  const files = universe(ctx, listRepoFiles(ctx.root, ctx.config.files));
  const stats = {
    files: files.length,
    jobs: atlas.systems.reduce((n, s) => n + (s.jobs?.length ?? 0), 0),
    models: new Set(atlas.systems.flatMap((s) => s.models ?? [])).size,
    checks: new Set(atlas.systems.flatMap((s) => s.checks ?? [])).size,
    extra: (ctx.config.stats ?? []).map((x) => ({ label: x.label, value: files.filter((p) => globToRegExp(x.glob).test(p)).length })),
    commit: git(ctx.root, ["rev-parse", "--short", "HEAD"]) ?? "unknown",
    generated: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    source: normalizePath(relative4(ctx.root, ctx.atlasPath))
  };
  const json = JSON.stringify({ ...atlas, stats }).replace(/</g, "\\u003c");
  return atlas_default.replace(MARKER, () => json);
}
function writePage(ctx, atlas, out) {
  const path = resolve3(out ?? resolve3(ctx.dir, "atlas.html"));
  writeFileSync3(path, renderPage(ctx, atlas));
  return path;
}

// src/cli.ts
var VERSION = true ? "0.1.0" : "dev";
function parse(argv) {
  const flags = /* @__PURE__ */ new Map();
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--depth") flags.set(a.slice(2), argv[++i] ?? "");
    else if (a.startsWith("--")) flags.set(a.slice(2), true);
    else pos.push(a);
  }
  return { flags, pos };
}
function main(argv) {
  const { flags, pos } = parse(argv);
  const cmd = pos[0];
  if (flags.has("version")) {
    console.log(VERSION);
    return 0;
  }
  if (flags.has("help") || cmd === "help") {
    console.log(HELP);
    return 0;
  }
  const dirFlag = typeof flags.get("dir") === "string" ? flags.get("dir") : void 0;
  if (cmd === "init") {
    console.log(init(dirFlag, flags.has("force")));
    return 0;
  }
  const ctx = loadContext(findAtlasDir(dirFlag, dirname2(fileURLToPath2(import.meta.url))));
  if (cmd === "inventory") {
    let atlas2;
    try {
      atlas2 = loadAtlas(ctx);
    } catch {
      atlas2 = void 0;
    }
    console.log(inventory(ctx, atlas2, Number(flags.get("depth")) || 2, flags.has("unowned")));
    return 0;
  }
  const atlas = loadAtlas(ctx);
  switch (cmd) {
    case "check": {
      const results = runCheck(ctx, atlas);
      const failed = results.filter((r) => !r.pass).length;
      if (flags.has("json")) console.log(JSON.stringify({ passed: results.length - failed, failed, codes: CHECK_CODES, results }, null, 2));
      else console.log(formatResults(results, `System Atlas check (atlas ${VERSION}): ${normalizePath(ctx.atlasPath.slice(ctx.root.length + 1))}, ${atlas.systems?.length ?? 0} systems`));
      return failed ? 1 : 0;
    }
    case "render": {
      const path = writePage(ctx, atlas, pos[1]);
      console.log(`Wrote ${path} (${atlas.systems.length} systems). It does not validate the atlas: run \`atlas check\` first.`);
      return 0;
    }
    case "merge":
      console.log(merge(ctx, atlas, pos.slice(1), flags.has("dry-run")));
      return 0;
    case "changed":
      console.log(changed(ctx, atlas, pos[1], flags.has("json")));
      return 0;
    case "stamp":
      console.log(stamp(ctx, atlas));
      return 0;
  }
  const arg = pos.join(" ").trim();
  if (!arg) {
    console.log(renderIndex(atlas));
    console.log("\nOne system: atlas <id> \xB7 a file's owner: atlas <path> \xB7 a word: atlas <word> \xB7 atlas help");
    return 0;
  }
  const system = atlas.systems.find((s) => s.id === arg);
  if (system) {
    console.log(flags.has("json") ? JSON.stringify(system, null, 2) : renderSystem(atlas, system));
    return 0;
  }
  const owners = ownersOf(atlas, arg);
  const looksLikePath = /[\\/]/.test(arg) || /\.[A-Za-z0-9]+$/.test(arg);
  if (owners.length || looksLikePath && pos.length === 1) {
    const p = normalizePath(arg);
    if (owners.length === 0) {
      console.log(`No system owns ${p}. Paths are repo-relative; a new file goes into a system's "owns" in atlas.json (atlas check fails until it does).`);
      return 1;
    }
    if (owners.length === 1) {
      console.log(`${p} belongs to ${owners[0].id}.
`);
      console.log(renderSystem(atlas, owners[0]));
      return 0;
    }
    console.log(`${p} belongs to ${owners.length} systems; print the one you need with atlas <id>:`);
    for (const s of owners) console.log(`  ${s.id} \u2014 ${s.name}: ${s.oneLiner}`);
    return 0;
  }
  const hits = search(atlas, arg);
  if (!hits.systems.length && !hits.mentions.length && !hits.terms.length) {
    console.log(`Nothing in the atlas mentions "${arg}". Run with no argument for the list of systems.`);
    return 1;
  }
  for (const s of hits.systems) console.log(`  ${s.id} \u2014 ${s.name}: ${s.oneLiner}`);
  if (hits.mentions.length) {
    console.log(hits.systems.length ? "\nAlso mentioned in:" : "Mentioned in:");
    for (const s of hits.mentions) console.log(`  ${s.id} \u2014 ${s.name}: ${s.oneLiner}`);
  }
  if (hits.terms.length) {
    console.log(hits.systems.length || hits.mentions.length ? "\nGlossary:" : "Glossary:");
    for (const t of hits.terms) console.log(`  ${t.term} \u2014 ${t.meaning}`);
  }
  return 0;
}
var HELP = `System Atlas ${VERSION}: a plain-English map of every system in this repo.

  atlas                       every system, one line each
  atlas <id> [--json]         one system in full (--json: as atlas.json holds it)
  atlas <path>                which system owns a file (and its entry)
  atlas <word ...>            systems and glossary terms mentioning every word
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

Reserved words that cannot be system ids: ${SUBCOMMANDS.join(", ")}.`;
try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    console.error(e.message);
    process.exitCode = 2;
  } else {
    throw e;
  }
}
