# Phase 5d Island Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the island interiors with seeded scenery, hills, paths and a dock that grow with each island's count of finished tasks.

**Architecture:** Every rule is a pure, three-free function: `stageFor`, hills, tones and paths in `scene/model/terrain.ts`, scenery and dock in `scene/model/island-growth.ts`, `hexLine` in `packages/shared`. `buildSceneModel` adds `stage`, `paths`, `scenery` and `dock` to each island and gives every land position a `y`. Hills and paths are baked into the existing terrain mesh; scenery is one archipelago-wide instanced mesh per type (8 draw calls). New pieces grow in on `high` only, behind a `growth` ticker demand.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5 + RTL, `@react-three/test-renderer` 9.1, `bun test` in `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 18 (Phase 5d), with sections 13, 15.2 and 17 for the systems it refines.

## Global Constraints

- Biome: single quotes, no semicolons, line width 100. `bun run lint` stays at the one known info.
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk. `scene/tuning.ts`, `scene/model/*` and `scene/use-reduced-motion.ts` are three-free; `scene/model/*` never imports `scene/models/*`.
- Every scene colour comes from `scenePalette` (A'raf tokens or `mix` of them).
- No API, DTO or land-rule change. Hills and scenery are visual only; `placeablePlots`/`islandRadius` are untouched.
- Scenery and docks carry no `onClick` and do not raycast: a tap on them reaches the terrain beneath.
- Stage counts tasks with `status === 'done'` only.
- Commit messages: conventional (`feat(web): …`, `feat(shared): …`, `test(web): …`, `docs: …`), no AI attribution or `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; shared `cd packages/shared && bun test <file>`; gate from the root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.

## Review Focus

1. A task, decoration, plot glow or placement ghost on a raised hex stands on that hex (not buried, not floating). Pinned in Task 3.
2. A ragged coast leaves hexes out of the outer ring; no scenery or dock ever sits on a missing hex (open water). Pinned in Task 2.
3. Reopening the only finished task of a milestone removes its path and drops the stage with it. Pinned in Task 3.
4. A stage drop while the scene is mounted (finished task deleted or reopened) removes pieces with no grow-in and no ticker. Pinned in Task 5.
5. Dropping from `high` to `low` (or turning on reduced motion) mid grow-in snaps every piece to full size and releases the ticker. Pinned in Task 5.

---

### Task 1: Stages, hills, grass tones and paths in the terrain

**Files:**
- Modify: `packages/shared/src/hex.ts`, `packages/shared/src/hex.test.ts`
- Modify: `apps/web/src/scene/model/hex-space.ts`, `apps/web/src/scene/model/palette.ts`, `apps/web/src/scene/tuning.ts`
- Modify: `apps/web/src/scene/model/terrain.ts`, `apps/web/src/scene/model/foundations.test.ts`

**Interfaces:**
- Produces: `hexLine(a: Hex, b: Hex): Hex[]` (both ends included) from `@archipelago/shared`.
- Produces: `type Spot = Point & { y: number }` in `model/hex-space.ts`.
- Produces: palette keys `grassDry`, `grassSprout`, `grassGreen`, `grassLush`, `path`, `foliage`, `foliageDry`, `petal`, `driftwood`.
- Produces: the "Island growth" tuning block (`GROWTH_THRESHOLDS`, `GROWTH_FILL`, `SHORE_FILL`, `HILL_STEP`, `HILL_MAX`, `HILL_SCALE`, `MEADOW_SHARE`, `SCENERY_WEIGHTS`, `CLUSTER_OFFSET`, `SCENERY_SCALE`, `GROW_IN_MS`).
- Produces in `model/terrain.ts`: `type Stage = 0 | 1 | 2 | 3 | 4`, `type GrassTone`, `GRASS_TONES`, `stageFor(finished: number): Stage`, `hillNoise(seed, x, z): number`, `islandTerrain(seed, radius, stage: Stage = 0, paths: readonly Hex[] = []): TerrainTile[]`, `tileHeights(tiles): ReadonlyMap<string, number>`, `heightAt(heights, hex): number`.

- [ ] **Step 1: Failing `hexLine` tests.** Add to `packages/shared/src/hex.test.ts` (add `hexLine` to the existing import from `./hex`):

```ts
describe('hexLine', () => {
  test('runs from a to b inclusive, one hex per step', () => {
    const a = { q: 0, r: 0 }
    const b = { q: 5, r: -3 }
    const line = hexLine(a, b)
    expect(line[0]).toEqual(a)
    expect(line.at(-1)).toEqual(b)
    expect(line).toHaveLength(hexDistance(a, b) + 1)
    line.slice(1).forEach((h, i) => {
      expect(hexDistance(line[i] ?? h, h)).toBe(1)
    })
  })

  test('an axis is exact, and a line to itself is one hex', () => {
    expect(hexLine({ q: 0, r: 0 }, { q: 0, r: 4 })).toEqual(
      [0, 1, 2, 3, 4].map((r) => ({ q: 0, r })),
    )
    expect(hexLine({ q: 0, r: 0 }, { q: -5, r: 0 })).toEqual(
      [0, -1, -2, -3, -4, -5].map((q) => ({ q: q + 0, r: 0 })),
    )
    expect(hexLine({ q: 2, r: 1 }, { q: 2, r: 1 })).toEqual([{ q: 2, r: 1 }])
  })
})
```

Run: `cd packages/shared && bun test src/hex.test.ts` — Expected: FAIL, `hexLine` is not exported.

- [ ] **Step 2: Implement `hexLine`.** Append to `packages/shared/src/hex.ts`:

```ts
/** Hexes on the straight line from `a` to `b`, both ends included. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b)
  const line: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    // The nudge keeps a point on a hex edge from rounding both ways along one line.
    line.push(hexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6))
  }
  return line
}

function hexRound(q: number, r: number): Hex {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  // `+ 0` turns -0 into 0, so lines compare equal to plain literals.
  return { q: rq + 0, r: rr + 0 }
}
```

Run: `cd packages/shared && bun test src/hex.test.ts` — Expected: PASS.

- [ ] **Step 3: `Spot`, palette and tuning.** In `apps/web/src/scene/model/hex-space.ts`, below `export type Point = { x: number; z: number }`, add:

```ts
/** A point on the land: `y` is the height of the tile it stands on (spec 18.3). */
export type Spot = Point & { y: number }
```

In `apps/web/src/scene/model/palette.ts` add to `scenePalette`, after `meadow`:

```ts
  grassDry: mix(colors.success, colors.warning, 0.5),
  grassSprout: mix(colors.success, colors.warning, 0.375),
  grassGreen: mix(colors.success, colors.warning, 0.25),
  grassLush: mix(colors.success, colors.warning, 0.125),
  path: mix(colors.warning, colors.surfacePrimary, 0.7),
  foliage: mix(colors.success, colors.textPrimary, 0.3),
  foliageDry: mix(colors.success, colors.warning, 0.6),
  petal: mix(colors.error, colors.surfacePrimary, 0.5),
  driftwood: mix(colors.warning, colors.textTertiary, 0.55),
```

Append to `apps/web/src/scene/tuning.ts`:

```ts

// Island growth (spec 18).
/** Finished tasks at which an island reaches stages 1, 2, 3 and 4. */
export const GROWTH_THRESHOLDS = [3, 8, 15, 30] as const
/** Share of free interior hexes holding scenery, per stage 0–4. */
export const GROWTH_FILL = [0.05, 0.2, 0.4, 0.6, 0.75] as const
/** Shore hexes fill at this share of the interior rate. */
export const SHORE_FILL = 0.5
/** Hills rise in steps of this many world units. */
export const HILL_STEP = 0.15
/** Tallest hill above LAND_HEIGHT, per stage. */
export const HILL_MAX = [0.15, 0.3, 0.4, 0.5, 0.6] as const
/** World units across one hill of the noise lattice. */
export const HILL_SCALE = 4
/** Meadow share of interior grass, per stage. */
export const MEADOW_SHARE = [0.1, 0.15, 0.2, 0.3, 0.35] as const
/** Scenery type shares per zone; each zone sums to 1. */
export const SCENERY_WEIGHTS = {
  inland: { tree: 0.45, flowers: 0.25, grass: 0.3 },
  edge: { bush: 0.6, rock: 0.4 },
  shore: { rock: 0.4, reeds: 0.35, driftwood: 0.25 },
} as const
/** Pieces of a cluster sit at most this far from their hex centre. */
export const CLUSTER_OFFSET = 0.55
export const SCENERY_SCALE: readonly [min: number, max: number] = [0.8, 1.2]
export const GROW_IN_MS = 600
```

- [ ] **Step 4: Failing terrain tests.** In `apps/web/src/scene/model/foundations.test.ts` change the imports to:

```ts
import { type Hex, hexDistance, hexKey, islandRadius } from '@archipelago/shared'
import { colors } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'
import { HILL_MAX, HILL_STEP } from '../tuning'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mix, scenePalette } from './palette'
import { mulberry32 } from './random'
import { GRASS_TONES, heightAt, islandTerrain, type Stage, stageFor, tileHeights } from './terrain'
```

Replace the test `'the interior is complete flat land with a plaza at the origin'` with:

```ts
  test('the interior is complete land at or above LAND_HEIGHT, with a flat plaza at the origin', () => {
    const tiles = islandTerrain(7, 6, 4)
    const at = (q: number, r: number) => tiles.find((t) => t.q === q && t.r === r)
    expect(at(0, 0)).toEqual({ q: 0, r: 0, height: LAND_HEIGHT, tone: 'plaza' })
    const interior = tiles.filter((t) => hexDistance(origin, t) <= 4)
    expect(interior).toHaveLength(1 + 3 * 4 * 5) // hexes within 4 rings
    for (const t of interior) expect(t.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
  })
```

Append inside `describe('islandTerrain', …)`:

```ts
  const STAGES: Stage[] = [0, 1, 2, 3, 4]

  test('hills rise in steps, never past their stage cap, and grow with the stage', () => {
    const tallest = STAGES.map(() => 0)
    for (let seed = 1; seed <= 10; seed++) {
      for (const stage of STAGES) {
        for (const t of islandTerrain(seed, 6, stage)) {
          if (hexDistance(origin, t) > 4) continue
          const rise = t.height - LAND_HEIGHT
          expect(rise).toBeGreaterThanOrEqual(0)
          expect(rise).toBeLessThanOrEqual(HILL_MAX[stage] + 1e-9)
          expect(Math.abs(rise / HILL_STEP - Math.round(rise / HILL_STEP))).toBeLessThan(1e-9)
          tallest[stage] = Math.max(tallest[stage] ?? 0, rise)
        }
      }
    }
    expect(tallest[4]).toBeGreaterThan(tallest[0] ?? 0)
  })

  test('the stage leaves the shore exactly as it was', () => {
    const shore = (stage: Stage) => islandTerrain(3, 6, stage).filter((t) => hexDistance(origin, t) > 4)
    expect(shore(4)).toEqual(shore(0))
  })

  test('grass is dry on a bare island and full grass when overgrown, with more meadow', () => {
    let meadow0 = 0
    let meadow4 = 0
    for (let seed = 1; seed <= 10; seed++) {
      const bare = islandTerrain(seed, 6, 0).filter((t) => t.tone !== 'plaza' && hexDistance(origin, t) <= 4)
      const lush = islandTerrain(seed, 6, 4).filter((t) => t.tone !== 'plaza' && hexDistance(origin, t) <= 4)
      for (const t of bare) expect(['grassDry', 'meadow']).toContain(t.tone)
      for (const t of lush) expect(['grass', 'meadow']).toContain(t.tone)
      meadow0 += bare.filter((t) => t.tone === 'meadow').length
      meadow4 += lush.filter((t) => t.tone === 'meadow').length
    }
    expect(meadow4).toBeGreaterThan(meadow0)
    expect(GRASS_TONES).toEqual(['grassDry', 'grassSprout', 'grassGreen', 'grassLush', 'grass'])
  })

  test('path hexes get the path tone and no other hex does', () => {
    const paths: Hex[] = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]
    const keys = new Set(paths.map(hexKey))
    for (const t of islandTerrain(5, 6, 2, paths)) {
      expect(t.tone === 'path').toBe(keys.has(hexKey(t)))
    }
  })

  test('tileHeights and heightAt read a tile height, LAND_HEIGHT off the island', () => {
    const tiles = islandTerrain(9, 5, 3)
    const heights = tileHeights(tiles)
    for (const t of tiles) expect(heightAt(heights, t)).toBe(t.height)
    expect(heightAt(heights, { q: 40, r: 0 })).toBe(LAND_HEIGHT)
  })
