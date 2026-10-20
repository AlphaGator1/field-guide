/**
 * Where each system's hill stands on the trail map, and how big it is drawn.
 * The layout has two phases. Phase 1 places the systems from the guide's
 * structure alone (which group a system is in, what it connects to) and looks
 * at no size. Phase 2 starts from those places, scales the whole layout by the
 * hills' root-mean-square bucket radius, and pushes hills apart by their size
 * bucket (a coarse log-scale step of code lines, never the exact size), so the
 * map stays put as code changes: an ordinary commit moves nothing, and a
 * system that crosses a bucket boundary moves the hills around it only a
 * little. Pure and deterministic: the same guide and sizes give the same hills
 * on every run, and adding a system does not reseed the others (each one's
 * start comes from its own id). A system with no id still gets a hill.
 */
import type { Guide, Hill, Size } from "./types"

/** A system's coarse size step: 0 for no code, then one more for every doubling of its code lines. */
export function sizeBucket(codeLines: number): number {
  return codeLines < 1 ? 0 : 1 + Math.floor(Math.log2(codeLines))
}

/** The radius of a hill's footprint, in layout units: its area grows with its code. */
export function footprintRadius(codeLines: number): number {
  return 16 + 2.3 * Math.sqrt(codeLines)
}

const ANCHOR_RX = 340 // groups start on an ellipse this wide...
const ANCHOR_RY = 240 // ...and this tall
const JITTER = 70 // a system starts within this distance (a square's half-side) of its group's anchor
const PHASE1_RADIUS = 90 // the one collision radius every hill has in phase 1, where no size is looked at
const STEPS1 = 700 // phase 1 steps; alpha scales the springs, cohesion and pull down linearly from 1 to 0
const SPRING = 0.4 // the share of a trail's stretch removed per step at full alpha (before dividing by its ends' trail counts)
const COHESION = 0.02 // the share of the distance to the group's centre closed per step at full alpha
const PULL = 0.001 // the share of the distance to the origin closed per step at full alpha
const COLLISION = 0.1 // the share of an overlap each end of a pair removes per step; all pairs push at once
const REST_SAME = 36 // a trail's rest length beyond the two collision radii, within a group...
const REST_OTHER = 150 // ...and between groups
const CLEARANCE_SAME = { scale: 0.8, gap: 30 } // the least centre distance, as scale * (ra + rb) + gap...
const CLEARANCE_OTHER = { scale: 1.15, gap: 120 } // ...within a group and between groups
const SCALE_MIN = 0.5 // phase 1 places hills as if they were PHASE1_RADIUS big; the layout is scaled by their root-mean-square bucket radius over that, but never below this
const STEPS2 = 300 // phase 2 collision steps
const SETTLE_PASSES = 2000 // at most this many extra collision-only passes after each phase; they stop once the worst overlap is under 0.01

/** FNV-1a: a 32-bit hash of the text. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** mulberry32: a small seeded PRNG giving numbers in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * One hill per system, in guide order. A missing `connects` is empty, a
 * connection to a system the guide does not have is skipped, and a system
 * whose `group` the guide does not declare joins one fallback group, placed
 * last (its hill's `group` is ""). Groups with no system take no place.
 */
