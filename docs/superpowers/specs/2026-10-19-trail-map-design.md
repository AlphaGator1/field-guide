# Trail map: a visual map of a Field Guide

Status: design, approved for planning once the owner signs off. Date: 2026-10-19.

## Why

The rendered page (`guide render`) shows every system as a tile in its group's
lane, and picking a tile outlines the tiles it connects to. That tells a reader
*that* two systems are related, not *how*: which way the connection runs, why
it exists, or how a request travels through the whole system. Readers also get
no sense of where the weight of the codebase sits.

The trail map draws the guide as terrain, in keeping with the name "field
guide":

- **Hills are systems.** A hill's footprint grows with the amount of code the
  system owns; its height (the number of contour rings) grows with how much
  branching that code does. A wide, low hill is a lot of plain code; a small,
  steep peak is dense logic.
- **Regions are groups.** A group's hills share one tinted landmass in the
  group's colour, with the group's name on its edge.
- **Trails are connections.** Every `connects` entry becomes a trail between
  two hills. Focusing a hill lights its trails, with arrows for the direction
  of each connection, and each trail carries its "why" sentence.
- **Routes are flows.** Each flow becomes a marked route with numbered stops.
  Playing it walks a marker from stop to stop and shows that step's sentence.

A throwaway mockup on ParaFlow's guide (13 systems, 56 connections on 32
trails, 3 flows) proved the idea; the owner's verdict was enthusiastic. The
mockup is not in the repo; the algorithms it used are described below.

## Goals

1. **Works for any project.** Nothing is specific to ParaFlow or any one
   stack. The map is built only from the guide (groups, systems, `owns`,
   `connects`, flows) and the repo's own files. It must read well from about 5
   to about 60 systems and up to 8 groups. This is the most important goal.
2. **Ships through the plugin.** Every project that vendors the CLI gets the
   map in its rendered page after `/field-guide:update` (which replaces the
   vendored CLI).
3. **Modular.** The map is a self-contained layer over a read-only data
   contract (a guide-shaped JSON plus the repo's files). It can be pointed at a
   guide that the field-guide CLI does not manage, and it writes only the one
   output file it is asked to write.
4. **Honest sizes.** Hill size is computed from the code, never typed by hand,
   and the page says what the numbers count.
5. **The map stays put.** Layout is deterministic, and stable as the code
   changes: readers learn it like a real map, so a week of ordinary commits
   must not reshuffle the hills (decided by the owner).

## Non-goals

- No 3D, WebGL, canvas libraries or any other dependency. No network.
- Not a call graph and not a file-level map: the smallest thing drawn is a
  system.
- No editing the guide from the page, no live reload.
- The map does not replace the tile list; the list stays as a view.
- No new check assertions. The map adds nothing the check must guard.

## Anti-goals (failure even if it works)

- Anything that breaks the page's promise: one self-contained file, offline,
  system fonts and inline script only, light and dark, phone to desktop.
- A map that reshuffles when only the code's size changed.
- Touching any file in a project other than the output file, in particular
  when the map is pointed at a guide the CLI does not manage (see
  "SiliconExchange" below).
- A new CLI subcommand name that would collide with a project's system id
  (see "Command line").

## What the map shows

### Sizing: code footprint and branch height

`render` computes, per system, from the files that system owns:

- **Code lines:** non-blank lines in its code files.
- **Branch points:** a count of decision points in those files.

A file is a *code file* when it is on the map (the same file universe the check
uses) and is none of:

- prose: the check's existing prose globs (`config.prose`, else
  `DEFAULT_PROSE` in `src/check.ts`: Markdown, text, reStructuredText,
  AsciiDoc, changelogs, licences);
- a lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `*.lock`,
  and similar);
- binary (a NUL byte in its first 8,000 bytes, as `lineCount` in
  `src/init.ts` already does);