```

Append a new describe:

```ts
describe('stageFor', () => {
  test.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [7, 1],
    [8, 2],
    [14, 2],
    [15, 3],
    [29, 3],
    [30, 4],
    [500, 4],
  ])('%i finished tasks is stage %i', (finished, stage) => {
    expect(stageFor(finished)).toBe(stage)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/foundations.test.ts` — Expected: FAIL (missing exports).

- [ ] **Step 5: Implement the terrain.** Replace `apps/web/src/scene/model/terrain.ts` with:

```ts
import { type Hex, hexKey, hexRing, SHORE_RINGS } from '@archipelago/shared'
import { GROWTH_THRESHOLDS, HILL_MAX, HILL_SCALE, HILL_STEP, MEADOW_SHARE } from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'
import { hashInts, mulberry32 } from './random'

export type Stage = 0 | 1 | 2 | 3 | 4
export type GrassTone = 'grassDry' | 'grassSprout' | 'grassGreen' | 'grassLush' | 'grass'
export type TerrainTone = GrassTone | 'meadow' | 'shore' | 'rock' | 'plaza' | 'path'
export type TerrainTile = { q: number; r: number; height: number; tone: TerrainTone }

/** Interior grass by stage: dry on a bare island, full `grass` once overgrown (spec 18.3). */
export const GRASS_TONES: readonly GrassTone[] = [
  'grassDry',
  'grassSprout',
  'grassGreen',
  'grassLush',
  'grass',
]

const ORIGIN: Hex = { q: 0, r: 0 }
const UNIT = 4294967296

/** An island's stage from its count of finished tasks (spec 18.1). */
export function stageFor(finished: number): Stage {
  return GROWTH_THRESHOLDS.filter((t) => finished >= t).length as Stage
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Smooth seeded value noise in [0, 1) over world x/z: hashed lattice corners, blended. */
export function hillNoise(seed: number, x: number, z: number): number {
  const gx = x / HILL_SCALE
  const gz = z / HILL_SCALE
  const ix = Math.floor(gx)
  const iz = Math.floor(gz)
  const fx = smooth(gx - ix)
  const fz = smooth(gz - iz)
  const corner = (dx: number, dz: number) => hashInts(seed, ix + dx, iz + dz) / UNIT
  const top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * fx
  const bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * fx
  return top + (bottom - top) * fz
}

/** LAND_HEIGHT plus whole HILL_STEPs, never above the stage's HILL_MAX. */
function hillHeight(seed: number, h: Hex, stage: Stage): number {
  const cap = HILL_MAX[stage]
  const { x, z } = hexToWorld(h)
  const steps = Math.min(
    Math.round((hillNoise(seed, x, z) * cap) / HILL_STEP),
    Math.floor(cap / HILL_STEP + 1e-9),
  )
  return LAND_HEIGHT + steps * HILL_STEP
}

/**
 * Hex tiles for an island of `radius` rings. Everything within `radius − 2` is land: rolling
 * hills that grow with `stage`, grass that greens with it, and `paths` in their own tone. The
 * plaza at the centre is always flat. The outer two rings are a lower shore shaped by `seed`, and
 * some hexes of the outermost ring are left out for a ragged coast; the stage never changes them.
 */
export function islandTerrain(
  seed: number,
  radius: number,
  stage: Stage = 0,
  paths: readonly Hex[] = [],
): TerrainTile[] {
  const random = mulberry32(seed)
  const onPath = new Set(paths.map(hexKey))
  const tiles: TerrainTile[] = []
  for (let ring = 0; ring <= radius; ring++) {
    for (const { q, r } of hexRing(ORIGIN, ring)) {
      if (ring === 0) {
        tiles.push({ q, r, height: LAND_HEIGHT, tone: 'plaza' })
        continue
      }
      // Two draws per hex keep the sequence aligned whichever branch runs.
      const a = random()
      const b = random()
      if (ring <= radius - SHORE_RINGS) {
        const tone: TerrainTone = onPath.has(hexKey({ q, r }))
          ? 'path'
          : a < MEADOW_SHARE[stage]
            ? 'meadow'
            : (GRASS_TONES[stage] ?? 'grass')
        tiles.push({ q, r, height: hillHeight(seed, { q, r }, stage), tone })
        continue
      }
      const outer = ring === radius
      if (outer && a < 0.3) continue
      const height = (outer ? 0.55 : 0.75) + b * 0.2
      tiles.push({ q, r, height, tone: a > 0.85 ? 'rock' : 'shore' })
    }
  }
  return tiles
}

/** Tile heights by hex key, for standing things on the land. */
export function tileHeights(tiles: readonly TerrainTile[]): ReadonlyMap<string, number> {
  return new Map(tiles.map((t) => [hexKey(t), t.height]))
}

/** The land height at a hex; LAND_HEIGHT off the island (a valid plot is always on it). */
export function heightAt(heights: ReadonlyMap<string, number>, h: Hex): number {
  return heights.get(hexKey(h)) ?? LAND_HEIGHT
}
```

- [ ] **Step 6: Run and commit.** Run: `cd apps/web && bunx vitest run src/scene/model src/scene/models` — Expected: PASS (`islandGeometry` colours tiles from the new palette keys). In `apps/web/src/scene/model/scene-model.test.ts`, test `'far districts and negative plots sit on flat interior land'`, change `expect(tile?.height).toBe(LAND_HEIGHT)` to `expect(tile?.height).toBeGreaterThanOrEqual(LAND_HEIGHT)` (stage-0 hills may lift a tile by one step; Task 3 rewrites this test properly). Then run `bun run --cwd apps/web test` and `bun run typecheck` from the root — Expected: all pass, 4/4. Every commit in this plan leaves the suite green.

```bash
git add packages/shared/src/hex.ts packages/shared/src/hex.test.ts apps/web/src/scene
git commit -m "feat(web): grow hills, greener grass and paths on islands by stage"
```

Note: at this commit `buildSceneModel` still calls `islandTerrain(seed, radius)` (stage 0, no paths), so islands show stage-0 hills (0 or 0.15) while structures still stand at `LAND_HEIGHT`. Task 3 closes that gap; do not wire anything else here.

---

### Task 2: Growth model — scenery, dock and paths

**Files:**
- Create: `apps/web/src/scene/model/island-growth.ts`, `apps/web/src/scene/model/island-growth.test.ts`

**Interfaces:**
- Consumes: `hexLine`, `Spot`, `Stage`, `TerrainTile`, `islandTerrain`, the "Island growth" tuning block (Task 1).
- Produces:
  - `SCENERY_TYPES = ['tree', 'bush', 'rock', 'flowers', 'grass', 'reeds', 'driftwood'] as const`, `type SceneryType`.
  - `type SceneryPiece = { id: string; type: SceneryType; position: Spot; turn: number; scale: number; low: boolean }` — `id` is `` `${q},${r}:${k}` `` (hex and place in its cluster), `position` island-local, `low` true when kept on the `low` tier.
  - `type Dock = { position: Spot; turn: number }` — the jetty model faces +x; `turn` points it away from the island centre.
  - `DOCK_STAGE = 2`.
  - `pathHexes(districts: readonly Hex[]): Hex[]`.
  - `islandGrowth(input: { seed: number; radius: number; stage: Stage; tiles: readonly TerrainTile[]; occupied: readonly Hex[]; paths: readonly Hex[] }): { scenery: SceneryPiece[]; dock: Dock | null }`.
  - `growEase(t: number): number` (ease-out cubic, clamped to [0, 1]; used by Task 5).

Rules (spec 18.2, 18.4), so the tests below make sense:
- A hex is revealed when `hashInts(seed, q, r) / 2^32 < GROWTH_FILL[stage]` (× `SHORE_FILL` on shore rings). That threshold test is per hex, so a higher stage only adds hexes, and occupying one hex never changes another.
- Each revealed hex draws everything else (type, count 1–3, offsets, turns, scales) from `mulberry32(hashInts(seed, q, r, 1))`, which depends on neither stage nor occupancy. `low` is bit 0 of `hashInts(seed, q, r, 2)`, so the `low` tier keeps whole clusters on about half the hexes.
- Zones: shore = ring > `radius - SHORE_RINGS`; edge = ring == `radius - SHORE_RINGS`; inland = everything nearer, except the centre.
- The dock stands on the outer-ring tile (present in `tiles`) with the smallest `hashInts(seed, q, r, 3)`, from `DOCK_STAGE`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/island-growth.test.ts`:

```ts
import { type Hex, hexDistance, hexKey, SHORE_RINGS } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { CLUSTER_OFFSET, GROWTH_FILL, SCENERY_SCALE, SCENERY_WEIGHTS, SHORE_FILL } from '../tuning'
import { hexToWorld } from './hex-space'
import {
  DOCK_STAGE,
  growEase,
  islandGrowth,
  pathHexes,
  type SceneryPiece,
} from './island-growth'
import { islandTerrain, type Stage } from './terrain'

const ORIGIN = { q: 0, r: 0 }
const STAGES: Stage[] = [0, 1, 2, 3, 4]

function grow(seed: number, stage: Stage, occupied: Hex[] = [], paths: Hex[] = [], radius = 7) {
  const tiles = islandTerrain(seed, radius, stage, paths)
  return { tiles, ...islandGrowth({ seed, radius, stage, tiles, occupied, paths }) }
}
const hexOf = (p: SceneryPiece) => p.id.split(':')[0] ?? ''
const flat = ({ position, ...rest }: SceneryPiece) => ({ ...rest, x: position.x, z: position.z })

describe('islandGrowth', () => {
  test('a higher stage only adds: every piece stays, same type, offset, turn, scale and tier', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const stage of [0, 1, 2, 3] as Stage[]) {
        const now = grow(seed, stage).scenery
        const next = new Map(grow(seed, (stage + 1) as Stage).scenery.map((p) => [p.id, flat(p)]))
        for (const p of now) expect(next.get(p.id)).toEqual(flat(p))
      }
    }
  })

  test('is deterministic', () => {
    expect(grow(3, 2)).toEqual(grow(3, 2))
  })

  test('never on an occupied hex, a path hex, the dock hex or the centre', () => {
    const occupied: Hex[] = [
      { q: 1, r: 0 },
      { q: -2, r: 1 },
      { q: 0, r: 3 },
    ]
    const paths: Hex[] = [
      { q: 0, r: -1 },
      { q: 0, r: -2 },
    ]
    for (let seed = 1; seed <= 10; seed++) {
      const { scenery, dock } = grow(seed, 4, occupied, paths)
      const banned = new Set([...occupied, ...paths, ORIGIN].map(hexKey))
      if (dock) {
        const at = scenery.find((p) => {
          const c = hexToWorld(parse(hexOf(p)))
          return Math.hypot(c.x - dock.position.x, c.z - dock.position.z) < 1e-9
        })
        expect(at).toBeUndefined()
      }
      for (const p of scenery) expect(banned.has(hexOf(p))).toBe(false)
    }
  })

  test('occupying one hex removes only that hex’s pieces', () => {
    const base = grow(4, 4).scenery
    const first = base[0]
    if (!first) throw new Error('seed 4 grew nothing')
    const target = hexOf(first)
    const after = grow(4, 4, [parse(target)]).scenery
    expect(after).toEqual(base.filter((p) => hexOf(p) !== target))
  })

  test('each stage fills about its share of free interior and shore hexes', () => {
    for (const stage of STAGES) {
      let inland = 0
      let inlandHit = 0
      let shore = 0
      let shoreHit = 0
      for (let seed = 1; seed <= 30; seed++) {
        const radius = 8
        const { tiles, scenery } = grow(seed, stage, [], [], radius)
        const hit = new Set(scenery.map(hexOf))
        for (const t of tiles) {
          const ring = hexDistance(ORIGIN, t)
          if (ring === 0) continue
          if (ring > radius - SHORE_RINGS) {
            shore++
            if (hit.has(hexKey(t))) shoreHit++
          } else {
            inland++
            if (hit.has(hexKey(t))) inlandHit++
          }
        }
      }
      expect(inlandHit / inland).toBeCloseTo(GROWTH_FILL[stage], 1)
      expect(shoreHit / shore).toBeCloseTo(GROWTH_FILL[stage] * SHORE_FILL, 1)
    }
  })

  test('types follow the place: shore, the ring next to it, and inland', () => {
    const radius = 7
    const edge = radius - SHORE_RINGS
    for (let seed = 1; seed <= 10; seed++) {
      for (const p of grow(seed, 4, [], [], radius).scenery) {
        const ring = hexDistance(ORIGIN, parse(hexOf(p)))
        const zone = ring > edge ? 'shore' : ring === edge ? 'edge' : 'inland'
        expect(Object.keys(SCENERY_WEIGHTS[zone])).toContain(p.type)
      }
    }
  })

  test('pieces stand on a present tile, near its centre, inside the island', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { tiles, scenery } = grow(seed, 4)
      const byKey = new Map(tiles.map((t) => [hexKey(t), t]))
      for (const p of scenery) {
        const tile = byKey.get(hexOf(p))
        expect(tile).toBeDefined()
        if (!tile) continue
        const c = hexToWorld(tile)
        expect(p.position.y).toBe(tile.height)
        expect(Math.hypot(p.position.x - c.x, p.position.z - c.z)).toBeLessThanOrEqual(
          CLUSTER_OFFSET + 1e-9,
        )
        expect(hexDistance(ORIGIN, tile)).toBeLessThanOrEqual(7)
        expect(p.scale).toBeGreaterThanOrEqual(SCENERY_SCALE[0])
        expect(p.scale).toBeLessThanOrEqual(SCENERY_SCALE[1])
      }
    }
  })

  test('a cluster holds 1–3 pieces, all on one tier', () => {
    const byHex = new Map<string, SceneryPiece[]>()
    for (const p of grow(6, 4).scenery) byHex.set(hexOf(p), [...(byHex.get(hexOf(p)) ?? []), p])
    for (const cluster of byHex.values()) {
      expect(cluster.length).toBeGreaterThanOrEqual(1)
      expect(cluster.length).toBeLessThanOrEqual(3)
      expect(new Set(cluster.map((p) => p.low)).size).toBe(1)
    }
  })

  test('the low tier keeps about half the hexes', () => {
    let all = 0
    let low = 0
    for (let seed = 1; seed <= 30; seed++) {
      const hexes = new Map(grow(seed, 4).scenery.map((p) => [hexOf(p), p.low]))
      all += hexes.size
      low += [...hexes.values()].filter(Boolean).length
    }
    expect(low / all).toBeGreaterThan(0.4)
    expect(low / all).toBeLessThan(0.6)
  })

  test('no dock before the green stage; from then on one, on a present outer hex, turned out to sea', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const stage of STAGES) {
        const { tiles, dock } = grow(seed, stage)
        if (stage < DOCK_STAGE) {
          expect(dock).toBeNull()
          continue
        }
        if (!dock) throw new Error('no dock')
        const tile = tiles.find((t) => {
          const c = hexToWorld(t)
          return Math.hypot(c.x - dock.position.x, c.z - dock.position.z) < 1e-9
        })
        expect(tile && hexDistance(ORIGIN, tile)).toBe(7)
        expect(dock.position.y).toBe(tile?.height)
        const d = Math.hypot(dock.position.x, dock.position.z)
        expect(Math.cos(dock.turn)).toBeCloseTo(dock.position.x / d)
        expect(-Math.sin(dock.turn)).toBeCloseTo(dock.position.z / d)
        expect(dock).toEqual(grow(seed, DOCK_STAGE).dock)
      }
    }
  })

  test('the scenery weights of each zone sum to 1', () => {
    for (const weights of Object.values(SCENERY_WEIGHTS)) {
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    }
  })
})

describe('pathHexes', () => {
  test('the line from the centre to each district, without its ends, each hex once', () => {
    expect(pathHexes([{ q: 5, r: 0 }])).toEqual([1, 2, 3, 4].map((q) => ({ q, r: 0 })))
    expect(pathHexes([])).toEqual([])
    const both = pathHexes([
      { q: 5, r: 0 },
      { q: 5, r: 0 },
      { q: 0, r: -5 },
    ])
    expect(both).toHaveLength(8)
    expect(both.some((h) => hexDistance(ORIGIN, h) === 0 || hexDistance(ORIGIN, h) === 5)).toBe(
      false,
    )
  })
})

describe('growEase', () => {
  test('runs 0 → 1, eased out, and clamps', () => {
    expect(growEase(0)).toBe(0)
    expect(growEase(1)).toBe(1)
    expect(growEase(0.5)).toBeGreaterThan(0.5)
    expect(growEase(-1)).toBe(0)
    expect(growEase(2)).toBe(1)
  })
})

function parse(key: string): Hex {
  const [q = 0, r = 0] = key.split(',').map(Number)
  return { q, r }
}
```

Run: `cd apps/web && bunx vitest run src/scene/model/island-growth.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 2: Implement.** Create `apps/web/src/scene/model/island-growth.ts`:

```ts
import {
  COMMONS_CENTER,
  type Hex,
  hexDistance,
  hexKey,
  hexLine,
  SHORE_RINGS,
} from '@archipelago/shared'
import { CLUSTER_OFFSET, GROWTH_FILL, SCENERY_SCALE, SCENERY_WEIGHTS, SHORE_FILL } from '../tuning'
import { hexToWorld, type Spot } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { Stage, TerrainTile } from './terrain'

export const SCENERY_TYPES = [
  'tree',
  'bush',
  'rock',
  'flowers',
  'grass',
  'reeds',
  'driftwood',
] as const
export type SceneryType = (typeof SCENERY_TYPES)[number]

export type SceneryPiece = {
  /** `q,r:k`: the hex and the piece's place in its cluster; the same at every stage. */
  id: string
  type: SceneryType
  /** Island-local, standing on its tile. */
  position: Spot
  turn: number
  scale: number
  /** Kept on the `low` tier: a fixed half of the hexes, whole clusters at a time. */
  low: boolean
}
/** A jetty; its model faces +x, and `turn` points it away from the island centre. */
export type Dock = { position: Spot; turn: number }

/** From this stage an island has a dock (spec 18.4). */
export const DOCK_STAGE = 2

const UNIT = 4294967296
const CLUSTER_SALT = 1
const LOW_SALT = 2
const DOCK_SALT = 3

/** Path hexes: the hex line from the commons centre to each district, ends excluded. */
export function pathHexes(districts: readonly Hex[]): Hex[] {
  const seen = new Map<string, Hex>()
  for (const d of districts) {
    for (const h of hexLine(COMMONS_CENTER, d).slice(1, -1)) seen.set(hexKey(h), h)
  }
  return [...seen.values()]
}

function pick<K extends string>(weights: Readonly<Record<K, number>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][]
  let sum = 0
  for (const [key, weight] of entries) {
    sum += weight
    if (u < sum) return key
  }
  // Rounding can leave u just past the last cumulative weight.
  return (entries.at(-1) as [K, number])[0]
}

function dockTile(seed: number, radius: number, tiles: readonly TerrainTile[]): TerrainTile | null {
  let best: TerrainTile | null = null
  let bestHash = Number.POSITIVE_INFINITY
  for (const t of tiles) {
    if (hexDistance(COMMONS_CENTER, t) !== radius) continue
    const h = hashInts(seed, t.q, t.r, DOCK_SALT)
    if (h < bestHash) {
      best = t
      bestHash = h
    }
  }
  return best
}

/**
 * Seeded scenery and the dock for one island (spec 18.2, 18.4). Each hex decides on its own
 * whether it is revealed at a stage, so growth only adds and occupying a hex hides only that
 * hex's pieces.
 */
export function islandGrowth({
  seed,
  radius,
  stage,
  tiles,
  occupied,
  paths,
}: {
  seed: number
  radius: number
  stage: Stage
  tiles: readonly TerrainTile[]
  occupied: readonly Hex[]
  paths: readonly Hex[]
}): { scenery: SceneryPiece[]; dock: Dock | null } {
  const dockAt = stage >= DOCK_STAGE ? dockTile(seed, radius, tiles) : null
  const blocked = new Set([...occupied, ...paths, COMMONS_CENTER].map(hexKey))
  if (dockAt) blocked.add(hexKey(dockAt))
  const edge = radius - SHORE_RINGS
  const scenery: SceneryPiece[] = []
  for (const tile of tiles) {
    if (blocked.has(hexKey(tile))) continue
    const ring = hexDistance(COMMONS_CENTER, tile)
    const zone = ring > edge ? 'shore' : ring === edge ? 'edge' : 'inland'
    const fill = GROWTH_FILL[stage] * (zone === 'shore' ? SHORE_FILL : 1)
    if (hashInts(seed, tile.q, tile.r) / UNIT >= fill) continue
    const random = mulberry32(hashInts(seed, tile.q, tile.r, CLUSTER_SALT))
    const type = pick<SceneryType>(SCENERY_WEIGHTS[zone], random())
    const count = 1 + Math.floor(random() * 3)
    const low = (hashInts(seed, tile.q, tile.r, LOW_SALT) & 1) === 0
    const centre = hexToWorld(tile)
    for (let k = 0; k < count; k++) {
      const angle = random() * 2 * Math.PI
      const reach = Math.sqrt(random()) * CLUSTER_OFFSET
      scenery.push({
        id: `${tile.q},${tile.r}:${k}`,
        type,
        position: {
          x: centre.x + Math.cos(angle) * reach,
          y: tile.height,
          z: centre.z + Math.sin(angle) * reach,
        },
        turn: random() * 2 * Math.PI,
        scale: SCENERY_SCALE[0] + random() * (SCENERY_SCALE[1] - SCENERY_SCALE[0]),
        low,
      })
    }
  }
  const dock = dockAt
    ? (() => {
        const { x, z } = hexToWorld(dockAt)
        return { position: { x, y: dockAt.height, z }, turn: Math.atan2(-z, x) }
      })()
    : null
  return { scenery, dock }
}

/** Ease-out cubic over [0, 1], clamped: the grow-in's scale curve (spec 18.5). */
export function growEase(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) ** 3
}
```

`pick<SceneryType>(SCENERY_WEIGHTS[zone], …)` may not typecheck because each zone's weights record has only some of the types. If it does not, type the parameter as `Readonly<Partial<Record<K, number>>>` and use `Object.entries(weights) as [K, number][]`; keep the behaviour identical.

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene/model/island-growth.test.ts` — Expected: PASS. The fill test uses `toBeCloseTo(…, 1)` (±0.05); if a stage misses by a hair over 30 seeds, raise the seed count to 60, never loosen the precision.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene/model/island-growth.ts apps/web/src/scene/model/island-growth.test.ts
git commit -m "feat(web): derive seeded island scenery and a dock from the growth stage"
```

---

### Task 3: Scene model carries growth, and everything stands at its tile's height

**Files:**
- Modify: `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/model/scene-model.test.ts`
- Modify: `apps/web/src/scene/model/reward-motion.ts`, `apps/web/src/scene/model/reward-motion.test.ts`
- Modify: `apps/web/src/scene/model-instances.tsx`, `apps/web/src/scene/crane-jibs.tsx`, `apps/web/src/scene/landmark.tsx`, `apps/web/src/scene/labels.tsx`, `apps/web/src/scene/island.tsx`
- Modify: `apps/web/src/scene/world-contents.test.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: `stageFor`, `islandTerrain(seed, radius, stage, paths)`, `tileHeights`, `heightAt`, `Spot` (Task 1); `islandGrowth`, `pathHexes`, `SceneryPiece`, `Dock` (Task 2).
- Produces: `SceneStructure.position`, `SceneDistrict.position`, `SceneDecoration.position` become `Spot`. `SceneIsland` gains `stage: Stage`, `paths: Hex[]`, `scenery: SceneryPiece[]`, `dock: Dock | null`.
- Produces: `ModelInstances` and `CraneJibs` take `points: readonly Spot[]`.

- [ ] **Step 1: Failing model tests.** In `apps/web/src/scene/model/scene-model.test.ts`:

Add imports: `hexRing` to the `@archipelago/shared` import; `import { pathHexes } from './island-growth'`; `import { heightAt, tileHeights } from './terrain'`. Add the helper below `world`:

```ts
type Island = ReturnType<typeof buildSceneModel>['islands'][number]
/** Where something on `h` stands: its hex centre at its tile's height. */
const spotOf = (island: Island | undefined, h: Hex) => {
  if (!island) throw new Error('no island')
  return { ...hexToWorld(h), y: heightAt(tileHeights(island.tiles), h) }
}
```

In `'places structures and districts at their hexes, island-local'` replace `position: hexToWorld({ q: 5, r: 0 })` with `position: spotOf(island, { q: 5, r: 0 })` and `position: hexToWorld({ q: 4, r: 1 })` with `position: spotOf(island, { q: 4, r: 1 })`.

Replace the test `'far districts and negative plots sit on flat interior land'` with:

```ts
  test('far districts and negative plots stand on interior land at their tile height', () => {
    const p = fakeProject()
    const m = fakeMilestone({ projectId: p.id, districtQ: -10, districtR: 5 })
    const tasks = [
      fakeTask({ projectId: p.id, milestoneId: m.id, plotX: -11, plotY: 5 }),
      fakeTask({ projectId: p.id, plotX: -1, plotY: -2 }),
    ]
    const [island] = buildSceneModel(
      world({ projects: [p], milestones: [m], tasks }),
      today,
    ).islands
    const occupied: Hex[] = [
      { q: -10, r: 5 },
      { q: -11, r: 5 },
      { q: -1, r: -2 },
    ]
    for (const h of occupied) {
      const tile = island?.tiles.find((t) => t.q === h.q && t.r === h.r)
      expect(tile?.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
    }
    expect(island?.districts[0]?.position).toEqual(spotOf(island, { q: -10, r: 5 }))
    expect(island?.structures.map((s) => s.position)).toEqual([
      spotOf(island, { q: -11, r: 5 }),
      spotOf(island, { q: -1, r: -2 }),
    ])
  })
```

In `describe('decorations')`, first test, replace `position: hexToWorld({ q: 0, r: 1 })` with `position: spotOf(model.islands[0], { q: 0, r: 1 })`.

Append:

```ts
describe('island growth', () => {
  const ringHexes = [1, 2, 3].flatMap((r) => hexRing({ q: 0, r: 0 }, r))

  test('the stage counts finished tasks only', () => {
    const p = fakeProject()
    const at = (i: number) => ringHexes[i] ?? { q: 0, r: 1 }
    const tasks = [
      ...[0, 1].map((i) => fakeTask({ projectId: p.id, status: 'done', plotX: at(i).q, plotY: at(i).r })),
      ...[2, 3, 4].map((i) => fakeTask({ projectId: p.id, status: 'doing', plotX: at(i).q, plotY: at(i).r })),
      ...[5, 6].map((i) => fakeTask({ projectId: p.id, status: 'todo', plotX: at(i).q, plotY: at(i).r })),
    ]
    const stage = (ts: typeof tasks) =>
      buildSceneModel(world({ projects: [p], tasks: ts }), today).islands[0]?.stage
    expect(stage(tasks)).toBe(0)
    const third = tasks.map((t, i) => (i === 2 ? { ...t, status: 'done' as const } : t))
    expect(stage(third)).toBe(1)
  })

  test('a path leads to a district once it has a finished task; reopening removes it', () => {
    const p = fakeProject()
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const done = fakeTask({ projectId: p.id, milestoneId: m.id, status: 'done', plotX: 0, plotY: 1 })
    const build = (t: typeof done) =>
      buildSceneModel(world({ projects: [p], milestones: [m], tasks: [t] }), today).islands[0]
    const island = build(done)
    expect(island?.paths).toEqual(pathHexes([{ q: 5, r: 0 }]))
    for (const h of island?.paths ?? []) {
      expect(island?.tiles.find((t) => t.q === h.q && t.r === h.r)?.tone).toBe('path')
    }
    const reopened = build({ ...done, status: 'todo', completedAt: null })
    expect(reopened?.paths).toEqual([])
    expect(reopened?.tiles.some((t) => t.tone === 'path')).toBe(false)
  })

  test('scenery never sits on a task, district or decoration plot; a dock from 8 finished tasks', () => {
    const p = fakeProject({ islandSeed: 21 })
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const plots = ringHexes.slice(0, 30)
    const tasks = plots.map((h, i) =>
      fakeTask({ projectId: p.id, status: i < 8 ? 'done' : 'todo', plotX: h.q, plotY: h.r }),
    )
    const pine = fakeBuilding({ projectId: p.id, type: 'pine', plotX: -4, plotY: 0 })
    const build = (ts: typeof tasks) =>
      buildSceneModel(world({ projects: [p], milestones: [m], tasks: ts, buildings: [pine] }), today)
        .islands[0]
    const island = build(tasks)
    const banned = new Set([...plots, { q: 5, r: 0 }, { q: -4, r: 0 }].map(hexKey))
    for (const s of island?.scenery ?? []) expect(banned.has(s.id.split(':')[0] ?? '')).toBe(false)
    expect(island?.stage).toBe(2)
    expect(island?.dock).not.toBeNull()
    const seven = tasks.map((t, i) => (i === 7 ? { ...t, status: 'todo' as const } : t))
    expect(build(seven)?.dock).toBeNull()
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/scene-model.test.ts` — Expected: FAIL (no `stage`, `paths`, `scenery`, `dock`; positions lack `y`).

- [ ] **Step 2: Build the growth into the model.** In `apps/web/src/scene/model/scene-model.ts`:

Imports become:

```ts
import {
  type DecorationType,
  type Hex,
  hexScale,
  isDecorationType,
  islandRadius,
  type LandmarkType,
  type WorldDto,
} from '@archipelago/shared'
import { islandOccupied } from '../../world/selectors'
import { hexToWorld, islandExtent, type Point, type Spot } from './hex-space'
import { type Dock, islandGrowth, pathHexes, type SceneryPiece } from './island-growth'
import { landmarkFor, type Marker, type StructureKind, structureFor } from './state'
import {
  heightAt,
  islandTerrain,
  type Stage,
  stageFor,
  type TerrainTile,
  tileHeights,
} from './terrain'
```

Change `position: Point` to `position: Spot` in `SceneStructure`, `SceneDistrict` and `SceneDecoration` (keep `Point` imported: `origin` still uses it). Add to `SceneIsland`, after `tiles: TerrainTile[]`:

```ts
  /** Growth stage from the island's finished tasks (spec 18.1). */
  stage: Stage
  /** Hexes of the paths to districts with a finished task (spec 18.4). */
  paths: Hex[]
  scenery: SceneryPiece[]
  dock: Dock | null
```

Replace the body of `buildSceneModel` with:

```ts
export function buildSceneModel(world: WorldDto, today: string): SceneModel {
  const prepared = world.projects.map((project) => {
    const milestones = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const buildings = world.buildings.filter((b) => b.projectId === project.id)
    const occupied = islandOccupied(world, project.id)
    const radius = islandRadius(occupied)
    const stage = stageFor(tasks.filter((t) => t.status === 'done').length)
    const paths = pathHexes(
      milestones
        .filter((m) => tasks.some((t) => t.milestoneId === m.id && t.status === 'done'))
        .map((m) => ({ q: m.districtQ, r: m.districtR })),
    )
    const tiles = islandTerrain(project.islandSeed, radius, stage, paths)
    return { project, milestones, tasks, buildings, occupied, radius, stage, paths, tiles }
  })
  // Slots are one hex apart; scaling them by the largest island's diameter plus a gap means no
  // two islands can touch, however big one grows.
  const largest = prepared.reduce((max, p) => Math.max(max, p.radius), 0)
  const spacing = 2 * largest + ISLAND_GAP

  const islands = prepared.map(
    ({ project, milestones, tasks, buildings, occupied, radius, stage, paths, tiles }) => {
      const heights = tileHeights(tiles)
      const spot = (h: Hex): Spot => ({ ...hexToWorld(h), y: heightAt(heights, h) })
      const growth = islandGrowth({ seed: project.islandSeed, radius, stage, tiles, occupied, paths })
      const island: SceneIsland = {
        projectId: project.id,
        name: project.name,
        slot: { q: project.archipelagoX, r: project.archipelagoY },
        seed: project.islandSeed,
        origin: hexToWorld(hexScale({ q: project.archipelagoX, r: project.archipelagoY }, spacing)),
        radius,
        tiles,
        stage,
        paths,
        scenery: growth.scenery,
        dock: growth.dock,
        districts: milestones.map((m) => ({
          milestoneId: m.id,
          name: m.name,
          ...landmarkFor(
            m,
            tasks.filter((t) => t.milestoneId === m.id),
          ),
          position: spot({ q: m.districtQ, r: m.districtR }),
        })),
        structures: tasks.map((t) => ({
          taskId: t.id,
          milestoneId: t.milestoneId,
          ...structureFor(t, today),
          position: spot({ q: t.plotX, r: t.plotY }),
        })),
        decorations: buildings.flatMap((b): SceneDecoration[] =>
          isDecorationType(b.type)
            ? [
                {
                  buildingId: b.id,
                  type: b.type,
                  position: spot({ q: b.plotX, r: b.plotY }),
                  rotation: b.rotation,
                },
              ]
            : [],
        ),
      }
      return island
    },
  )
  return { islands, bounds: boundsOf(islands) }
}
```

Keep the existing `buildSceneModel` doc comment and the `DecorationType`/`LandmarkType` usages as they are.

- [ ] **Step 3: Floats above the structure's own height.** In `apps/web/src/scene/model/reward-motion.ts`, in `floatAnchor`, change `y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE` to `y: spot.y + FLOAT_ABOVE_STRUCTURE` (the island-centre branch keeps `LAND_HEIGHT + FLOAT_ABOVE_ISLAND`: the plaza is always flat). In `reward-motion.test.ts`, test `'above the target when its island is focused…'`, replace the two `y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE` with `y: (betaIsland.structures[0]?.position.y ?? Number.NaN) + FLOAT_ABOVE_STRUCTURE` (task) and `y: (betaIsland.decorations[0]?.position.y ?? Number.NaN) + FLOAT_ABOVE_STRUCTURE` (pine).

Run: `cd apps/web && bunx vitest run src/scene/model` — Expected: PASS.

- [ ] **Step 4: Failing render tests.** In `apps/web/src/scene/world-contents.test.tsx`:

Add `import { heightAt, tileHeights } from './model/terrain'` (keep the `hex-space` import), and add below `instanceCount`:

```ts
/** The height of `plot`'s tile on `projectId`'s island in `world`. */
function landAt(world: WorldDto, projectId: string, plot: { q: number; r: number }): number {
  const island = buildSceneModel(world, today).islands.find((i) => i.projectId === projectId)
  if (!island) throw new Error('no island')
  return heightAt(tileHeights(island.tiles), plot)
}
```

Replace every remaining `LAND_HEIGHT` expectation with the tile height:
- `'placed decorations stand on their plot…'`: `.setPosition(at.x, landAt(world, beta.id, plot), at.z)`.
- `'a decoration tap on the focused island selects it…'`: `expect(y).toBeCloseTo(landAt(world, beta.id, { q: 0, r: 1 }))`.
- `'the ghost stands on its plot…'`: `expect(ghost.props.position).toEqual([at.x, landAt(world, beta.id, plot), at.z])`.

Append inside `describe('decorations and placement', …)`:

```ts
  test('on a hilly island, structures, the ring, plot glow and ghost stand on their own tiles', async () => {
    const hill = fakeProject({ name: 'Hill', islandSeed: 11, archipelagoX: 0, archipelagoY: 0 })
    const plots = [1, 2].flatMap((r) => hexRing({ q: 0, r: 0 }, r))
    const tasks = plots.slice(0, 12).map((h) =>
      fakeTask({ projectId: hill.id, status: 'done', size: 'M', plotX: h.q, plotY: h.r }),
    )
    const hilly: WorldDto = { projects: [hill], milestones: [], tasks, buildings: [], economy }
    const free = [3].flatMap((r) => hexRing({ q: 0, r: 0 }, r))
    const ys = tasks.map((t) => landAt(hilly, hill.id, { q: t.plotX, r: t.plotY }))
    // Stage 2 hills: some of these tiles must be raised, or the test proves nothing.
    expect(ys.some((y) => y > LAND_HEIGHT)).toBe(true)

    const { renderer } = await render(hilly, { kind: 'island', projectId: hill.id }, null, {
      placement: { projectId: hill.id, plots: free, ghost: { type: 'well', plot: free[0] ?? { q: 3, r: 0 } } },
    })
    const island = one(renderer.scene, `island:${hill.id}`)
    const yAt = (name: string, i: number) => {
      const m = new THREE.Matrix4()
      ;(one(island, name).instance as THREE.InstancedMesh).getMatrixAt(i, m)
      return new THREE.Vector3().setFromMatrixPosition(m).y
    }
    ys.forEach((y, i) => {
      expect(yAt('house', i)).toBeCloseTo(y)
      expect(yAt('shadow', i)).toBeCloseTo(y)
    })
    free.forEach((h, i) => {
      expect(yAt('plot', i)).toBeCloseTo(landAt(hilly, hill.id, h))
    })
    const ghost = one(renderer.scene, 'ghost')
    expect((ghost.props.position as number[])[1]).toBeCloseTo(
      landAt(hilly, hill.id, free[0] ?? { q: 3, r: 0 }),
    )

    const selected = await render(hilly, { kind: 'island', projectId: hill.id }, tasks[0]?.id ?? null)
    const ring = one(selected.renderer.scene, 'selection')
    expect((ring.props.position as number[])[1]).toBeCloseTo(ys[0] ?? Number.NaN)
  })
```

Add `hexRing` to the `@archipelago/shared` import. Size `M` done tasks render as `house` (see `structureFor`); if `structureFor` maps `M` to another kind, use that kind's name. If seed 11 raises none of the twelve tiles, pick another seed and say so in your report.

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx` — Expected: FAIL (structures still at `LAND_HEIGHT`; plot and ghost too).

- [ ] **Step 5: Stand everything on its tile.**

`apps/web/src/scene/model-instances.tsx`: import `type Spot` (not `LAND_HEIGHT, type Point`) from `./model/hex-space`; `function compose(p: Spot, …)` ends `return matrix.setPosition(p.x, p.y, p.z)`; prop `points: readonly Spot[]`.

`apps/web/src/scene/crane-jibs.tsx`: import `type Spot` instead of `LAND_HEIGHT, type Point`; prop `points: readonly Spot[]`; `matrix.setPosition(p.x + JIB_PIVOT[0], p.y + JIB_PIVOT[1], p.z + JIB_PIVOT[2])`.

`apps/web/src/scene/landmark.tsx`: drop the `LAND_HEIGHT` import; `position={[district.position.x, district.position.y, district.position.z]}`.

`apps/web/src/scene/labels.tsx`: the district label becomes `position={[island.origin.x + d.position.x, d.position.y + 2.2, island.origin.z + d.position.z]}`; the island label keeps `LAND_HEIGHT + 1.6` (the plaza is flat).

`apps/web/src/scene/island.tsx`:
- Imports: `hexKey` from `@archipelago/shared`; `hexToWorld, type Spot` from `./model/hex-space` (drop `LAND_HEIGHT`); `heightAt, tileHeights` from `./model/terrain`.
- The terrain memo keys on the stage and paths too:

```ts
  const pathKey = island.paths.map(hexKey).join(';')
  // A refetch builds fresh tiles with the same content; seed, radius, stage and paths decide them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these four determine the tiles
  const terrain = useMemo(
    () => islandGeometry(island.tiles, island.radius),
    [island.seed, island.radius, island.stage, pathKey],
  )
```

- Heights for plots and the ghost:

```ts
  const heights = useMemo(() => tileHeights(island.tiles), [island.tiles])
  const plotPoints = useMemo(
    (): Spot[] => placement?.plots.map((h) => ({ ...hexToWorld(h), y: heightAt(heights, h) })) ?? [],
    [placement?.plots, heights],
  )
```

(replacing the old `plotPoints` memo).
- Selection ring: `position={[selected.position.x, selected.position.y, selected.position.z]}`.
- Ghost: `<Ghost type={placement.ghost.type} plot={placement.ghost.plot} y={heightAt(heights, placement.ghost.plot)} />`, and in `Ghost` take `y: number` and use `position={[at.x, y, at.z]}`.

- [ ] **Step 6: The stage reaches the scene from the app.** In `apps/web/src/layout/world-scene-integration.test.tsx`, add to the stub's `data-testid="scene"` element: `data-stages={model.islands.map((i) => i.stage).join(',')}`. Append to the main `describe`:

```ts
  test('finishing the task that crosses a growth threshold reaches the scene as a new stage', async () => {
    const beta = fakeProject({ name: 'Beta' })
    const tasks = [
      fakeTask({ projectId: beta.id, status: 'done', plotX: 1, plotY: 0 }),
      fakeTask({ projectId: beta.id, status: 'done', plotX: 2, plotY: 0 }),
      fakeTask({ projectId: beta.id, title: 'Third', status: 'doing', plotX: 3, plotY: 0 }),
    ]
    const { api } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks, buildings: [] },
    })
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    expect(await screen.findByTestId('scene')).toHaveAttribute('data-stages', '0')
    await user.click(await screen.findByRole('button', { name: 'Mark "Third" as done' }))
    await waitFor(() => expect(screen.getByTestId('scene')).toHaveAttribute('data-stages', '1'))
  })