export function layoutHills(guide: Guide, sizes: Map<string, Size>): Hill[] {
  const systems = guide.systems
  const n = systems.length
  const size = systems.map((s) => sizes.get(s.id) ?? { files: 0, codeLines: 0, branchPoints: 0 })

  // Groups in guide order, the fallback last; slot[i] is the place of system i's group on the ellipse.
  const declared = new Map<string, number>()
  for (const g of guide.groups ?? []) if (!declared.has(g.id)) declared.set(g.id, declared.size)
  const rank = systems.map((s) => declared.get(s.group) ?? declared.size)
  const used = [...new Set(rank)].sort((a, b) => a - b)
  const slot = rank.map((r) => used.indexOf(r))

  // Start at the group's anchor plus jitter from a PRNG seeded by the system's own id.
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  systems.forEach((s, i) => {
    // The first group sits at the left of the ellipse and the rest follow clockwise on screen.
    const turn = (-0.5 + slot[i] / used.length) * 2 * Math.PI
    // render does not validate the guide: a missing id hashes as "" instead of throwing.
    const rand = mulberry32(fnv1a(String(s.id ?? "")))
    px[i] = (used.length > 1 ? ANCHOR_RX * Math.cos(turn) : 0) + (rand() * 2 - 1) * JITTER
    py[i] = (used.length > 1 ? ANCHOR_RY * Math.sin(turn) : 0) + (rand() * 2 - 1) * JITTER
  })

  // Only real ids: a connection with no `to` must not land on a system with no id.
  const index = new Map(systems.flatMap((s, i) => (typeof s.id === "string" ? [[s.id, i] as const] : [])))
  const trails = new Map<number, [number, number]>()
  systems.forEach((s, i) => {
    for (const link of s.connects ?? []) {
      const j = index.get(link?.to)
      if (j !== undefined && j !== i) trails.set(Math.min(i, j) * n + Math.max(i, j), [Math.min(i, j), Math.max(i, j)])
    }
  })
  const trailCount = new Float64Array(n)
  for (const [a, b] of trails.values()) {
    trailCount[a]++
    trailCount[b]++
  }

  const pushX = new Float64Array(n)
  const pushY = new Float64Array(n)
  /**
   * Every overlapping pair pushes apart at once, each end taking COLLISION of
   * the overlap. Pairs are not resolved one after another (the order of that
   * would decide the outcome, and a small change would reshuffle a crowd).
   * Returns the worst overlap met.
   */
  const collide = (radius: Float64Array) => {
    let worst = 0
    pushX.fill(0)
    pushY.fill(0)
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        let vx = px[b] - px[a]
        let vy = py[b] - py[a]
        const d = Math.sqrt(vx * vx + vy * vy)
        const c = slot[a] === slot[b] ? CLEARANCE_SAME : CLEARANCE_OTHER
        const need = c.scale * (radius[a] + radius[b]) + c.gap
        if (d >= need) continue
        if (d > 1e-9) {
          vx /= d
          vy /= d
        } else {
          // On top of each other (a duplicate id): a fixed direction for the pair.
          const turn = (a * 7 + b * 13) * 2.399963
          vx = Math.cos(turn)
          vy = Math.sin(turn)
        }
        const push = (need - d) * COLLISION
        pushX[a] -= vx * push
        pushY[a] -= vy * push
        pushX[b] += vx * push
        pushY[b] += vy * push
        worst = Math.max(worst, need - d)
      }
    }
    for (let i = 0; i < n; i++) {
      px[i] += pushX[i]
      py[i] += pushY[i]
    }
    return worst
  }
  /** Collision-only passes until the worst overlap is under 0.01 (or the passes run out). */
  const settle = (radius: Float64Array) => {
    for (let pass = 0; pass < SETTLE_PASSES; pass++) if (collide(radius) <= 0.01) break
  }

  // Phase 1: structure only. Every hill has the same collision radius, so nothing here depends on a size.
  const same = new Float64Array(n).fill(PHASE1_RADIUS)
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  const sumX = new Float64Array(used.length)
  const sumY = new Float64Array(used.length)
  const count = new Float64Array(used.length)
  for (let step = 0; step < STEPS1; step++) {
    const alpha = 1 - step / STEPS1
    dx.fill(0)
    dy.fill(0)
    // Springs along each connected pair, longer between groups. A spring's strength is divided by the trail count of
    // the end with fewer, and the end with fewer trails moves more, so a hub with many trails is not yanked about.
    for (const [a, b] of trails.values()) {
      const vx = px[b] - px[a]
      const vy = py[b] - py[a]
      const d = Math.sqrt(vx * vx + vy * vy)
      if (d < 1e-9) continue
      const rest = same[a] + same[b] + (slot[a] === slot[b] ? REST_SAME : REST_OTHER)
      const ta = trailCount[a]
      const tb = trailCount[b]
      const pull = (SPRING * alpha * (d - rest)) / d / Math.min(ta, tb)
      dx[a] += (vx * pull * tb) / (ta + tb)
      dy[a] += (vy * pull * tb) / (ta + tb)
      dx[b] -= (vx * pull * ta) / (ta + tb)
      dy[b] -= (vy * pull * ta) / (ta + tb)
    }
    // Cohesion toward the group's centre, and a weak pull toward the origin.
    sumX.fill(0)
    sumY.fill(0)
    count.fill(0)
    for (let i = 0; i < n; i++) {
      sumX[slot[i]] += px[i]
      sumY[slot[i]] += py[i]
      count[slot[i]]++
    }
    for (let i = 0; i < n; i++) {
      dx[i] += (sumX[slot[i]] / count[slot[i]] - px[i]) * COHESION * alpha - px[i] * PULL * alpha
      dy[i] += (sumY[slot[i]] / count[slot[i]] - py[i]) * COHESION * alpha - py[i] * PULL * alpha
    }
    for (let i = 0; i < n; i++) {
      px[i] += dx[i]
      py[i] += dy[i]
    }
    collide(same)
  }
  settle(same)

  // Phase 2: room by size. The collision radius comes from the size bucket, never the exact size. The whole layout is
  // first scaled by the hills' root-mean-square bucket radius over phase 1's (up when they are bigger, down to half at
  // most when they are smaller; one system crossing a bucket changes the scale only a little), and the hills are then
  // pushed apart from there.
  const radius = Float64Array.from(size.map((z) => footprintRadius(2 ** sizeBucket(z.codeLines))))
  const scale = Math.max(SCALE_MIN, Math.sqrt(radius.reduce((sum, r) => sum + r * r, 0) / Math.max(1, n)) / PHASE1_RADIUS)
  for (let i = 0; i < n; i++) {
    px[i] *= scale
    py[i] *= scale
  }
  for (let step = 0; step < STEPS2; step++) collide(radius)
  settle(radius)

  const peak = Math.max(0, ...size.map((z) => Math.sqrt(z.branchPoints)))
  return systems.map((s, i) => ({
    id: s.id,
    group: rank[i] < declared.size ? s.group : "",
    x: round1(px[i]),
    y: round1(py[i]),
    footprint: footprintRadius(size[i].codeLines),
    height: peak > 0 ? Math.sqrt(size[i].branchPoints) / peak : 0,
    files: size[i].files,
    codeLines: size[i].codeLines,
    branchPoints: size[i].branchPoints,
  }))
}