- data or config rather than logic, by extension: `json`, `jsonc`, `json5`,
  `yaml`, `yml`, `toml`, `ini`, `cfg`, `conf`, `env`, `xml`, `plist`, `csv`,
  `tsv`, `svg` and similar (builder's call on the exact list; it is tested).
  Markup, styles and queries that people write (HTML, CSS, SQL, templates)
  do count as code;
- generated: any file git marks `linguist-generated` (read with
  `git check-attr`, local only), plus minified files (very long average line
  length, or any line over a few thousand characters; the builder picks the
  thresholds and tests them).

(Builder check, my call: data and config files are excluded because they make
footprints without adding complexity, such as a large i18n or fixture JSON.)

A file owned by several systems counts in equal shares toward each.

Branch points are counted with one language-agnostic rule, applied to every
code file: the keywords `if`, `elif`, `for`, `foreach`, `while`, `case`,
`catch`, `except`, `when` and `match` as whole words, plus `&&`, `||` and the
ternary `?` (written with spaces around it, so optional chaining `?.` and
optional types `?:` do not count). `else if` counts once, through its `if`.
This is an approximation, not a parser: it counts matches inside strings and
comments too. That is acceptable because the map compares systems within one
repo, where the error is roughly uniform. The page states the rule in one line
of its legend.

The numbers travel in the rendered page's data as
`systems[i].size = { files, codeLines, branchPoints }` (computed at render
time; `guide.json` is never changed).

Drawing rules:

- Footprint radius grows with the square root of code lines, so area is
  proportional to code.
- Height grows with the square root of branch points, scaled so the tallest
  hill in the guide gets about 9 rings.
- A system with no code files (only prose, data, config, generated files or
  assets) is drawn as a flat
  marker on its region with no rings, labelled "no code", still clickable.
- The region landmass is drawn from footprints alone (a separate field of unit
  height), so a low hill does not shrink its region's outline.

### Layout

Positions come from the guide's structure, not from the code's size, so the
map stays put as code changes:

- Groups start on an ellipse in guide order; systems start near their group's
  anchor with jitter from a PRNG seeded by each system's id (so adding one
  system does not reseed the others).
- A fixed number of relaxation steps: springs along trails (longer between
  groups), cohesion toward the group's centre, collision, and a weak pull to
  the middle.
- Collision uses each hill's size *bucket* (a few coarse steps on a log scale
  of code lines), not its exact size, so ordinary commits do not change the
  forces at all. Only a system crossing a bucket boundary, or a change to
  groups, systems or connections, can move hills, and then only a little.
- Tested: renders before and after a 10% change to one system's code lines
  give identical positions; a change that crosses a bucket moves no hill more
  than a small bound the builder sets.
- Layout runs in the CLI at render time (so it is testable) and its positions
  travel in the page's data. The page only does one thing to it: turn it a
  quarter when the map area is tall and the layout is wide, or the reverse.
  So each screen shape always shows the same map.

### Terrain drawing (in the page)

- One height field per group: each hill adds a Gaussian (centre at the
  system, spread from its footprint, peak from its height).
- Marching squares over a grid turns each field into contour loops; segments
  are chained into closed loops by the grid edge they cross. Saddle cells use
  the centre value.
- Each ring level is one SVG path, filled faintly with the group colour
  (`fill-rule: evenodd`) so peaks shade darker; every fourth ring is an
  index contour, drawn heavier.

### Trails

- One curved trail per pair of connected systems, bowing to a side chosen
  from the pair's ids. Both directions' "why" sentences belong to it.
- By default trails are faint dashes. Focusing a hill makes its trails solid
  with direction arrows and dims everything else.
- Hovering a trail shows a tooltip with "A → B: why" (and "B → A: why" when
  both directions exist).
- A `connects` entry that points at a system the guide does not have is
  skipped, not drawn and not an error.

### Routes

- A bar of route buttons above the map, one per flow; a flow with a step whose
  system is missing is left out.
- Picking a route draws it along the trails' curves with numbered stops
  (repeat visits to a hill fan out around it), dims the rest, and opens a
  caption with previous, play/pause and next. The left and right arrow keys
  step; Escape leaves the route. Playback pauses at each stop for a reading
  time based on the step's length.
- The panel shows the current stop's system.

### Labels and scale

- Labels, markers, badges and arrows keep a constant on-screen size; lines
  use non-scaling strokes.
- Labels are placed greedily in screen space (below, above, right, left of the
  summit), never over another label, a summit, a region name or the map's
  edge. Priority: the hill in focus (always shown), hills on the active route,
  then by code lines. A label with no room is hidden, as maps drop minor names,
  and returns when zooming in.
- Pan by dragging, zoom with the wheel, pinch and the +, − and fit buttons.

## Where it lives in the page

- The left column gets a **Map | List** switch. The map is the default view
  when the page is at least 860px wide; the list (today's tiles) is the default
  below that. The choice is remembered in the URL hash so links keep the view.
- Clicking a hill does exactly what clicking a tile does today: it opens the
  system's entry in the existing panel. The search box selects and centres the
  matching hill when the map is showing.
- With nothing selected, the panel's existing overview gets a short "How to
  read the map" legend: what footprint and height count, regions, trails and
  routes.
- Hills are keyboard-reachable (tab order by group, Enter opens the entry) and
  carry accessible names. The list view remains the complete, accessible
  alternative.
- The map's code and styles live in their own template files and are inlined
  into the page at render time, beside the existing page code. They follow the
  existing template's idiom (plain ES5-style script, the page's colour tokens).