```

- [ ] **Step 7: Run and commit.** `bun run --cwd apps/web test` and `bun run typecheck` — Expected: all pass, 4/4. Any other test that fails because a position now has `y` (a `toEqual` against `hexToWorld(...)`) gets the same `spotOf`/`landAt` treatment; list each one in your report.

```bash
git add apps/web/src
git commit -m "feat(web): stand everything on its hill and carry island growth in the scene model"
```

---

### Task 4: Scenery models and the archipelago-wide scenery layer

**Files:**
- Create: `apps/web/src/scene/models/scenery.ts`
- Modify: `apps/web/src/scene/models/models.test.ts`
- Create: `apps/web/src/scene/scenery.tsx`, `apps/web/src/scene/scenery.test.tsx`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`, `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Consumes: `SceneIsland.scenery`, `SceneIsland.dock`, `SceneIsland.stage` (Task 3); `SCENERY_TYPES`, `SceneryType` (Task 2); `useStableShores` (`scene/use-stable-shores.ts`); `hashString` (`model/random.ts`).
- Produces: `type SceneryKind = SceneryType | 'dock'`, `SCENERY_KINDS`, `sceneryGeometry(kind): THREE.BufferGeometry` in `models/scenery.ts`.
- Produces: `SceneryLayer` props `{ islands: readonly SceneIsland[]; lowTier: boolean; animate: boolean; onGrowth?: (running: boolean) => void }` — meshes named `scenery:<kind>`. `animate` and `onGrowth` are accepted but unused until Task 5.
- Produces: `WorldContentsProps` gains `lowTier?: boolean` (default false) and `onGrowth?: (running: boolean) => void`.

- [ ] **Step 1: Failing model tests.** In `apps/web/src/scene/models/models.test.ts` add `import { SCENERY_KINDS, sceneryGeometry } from './scenery'` and `import { decorationBuilders } from './decorations'` (if not already imported), then append:

```ts
describe('scenery models', () => {
  const triangles = (g: THREE.BufferGeometry) =>
    (g.index ? g.index.count : g.getAttribute('position').count) / 3
  const height = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox()
    const b = g.boundingBox ?? new THREE.Box3()
    return b.max.y - b.min.y
  }

  test.each(SCENERY_KINDS)('%s is palette-coloured and cached', (kind) => {
    expectPaletteColoured(sceneryGeometry(kind))
    expect(sceneryGeometry(kind)).toBe(sceneryGeometry(kind))
  })

  test.each(SCENERY_KINDS.filter((k) => k !== 'dock'))('%s is small and light', (kind) => {
    const g = sceneryGeometry(kind)
    g.computeBoundingBox()
    const box = g.boundingBox ?? new THREE.Box3()
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
    for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
      // A cluster offset of 0.55 plus this stays inside the hex at the largest scale (1.2).
      expect(Math.abs(v) * 1.2).toBeLessThanOrEqual(0.3)
    }
    expect(triangles(g)).toBeGreaterThanOrEqual(12)
    expect(triangles(g)).toBeLessThanOrEqual(40)
  })

  test('the tallest scenery tree stays under 0.6 of the shop pine', () => {
    expect(height(sceneryGeometry('tree')) * 1.2).toBeLessThanOrEqual(
      0.6 * height(modelGeometry('pine')),
    )
  })

  test('the dock reaches out along +x from its shore hex', () => {
    const g = sceneryGeometry('dock')
    g.computeBoundingBox()
    const box = g.boundingBox ?? new THREE.Box3()
    expect(box.max.x).toBeGreaterThan(1)
    expect(box.min.x).toBeGreaterThanOrEqual(-0.1)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/models/models.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 2: Models.** Create `apps/web/src/scene/models/scenery.ts`:

```ts
import type * as THREE from 'three'
import { SCENERY_TYPES, type SceneryType } from '../model/island-growth'
import { box, cone, merge, part, prism } from './build'

export type SceneryKind = SceneryType | 'dock'
export const SCENERY_KINDS: readonly SceneryKind[] = [...SCENERY_TYPES, 'dock']

/**
 * Small, muted pieces with their base on y=0, centred on x/z (spec 18.2). The tree stays well
 * under the shop pine; the dock's deck runs along +x from the shore hex's centre.
 */
const builders: Record<SceneryKind, () => THREE.BufferGeometry[]> = {
  tree: () => [
    part(prism(0.03, 0.04, 0.12, 5), 'woodDark'),
    part(cone(0.15, 0.24, 5), 'foliage', [0, 0.1, 0]),
  ],
  bush: () => [
    part(prism(0.09, 0.13, 0.12, 5), 'foliage'),
    part(prism(0.05, 0.08, 0.08, 5), 'foliage', [0.1, 0, 0.06]),
  ],
  rock: () => [part(prism(0.08, 0.14, 0.12, 5), 'rock')],
  flowers: () => [
    part(box(0.03, 0.08, 0.03), 'foliage'),
    part(box(0.07, 0.03, 0.07), 'petal', [0, 0.08, 0]),
    part(box(0.06, 0.03, 0.06), 'petal', [0.09, 0, 0.05]),
  ],
  grass: () => [
    part(cone(0.03, 0.16, 3), 'foliageDry'),
    part(cone(0.03, 0.12, 3), 'foliageDry', [0.05, 0, 0.03]),
    part(cone(0.03, 0.14, 3), 'foliageDry', [-0.04, 0, 0.04]),
  ],
  reeds: () => [
    part(cone(0.02, 0.26, 3), 'foliage'),
    part(cone(0.02, 0.2, 3), 'foliage', [0.05, 0, -0.03]),
    part(cone(0.02, 0.23, 3), 'foliage', [-0.04, 0, 0.04]),
  ],
  driftwood: () => [
    part(box(0.3, 0.05, 0.06), 'driftwood'),
    part(box(0.14, 0.04, 0.05), 'driftwood', [0.06, 0.03, 0.05], 0.6),
  ],
  dock: () => [
    part(box(1.4, 0.06, 0.4), 'wood', [0.7, 0, 0]),
    ...[0.5, 1.3].flatMap((x) =>
      [-0.15, 0.15].map((z) => part(box(0.06, 0.8, 0.06), 'woodDark', [x, -0.8, z])),
    ),
  ],
}

const cache = new Map<SceneryKind, THREE.BufferGeometry>()

/** Shared per kind; never disposed. */
export function sceneryGeometry(kind: SceneryKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}
```

The dock's posts reach below y=0 on purpose (into the shallows); the dock is exempt from the y ≥ 0 check. If a piece misses its triangle band (12–40), adjust its side counts, not the test.

Run: `cd apps/web && bunx vitest run src/scene/models/models.test.ts` — Expected: PASS.

- [ ] **Step 3: Failing layer tests.** Create `apps/web/src/scene/scenery.test.tsx`:

```ts
import { hexRing } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { SCENERY_KINDS } from './models/scenery'
import { SceneryLayer } from './scenery'

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

const plots = [1, 2, 3].flatMap((r) => hexRing({ q: 0, r: 0 }, r))

/** Two islands with `done` finished tasks each, ids p0 and p1. */
function modelWith(done: number): SceneModel {
  const projects = [0, 1].map((i) =>
    fakeProject({ id: `p${i}`, islandSeed: 40 + i, archipelagoX: i, archipelagoY: 0 }),
  )
  const tasks = projects.flatMap((p) =>
    plots.slice(0, done).map((h) =>
      fakeTask({ projectId: p.id, status: 'done', plotX: h.q, plotY: h.r }),
    ),
  )
  return buildSceneModel(
    { projects, milestones: [], tasks, buildings: [], economy: quietEconomy },
    '2026-10-08',
  )
}

const meshes = (r: Renderer) =>
  r.scene.findAll((n) => String(n.props.name).startsWith('scenery:'))
const countOf = (r: Renderer, kind: string) =>
  meshes(r)
    .filter((n) => n.props.name === `scenery:${kind}`)
    .reduce((sum, n) => sum + (n.instance as THREE.InstancedMesh).count, 0)
const versions = (r: Renderer) =>
  meshes(r).map((n) => (n.instance as THREE.InstancedMesh).instanceMatrix.version)
const make = (model: SceneModel, lowTier = false) =>
  ReactThreeTestRenderer.create(
    <SceneryLayer islands={model.islands} lowTier={lowTier} animate={false} />,
  )

describe('SceneryLayer', () => {
  test('one instanced mesh per kind for the whole archipelago, sized to the pieces', async () => {
    const model = modelWith(15)
    const r = await make(model)
    for (const kind of SCENERY_KINDS) {
      expect(meshes(r).filter((n) => n.props.name === `scenery:${kind}`).length).toBeLessThanOrEqual(1)
      const expected =
        kind === 'dock'
          ? model.islands.filter((i) => i.dock).length
          : model.islands.flatMap((i) => i.scenery).filter((p) => p.type === kind).length
      expect(countOf(r, kind)).toBe(expected)
    }
    expect(countOf(r, 'dock')).toBe(2)
  })

  test('instances stand at their island origin plus their local spot, turned and scaled', async () => {
    const model = modelWith(8)
    const r = await make(model)
    const island = model.islands[1]
    const piece = island?.scenery.find((p) => p.type === 'tree')
    if (!island || !piece) throw new Error('no tree on p1')
    const trees = model.islands.flatMap((i) =>
      i.scenery.filter((p) => p.type === 'tree').map((p) => ({ i, p })),
    )
    const index = trees.findIndex(({ p }) => p === piece)
    const m = new THREE.Matrix4()
    ;(meshes(r).find((n) => n.props.name === 'scenery:tree')?.instance as THREE.InstancedMesh).getMatrixAt(index, m)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    m.decompose(position, quaternion, scale)
    expect(position.x).toBeCloseTo(island.origin.x + piece.position.x)
    expect(position.y).toBeCloseTo(piece.position.y)
    expect(position.z).toBeCloseTo(island.origin.z + piece.position.z)
    expect(scale.x).toBeCloseTo(piece.scale)
  })

  test('the low tier draws only the pieces kept on low; docks stay', async () => {
    const model = modelWith(15)
    const r = await make(model, true)
    for (const kind of SCENERY_KINDS.filter((k) => k !== 'dock')) {
      const kept = model.islands.flatMap((i) => i.scenery).filter((p) => p.type === kind && p.low)
      expect(countOf(r, kind)).toBe(kept.length)
    }
    expect(countOf(r, 'dock')).toBe(2)
  })

  test('scenery takes no taps: no handlers, and a ray straight down at a piece hits nothing', async () => {
    const model = modelWith(15)
    const r = await make(model)
    for (const n of meshes(r)) expect(n.props.onClick).toBeUndefined()
    const island = model.islands[0]
    const piece = island?.scenery[0]
    if (!island || !piece) throw new Error('no scenery')
    const ray = new THREE.Raycaster(
      new THREE.Vector3(island.origin.x + piece.position.x, 10, island.origin.z + piece.position.z),
      new THREE.Vector3(0, -1, 0),
    )
    for (const n of meshes(r)) {
      const hits: THREE.Intersection[] = []
      ;(n.instance as THREE.InstancedMesh).raycast(ray, hits)
      expect(hits).toEqual([])
    }
  })

  test('a refetch with the same content leaves the matrices alone; a new stage rewrites them', async () => {
    const r = await make(modelWith(8))
    const before = versions(r)
    await r.update(<SceneryLayer islands={modelWith(8).islands} lowTier={false} animate={false} />)
    expect(versions(r)).toEqual(before)
    await r.update(<SceneryLayer islands={modelWith(15).islands} lowTier={false} animate={false} />)
    expect(versions(r)).not.toEqual(before)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/scenery.test.tsx` — Expected: FAIL, module not found.

- [ ] **Step 4: The layer.** Create `apps/web/src/scene/scenery.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import type { Spot } from './model/hex-space'
import { hashString } from './model/random'
import type { SceneIsland } from './model/scene-model'
import { SCENERY_KINDS, type SceneryKind, sceneryGeometry } from './models/scenery'
import { useStableShores } from './use-stable-shores'

const matrix = new THREE.Matrix4()
const size = new THREE.Vector3()
const noRaycast = () => {}

type Item = { id: string; position: Spot; turn: number; scale: number }

/** What decides an island's pieces: a refetch with the same key must not rebuild them. */
const sceneryKey = (islands: readonly SceneIsland[]) =>
  islands
    .map((i) => {
      const ids = hashString(i.scenery.map((p) => p.id).join('|'))
      const dock = i.dock ? `${i.dock.position.x},${i.dock.position.z}` : '-'
      return `${i.projectId}@${i.origin.x},${i.origin.z}r${i.radius}#${i.stage}:${ids}:${dock}`
    })
    .join(';')