## Command line

No new subcommand: a new command name would make `guide <id>` unable to look
up a project's system with that id (`SUBCOMMANDS` in `src/types.ts`), and a
project could already have a system called `map`. Instead `render` gains
flags:

- `guide render [out.html]`: as today, now with the map as the default view.
- `guide render --map-only [out.html]`: a page with just the map, the route
  bar and the entry panel; no list, jobs table or glossary.
- `guide render --guide <file.json> [--root <folder>] [--map-only] <out.html>`:
  render a guide-shaped JSON that has no `guide.config.json`. The repo root
  defaults to the git top level of the JSON's folder. Config falls back to
  defaults (`files: "git"`, include everything, the default prose globs); an
  optional `--config <file>` supplies a `guide.config.json`-shaped file
  instead (include, exclude, prose). The JSON's own folder counts as the
  guide folder, so its files are left out of sizes. An output path is required
  in this mode, so nothing is written next to someone else's guide by
  accident.
- The page treats a missing array field on a system (`journey`, `keyFiles`,
  `connects` and the rest) as empty instead of failing, since `render` does
  not validate and `--guide` reads guides the check never saw.

`render` stays read-only apart from the output file, makes no network
request, and does not validate the guide (as today).

## SiliconExchange

SiliconExchange runs its own System Atlas (its own scripts, check and page
template), not this plugin. Checked read-only on 2026-10-19: its `atlas.json`
has the same top-level keys and the same system fields as `guide.json`, every
one of its 24 systems has every array field, and its `owns` globs use the same
`*` and `**` rules as field-guide's `globToRegExp`. Its check walks a narrower
set of folders than "everything in git", but that matters little here, since
sizes count only the files a system's `owns` claims. So it can get the map with no update
to its tooling, by running a field-guide CLI from outside its repo:

`node <field-guide>/dist/guide.mjs render --guide docs/atlas/atlas.json --map-only docs/atlas/map.html`

That writes one new file and touches nothing else. Whether that file is
committed, gitignored or kept out of the Atlas's own coverage check is
SiliconExchange's decision; a read-only audit prompt for a session in that
repo has been given to the owner.

## Constraints

- Dependency-free CLI, local files and `git` only (CLAUDE.md).
- `dist/guide.mjs` is rebuilt, never hand-edited; `npm run check` passes.
- Every new file is claimed in `docs/field-guide/guide.json`, and the entries
  whose behaviour changes (the page, the command line, the lookup's
  `SUBCOMMANDS` if touched) get their sentences fixed in the same commit.
- Performance budget: layout in the CLI under 200 ms and the page's first
  draw (terrain included) under 300 ms for 60 systems on a typical laptop.
- The page's existing guarantee that data cannot close the script element
  (`<` escaped) covers the new data.
- `examples/paraflow/guide.html` is regenerated by running the new CLI's
  `render` on the example's own `guide.json` and config in a ParaFlow
  checkout at commit `043aaeb` (`ecfdf66` plus the guide files the build
  added; a local clone works, no network needed), never by hand. The
  example's README says which commit the page was rendered at, and the
  repo README's screenshot is retaken from it (decided by the owner). If no
  local ParaFlow clone is available, stop and ask; do not reconstruct files.
- Release: minor version bump, per CLAUDE.md, after the owner approves.

## Testing

- **Sizing:** fixture files in several languages (TypeScript, Python, Rust,
  shell) with known branch counts; prose, lockfiles, binaries and a minified
  file excluded; shared ownership split evenly; a no-code system.
- **Layout:** the same input gives identical positions twice; a 10% size
  change within a bucket moves nothing; no two hills closer than the collision
  rule allows; works for 1, 5, 13 and 60 systems and for a group with one
  system.
- **Render:** the page contains sizes and positions for every system;
  `--map-only` omits the list, jobs and glossary; `--guide` on a fixture with
  no config writes only the named file (the repo's git status is otherwise
  unchanged) and refuses to run without an output path.
- **Robustness:** a `connects` to a missing system and a flow with a missing
  system render without error.
- Run against the previous build where a test could pass vacuously
  (`GUIDE_CLI=<old dist/guide.mjs> node test/run.mjs`).

## Left to the builder

- Exact constants: spring and collision strengths, grid step, ring spacing,
  the minified-file thresholds, playback speeds.
- The precise lockfile list and whether to strip obvious comment lines before
  counting branches (allowed, if it stays language-agnostic and tested).
- The route colour token and the map's paper tint, within the page's palette,
  in both themes.
- Visual styling of the Map | List switch and the route bar.
- How the map's template files are split and inlined, as long as the bundle
  stays one file.