function itemsOf(islands: readonly SceneIsland[], kind: SceneryKind, lowTier: boolean): Item[] {
  return islands.flatMap((island): Item[] => {
    const at = (p: Spot): Spot => ({
      x: island.origin.x + p.x,
      y: p.y,
      z: island.origin.z + p.z,
    })
    if (kind === 'dock') {
      return island.dock
        ? [{ id: `${island.projectId}:dock`, position: at(island.dock.position), turn: island.dock.turn, scale: 1 }]
        : []
    }
    return island.scenery
      .filter((p) => p.type === kind && (!lowTier || p.low))
      .map((p) => ({ id: `${island.projectId}:${p.id}`, position: at(p.position), turn: p.turn, scale: p.scale }))
  })
}

/**
 * Trees, bushes, rocks, flowers, grass, reeds, driftwood and docks on every island (spec 18.5):
 * one instanced mesh per kind for the whole archipelago, placed once per layout and never
 * tappable, so a tap reaches the terrain beneath.
 */
export function SceneryLayer({
  islands,
  lowTier,
}: {
  islands: readonly SceneIsland[]
  lowTier: boolean
  /** The grow-in may run (`high` tier, motion allowed); used from Task 5. */
  animate: boolean
  /** Reports a grow-in starting and ending, for the ticker; used from Task 5. */
  onGrowth?: (running: boolean) => void
}) {
  const stable = useStableShores(islands, sceneryKey)
  const byKind = useMemo(
    () => SCENERY_KINDS.map((kind) => ({ kind, items: itemsOf(stable, kind, lowTier) })),
    [stable, lowTier],
  )
  const meshes = useRef(new Map<SceneryKind, THREE.InstancedMesh>())
  const invalidate = useThree((s) => s.invalidate)

  const write = useCallback(
    (factor: (id: string) => number) => {
      for (const { kind, items } of byKind) {
        const mesh = meshes.current.get(kind)
        if (!mesh) continue
        items.forEach((item, i) => {
          matrix
            .makeRotationY(item.turn)
            .scale(size.setScalar(item.scale * factor(item.id)))
            .setPosition(item.position.x, item.position.y, item.position.z)
          mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }
      invalidate()
    },
    [byKind, invalidate],
  )

  useLayoutEffect(() => write(() => 1), [write])

  return byKind.map(({ kind, items }) =>
    items.length === 0 ? null : (
      <instancedMesh
        // The instance count is fixed at construction; a new count needs a new mesh.
        key={`${kind}:${items.length}`}
        ref={(mesh) => {
          if (mesh) meshes.current.set(kind, mesh)
          else meshes.current.delete(kind)
        }}
        name={`scenery:${kind}`}
        args={[sceneryGeometry(kind), solidMaterial, items.length]}
        raycast={noRaycast}
      />
    ),
  )
}
```

Biome will flag the unused `animate`/`onGrowth` props only if they are destructured; leave them out of the destructuring until Task 5. If Biome formats the long `itemsOf` lines, accept its formatting.

Run: `cd apps/web && bunx vitest run src/scene/scenery.test.tsx` — Expected: PASS.

- [ ] **Step 5: Mount it.** In `apps/web/src/scene/world-contents.tsx`:
- `import { SceneryLayer } from './scenery'`.
- Add to `WorldContentsProps`:

```ts
  /** The `low` quality tier: scenery draws its thinner half (spec 18.2). */
  lowTier?: boolean
  /** A scenery grow-in started (true) or ended (false); keeps the ticker running for it. */
  onGrowth?: (running: boolean) => void
```

- Destructure `lowTier = false, onGrowth,` next to `life = NO_LIFE`.
- After `<AmbientLifeLayer … />` render:

```tsx
      <SceneryLayer
        islands={model.islands}
        lowTier={lowTier}
        animate={seaWave}
        onGrowth={onGrowth}
      />
```

In `apps/web/src/scene/world-scene.tsx` pass `lowTier={quality.tier === 'low'}` to `<WorldContents … />`.

Append to `describe('WorldContents', …)` in `apps/web/src/scene/world-contents.test.tsx`:

```ts
  test('scenery is drawn archipelago-wide, outside the islands, and ignores taps', async () => {
    const { world } = seeded()
    const { renderer } = await render(world, { kind: 'archipelago' })
    const layers = renderer.scene.findAll((n) => String(n.props.name).startsWith('scenery:'))
    expect(layers.length).toBeGreaterThan(0)
    for (const n of layers) expect(n.props.onClick).toBeUndefined()
    const islands = renderer.scene.findAll((n) => String(n.props.name).startsWith('island:'))
    for (const island of islands) {
      expect(island.findAll((n) => String(n.props.name).startsWith('scenery:'))).toHaveLength(0)
    }
  })
```

If the seeded world (stage 0) happens to grow no scenery on either island, add five `done` tasks to `beta` in this test's world before rendering, and say so in your report.

- [ ] **Step 6: Run and commit.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, 4/4, the one known info.

```bash
git add apps/web/src/scene
git commit -m "feat(web): draw island scenery and docks as one instanced layer per kind"
```

---

### Task 5: Grow-in on a stage rise, and the `growth` ticker demand

**Files:**
- Modify: `apps/web/src/scene/scenery.tsx`, `apps/web/src/scene/scenery.test.tsx`
- Modify: `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`
- Modify: `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Consumes: `growEase` (Task 2), `GROW_IN_MS`, `clampDelta` (`scene/tuning.ts`), `SceneryLayer` (Task 4).
- Produces: `TickerDemand.growth: boolean` (a scenery grow-in is running).

Behaviour (spec 18.5):
- When an island's stage rises while the layer is mounted and `animate` is true, the pieces it did not have before scale from 0 to their scale over `GROW_IN_MS` with `growEase`. `onGrowth(true)` fires when that starts and `onGrowth(false)` when it ends.
- The first mount, a stage drop, a same-stage refetch and any change while `animate` is false never grow anything in; new pieces simply appear.
- If `animate` turns false mid grow-in, every piece snaps to full size and `onGrowth(false)` fires. Unmounting mid grow-in also fires `onGrowth(false)`.
- The grow-in's clock starts on its first frame (that frame's delta is the idle gap before the ticker woke, not grow time), like the reward pop in `model-instances.tsx`.

- [ ] **Step 1: Failing ticker test.** In `apps/web/src/scene/ticker.test.ts` add `growth: false,` to the `still` demand, `'growth'` to the key list in `'runs while anything moves…'`, and `growth: true,` to the reduced-motion case.

Run: `cd apps/web && bunx vitest run src/scene/ticker.test.ts` — Expected: FAIL (type error / `growth` ignored).

- [ ] **Step 2: Ticker demand.** In `apps/web/src/scene/ticker.ts` add to `TickerDemand`:

```ts
  /** New scenery is growing in after a stage rise (`high` tier, spec 18.5). */
  growth: boolean
```

and make `tickerWanted` return `d.animate && (d.seaWave || d.cranes || d.effects || d.camera || d.life || d.growth)`.

In `apps/web/src/scene/world-scene.tsx`: `const [growing, setGrowing] = useState(false)`; add `growth: growing` to the `tickerWanted({ … })` call; pass `onGrowth={setGrowing}` to `<WorldContents … />`.

Run: `cd apps/web && bunx vitest run src/scene/ticker.test.ts` — Expected: PASS.

- [ ] **Step 3: Failing grow-in tests.** Append to `apps/web/src/scene/scenery.test.tsx` (add `vi` to the vitest import, and `GROW_IN_MS` from `./tuning`):

```ts
describe('SceneryLayer grow-in', () => {
  /** The smallest instance scale across every scenery mesh, relative to its piece's own scale. */
  function smallest(r: Renderer): number {
    let min = Number.POSITIVE_INFINITY
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    for (const n of meshes(r)) {
      const mesh = n.instance as THREE.InstancedMesh
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m)
        min = Math.min(min, s.setFromMatrixScale(m).x)
      }
    }
    return min
  }
  const layer = (model: SceneModel, animate: boolean, onGrowth = vi.fn(), lowTier = false) => (
    <SceneryLayer islands={model.islands} lowTier={lowTier} animate={animate} onGrowth={onGrowth} />
  )
  const FULL = 0.79 // just under the smallest piece scale (0.8)
  const frames = Math.ceil(GROW_IN_MS / 100) + 2

  test('the first mount appears at full size and never asks for frames', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('a stage rise grows the new pieces in from nothing, then settles and releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    expect(onGrowth).toHaveBeenLastCalledWith(true)
    expect(smallest(r)).toBeLessThan(0.01)
    await r.advanceFrames(1, 0.1) // the first frame only starts the clock
    await r.advanceFrames(2, 0.1)
    const mid = smallest(r)
    expect(mid).toBeGreaterThan(0.01)
    expect(mid).toBeLessThan(FULL)
    await r.advanceFrames(frames, 0.1)
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).toHaveBeenLastCalledWith(false)
  })

  test('without animation a stage rise just shows the new pieces', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), false, onGrowth))
    await r.update(layer(modelWith(15), false, onGrowth))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('a stage drop removes pieces with no grow-in', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(15), true, onGrowth))
    const before = countOf(r, 'tree') + countOf(r, 'flowers') + countOf(r, 'grass')
    await r.update(layer(modelWith(8), true, onGrowth))
    const after = countOf(r, 'tree') + countOf(r, 'flowers') + countOf(r, 'grass')
    expect(after).toBeLessThan(before)
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('losing animation mid grow-in snaps everything to full size and releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    await r.advanceFrames(2, 0.1)
    expect(smallest(r)).toBeLessThan(FULL)
    await r.update(layer(modelWith(15), false, onGrowth, true))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).toHaveBeenLastCalledWith(false)
    await r.advanceFrames(3, 0.1)
    expect(smallest(r)).toBeGreaterThan(FULL)
  })

  test('unmounting mid grow-in releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    await r.unmount()
    expect(onGrowth).toHaveBeenLastCalledWith(false)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/scenery.test.tsx` — Expected: the new grow-in tests FAIL.

- [ ] **Step 4: Grow-in.** In `apps/web/src/scene/scenery.tsx`:
- Imports: `useFrame` from `@react-three/fiber`; `useEffect` from `react`; `growEase` from `./model/island-growth`; `clampDelta, GROW_IN_MS` from `./tuning`.
- Destructure `animate` and `onGrowth` in `SceneryLayer` and drop the "used from Task 5" doc lines.
- Replace `useLayoutEffect(() => write(() => 1), [write])` with:

```tsx
  // Ids present at the last layout, per island stage: a stage rise grows in what is new.
  const seen = useRef<{ stages: Map<string, number>; ids: Set<string> } | null>(null)
  const growing = useRef<{ ids: Set<string>; elapsed: number; fresh: boolean } | null>(null)
  const report = useRef(onGrowth)
  report.current = onGrowth
  const factorOf = useCallback((id: string) => {
    const g = growing.current
    return g?.ids.has(id) ? growEase(g.elapsed / GROW_IN_MS) : 1
  }, [])

  // Runs before the write below in the same commit, so new pieces are first drawn at scale 0.
  useLayoutEffect(() => {
    const ids = new Set(stable.flatMap((i) => i.scenery.map((p) => `${i.projectId}:${p.id}`)))
    const stages = new Map(stable.map((i) => [i.projectId, i.stage]))
    const before = seen.current
    seen.current = { stages, ids }
    if (!before || !animate) return
    const fresh = stable
      .filter((i) => i.stage > (before.stages.get(i.projectId) ?? i.stage))
      .flatMap((i) => i.scenery.map((p) => `${i.projectId}:${p.id}`))
      .filter((id) => !before.ids.has(id))
    if (fresh.length === 0) return
    growing.current = { ids: new Set(fresh), elapsed: 0, fresh: true }
    report.current?.(true)
  }, [stable, animate])

  useLayoutEffect(() => write(factorOf), [write, factorOf])

  // Losing animation mid grow-in (tier drop, reduced motion) snaps everything to full size.
  useLayoutEffect(() => {
    if (animate || !growing.current) return
    growing.current = null
    report.current?.(false)
    write(factorOf)
  }, [animate, write, factorOf])

  useEffect(
    () => () => {
      if (growing.current) report.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const g = growing.current
    if (!g || !animate) return
    g.elapsed = Math.min(GROW_IN_MS, g.elapsed + (g.fresh ? 0 : clampDelta(delta) * 1000))
    g.fresh = false
    write(factorOf)
    if (g.elapsed < GROW_IN_MS) return
    growing.current = null
    report.current?.(false)
  })
```

Note the detection effect lists `animate` as a dependency: when `animate` flips, it re-records `seen` from the current layout and finds nothing new, which is correct. A grow-in that starts while another runs replaces it; pieces of the earlier one then draw at full size.

Run: `cd apps/web && bunx vitest run src/scene/scenery.test.tsx src/scene/ticker.test.ts` — Expected: PASS.

- [ ] **Step 5: Run and commit.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, 4/4, the one known info.

```bash
git add apps/web/src/scene
git commit -m "feat(web): grow new scenery in after a stage rise, ticking only while it grows"
```

---

### Task 6: Gate, device check and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (only if a ruling during execution changed a spec value)

- [ ] **Step 1: Full gate from the root.**

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Expected: web and API suites pass; typecheck 4/4; lint at the one known info; build succeeds.

- [ ] **Step 2: three.js stays in the scene chunk.** After the build:

```bash
grep -l "WebGLRenderer" apps/web/dist/assets/*.js
grep -rln "from 'three'\|@react-three" apps/web/src/world apps/web/src/layout apps/web/src/app apps/web/src/rewards apps/web/src/economy apps/web/src/shop
grep -rn "from '\.\./models\|from '\./models\|scene/models" apps/web/src/scene/model
```

Expected: the first lists exactly one file (the world-scene chunk); the second and third print nothing.

- [ ] **Step 3: Spec sync.** If any task ruled a value away from spec section 18 (a fill rate, a hill cap, a model size), amend section 18 to match and commit with `docs: …`. Otherwise skip.

- [ ] **Step 4: Owner's device check (manual, not for agents).** Hand off to the owner: open the app on the phone with `?perf`, pan the archipelago and an island on both tiers. Exit criteria (spec 18.7): draw calls at most 8 above the 5c reading; no drop from `high` to `low` attributable to 5d; a visual pass on desktop and phone. Constants in the "Island growth" tuning block are tuned from those readings in a follow-up.
