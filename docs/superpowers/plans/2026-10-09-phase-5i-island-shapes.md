# Phase 5i Island Shapes and District Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every island a seeded silhouette (footprint, coast, relief) that decides its land and where things are placed, and draw a gold ring along the outer edges of the focused district's tiles.

**Architecture:**
- **Tasks 1–2:** pure shared code. A shape genome and a hex land model go in `packages/shared/src/island-shape.ts`, and every placement rule moves to seed-aware functions in `packages/shared/src/land.ts`. The API and the web app call these.
- **Task 3:** the web terrain draws that land, with zones by depth to the sea and one of four relief profiles.
- **Task 4:** the shallows, foam, sea shading and island camera follow the coast instead of a disc.
- **Tasks 5–6:** the district ring. A pure tile, outline and mitre model, a ribbon geometry, a small shader, and a component that draws on, fades and swaps with the route.

**Tech Stack:** Bun 1.4 (shared and API tests use `bun:test`), TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5 with `@react-three/test-renderer` 9.1 (web), Drizzle/Postgres (API).

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`, section 24.

## Global Constraints

- **Formatting:** Biome, with single quotes, no semicolons and line width 100. `bun run lint` must stay at the one known info. Format with `bunx biome check --write <files>`.
- **TypeScript:** strict, with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for types).
- **three.js boundaries:** three.js stays only in the lazy world-scene chunk. `scene/model/*`, `scene/tuning.ts` and `packages/shared` are three-free.
- **Database:** it is reset for this phase. There is no migration, no legacy disc path and no schema change, and DTOs are unchanged.
- **Values, verbatim:**
  - `MIN_ISLAND_SIZE = 4`, `MAX_ISLAND_SIZE = 60`, `MIN_INTERIOR = 19`, `SHORE_RINGS = 2`. `DISTRICT_SPACING = 5` is unchanged.
  - Footprint weights: round 1, oval 1.2, elongated 1.2, crescent 1, lobed 1.2, spiral 0.8, irregular 1.2.
  - `RELIEF_FACTOR = { flattened: 0.5, spherical: 1, conical: 1.5, cylindrical: 1 }`.
  - `DISTRICT_RING_WIDTH = 0.15`, `DISTRICT_RING_INSET = 0.05`, `DISTRICT_RING_LIFT = 0.02`.
  - `CLOUD_MS = 600` is reused for the ring.
- **Commits:** conventional messages, with no AI attribution and no `Co-Authored-By` trailer. Check that `git branch --show-current` prints `phase-5i-island-shapes` before every commit.
- **Commands:**
  - shared: `cd packages/shared && bun test <file>`;
  - API: `cd apps/api && bun test <file>`;
  - web: `cd apps/web && bunx vitest run <file>`;
  - the gate, from the repo root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.
- **Green commits:** every commit leaves the full suite green. If the API suite times out under machine load (`seedDemoWorld`), re-run it once and report both runs.

## Spec refinements made while planning (ledger them as rulings)

1. **Core rings.** Rings 0–3 are always land at size ≥ 4, so the centre and ring 1 are always interior (24.1 said "centre and ring 1 always land"). The forced core is `min(3, size − 1)` rings, so the size-1 uncharted island stays tiny.
2. **Minimum interior.** `islandSize` also requires `MIN_INTERIOR` (19) interior hexes, the old radius-4 disc's interior. Without it a thin footprint could be born with almost no buildable land.
3. **Land only grows.** Land at a size is the union of the shape's hexes at every whole size from `MIN_ISLAND_SIZE` up to it. Crescents, spirals and lobes are not star-shaped, so plain scaling could drop land as an island grows.
4. **No `sizeNeeded`.**
   - `nextDistrictCenter` steps the size up from the current one and takes the first free lattice spot that is interior, in spiral order. That is the same result as "smallest needed size, ties by spiral order" without a per-hex search.
   - Both `nextDistrictCenter` and `nearestFreePlot` take `occupied: Hex[]`, not a taken-key set.
   - `MAX_ISLAND_SIZE` is only the loop cap.
5. **Footprint area.** Each footprint is scaled (`norm`) so that its area at unit size equals a unit disc's, which keeps sizes comparable across footprints.
6. **Conical relief.** Height rises linearly with depth, so a long island gets a ridge rather than a single point peak.
7. **Dock facing.** The dock faces its missing neighbour closest to the outward radial direction (60° steps), not an average of directions.
8. **`SceneIsland` fields.** It gains `size`, `coast`, `rim`, `shallows` and `box`. It does not carry the `IslandShape` (YAGNI).
9. **Foam follows the rim.** The foam band runs along the outer sides of the shallows hexes instead of a disc. The spec did not mention foam, and a disc band would float in open water around a long island. Task 4 adds a line to spec 24.4.
10. **Ring shading.** The ring is a transparent `ShaderMaterial` (`uReveal`, `uOpacity`) with depth test on and depth write off, so it can draw on and fade. The spec said "opaque". It renders at full opacity when idle.

## Review Focus

1. **A district whose tasks sit in two separate patches.** Two loops, each closed, neither crossing the other. Pinned in Task 5 (detached plot → second loop).
2. **A district with no tasks yet.** One hexagon round its landmark, not nothing and not an error. Pinned in Task 5 (`districtTiles` returns the landmark alone, and `ringLoops` gives one loop of 6).
3. **A refetch that changes only a hill height under the ring** (a stage rise). The ring rebuilds at the new height without animating. Pinned in Task 6 (the key includes heights).
4. **Leaving a district mid draw-on.** The ring fades from where it is and releases the ticker at the end. Pinned in Task 6.
5. **A building placed on a shore hex, or past the coast, of a non-round island.** The API refuses it with `validation_failed`. Pinned in Task 2 (API test using a shore hex taken from `islandLand`).

---

### Task 1: Shared shape model

**Files:**
- Create: `packages/shared/src/random.ts`, `packages/shared/src/random.test.ts`, `packages/shared/src/island-shape.ts`, `packages/shared/src/island-shape.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/land.ts` (`SHORE_RINGS` moves out), `apps/web/src/scene/model/random.ts` (becomes a re-export)

**Interfaces:**
- Consumes: `COMMONS_CENTER`, `HEX_DIRECTIONS`, `Hex`, `hexDistance`, `hexKey`, `hexRing` from `packages/shared/src/hex.ts`.
- Produces (all exported from `@archipelago/shared`):
  - Random helpers: `mulberry32(seed): () => number`, `hashInts(...values: number[]): number`, `hashString(s: string): number`.
  - Shape lists and types: `FOOTPRINTS`, `Footprint`, `COASTS`, `Coast`, `RELIEFS`, `Relief`, `FOOTPRINT_WEIGHTS`.
  - Constants: `MIN_ISLAND_SIZE` (4), `MAX_ISLAND_SIZE` (60), `MIN_INTERIOR` (19), `SHORE_RINGS` (2).
  - `type IslandShape = { footprint; coast; relief; symmetric: boolean; angle: number; distance: (p: { x: number; y: number }) => number; norm: number; extent: number }`.
  - `islandShape(seed): IslandShape` (memoised).
  - `type IslandLand = { size: number; land: Hex[]; interior: ReadonlySet<string>; depth: ReadonlyMap<string, number>; radius: number }`.
  - `islandLand(seed, size): IslandLand` (memoised).
  - `islandSize(seed, occupied: readonly Hex[]): number`.

The controller ran this code in a scratch copy of `packages/shared`: all 83 shared tests passed in 2.3 s, and the tree typechecked. A simulation of 200 seeds, each built out with 4 loose tasks, 5 districts of 8 tasks and 5 decorations, put every hex on interior. Land only grew. The largest size reached was 11.

- [ ] **Step 1: Move the random helpers.** Create `packages/shared/src/random.ts` with exactly the current content of `apps/web/src/scene/model/random.ts`:

```ts
/** mulberry32: a tiny deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An unsigned 32-bit hash of integers, for seeding `mulberry32` from grid cells or indices. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x27d4eb2d)
    h ^= h >>> 15
  }
  return h >>> 0
}

/** FNV-1a of a string, for seeding from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
```

Replace the whole of `apps/web/src/scene/model/random.ts` with:

```ts
// The seeded helpers live in shared now: the API and the web must agree on island shapes.
export { hashInts, hashString, mulberry32 } from '@archipelago/shared'
```

- [ ] **Step 2: Write the random test** `packages/shared/src/random.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { hashInts, hashString, mulberry32 } from './random'

describe('random', () => {
  test('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(9)
    const b = mulberry32(9)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('hashInts and hashString are unsigned 32-bit and order-sensitive', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1))
    expect(hashInts(1, 2)).toBe(hashInts(1, 2))
    expect(hashString('ab')).not.toBe(hashString('ba'))
    for (const h of [hashInts(-5, 7), hashString('x')]) {
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })
})
```

- [ ] **Step 3: Write the failing shape tests** `packages/shared/src/island-shape.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { COMMONS_CENTER, HEX_DIRECTIONS, type Hex, hexKey, hexRing } from './hex'
import {
  COASTS,
  FOOTPRINTS,
  type IslandShape,
  islandLand,
  islandShape,
  islandSize,
  MIN_INTERIOR,
  MIN_ISLAND_SIZE,
  RELIEFS,
  SHORE_RINGS,
} from './island-shape'

const SEEDS = Array.from({ length: 300 }, (_, i) => i)
const seedWhere = (ok: (s: IslandShape) => boolean): number => {
  const seed = SEEDS.find((s) => ok(islandShape(s)))
  if (seed === undefined) throw new Error('no seed matches')
  return seed
}
const neighbours = (h: Hex): Hex[] => HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }))
const cartesian = (h: Hex) => ({ x: h.q + h.r / 2, y: (h.r * Math.sqrt(3)) / 2 })

describe('islandShape', () => {
  test('is deterministic per seed and varies between seeds', () => {
    const a = islandShape(42)
    const { distance: _, ...genome } = a
    expect(genome).toEqual(
      (({ distance: _d, ...g }) => g)(islandShape(42)) as Omit<IslandShape, 'distance'>,
    )
    const genomes = new Set(SEEDS.slice(0, 50).map((s) => JSON.stringify(islandShape(s))))
    expect(genomes.size).toBeGreaterThan(40)
  })

  test('every footprint, coast and relief turns up across seeds 0–299', () => {
    const seen = new Set(
      SEEDS.flatMap((s) => {
        const { footprint, coast, relief } = islandShape(s)
        return [footprint, coast, relief]
      }),
    )
    for (const k of [...FOOTPRINTS, ...COASTS, ...RELIEFS]) expect(seen.has(k)).toBe(true)
  })

  test('symmetric and asymmetric coasts both occur', () => {
    const sym = SEEDS.slice(0, 100).map((s) => islandShape(s).symmetric)
    expect(sym).toContain(true)
    expect(sym).toContain(false)
  })
})

describe('islandLand', () => {
  test('is deterministic and holds the centre and ring 1 as interior at every starting size', () => {
    expect(islandLand(7, 6)).toEqual(islandLand(7, 6))
    for (const seed of SEEDS.slice(0, 200)) {
      const { interior } = islandLand(seed, islandSize(seed, []))
      for (const h of [COMMONS_CENTER, ...hexRing(COMMONS_CENTER, 1)]) {
        expect(interior.has(hexKey(h))).toBe(true)
      }
    }
  })

  test('land is one piece joined to the centre', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const { land } = islandLand(seed, 8)
      const keys = new Set(land.map(hexKey))
      const seen = new Set([hexKey(COMMONS_CENTER)])
      const queue = [COMMONS_CENTER as Hex]
      while (queue.length > 0) {
        for (const n of neighbours(queue.pop() as Hex)) {
          const k = hexKey(n)
          if (keys.has(k) && !seen.has(k)) {
            seen.add(k)
            queue.push(n)
          }
        }
      }
      expect(seen.size).toBe(keys.size)
    }
  })

  test('depth counts steps to the sea; interior is exactly depth above SHORE_RINGS', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { land, depth, interior } = islandLand(seed, 7)
      const keys = new Set(land.map(hexKey))
      for (const h of land) {
        const d = depth.get(hexKey(h)) ?? 0
        const coast = neighbours(h).some((n) => !keys.has(hexKey(n)))
        expect(d === 1).toBe(coast)
        if (d > 1)
          expect(Math.min(...neighbours(h).map((n) => depth.get(hexKey(n)) ?? 0))).toBe(d - 1)
        expect(interior.has(hexKey(h))).toBe(d > SHORE_RINGS)
      }
    }
  })

  test('growing only ever adds land', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (let size = MIN_ISLAND_SIZE; size < 12; size++) {
        const next = new Set(islandLand(seed, size + 1).land.map(hexKey))
        for (const h of islandLand(seed, size).land) expect(next.has(hexKey(h))).toBe(true)
      }
    }
  })

  test('radius is the furthest land ring', () => {
    const { land, radius } = islandLand(3, 9)
    expect(
      Math.max(...land.map((h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2)),
    ).toBe(radius)
  })

  test('an elongated island is at least twice as long as it is wide', () => {
    const seed = seedWhere((s) => s.footprint === 'elongated' && s.coast === 'blunt')
    const { angle } = islandShape(seed)
    const along = islandLand(seed, 10).land.map((h) => {
      const c = cartesian(h)
      return {
        u: c.x * Math.cos(angle) + c.y * Math.sin(angle),
        v: -c.x * Math.sin(angle) + c.y * Math.cos(angle),
      }
    })
    const length = Math.max(...along.map((p) => p.u)) - Math.min(...along.map((p) => p.u))
    const width = Math.max(...along.map((p) => p.v)) - Math.min(...along.map((p) => p.v))
    expect(length).toBeGreaterThan(2 * width)
  })

  test('a crescent leaves its bite as sea', () => {
    const seed = seedWhere((s) => s.footprint === 'crescent' && s.coast === 'blunt')
    const { land, radius } = islandLand(seed, 10)
    // A convex shape of this reach would fill far more of its enclosing ring.
    expect(land.length).toBeLessThan(0.6 * (1 + 3 * radius * (radius + 1)))
  })
})

describe('islandSize', () => {
  test('at least MIN_ISLAND_SIZE with MIN_INTERIOR interior hexes, for every seed', () => {
    for (const seed of SEEDS) {
      const size = islandSize(seed, [])
      expect(size).toBeGreaterThanOrEqual(MIN_ISLAND_SIZE)
      expect(islandLand(seed, size).interior.size).toBeGreaterThanOrEqual(MIN_INTERIOR)
    }
  })

  test('the smallest size whose interior holds every occupied hex', () => {
    const far: Hex = { q: 9, r: -3 }
    const size = islandSize(5, [far])
    expect(islandLand(5, size).interior.has(hexKey(far))).toBe(true)
    if (size > islandSize(5, [])) {
      expect(islandLand(5, size - 1).interior.has(hexKey(far))).toBe(false)
    }
  })

  test('never shrinks as hexes are added', () => {
    const occupied: Hex[] = []
    let last = islandSize(11, occupied)
    for (const h of [
      { q: 4, r: 0 },
      { q: -6, r: 2 },
      { q: 1, r: 1 },
      { q: 0, r: 8 },
    ]) {
      occupied.push(h)
      const now = islandSize(11, occupied)
      expect(now).toBeGreaterThanOrEqual(last)
      last = now
    }
  })
})
```

- [ ] **Step 4: Run the tests and see them fail.** Run `cd packages/shared && bun test src/island-shape.test.ts`. Expected: FAIL, with "Cannot find module './island-shape'".

- [ ] **Step 5: Implement** `packages/shared/src/island-shape.ts`:

```ts
import { COMMONS_CENTER, HEX_DIRECTIONS, type Hex, hexDistance, hexKey, hexRing } from './hex'
import { hashInts, mulberry32 } from './random'

export const FOOTPRINTS = [
  'round',
  'oval',
  'elongated',
  'crescent',
  'lobed',
  'spiral',
  'irregular',
] as const
export type Footprint = (typeof FOOTPRINTS)[number]
export const COASTS = ['straight', 'wavy', 'curved', 'angular', 'pointed', 'blunt'] as const
export type Coast = (typeof COASTS)[number]
export const RELIEFS = ['flattened', 'spherical', 'conical', 'cylindrical'] as const
export type Relief = (typeof RELIEFS)[number]

/** Relative odds of each footprint (spec 24.6). */
export const FOOTPRINT_WEIGHTS: Readonly<Record<Footprint, number>> = {
  round: 1,
  oval: 1.2,
  elongated: 1.2,
  crescent: 1,
  lobed: 1.2,
  spiral: 0.8,
  irregular: 1.2,
}
export const MIN_ISLAND_SIZE = 4
export const MAX_ISLAND_SIZE = 60
/** Interior hexes a new island has at least, whatever its footprint. */
export const MIN_INTERIOR = 19
/** Rings of lower shore around the flat interior. */
export const SHORE_RINGS = 2
/** Rings always land from size 4 up, so the commons centre and ring 1 are always interior. */
const CORE_RINGS = SHORE_RINGS + 1

type P = { x: number; y: number }
type Disc = { x: number; y: number; r: number }

export type IslandShape = {
  footprint: Footprint
  coast: Coast
  relief: Relief
  symmetric: boolean
  /** Radians; turns the whole shape. */
  angle: number
  /** The footprint's signed distance at unit size, coast included; negative inside. */
  distance: (p: P) => number
  /** Unit-size points are multiplied by this so every footprint covers a unit disc's area. */
  norm: number
  /** Furthest land from the centre at unit size, after `norm`. */
  extent: number
}

const SALT = {
  footprint: 11,
  coast: 12,
  relief: 13,
  angle: 14,
  shape: 15,
  edge: 16,
}
const TAU = 2 * Math.PI

const len = (x: number, y: number) => Math.hypot(x, y)

/** Polynomial smooth minimum: blends two distances over `k`. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - (h * h * k) / 4
}

function weighted<K extends string>(weights: Readonly<Record<K, number>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let acc = 0
  for (const [k, w] of entries) {
    acc += w / total
    if (u < acc) return k
  }
  return (entries.at(-1) as [K, number])[0]
}

const pickOf = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length)] as T

/** Smooth value noise in [0, 1) on a unit lattice, seeded. */
function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const c = (dx: number, dy: number) => hashInts(seed, ix + dx, iy + dy) / 4294967296
  const top = c(0, 0) + (c(1, 0) - c(0, 0)) * sx
  const bottom = c(0, 1) + (c(1, 1) - c(0, 1)) * sx
  return top + (bottom - top) * sy
}

function footprintDistance(footprint: Footprint, random: () => number, seed: number) {
  switch (footprint) {
    case 'round':
      return (p: P) => len(p.x, p.y) - 1
    case 'oval': {
      const k = 1.3 + random() * 0.3
      const a = Math.sqrt(k)
      const b = 1 / a
      return (p: P) => (len(p.x / a, p.y / b) - 1) * b
    }
    case 'elongated': {
      const aspect = 2.5 + random()
      const w = Math.sqrt(Math.PI / (4 * (aspect - 1) + Math.PI))
      const half = (aspect - 1) * w
      return (p: P) => len(Math.max(Math.abs(p.x) - half, 0), p.y) - w
    }
    case 'crescent': {
      const outer = 1.3
      const bite = 0.8 + random() * 0.2
      const cut = outer * bite
      const offset = outer * 0.55
      // The arc is thickest opposite the cut; the origin sits mid-way through it.
      const shift = (-outer + (offset - cut)) / 2
      return (p: P) => {
        const y = p.y + shift
        return Math.max(len(p.x, y) - outer, cut - len(p.x, y - offset))
      }
    }
    case 'lobed': {
      const count = 2 + Math.floor(random() * 3)
      const start = random() * TAU
      const lobes: Disc[] = Array.from({ length: count }, (_, i) => {
        const a = start + (i * TAU) / count + (random() - 0.5) * 0.6
        const reach = 0.7 + random() * 0.25
        return {
          x: Math.cos(a) * reach,
          y: Math.sin(a) * reach,
          r: 0.5 + random() * 0.15,
        }
      })
      return (p: P) =>
        lobes.reduce((d, l) => smin(d, len(p.x - l.x, p.y - l.y) - l.r, 0.35), len(p.x, p.y) - 0.6)
    }
    case 'spiral': {
      const turns = 0.75 + random() * 0.5
      const sense = random() < 0.5 ? 1 : -1
      const steps = 40
      const arm: Disc[] = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps
        const a = sense * t * turns * TAU
        const reach = 0.35 + t * 1.15
        return {
          x: Math.cos(a) * reach,
          y: Math.sin(a) * reach,
          r: 0.42 - t * 0.27,
        }
      })
      return (p: P) =>
        arm.reduce((d, s) => smin(d, len(p.x - s.x, p.y - s.y) - s.r, 0.2), len(p.x, p.y) - 0.6)
    }
    case 'irregular': {
      const n = hashInts(seed, SALT.shape, 99)
      return (p: P) => {
        const wx = (valueNoise(n, p.x * 1.4 + 7.1, p.y * 1.4) - 0.5) * 0.9
        const wy = (valueNoise(n + 1, p.x * 1.4, p.y * 1.4 - 3.3) - 0.5) * 0.9
        return len(p.x + wx, p.y + wy) - 1
      }
    }
  }
}

function coastModifier(coast: Coast, symmetric: boolean, random: () => number) {
  const fold = (a: number) => (symmetric ? Math.abs(a) : a)
  switch (coast) {
    case 'blunt':
      return (d: number) => d
    case 'wavy': {
      const k = 5 + Math.floor(random() * 5)
      const phase = symmetric ? 0 : random() * TAU
      return (d: number, p: P) => d + 0.06 * Math.sin(k * fold(Math.atan2(p.y, p.x)) + phase)
    }
    case 'curved': {
      const k = 2 + Math.floor(random() * 2)
      const phase = symmetric ? 0 : random() * TAU
      return (d: number, p: P) => d + 0.13 * Math.sin(k * fold(Math.atan2(p.y, p.x)) + phase)
    }
    case 'angular': {
      const k = 5 + Math.floor(random() * 3)
      const phase = symmetric ? 0 : random()
      return (d: number, p: P) => {
        const u = (k * fold(Math.atan2(p.y, p.x))) / TAU + phase
        return d + 0.1 * (Math.abs((u - Math.floor(u)) * 2 - 1) * 2 - 1)
      }
    }
    case 'pointed': {
      const count = 2 + Math.floor(random() * 3)
      const capes = Array.from({ length: count }, () => (random() - 0.5) * TAU)
      return (d: number, p: P) => {
        const a = fold(Math.atan2(p.y, p.x))
        let lift = 0
        for (const c of capes) {
          const gap = Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))
          lift = Math.max(lift, 1 - gap / 0.2)
        }
        return d - 0.4 * lift
      }
    }
    case 'straight': {
      const count = 1 + Math.floor(random() * 3)
      const cuts = Array.from({ length: count }, () => {
        const a = random() * TAU
        return { a, c: 0.6 + random() * 0.25 }
      })
      const all = symmetric ? cuts.flatMap((k) => [k, { a: -k.a, c: k.c }]) : cuts
      return (d: number, p: P) =>
        all.reduce((m, k) => Math.max(m, p.x * Math.cos(k.a) + p.y * Math.sin(k.a) - k.c), d)
    }
  }
}

function buildShape(seed: number): IslandShape {
  const draw = (salt: number) => mulberry32(hashInts(seed, salt))
  const footprint = weighted(FOOTPRINT_WEIGHTS, draw(SALT.footprint)())
  const edge = draw(SALT.coast)
  const coast = pickOf(COASTS, edge())
  const symmetric = edge() < 0.5
  const relief = pickOf(RELIEFS, draw(SALT.relief)())
  const angle = draw(SALT.angle)() * TAU
  const body = footprintDistance(footprint, draw(SALT.shape), seed)
  const modify = coastModifier(coast, symmetric, draw(SALT.edge))
  const raw = (p: P) => modify(body(p), p)
  // Sample the raw shape once for its area and reach.
  const span = 3.5
  const n = 48
  const cell = (2 * span) / n
  let inside = 0
  let reach = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: -span + (i + 0.5) * cell, y: -span + (j + 0.5) * cell }
      if (raw(p) <= 0) {
        inside++
        reach = Math.max(reach, len(p.x, p.y))
      }
    }
  }
  const norm = Math.sqrt((inside * cell * cell) / Math.PI)
  return {
    footprint,
    coast,
    relief,
    symmetric,
    angle,
    distance: raw,
    norm,
    extent: (reach + cell) / norm,
  }
}

export type IslandLand = {
  size: number
  land: Hex[]
  interior: ReadonlySet<string>
  /** Hex steps to the nearest non-land hex, per land hex key; 1–2 is shore. */
  depth: ReadonlyMap<string, number>
  /** The furthest land hex's distance from the centre, in rings. */
  radius: number
}

/** A hex centre in hex units (centre to centre 1), x along q. */
const cartesian = (h: Hex): P => ({
  x: h.q + h.r / 2,
  y: (h.r * Math.sqrt(3)) / 2,
})

const neighbours = (h: Hex): Hex[] => HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }))

/** Memo caps: the API sees many seeds over its lifetime; the oldest entries go first. */
const MEMO_LIMIT = 256

function remember<V>(memo: Map<string | number, V>, key: string | number, make: () => V): V {
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const value = make()
  memo.set(key, value)
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value as string | number)
  return value
}

const shapes = new Map<string | number, IslandShape>()

/** The island's seeded shape genome (spec 24.1). Memoised: pure in its seed. */
export function islandShape(seed: number): IslandShape {
  return remember(shapes, seed, () => buildShape(seed))
}
const raws = new Map<string | number, ReadonlySet<string>>()
const lands = new Map<string | number, IslandLand>()

/**
 * Hexes inside the shape at any whole size from MIN_ISLAND_SIZE up to `size`, so land only ever
 * grows even where a shape is not convex.
 */
function rawLand(seed: number, size: number): ReadonlySet<string> {
  return remember(raws, `${seed}:${size}`, () => {
    const shape = islandShape(seed)
    const core = Math.min(CORE_RINGS, size - 1)
    const inShape = new Set(size > MIN_ISLAND_SIZE ? rawLand(seed, size - 1) : [])
    const cos = Math.cos(-shape.angle)
    const sin = Math.sin(-shape.angle)
    const rings = Math.ceil(size * shape.extent) + 1
    for (let ring = 0; ring <= rings; ring++) {
      for (const h of hexRing(COMMONS_CENTER, ring)) {
        const k = hexKey(h)
        if (inShape.has(k)) continue
        const c = cartesian(h)
        const p = {
          x: ((c.x * cos - c.y * sin) / size) * shape.norm,
          y: ((c.x * sin + c.y * cos) / size) * shape.norm,
        }
        if (ring <= core || shape.distance(p) <= 0) inShape.add(k)
      }
    }
    return inShape
  })
}

/** The island's land at `size` (spec 24.1). Memoised: pure in its inputs. */
export function islandLand(seed: number, size: number): IslandLand {
  return remember(lands, `${seed}:${size}`, () => {
    const inShape = rawLand(seed, size)
    // Keep only what joins the centre.
    const land: Hex[] = []
    const seen = new Set<string>([hexKey(COMMONS_CENTER)])
    const queue: Hex[] = [COMMONS_CENTER]
    while (queue.length > 0) {
      const h = queue.shift() as Hex
      land.push(h)
      for (const n of neighbours(h)) {
        const k = hexKey(n)
        if (inShape.has(k) && !seen.has(k)) {
          seen.add(k)
          queue.push(n)
        }
      }
    }
    // Depth: breadth-first inward from the coast.
    const depth = new Map<string, number>()
    let front: Hex[] = []
    for (const h of land) {
      if (neighbours(h).some((n) => !seen.has(hexKey(n)))) {
        depth.set(hexKey(h), 1)
        front.push(h)
      }
    }
    for (let d = 2; front.length > 0; d++) {
      const next: Hex[] = []
      for (const h of front) {
        for (const n of neighbours(h)) {
          const k = hexKey(n)
          if (seen.has(k) && !depth.has(k)) {
            depth.set(k, d)
            next.push(n)
          }
        }
      }
      front = next
    }
    const interior = new Set<string>()
    for (const [k, d] of depth) if (d > SHORE_RINGS) interior.add(k)
    const radius = land.reduce((m, h) => Math.max(m, hexDistance(COMMONS_CENTER, h)), 0)
    return { size, land, interior, depth, radius }
  })
}

/** The smallest size whose interior holds every occupied hex and at least MIN_INTERIOR hexes. */
export function islandSize(seed: number, occupied: readonly Hex[]): number {
  for (let size = MIN_ISLAND_SIZE; size <= MAX_ISLAND_SIZE; size++) {
    const { interior } = islandLand(seed, size)
    if (interior.size >= MIN_INTERIOR && occupied.every((h) => interior.has(hexKey(h)))) return size
  }
  throw new Error('Island outgrew MAX_ISLAND_SIZE')
}
```

- [ ] **Step 6: Move `SHORE_RINGS`.** In `packages/shared/src/land.ts`:
  - delete the line `export const SHORE_RINGS = 2` and its doc comment;
  - add `import { SHORE_RINGS } from './island-shape'` under the existing `./hex` import.

  The old disc functions stay until Task 2. In `packages/shared/src/index.ts`, add `export * from './island-shape'` after `export * from './hex'`, and `export * from './random'` after `export * from './land'`.

- [ ] **Step 7: Run the shared tests, then the gate.** Run `cd packages/shared && bun test`. Expected: all pass in a few seconds. Then run `bun run typecheck`, `bun run test` and `bun run lint` from the root. Expected: green; the web scene still imports the helpers through `scene/model/random.ts`.

- [ ] **Step 8: Commit.**

```bash
git add packages/shared/src apps/web/src/scene/model/random.ts
git commit -m "feat(shared): seed each island a shape genome and a hex land model"
```

---

### Task 2: Placement follows the shape (shared, API, web callers)

**Files:**
- Modify (shared): `packages/shared/src/land.ts` (rewritten), `packages/shared/src/land.test.ts` (rewritten), `packages/shared/src/hex.ts`, `packages/shared/src/hex.test.ts`
- Modify (API): `apps/api/src/world/plots.ts`, `apps/api/src/milestones/service.ts`, `apps/api/src/buildings/service.ts`, `apps/api/src/cli/demo-world.ts`, and the tests in `apps/api/src/world/plots.test.ts`, `apps/api/src/routes/tasks.test.ts`, `apps/api/src/routes/milestones.test.ts`, `apps/api/src/routes/buildings.test.ts`
- Modify (web): `apps/web/src/layout/world-screen.tsx`, `apps/web/src/test/fake-api.ts`, `apps/web/src/scene/model/scene-model.ts`, plus any web test that calls `islandRadius`, `placeablePlots` or `isPlaceable` (`apps/web/src/scene/model/foundations.test.ts`, `apps/web/src/test/fake-api-shop.test.ts`, `apps/web/src/layout/world-shop.test.tsx`, `apps/web/src/scene/model/scene-model.test.ts`; find them all with `grep -rn "islandRadius\|placeablePlots\|isPlaceable" apps/web/src`)

**Interfaces:**
- Consumes: `islandLand`, `islandSize`, `MAX_ISLAND_SIZE` (Task 1); `COMMONS_CENTER`, `DISTRICT_SPACING`, `hexRing`, `hexScale`, `hexKey`, `seedDirection` (`hex.ts`).
- Produces (from `@archipelago/shared`):
  - `islandRadius(seed: number, occupied: readonly Hex[]): number`;
  - `placeablePlots(seed: number, occupied: readonly Hex[]): Hex[]`;
  - `isPlaceable(seed: number, occupied: readonly Hex[], plot: Hex): boolean`;
  - `nextDistrictCenter(seed: number, occupied: readonly Hex[]): Hex`;
  - `nearestFreePlot(seed: number, centre: Hex, startDirection: number, occupied: readonly Hex[]): Hex`;
  - `decorationRotation(plot: Hex): number` (unchanged).
  - Removed: `MIN_ISLAND_RADIUS`, `hex.ts`'s old `nextDistrictCenter(taken)` and `nearestFreePlot(centre, dir, isTaken)`.
  - API: `takenPlots` is deleted if nothing uses it any more (`grep -rn takenPlots apps/api/src`); keep its test only if the function stays.

- [ ] **Step 1: Write the failing shared tests.** Replace `packages/shared/src/land.test.ts` with:

```ts
import { describe, expect, test } from 'bun:test'
import { COMMONS_CENTER, DISTRICT_SPACING, type Hex, hexKey, seedDirection } from './hex'
import { islandLand, islandShape, islandSize } from './island-shape'
import {
  decorationRotation,
  islandRadius,
  isPlaceable,
  nearestFreePlot,
  nextDistrictCenter,
  placeablePlots,
} from './land'

const SEED = 4
const interiorAt = (seed: number, occupied: readonly Hex[]) =>
  islandLand(seed, islandSize(seed, occupied)).interior

/** Builds an island the way the API does: loose tasks, then districts with tasks of their own. */
function build(seed: number, districts: number, tasksEach: number): Hex[] {
  const occupied: Hex[] = []
  const dir = seedDirection(seed)
  for (let i = 0; i < 4; i++) occupied.push(nearestFreePlot(seed, COMMONS_CENTER, dir, occupied))
  for (let m = 0; m < districts; m++) {
    const centre = nextDistrictCenter(seed, occupied)
    occupied.push(centre)
    for (let i = 0; i < tasksEach; i++) occupied.push(nearestFreePlot(seed, centre, dir, occupied))
  }
  return occupied
}

describe('land rule', () => {
  test('decorationRotation varies along every anti-diagonal', () => {
    // The old (q*7 + r*13) % 6 reduces to (q + r) % 6: one turn per anti-diagonal.
    for (const sum of [-2, 0, 1, 3]) {
      const turns = new Set<number>()
      for (let k = -4; k <= 4; k++) turns.add(decorationRotation({ q: k, r: sum - k }))
      expect(turns.size).toBeGreaterThan(1)
    }
  })

  test('decorationRotation is deterministic and in 0..5', () => {
    const turns = placeablePlots(SEED, []).map(decorationRotation)
    expect(turns.every((t) => Number.isInteger(t) && t >= 0 && t <= 5)).toBe(true)
    expect(new Set(turns).size).toBeGreaterThan(1)
    expect(decorationRotation({ q: -3, r: 2 })).toBe(decorationRotation({ q: -3, r: 2 }))
  })

  test('islandRadius is the enclosing ring of the land at the current size', () => {
    const occupied = [{ q: 1, r: 0 }]
    expect(islandRadius(SEED, occupied)).toBe(islandLand(SEED, islandSize(SEED, occupied)).radius)
  })

  test('placeable plots are the free interior, ring by ring, without the centre', () => {
    const occupied = [{ q: 1, r: 0 }]
    const plots = placeablePlots(SEED, occupied)
    const interior = interiorAt(SEED, occupied)
    const keys = plots.map(hexKey)
    expect(new Set(keys).size).toBe(plots.length)
    expect(keys).not.toContain('0,0')
    expect(keys).not.toContain('1,0')
    expect(plots).toHaveLength(interior.size - 2)
    for (const k of keys) expect(interior.has(k)).toBe(true)
    const rings = plots.map((h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2)
    expect(rings).toEqual([...rings].sort((a, b) => a - b))
  })

  test('isPlaceable agrees with placeablePlots, and refuses shore, sea, taken and the centre', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const occupied = build(seed, 2, 3)
      const plots = new Set(placeablePlots(seed, occupied).map(hexKey))
      const { land, interior } = islandLand(seed, islandSize(seed, occupied))
      for (const h of land) expect(isPlaceable(seed, occupied, h)).toBe(plots.has(hexKey(h)))
      const shore = land.find((h) => !interior.has(hexKey(h)))
      if (shore) expect(isPlaceable(seed, occupied, shore)).toBe(false)
      expect(isPlaceable(seed, occupied, { q: 90, r: 0 })).toBe(false)
      expect(isPlaceable(seed, occupied, COMMONS_CENTER)).toBe(false)
      expect(isPlaceable(seed, occupied, occupied[0] as Hex)).toBe(false)
    }
  })
})

describe('placement follows the shape', () => {
  test('every plot and district centre lands on interior, never twice', () => {
    for (let seed = 0; seed < 60; seed++) {
      const occupied = build(seed, 4, 6)
      const interior = interiorAt(seed, occupied)
      expect(new Set(occupied.map(hexKey)).size).toBe(occupied.length)
      for (const h of occupied) expect(interior.has(hexKey(h))).toBe(true)
    }
  })

  test('district centres sit on the DISTRICT_SPACING lattice', () => {
    for (const c of build(9, 4, 0).slice(4)) {
      expect(Math.abs(c.q % DISTRICT_SPACING)).toBe(0)
      expect(Math.abs(c.r % DISTRICT_SPACING)).toBe(0)
    }
  })

  test('the next centre is one already interior when there is one', () => {
    const seed = 2
    const occupied = build(seed, 0, 0)
    const centre = nextDistrictCenter(seed, occupied)
    const before = islandSize(seed, occupied)
    const lattice = [...interiorAt(seed, occupied)].filter((k) => {
      const [q = 0, r = 0] = k.split(',').map(Number)
      return (q !== 0 || r !== 0) && q % DISTRICT_SPACING === 0 && r % DISTRICT_SPACING === 0
    })
    if (lattice.length > 0) expect(islandSize(seed, [...occupied, centre])).toBe(before)
  })

  test('on an elongated island the first three districts line up along its axis', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i).find(
      (s) => islandShape(s).footprint === 'elongated',
    ) as number
    const { angle } = islandShape(seed)
    const occupied: Hex[] = []
    for (let m = 0; m < 3; m++) {
      const c = nextDistrictCenter(seed, occupied)
      occupied.push(c)
      const x = c.q + c.r / 2
      const y = (c.r * Math.sqrt(3)) / 2
      const off = Math.abs(
        Math.atan2(Math.sin(Math.atan2(y, x) - angle), Math.cos(Math.atan2(y, x) - angle)),
      )
      // Within 35° of the long axis, either way along it.
      expect(Math.min(off, Math.PI - off)).toBeLessThan((35 * Math.PI) / 180)
    }
  })

  test('a task goes next to its district when there is room', () => {
    const seed = 6
    const occupied = build(seed, 1, 0)
    const centre = occupied.at(-1) as Hex
    const plot = nearestFreePlot(seed, centre, 0, occupied)
    const d =
      (Math.abs(plot.q - centre.q) +
        Math.abs(plot.q - centre.q + plot.r - centre.r) +
        Math.abs(plot.r - centre.r)) /
      2
    expect(d).toBe(1)
  })

  test('different start directions start the walk in different places', () => {
    expect(nearestFreePlot(SEED, COMMONS_CENTER, 0, [])).not.toEqual(
      nearestFreePlot(SEED, COMMONS_CENTER, 1, []),
    )
  })

  test('a freed district slot is reused first', () => {
    const seed = 3
    const first = nextDistrictCenter(seed, [])
    const second = nextDistrictCenter(seed, [first])
    expect(nextDistrictCenter(seed, [second])).toEqual(first)
  })
})
```

In `packages/shared/src/hex.test.ts`:
- delete the `describe('nextDistrictCenter', …)` and `describe('nearestFreePlot', …)` blocks;
- drop `nearestFreePlot`, `nextDistrictCenter` and `DISTRICT_SPACING` from its imports if they become unused. Biome flags unused imports.

- [ ] **Step 2: Run them and see them fail.** Run `cd packages/shared && bun test src/land.test.ts`. Expected: FAIL. `islandRadius` and the others still take the old arguments, and `nextDistrictCenter`/`nearestFreePlot` come from `hex.ts` with the old signatures.

- [ ] **Step 3: Implement the shared land rule.** Replace `packages/shared/src/land.ts` with:

```ts
import { COMMONS_CENTER, DISTRICT_SPACING, type Hex, hexKey, hexRing, hexScale } from './hex'
import { islandLand, islandSize, MAX_ISLAND_SIZE } from './island-shape'

/** The ring enclosing all land (spec 24.2): island spacing, gulls, boat loops and the cloud plane. */
export function islandRadius(seed: number, occupied: readonly Hex[]): number {
  return islandLand(seed, islandSize(seed, occupied)).radius
}

/**
 * Free interior hexes at the island's current size, ring by ring outward. The size comes from
 * what is already on the island, so a new decoration can never grow it.
 */
export function placeablePlots(seed: number, occupied: readonly Hex[]): Hex[] {
  const { interior, radius } = islandLand(seed, islandSize(seed, occupied))
  const taken = new Set(occupied.map(hexKey))
  const plots: Hex[] = []
  for (let ring = 1; ring <= radius; ring++) {
    for (const h of hexRing(COMMONS_CENTER, ring)) {
      const k = hexKey(h)
      if (interior.has(k) && !taken.has(k)) plots.push(h)
    }
  }
  return plots
}

export function isPlaceable(seed: number, occupied: readonly Hex[], plot: Hex): boolean {
  if (plot.q === COMMONS_CENTER.q && plot.r === COMMONS_CENTER.r) return false
  if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) return false
  return islandLand(seed, islandSize(seed, occupied)).interior.has(hexKey(plot))
}

/**
 * The next district centre (spec 24.2): the free `DISTRICT_SPACING` lattice spot that is interior
 * at the smallest size, from the current one up; ties go by spiral order. Districts so follow the
 * island's shape: along a long island, round a crescent's arc, one per lobe.
 */
export function nextDistrictCenter(seed: number, occupied: readonly Hex[]): Hex {
  const taken = new Set([...occupied, COMMONS_CENTER].map(hexKey))
  for (let size = islandSize(seed, occupied); size <= MAX_ISLAND_SIZE; size++) {
    const { interior, radius } = islandLand(seed, size)
    const reach = Math.ceil(radius / DISTRICT_SPACING)
    for (let ring = 1; ring <= reach; ring++) {
      for (const unit of hexRing(COMMONS_CENTER, ring)) {
        const centre = hexScale(unit, DISTRICT_SPACING)
        const k = hexKey(centre)
        if (interior.has(k) && !taken.has(k)) return centre
      }
    }
  }
  throw new Error('No free district centre')
}

/**
 * A task's plot (spec 24.2): spiralling out from `centre` (starting towards `startDirection`), the
 * first free hex that is interior at the current size within DISTRICT_SPACING rings; failing that,
 * the same at the next size up, so the island grows only when the district is boxed in.
 */
export function nearestFreePlot(
  seed: number,
  centre: Hex,
  startDirection: number,
  occupied: readonly Hex[],
): Hex {
  const taken = new Set([...occupied, COMMONS_CENTER].map(hexKey))
  for (let size = islandSize(seed, occupied); size <= MAX_ISLAND_SIZE; size++) {
    const { interior } = islandLand(seed, size)
    for (let ring = 1; ring <= DISTRICT_SPACING; ring++) {
      for (const h of hexRing(centre, ring, startDirection)) {
        const k = hexKey(h)
        if (interior.has(k) && !taken.has(k)) return h
      }
    }
  }
  throw new Error('No free plot near district centre')
}

/**
 * A fixed 60° step per plot, so decorations face different ways without the user turning them.
 * An integer hash of both coordinates: any linear form in q and r repeats along a line of hexes.
 */
export function decorationRotation(plot: Hex): number {
  let h = Math.imul(plot.q, 0x27d4eb2d) ^ Math.imul(plot.r, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) % 6
}
```

In `packages/shared/src/hex.ts`, delete `export function nextDistrictCenter(…) {…}` and `export function nearestFreePlot(…) {…}`. `MAX_SPIRAL_RADIUS`, `hexSpiral`, `nextArchipelagoSlot` and `seedDirection` stay.

Run `cd packages/shared && bun test`. Expected: PASS.

- [ ] **Step 4: API callers.**

`apps/api/src/world/plots.ts`: the imports become `COMMONS_CENTER, type Hex, nearestFreePlot, seedDirection` (drop `hexKey` if unused), and `assignTaskPlot` becomes:

```ts
export async function assignTaskPlot(
  tx: Db,
  project: ProjectRow,
  milestone: MilestoneRow | null,
): Promise<Hex> {
  const occupied = await occupiedHexes(tx, project.id)
  const centre = milestone ? { q: milestone.districtQ, r: milestone.districtR } : COMMONS_CENTER
  return nearestFreePlot(
    project.islandSeed,
    centre,
    seedDirection(project.islandSeed),
    occupied,
  )
}
```

`apps/api/src/milestones/service.ts` (inside `createMilestone`, where `project` is the locked row): import `occupiedHexes` instead of `takenPlots`.

```ts
    // Avoid every occupied hex, not only other centres, so a centre never lands on a task.
    const centre = nextDistrictCenter(project.islandSeed, await occupiedHexes(tx, projectId))
```

`apps/api/src/buildings/service.ts`: `if (!isPlaceable(project.islandSeed, occupied, plot)) throw notLand()`.

`apps/api/src/cli/demo-world.ts`:
- `placeDecorations` gains a `seed: number` parameter after `projectId`, and calls `placeablePlots(seed, await occupiedHexes(db, projectId))`.
- Its two callers pass the project's `islandSeed`. The project DTOs created in this file carry `islandSeed`; if a call site holds only an id, read it with `db.select({ islandSeed: projects.islandSeed }).from(projects).where(eq(projects.id, projectId))`.

Then delete `takenPlots` from `plots.ts` if `grep -rn takenPlots apps/api/src` shows no other user, and drop its test block in `plots.test.ts`.

- [ ] **Step 5: API tests.** These assumed a disc and now derive their expectations from the island's own land.
  - **`apps/api/src/routes/buildings.test.ts`, the "422 for unknown types and plots that are not free flat land" test.** Replace the fixed shore plot `{ plotX: 3, plotY: 0 }` with a real shore hex of the project:

    ```ts
    const { land, interior } = islandLand(s.project.islandSeed, islandSize(s.project.islandSeed, []))
    const shore = land.find((h) => !interior.has(hexKey(h))) as Hex
    // … in the list of bodies:
    { plotX: shore.q, plotY: shore.r }, // shore of this island
    ```

    Keep `{ plotX: 0, plotY: 0 }` (commons) and `{ plotX: 90, plotY: 0 }` (open sea; was 9, which can be land on a long island).
  - **The "201" placement tests** that use fixed plots `(1,0)` and `(0,1)`: rings 0–3 are always interior, so they stay valid. Leave them.
  - **"A decoration at the interior edge keeps the island when its task is deleted".** Rewrite it:
    1. Insert the task at a far interior hex: `const plots = placeablePlots(seed, []); const far = plots.at(-1)`.
    2. Place a decoration on a free interior neighbour of `far`.
    3. Delete the task.
    4. Assert that placing on another plot from `placeablePlots(seed, [decorationPlot])` is 201.

    The intent stays: the decoration still counts toward the island's size.
  - **`apps/api/src/routes/milestones.test.ts`**, the six-milestone test: replace `for (const c of centres) expect(hexDistance(c, origin)).toBe(5)` with checks that every centre sits on the lattice, (`Math.abs(c.q % DISTRICT_SPACING) === 0 && Math.abs(c.r % DISTRICT_SPACING) === 0`) and that every centre is interior at the final size:

    ```ts
    const seed = project.islandSeed
    const interior = islandLand(seed, islandSize(seed, centres)).interior
    for (const c of centres) expect(interior.has(hexKey(c))).toBe(true)
    ```

    Keep the distinct-centres check. Rewrite any other test in the file that asserts a fixed centre the same way.
  - **`apps/api/src/routes/tasks.test.ts`**, the seven-tasks test: keep "6 distinct, first six at distance 1 from the centre" only if the centre's ring 1 is interior. Rings 0–3 are always interior, and the district centre is interior with depth ≥ 3, so its ring 1 is land with depth ≥ 2. Replace the distance assertions with:

    ```ts
    const seed = project.islandSeed
    const interior = islandLand(seed, islandSize(seed, [centre, ...plots])).interior
    for (const p of plots) expect(interior.has(hexKey(p))).toBe(true)
    expect(Math.min(...plots.map((p) => hexDistance(p, centre)))).toBe(1)
    for (const p of plots) expect(hexDistance(p, centre)).toBeLessThanOrEqual(DISTRICT_SPACING)
    ```

  - **`apps/api/src/world/plots.test.ts`, `assignTaskPlot`:** keep `hexDistance(loose, origin) === 1`, since ring 1 is always interior. For the district task, insert the milestone at `nextDistrictCenter(project.islandSeed, [])` instead of `(-5, 5)`, then keep `hexDistance(inDistrict, centre)` at most 2 and assert it is interior as above.

  Run `cd apps/api && bun test`. Expected: PASS. A `seedDemoWorld` timeout under load gets one re-run.

- [ ] **Step 6: Web callers.**
  - `apps/web/src/layout/world-screen.tsx`: the project's seed is `world.data.projects.find((p) => p.id === resolvedProjectId)?.islandSeed`. Compute it inside the existing `useMemo` and call `placeablePlots(seed, islandOccupied(world.data, resolvedProjectId))`, falling back to `[]` when the project is missing.
  - `apps/web/src/test/fake-api.ts` (`placeBuilding`): `isPlaceable(project.islandSeed, occupied, plot)`.
  - `apps/web/src/scene/model/scene-model.ts`: `const radius = islandRadius(project.islandSeed, occupied)`. Terrain stays the old ring-based `islandTerrain(seed, radius, …)` until Task 3. A disc of the enclosing radius covers all land, so every plot still stands on drawn land.
  - Web tests that call the old signatures: pass the fixture project's `islandSeed`, which is `fakeProject`'s `1` unless overridden.
    - Tests asserting exact disc radii (`foundations.test.ts`'s `describe('islandRadius')`, `scene-model.test.ts` "radius 7"): rewrite them to expect `islandLand(seed, islandSize(seed, occupied)).radius` for the same occupied hexes.
    - The shop tests that pick plots from `placeablePlots`: just pass the seed.

  Run `cd apps/web && bunx vitest run`. Expected: PASS. Fix any remaining disc assumption the same way: derive the expectation from `islandLand`.

- [ ] **Step 7: Gate and commit.** Run `bun run typecheck && bun run test && bun run lint` from the root. Expected: green.

```bash
git add packages/shared/src apps/api/src apps/web/src
git commit -m "feat: place districts, tasks and decorations on each island's own shape"
```

---
### Task 3: Terrain, relief and growth on the shaped land (web)

**Files:**
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/terrain.ts`, `apps/web/src/scene/model/island-growth.ts`, `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/empty-sea.tsx`, `apps/web/src/scene/model/sea-depth.ts` (rename only)
- Test: `apps/web/src/scene/model/foundations.test.ts` (the `islandTerrain` block), `apps/web/src/scene/model/island-growth.test.ts`, `apps/web/src/scene/model/scene-model.test.ts`

**Interfaces:**
- Consumes: `islandLand`, `islandShape`, `islandSize`, `type Relief`, `SHORE_RINGS`, `hashInts`, `mulberry32` from `@archipelago/shared` (Tasks 1–2).
- Produces:
  - Tuning: `RELIEF_FACTOR: Readonly<Record<Relief, number>>`.
  - Terrain:
    - `type TerrainTile = { q: number; r: number; height: number; tone: TerrainTone; depth: number }`;
    - `islandTerrain(seed: number, size: number, stage?: Stage, paths?: readonly Hex[]): TerrainTile[]`.
  - Growth: `islandGrowth({ seed, stage, tiles, occupied, paths })` (no `radius`).
  - `SceneIsland` gains `size: number`. Its `radius` is now the enclosing ring from `islandLand`.
  - `sea-depth.ts`: `UNCHARTED_RADIUS` becomes `UNCHARTED_SIZE` (value 1).

- [ ] **Step 1: Tuning.** In `apps/web/src/scene/tuning.ts`, after `HILL_MAX`, add the block below, with `import type { Relief } from '@archipelago/shared'` at the top:

```ts
/** Each relief profile's share of the stage's hill cap (spec 24.3). */
export const RELIEF_FACTOR: Readonly<Record<Relief, number>> = {
  flattened: 0.5,
  spherical: 1,
  conical: 1.5,
  cylindrical: 1,
}
```

- [ ] **Step 2: Write the failing terrain tests.** In `apps/web/src/scene/model/foundations.test.ts`, delete the `describe('islandRadius', …)` block if Task 2 left one, and replace the whole `describe('islandTerrain', …)` block with:

```ts
describe('islandTerrain', () => {
  const SIZE = 7
  const seedWith = (relief: Relief) =>
    Array.from({ length: 300 }, (_, i) => i).find((s) => islandShape(s).relief === relief) as number

  test('is deterministic per seed', () => {
    expect(islandTerrain(42, SIZE)).toEqual(islandTerrain(42, SIZE))
    expect(islandTerrain(42, SIZE)).not.toEqual(islandTerrain(43, SIZE))
  })

  test('one tile per land hex, less the ragged depth-1 dropout; depth comes from the land', () => {
    let dropped = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { land, depth } = islandLand(seed, SIZE)
      const tiles = islandTerrain(seed, SIZE)
      const byKey = new Map(tiles.map((t) => [hexKey(t), t]))
      for (const h of land) {
        const t = byKey.get(hexKey(h))
        const d = depth.get(hexKey(h)) ?? 0
        if (!t) {
          expect(d).toBe(1)
          dropped++
          continue
        }
        expect(t.depth).toBe(d)
      }
      expect(tiles.length).toBeLessThanOrEqual(land.length)
    }
    expect(dropped).toBeGreaterThan(0)
  })

  test('the shore (depth 1–2) is lower sand or rock and the stage never changes it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const shore = (stage: Stage) => islandTerrain(seed, SIZE, stage).filter((t) => t.depth <= 2)
      for (const t of shore(0)) {
        expect(t.height).toBeGreaterThan(0.5)
        expect(t.height).toBeLessThan(LAND_HEIGHT)
        expect(['shore', 'rock']).toContain(t.tone)
      }
      expect(shore(4)).toEqual(shore(0))
    }
  })

  test('the plaza is the centre, flat at its relief height; interior is at or above LAND_HEIGHT', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const tiles = islandTerrain(seed, SIZE, 4)
      const plaza = tiles.filter((t) => t.tone === 'plaza')
      expect(plaza).toHaveLength(1)
      expect(plaza[0]).toMatchObject({ q: 0, r: 0 })
      for (const t of tiles.filter((x) => x.depth > 2)) {
        expect(t.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
      }
    }
  })

  const STAGES: Stage[] = [0, 1, 2, 3, 4]

  test('hills rise in whole steps under the stage cap times the relief factor', () => {
    const tallest = STAGES.map(() => 0)
    for (let seed = 1; seed <= 20; seed++) {
      const factor = RELIEF_FACTOR[islandShape(seed).relief]
      for (const stage of STAGES) {
        for (const t of islandTerrain(seed, SIZE, stage)) {
          if (t.depth <= 2) continue
          const rise = t.height - LAND_HEIGHT
          expect(rise).toBeGreaterThanOrEqual(0)
          expect(rise).toBeLessThanOrEqual(HILL_MAX[stage] * factor + 1e-9)
          expect(Math.abs(rise / HILL_STEP - Math.round(rise / HILL_STEP))).toBeLessThan(1e-9)
          tallest[stage] = Math.max(tallest[stage] ?? 0, rise)
        }
      }
    }
    expect(tallest[4]).toBeGreaterThan(tallest[0] ?? 0)
  })

  test('conical rises with depth: the deepest tiles are the tallest', () => {
    const seed = seedWith('conical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    const deepest = Math.max(...tiles.map((t) => t.depth))
    const top = Math.max(...tiles.map((t) => t.height))
    expect(tiles.filter((t) => t.depth === deepest).every((t) => t.height === top)).toBe(true)
    expect(Math.min(...tiles.filter((t) => t.depth === 3).map((t) => t.height))).toBeLessThan(top)
  })

  test('cylindrical is a mesa: the edge zone stays at LAND_HEIGHT, inland stands above it', () => {
    const seed = seedWith('cylindrical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    for (const t of tiles.filter((x) => x.depth === 3)) expect(t.height).toBe(LAND_HEIGHT)
    for (const t of tiles.filter((x) => x.depth > 3)) {
      expect(t.height).toBeGreaterThan(LAND_HEIGHT)
    }
  })

  test('spherical is a dome: deeper tiles are never lower on average', () => {
    const seed = seedWith('spherical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    const mean = (d: number) => {
      const at = tiles.filter((t) => t.depth === d)
      return at.reduce((s, t) => s + t.height, 0) / at.length
    }
    const depths = [...new Set(tiles.map((t) => t.depth))].sort((a, b) => a - b)
    for (let i = 1; i < depths.length; i++) {
      expect(mean(depths[i] as number)).toBeGreaterThanOrEqual(mean(depths[i - 1] as number) - 1e-9)
    }
  })

  test('flattened stays within half the cap', () => {
    const seed = seedWith('flattened')
    for (const t of islandTerrain(seed, 9, 4)) {
      expect(t.height - LAND_HEIGHT).toBeLessThanOrEqual(HILL_MAX[4] * 0.5 + 1e-9)
    }
  })

  test('grass is dry on a bare island and full grass when overgrown, with more meadow', () => {
    let meadow0 = 0
    let meadow4 = 0
    for (let seed = 1; seed <= 10; seed++) {
      const inland = (stage: Stage) =>
        islandTerrain(seed, SIZE, stage).filter((t) => t.tone !== 'plaza' && t.depth > 2)
      for (const t of inland(0)) expect(['grassDry', 'meadow']).toContain(t.tone)
      for (const t of inland(4)) expect(['grass', 'meadow']).toContain(t.tone)
      meadow0 += inland(0).filter((t) => t.tone === 'meadow').length
      meadow4 += inland(4).filter((t) => t.tone === 'meadow').length
    }
    expect(meadow4).toBeGreaterThan(meadow0)
    expect(GRASS_TONES).toEqual(['grassDry', 'grassSprout', 'grassGreen', 'grassLush', 'grass'])
  })

  test('path hexes on interior get the path tone and no other hex does', () => {
    const paths: Hex[] = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]
    const keys = new Set(paths.map(hexKey))
    for (const t of islandTerrain(5, SIZE, 2, paths)) {
      expect(t.tone === 'path').toBe(keys.has(hexKey(t)))
    }
  })

  test('tileHeights and heightAt read a tile height, LAND_HEIGHT off the island', () => {
    const tiles = islandTerrain(9, 5, 3)
    const heights = tileHeights(tiles)
    for (const t of tiles) expect(heightAt(heights, t)).toBe(t.height)
    expect(heightAt(heights, { q: 400, r: 0 })).toBe(LAND_HEIGHT)
  })
})
```

Update that file's imports:
- add `islandLand`, `islandShape` and `type Relief` from `@archipelago/shared`;
- add `RELIEF_FACTOR` from `../tuning`, next to `HILL_MAX` and `HILL_STEP`;
- drop `hexDistance`/`origin` if they become unused.

- [ ] **Step 3: Run it and see it fail.** Run `cd apps/web && bunx vitest run src/scene/model/foundations.test.ts`. Expected: FAIL (`depth` is missing from the tiles, and the conical/cylindrical expectations aren't met).

- [ ] **Step 4: Implement the terrain.** Replace `islandTerrain` and its helpers in `apps/web/src/scene/model/terrain.ts`. `stageFor`, `hillNoise`, `GRASS_TONES`, `tileHeights` and `heightAt` stay as they are.

```ts
import {
  type Hex,
  hashInts,
  hexKey,
  islandLand,
  islandShape,
  mulberry32,
  type Relief,
  SHORE_RINGS,
} from '@archipelago/shared'
import {
  GROWTH_THRESHOLDS,
  HILL_MAX,
  HILL_SCALE,
  HILL_STEP,
  MEADOW_SHARE,
  RELIEF_FACTOR,
} from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'

export type TerrainTile = {
  q: number
  r: number
  height: number
  tone: TerrainTone
  /** Hex steps to the sea (spec 24.3): 1–2 is shore, 3 the edge, deeper is inland. */
  depth: number
}

const TILE_SALT = 5
/** Share of depth-1 hexes left out for a ragged coast. */
const DROPOUT = 0.3

/** Height above LAND_HEIGHT for an interior hex, by the island's relief (spec 24.3). */
function reliefRise(
  seed: number,
  relief: Relief,
  h: Hex,
  depth: number,
  deepest: number,
  stage: Stage,
): number {
  const cap = HILL_MAX[stage] * RELIEF_FACTOR[relief]
  const { x, z } = hexToWorld(h)
  const noise = hillNoise(seed, x, z)
  const t = Math.min(1, (depth - SHORE_RINGS) / Math.max(1, deepest - SHORE_RINGS))
  const raw =
    relief === 'flattened'
      ? noise * cap
      : relief === 'spherical'
        ? cap * (0.7 * Math.sqrt(1 - (1 - t) ** 2) + 0.3 * noise)
        : relief === 'conical'
          ? cap * t
          : depth > SHORE_RINGS + 1
            ? cap * (0.8 + 0.2 * noise)
            : 0
  const steps = Math.min(Math.round(raw / HILL_STEP), Math.floor(cap / HILL_STEP + 1e-9))
  return steps * HILL_STEP
}

/**
 * Tiles for the island's land at `size` (spec 24.3). Shore is depth 1–2: lower sand and rock,
 * with some depth-1 hexes left out for a ragged coast, never changed by the stage. Deeper is
 * grass that greens with `stage`, `paths` in their own tone, and the flat plaza at the centre,
 * raised by the island's relief profile.
 */
export function islandTerrain(
  seed: number,
  size: number,
  stage: Stage = 0,
  paths: readonly Hex[] = [],
): TerrainTile[] {
  const { land, depth } = islandLand(seed, size)
  const { relief } = islandShape(seed)
  const deepest = Math.max(...depth.values())
  const onPath = new Set(paths.map(hexKey))
  const tiles: TerrainTile[] = []
  for (const h of land) {
    const d = depth.get(hexKey(h)) ?? 1
    // Per-hex draws, so a hex keeps its look as the island grows around it.
    const random = mulberry32(hashInts(seed, h.q, h.r, TILE_SALT))
    const a = random()
    const b = random()
    if (d <= SHORE_RINGS) {
      const outer = d === 1
      if (outer && a < DROPOUT) continue
      const height = (outer ? 0.55 : 0.75) + b * 0.2
      tiles.push({ q: h.q, r: h.r, height, tone: a > 0.85 ? 'rock' : 'shore', depth: d })
      continue
    }
    const plaza = h.q === 0 && h.r === 0
    const tone: TerrainTone = plaza
      ? 'plaza'
      : onPath.has(hexKey(h))
        ? 'path'
        : a < MEADOW_SHARE[stage]
          ? 'meadow'
          : (GRASS_TONES[stage] ?? 'grass')
    const height = LAND_HEIGHT + reliefRise(seed, relief, h, d, deepest, stage)
    tiles.push({ q: h.q, r: h.r, height, tone, depth: d })
  }
  return tiles
}
```

Delete the old `hillHeight`, `ORIGIN`, `UNIT` (if unused) and `hexRing` import. Keep `hillNoise` exported; it still uses `hashInts` and needs `UNIT = 4294967296`, so keep that constant.

Run `cd apps/web && bunx vitest run src/scene/model/foundations.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing growth tests.** In `apps/web/src/scene/model/island-growth.test.ts`:
  - change the helper to `function grow(seed: number, stage: Stage, occupied: Hex[] = [], paths: Hex[] = [], size = 7) { const tiles = islandTerrain(seed, size, stage, paths); return { tiles, ...islandGrowth({ seed, stage, tiles, occupied, paths }) } }`;
  - in the fill-share test, pass `size` 8 as the fifth argument and count `t.depth <= SHORE_RINGS` as shore instead of the ring test;
  - replace the "types follow the place" test, the bound check in "pieces stand on a present tile", and the dock test with these:

```ts
  test('types follow the place: shore by depth, the edge at depth 3, deeper inland', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { tiles, scenery } = grow(seed, 4)
      const depth = new Map(tiles.map((t) => [hexKey(t), t.depth]))
      for (const p of scenery) {
        const d = depth.get(hexOf(p)) ?? 0
        const zone = d <= SHORE_RINGS ? 'shore' : d === SHORE_RINGS + 1 ? 'edge' : 'inland'
        expect(Object.keys(SCENERY_WEIGHTS[zone])).toContain(p.type)
      }
    }
  })

  test('no dock before the green stage; from then on one, on a depth-1 tile facing open water', () => {
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
        expect(tile?.depth).toBe(1)
        expect(dock.position.y).toBe(tile?.height)
        // One hex along the dock's facing there is no tile.
        const ahead = {
          x: dock.position.x + Math.cos(dock.turn) * SQRT3,
          z: dock.position.z - Math.sin(dock.turn) * SQRT3,
        }
        const blocked = tiles.some((t) => {
          const c = hexToWorld(t)
          return Math.hypot(c.x - ahead.x, c.z - ahead.z) < 1e-6
        })
        expect(blocked).toBe(false)
        expect(dock).toEqual(grow(seed, DOCK_STAGE).dock)
      }
    }
  })
```

In "pieces stand on a present tile", replace `expect(hexDistance(ORIGIN, tile)).toBeLessThanOrEqual(7)` with nothing; the tile lookup already proves the piece is on the island. Import `SQRT3` from `./hex-space`.

- [ ] **Step 6: Implement the growth changes.** In `apps/web/src/scene/model/island-growth.ts`:
  - drop `radius` from `islandGrowth`'s parameter object and type;
  - the zone becomes `const zone = tile.depth <= SHORE_RINGS ? 'shore' : tile.depth === SHORE_RINGS + 1 ? 'edge' : 'inland'`, replacing the ring/edge computation;
  - replace `dockTile` and the dock return with:

```ts
/** A seeded depth-1 tile: the jetty's footing (spec 24.3). */
function dockTile(seed: number, tiles: readonly TerrainTile[]): TerrainTile | null {
  let best: TerrainTile | null = null
  let bestHash = Number.POSITIVE_INFINITY
  for (const t of tiles) {
    if (t.depth !== 1) continue
    const h = hashInts(seed, t.q, t.r, DOCK_SALT)
    if (h < bestHash) {
      best = t
      bestHash = h
    }
  }
  return best
}

/** Faces the dock's tileless neighbour nearest the outward direction from the island centre. */
function dockTurn(dock: Hex, tiles: readonly TerrainTile[]): number {
  const present = new Set(tiles.map(hexKey))
  const at = hexToWorld(dock)
  const out = Math.atan2(-at.z, at.x)
  let best = out
  let bestGap = Number.POSITIVE_INFINITY
  for (const d of HEX_DIRECTIONS) {
    const n = { q: dock.q + d.q, r: dock.r + d.r }
    if (present.has(hexKey(n))) continue
    const c = hexToWorld(n)
    const turn = Math.atan2(-(c.z - at.z), c.x - at.x)
    const gap = Math.abs(Math.atan2(Math.sin(turn - out), Math.cos(turn - out)))
    if (gap < bestGap) {
      best = turn
      bestGap = gap
    }
  }
  return best
}
```

  and in `islandGrowth`:

```ts
  const dockAt = dockTile(seed, tiles)
  // …
  if (!dockAt || stage < DOCK_STAGE) return { scenery, dock: null }
  const { x, z } = hexToWorld(dockAt)
  return { scenery, dock: { position: { x, y: dockAt.height, z }, turn: dockTurn(dockAt, tiles) } }
```

  Imports: add `HEX_DIRECTIONS`; drop `hexDistance` and `COMMONS_CENTER` only if unused (`blocked` still adds `COMMONS_CENTER`). The `Dock` doc comment becomes "its model faces +x, and `turn` points it at open water".

- [ ] **Step 7: Scene model and the uncharted island.** In `apps/web/src/scene/model/scene-model.ts`:

```ts
    const occupied = islandOccupied(world, project.id)
    const size = islandSize(project.islandSeed, occupied)
    const { radius, land } = islandLand(project.islandSeed, size)
    const onLand = new Set(land.map(hexKey))
    const stage = stageFor(tasks.filter((t) => t.status === 'done').length)
    // A path that crosses a bay keeps only its land hexes (spec 24.3).
    const paths = pathHexes(
      milestones
        .filter((m) => tasks.some((t) => t.milestoneId === m.id && t.status === 'done'))
        .map((m) => ({ q: m.districtQ, r: m.districtR })),
    ).filter((h) => onLand.has(hexKey(h)))
    const tiles = islandTerrain(project.islandSeed, size, stage, paths)
    return { project, milestones, tasks, buildings, occupied, size, radius, stage, paths, tiles }
```

  - Carry `size` into the `SceneIsland` literal.
  - Add `size: number` to the `SceneIsland` type, documented as "The island's growth size (spec 24.1); with `seed` it fully determines its land". The `seed` comment becomes "The project's terrain seed; with `size` it fully determines `tiles`", and the `radius` comment "The ring enclosing all land".
  - Drop `radius` from the `islandGrowth` call.
  - Imports: `hexKey`, `islandLand` and `islandSize` from shared, replacing `islandRadius`.

  In `apps/web/src/scene/model/sea-depth.ts`, rename `UNCHARTED_RADIUS` to `UNCHARTED_SIZE` (value 1, comment "The empty world's ghost island (spec 17.4): this size, at the origin"). Its `Shore` still uses `radius: UNCHARTED_SIZE` until Task 4. In `apps/web/src/scene/empty-sea.tsx` use `islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)` and `islandGeometry(…, UNCHARTED_SIZE)`. Update `sea-depth.test.ts`'s import name.

  In `scene-model.test.ts`, rewrite the remaining disc expectations:
  - "every task plot lies within its island radius" becomes "every task plot is interior land": `islandLand(seed, island.size).interior.has(hexKey(plot))`;
  - "decoration plots … count toward the island radius" expects `island.size === islandSize(seed, occupied)` with the decoration in `occupied`;
  - the spacing tests keep using `islandExtent(radius)`. Spacing still uses the enclosing ring.

- [ ] **Step 8: Run the web suite.** Run `cd apps/web && bunx vitest run`. Expected: PASS. Any other test that read `tiles` by ring (for example a scenery or world-contents snapshot of a fixed seed) is updated to the depth-based expectation, not deleted.

- [ ] **Step 9: Gate and commit.** Run `bun run typecheck && bun run test && bun run lint`. Expected: green.

```bash
git add apps/web/src
git commit -m "feat(web): draw each island's own land with depth zones and a relief profile"
```

---
### Task 4: Shallows, foam, sea shading and the island camera follow the coast (web)

**Files:**
- Modify: `apps/web/src/scene/model/hex-space.ts`, `apps/web/src/scene/model/terrain.ts`, `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/model/sea-depth.ts`, `apps/web/src/scene/use-stable-shores.ts`, `apps/web/src/scene/models/terrain-geometry.ts`, `apps/web/src/scene/models/sea-props.ts`, `apps/web/src/scene/island.tsx`, `apps/web/src/scene/empty-sea.tsx`, `apps/web/src/scene/model/camera.ts`, `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (one line in 24.4)
- Test: `apps/web/src/scene/model/hex-space.test.ts` (create), `apps/web/src/scene/model/foundations.test.ts`, `apps/web/src/scene/model/sea-depth.test.ts`, `apps/web/src/scene/models/models.test.ts`, `apps/web/src/scene/model/camera.test.ts`

**Interfaces:**
- Consumes: `TerrainTile` with `depth`, `islandTerrain(seed, size, …)`, and `SceneIsland.size` (Task 3).
- Produces:
  - `hex-space.ts`:
    - `hexSide(h: Hex, i: number): [Point, Point]`: the side facing `HEX_DIRECTIONS[i]`, from the corner at angle `−60°·i − 30°` to the one at `−60°·i + 30°`, island-local;
    - `SHALLOWS_REACH = SQRT3 + 1`: coast hex centre to the far corner of its shallows.
  - `terrain.ts`:
    - `type RimSide = { a: Point; b: Point; out: Point }`;
    - `shallowsHexes(tiles: readonly Hex[]): Hex[]`;
    - `shallowsRim(tiles: readonly Hex[], shallows: readonly Hex[]): RimSide[]`.
  - `SceneIsland` gains these, all island-local:
    - `coast: Point[]`: centres of depth-1 tiles;
    - `shallows: Hex[]`;
    - `rim: RimSide[]`;
    - `box: Bounds`: tile centres.
  - `sea-depth.ts`: `type Shore = { origin: Point; radius: number; size: number; coast: readonly Point[]; rim: readonly RimSide[] }`, plus `UNCHARTED_SHORE: Shore`.
  - `islandGeometry(tiles: readonly TerrainTile[], shallows: readonly Hex[])`.
  - `foamGeometry(shores: readonly Pick<Shore, 'origin' | 'rim'>[])`.

- [ ] **Step 1: Write the failing pure tests.** Create `apps/web/src/scene/model/hex-space.test.ts`:

```ts
import { HEX_DIRECTIONS } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { hexSide, hexToWorld, SQRT3 } from './hex-space'

describe('hexSide', () => {
  test('each side is one unit long, half a hex-width out towards its neighbour', () => {
    const h = { q: 2, r: -1 }
    const c = hexToWorld(h)
    HEX_DIRECTIONS.forEach((d, i) => {
      const [a, b] = hexSide(h, i)
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(1)
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      const n = hexToWorld({ q: h.q + d.q, r: h.r + d.r })
      expect(mid.x).toBeCloseTo((c.x + n.x) / 2)
      expect(mid.z).toBeCloseTo((c.z + n.z) / 2)
      expect(Math.hypot(mid.x - c.x, mid.z - c.z)).toBeCloseTo(SQRT3 / 2)
    })
  })

  test('consecutive sides share a corner, going round the hex', () => {
    const h = { q: 0, r: 0 }
    for (let i = 0; i < 6; i++) {
      const [, to] = hexSide(h, i)
      const [from] = hexSide(h, (i + 5) % 6)
      expect(to.x).toBeCloseTo(from.x)
      expect(to.z).toBeCloseTo(from.z)
    }
  })
})
```

`hexSide(h, i)` runs from angle `−60i − 30` to `−60i + 30`. Its end corner (`−60i + 30`) is therefore the start corner of side `i − 1`, which is `(i + 5) % 6`. The test above checks exactly that.

In `foundations.test.ts`, add:

```ts
describe('shallows', () => {
  test('one ring of non-land hexes round the tiles, and a rim facing open water', () => {
    const tiles = islandTerrain(3, 7)
    const keys = new Set(tiles.map(hexKey))
    const shallows = shallowsHexes(tiles)
    const wet = new Set(shallows.map(hexKey))
    for (const h of shallows) {
      expect(keys.has(hexKey(h))).toBe(false)
      expect(HEX_DIRECTIONS.some((d) => keys.has(hexKey({ q: h.q + d.q, r: h.r + d.r })))).toBe(true)
    }
    for (const t of tiles) {
      for (const d of HEX_DIRECTIONS) {
        const n = { q: t.q + d.q, r: t.r + d.r }
        expect(keys.has(hexKey(n)) || wet.has(hexKey(n))).toBe(true)
      }
    }
    const rim = shallowsRim(tiles, shallows)
    expect(rim.length).toBeGreaterThan(0)
    for (const s of rim) {
      expect(Math.hypot(s.out.x, s.out.z)).toBeCloseTo(1)
      // One step outward from the side's middle is open water: neither tile nor shallows.
      const p = { x: (s.a.x + s.b.x) / 2 + s.out.x * 0.9, z: (s.a.z + s.b.z) / 2 + s.out.z * 0.9 }
      const r = Math.round(p.z / 1.5)
      const q = Math.round(p.x / SQRT3 - r / 2)
      expect(keys.has(hexKey({ q, r })) || wet.has(hexKey({ q, r }))).toBe(false)
    }
  })
})
```

(Imports: `HEX_DIRECTIONS` from shared; `shallowsHexes` and `shallowsRim` from `./terrain`; `SQRT3` from `./hex-space`.)

Replace `apps/web/src/scene/model/sea-depth.test.ts` with:

```ts
import { islandShape } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, SHALLOWS_REACH } from './hex-space'
import { depthShade, type Shore, shoreDistance, UNCHARTED_SHORE } from './sea-depth'
import { islandTerrain } from './terrain'

const shoreOf = (seed: number, size: number, origin = { x: 0, z: 0 }): Shore => {
  const tiles = islandTerrain(seed, size)
  return {
    origin,
    radius: Math.max(...tiles.map((t) => (Math.abs(t.q) + Math.abs(t.q + t.r) + Math.abs(t.r)) / 2)),
    size,
    coast: tiles.filter((t) => t.depth === 1).map(hexToWorld),
    rim: [],
  }
}

describe('sea depth', () => {
  test('0 on and near the land; measured from the nearest coast hex less SHALLOWS_REACH', () => {
    const s = shoreOf(4, 6)
    expect(shoreDistance({ x: 0, z: 0 }, [s])).toBe(0)
    const c = s.coast[0] as { x: number; z: number }
    const len = Math.hypot(c.x, c.z)
    const far = { x: (c.x / len) * (len + SHALLOWS_REACH + 30), z: (c.z / len) * (len + SHALLOWS_REACH + 30) }
    const nearest = Math.min(...s.coast.map((p) => Math.hypot(far.x - p.x, far.z - p.z)))
    expect(shoreDistance(far, [s])).toBeCloseTo(nearest - SHALLOWS_REACH)
  })

  test('the nearest island wins', () => {
    const a = shoreOf(4, 6)
    const b = shoreOf(4, 6, { x: 80, z: 0 })
    const p = { x: 70, z: 0 }
    expect(shoreDistance(p, [a, b])).toBeCloseTo(shoreDistance(p, [b]))
  })

  test('beside a long island’s tip is shallow; as far out across its narrow width is deep', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i).find(
      (s) => islandShape(s).footprint === 'elongated' && islandShape(s).coast === 'blunt',
    ) as number
    const s = shoreOf(seed, 9)
    const tip = s.coast.reduce((m, p) => (Math.hypot(p.x, p.z) > Math.hypot(m.x, m.z) ? p : m))
    const reach = Math.hypot(tip.x, tip.z) + 2
    const along = { x: (tip.x / Math.hypot(tip.x, tip.z)) * reach, z: (tip.z / Math.hypot(tip.x, tip.z)) * reach }
    const across = { x: -along.z, z: along.x }
    expect(shoreDistance(along, [s])).toBeLessThan(1)
    expect(shoreDistance(across, [s])).toBeGreaterThan(5)
  })

  test('an empty world measures from the uncharted island at the origin', () => {
    expect(shoreDistance({ x: 0, z: 0 }, [])).toBe(0)
    expect(shoreDistance({ x: 60, z: 0 }, [])).toBeCloseTo(shoreDistance({ x: 60, z: 0 }, [UNCHARTED_SHORE]))
  })

  test('shade runs from 0 at the shallows to 1 at the deep distance, then stays', () => {
    expect(depthShade(0)).toBe(0)
    expect(depthShade(SEA_DEEP_DISTANCE / 2)).toBeCloseTo(0.5)
    expect(depthShade(SEA_DEEP_DISTANCE * 3)).toBe(1)
  })
})
```

In `models/models.test.ts`, replace the `islandGeometry` test and the foam test with:

```ts
describe('islandGeometry', () => {
  test('merges every tile plus a shallows prism per shallows hex', () => {
    const tiles = islandTerrain(5, 5)
    const shallows = shallowsHexes(tiles)
    const g = islandGeometry(tiles, shallows)
    expectPaletteColoured(g)
    const one = islandGeometry(tiles.slice(0, 1), [])
    const perPrism = one.getAttribute('position').count
    expect(g.getAttribute('position').count).toBe(perPrism * (tiles.length + shallows.length))
    g.dispose()
    one.dispose()
  })
})
```

```ts
  test('foam is a strip per rim side, palette-coloured, doubled for two shores', () => {
    const tiles = islandTerrain(5, 5)
    const rim = shallowsRim(tiles, shallowsHexes(tiles))
    const one = foamGeometry([{ origin: { x: 0, z: 0 }, rim }])
    const two = foamGeometry([
      { origin: { x: 0, z: 0 }, rim },
      { origin: { x: 30, z: 0 }, rim },
    ])
    expectPaletteColoured(two)
    expect(one.getAttribute('position').count).toBe(rim.length * 6)
    expect(two.getAttribute('position').count).toBe(one.getAttribute('position').count * 2)
  })
```

In `model/camera.test.ts`, replace "an island outline is 12 points on its shallows circle" and "an island is a circle out to its coastline" with:

```ts
  test('an island outline is its tile box grown by SHALLOWS_REACH', () => {
    const outline = focusOutline(model, onBeta)
    const b = island.box
    const xs = outline.map((p) => p.x)
    const zs = outline.map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(island.origin.x + b.minX - SHALLOWS_REACH)
    expect(Math.max(...xs)).toBeCloseTo(island.origin.x + b.maxX + SHALLOWS_REACH)
    expect(Math.min(...zs)).toBeCloseTo(island.origin.z + b.minZ - SHALLOWS_REACH)
    expect(Math.max(...zs)).toBeCloseTo(island.origin.z + b.maxZ + SHALLOWS_REACH)
  })
```

```ts
  test('an island is its tile box, rounded by one hex corner', () => {
    const { x, z } = island.origin
    const b = island.box
    expect(layerArea(model, onBeta)).toEqual({
      minX: x + b.minX,
      maxX: x + b.maxX,
      minZ: z + b.minZ,
      maxZ: z + b.maxZ,
      round: 1,
    })
    expect(panArea(model, onBeta)).toEqual(layerArea(model, onBeta))
  })
```

Also add to `scene-model.test.ts`:

```ts
  test('an island carries its coast, shallows, rim and tile box', () => {
    const island = buildSceneModel(world, today).islands[0]
    if (!island) throw new Error('no island')
    expect(island.coast).toEqual(island.tiles.filter((t) => t.depth === 1).map(hexToWorld))
    expect(island.shallows).toEqual(shallowsHexes(island.tiles))
    expect(island.rim).toEqual(shallowsRim(island.tiles, island.shallows))
    const xs = island.tiles.map((t) => hexToWorld(t).x)
    expect(island.box.minX).toBe(Math.min(...xs))
    expect(island.box.maxX).toBe(Math.max(...xs))
  })
```

Use whatever `world` fixture that test file already has with at least one island.

- [ ] **Step 2: Run them and see them fail.** Run `cd apps/web && bunx vitest run src/scene/model src/scene/models`. Expected: FAIL (the new names are missing).

- [ ] **Step 3: Implement `hex-space.ts` additions.**

```ts
/** Coast hex centre to the far corner of the shallows hex beyond it (spec 24.4). */
export const SHALLOWS_REACH = SQRT3 + 1

const corner = (c: Point, degrees: number): Point => ({
  x: c.x + Math.cos((degrees * Math.PI) / 180),
  z: c.z + Math.sin((degrees * Math.PI) / 180),
})

/**
 * The side of `h` facing `HEX_DIRECTIONS[i]`, island-local: direction `i` lies at −60°·i, and the
 * side runs from the corner 30° before it to the corner 30° after.
 */
export function hexSide(h: Hex, i: number): [Point, Point] {
  const c = hexToWorld(h)
  return [corner(c, -60 * i - 30), corner(c, -60 * i + 30)]
}
```

- [ ] **Step 4: Implement the shallows in `terrain.ts`.**

```ts
/** A shallows side facing open water: `out` is its unit outward normal (spec 24.4). */
export type RimSide = { a: Point; b: Point; out: Point }

const step = (h: Hex, i: number): Hex => {
  const d = HEX_DIRECTIONS[i] as Hex
  return { q: h.q + d.q, r: h.r + d.r }
}

/** The hexes round the tiles that are not tiles: one ring of shallows, dropped coast included. */
export function shallowsHexes(tiles: readonly Hex[]): Hex[] {
  const land = new Set(tiles.map(hexKey))
  const wet = new Map<string, Hex>()
  for (const t of tiles) {
    for (let i = 0; i < 6; i++) {
      const n = step(t, i)
      const k = hexKey(n)
      if (!land.has(k)) wet.set(k, n)
    }
  }
  return [...wet.values()]
}

/** The shallows' sides that face neither land nor shallows. Island-local. */
export function shallowsRim(tiles: readonly Hex[], shallows: readonly Hex[]): RimSide[] {
  const covered = new Set([...tiles, ...shallows].map(hexKey))
  const rim: RimSide[] = []
  for (const h of shallows) {
    const c = hexToWorld(h)
    for (let i = 0; i < 6; i++) {
      if (covered.has(hexKey(step(h, i)))) continue
      const [a, b] = hexSide(h, i)
      const mx = (a.x + b.x) / 2 - c.x
      const mz = (a.z + b.z) / 2 - c.z
      const len = Math.hypot(mx, mz)
      rim.push({ a, b, out: { x: mx / len, z: mz / len } })
    }
  }
  return rim
}
```

Imports: `HEX_DIRECTIONS` from shared; `hexSide` and `type Point` from `./hex-space`.

- [ ] **Step 5: Scene model.** In the island literal, add:

```ts
        coast: tiles.filter((t) => t.depth === 1).map(hexToWorld),
        shallows,
        rim: shallowsRim(tiles, shallows),
        box: boxOf(tiles),
```

where `const shallows = shallowsHexes(tiles)` is computed next to `heights`, and:

```ts
/** Island-local bounds of the tile centres. */
function boxOf(tiles: readonly Hex[]): Bounds {
  const at = tiles.map(hexToWorld)
  return {
    minX: Math.min(...at.map((p) => p.x)),
    maxX: Math.max(...at.map((p) => p.x)),
    minZ: Math.min(...at.map((p) => p.z)),
    maxZ: Math.max(...at.map((p) => p.z)),
  }
}
```

Add the four fields to `SceneIsland`, with doc comments:
- `coast`: "Centres of the depth-1 tiles: the sea measures from them (spec 24.4)";
- `shallows`: "The ring of shallows hexes round the tiles";
- `rim`: "The shallows' sides facing open water: the foam runs along them";
- `box`: "Island-local bounds of the tile centres: the island layer's area".

- [ ] **Step 6: Sea depth.** Replace `apps/web/src/scene/model/sea-depth.ts` with:

```ts
import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, type Point, SHALLOWS_REACH, SQRT3 } from './hex-space'
import { islandTerrain, type RimSide, shallowsHexes, shallowsRim } from './terrain'

/** What the sea needs to know about an island; `SceneIsland` satisfies it. */
export type Shore = {
  origin: Point
  /** The ring enclosing all land. */
  radius: number
  size: number
  /** Island-local centres of the depth-1 tiles. */
  coast: readonly Point[]
  rim: readonly RimSide[]
}

/** The empty world's ghost island (spec 17.4): this size, at the origin. */
export const UNCHARTED_SIZE = 1
export const UNCHARTED_SEED = 7

const unchartedTiles = islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)
export const UNCHARTED_SHORE: Shore = {
  origin: { x: 0, z: 0 },
  radius: Math.max(
    ...unchartedTiles.map((t) => (Math.abs(t.q) + Math.abs(t.q + t.r) + Math.abs(t.r)) / 2),
  ),
  size: UNCHARTED_SIZE,
  coast: unchartedTiles.filter((t) => t.depth === 1).map(hexToWorld),
  rim: shallowsRim(unchartedTiles, shallowsHexes(unchartedTiles)),
}

/**
 * World distance from `p` to the nearest shallows edge, 0 inside one (spec 24.4): the nearest
 * coast hex centre less SHALLOWS_REACH. An island whose enclosing disc is already further than
 * the best so far is skipped. An empty world measures from the uncharted island.
 */
export function shoreDistance(p: Point, shores: readonly Shore[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const s of shores.length > 0 ? shores : [UNCHARTED_SHORE]) {
    const dx = p.x - s.origin.x
    const dz = p.z - s.origin.z
    if (Math.hypot(dx, dz) - (s.radius * SQRT3 + SHALLOWS_REACH) >= best) continue
    for (const c of s.coast) {
      const d = Math.hypot(dx - c.x, dz - c.z) - SHALLOWS_REACH
      if (d < best) best = d
    }
  }
  return Math.max(0, best)
}

/** 0 at a shallows edge, 1 at `SEA_DEEP_DISTANCE` and beyond. */
export const depthShade = (distance: number): number => Math.min(1, distance / SEA_DEEP_DISTANCE)
```

The disc skip is a true lower bound: every coast centre lies within `radius · SQRT3` of the origin.

`use-stable-shores.ts`'s `shoreKey` becomes ``shores.map((s) => `${s.origin.x},${s.origin.z},${s.radius},${s.size}`).join(';')``. A size change can reshape the coast without changing the radius.

- [ ] **Step 7: Geometry.**

In `models/terrain-geometry.ts`:

```ts
/** One merged mesh per island: a hex prism per tile and a low one per shallows hex. Caller disposes. */
export function islandGeometry(
  tiles: readonly TerrainTile[],
  shallows: readonly Hex[],
): THREE.BufferGeometry {
  const parts = tiles.map((t) => {
    const { x, z } = hexToWorld(t)
    return part(prism(1, 1, t.height), t.tone, [x, 0, z])
  })
  for (const h of shallows) {
    const { x, z } = hexToWorld(h)
    parts.push(part(prism(1, 1, SHALLOWS_HEIGHT), 'shallows', [x, 0, z]))
  }
  return merge(parts)
}
```

(Drop the `shallowsRadius` import. Keep the `SHALLOWS_MARGIN` re-export only if something still imports it from here; `grep` it.)

In `models/sea-props.ts`, replace `foamGeometry` with the version below. Keep `flatRing`; `splash` uses it.

```ts
/** A flat foam strip just outside one rim side. */
function foamStrip(s: RimSide): THREE.BufferGeometry {
  const w = FOAM_WIDTH
  const a2 = { x: s.a.x + s.out.x * w, z: s.a.z + s.out.z * w }
  const b2 = { x: s.b.x + s.out.x * w, z: s.b.z + s.out.z * w }
  const g = new THREE.BufferGeometry()
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [s.a.x, 0, s.a.z, b2.x, 0, b2.z, s.b.x, 0, s.b.z, s.a.x, 0, s.a.z, a2.x, 0, a2.z, b2.x, 0, b2.z],
      3,
    ),
  )
  g.computeVertexNormals()
  return g
}

/**
 * Foam along every island's rim (spec 24.4): a strip per shallows side facing open water,
 * merged into one mesh. Caller disposes.
 */
export function foamGeometry(shores: readonly Pick<Shore, 'origin' | 'rim'>[]): THREE.BufferGeometry {
  return merge(
    shores.flatMap((s) =>
      s.rim.map((side) => part(foamStrip(side), 'foam', [s.origin.x, SEA_LEVEL + 0.06, s.origin.z])),
    ),
  )
}
```

Winding: the strip is seen from above. If `computeVertexNormals` gives a downward normal, so the strip renders black under Lambert, swap the second and third vertex of each triangle. The palette test doesn't catch it; check visually in the controller's preview. `foamMaterial` is `MeshBasicMaterial`, so the normal doesn't affect its shade, but keep the normal pointing up.

- [ ] **Step 8: Callers.**
  - `island.tsx`: `islandGeometry(island.tiles, island.shallows)`, with the memo deps `[island.tiles, island.shallows]`.
  - `empty-sea.tsx`: build from `islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)` and `shallowsHexes` of those tiles.
  - `camera.ts`:

```ts
  if (level.kind === 'island') {
    const { origin, box } = level.island
    // Tile centres rounded by one hex corner: the land, edge to edge (spec 24.4).
    return {
      minX: origin.x + box.minX,
      maxX: origin.x + box.maxX,
      minZ: origin.z + box.minZ,
      maxZ: origin.z + box.maxZ,
      round: 1,
    }
  }
```

  and in `focusOutline`:

```ts
  if (level.kind === 'island') {
    const { origin, box } = level.island
    const world = {
      minX: origin.x + box.minX,
      maxX: origin.x + box.maxX,
      minZ: origin.z + box.minZ,
      maxZ: origin.z + box.maxZ,
    }
    return corners(grow(world, SHALLOWS_REACH))
  }
```

  Drop `islandExtent` and `shallowsRadius` from `camera.ts`'s imports if they become unused. Update the doc comments: layerArea's "an island is its tile box"; focusOutline's "the island's tile box grown by the shallows".

- [ ] **Step 9: Spec line.** In spec 24.4, after the "Shallows" bullet, add:

```markdown
- **Foam** runs along the rim (the shallows hexes' sides facing open water), a `FOAM_WIDTH` strip per side, instead of a hexagonal band round the enclosing disc.
```

- [ ] **Step 10: Run everything.** Run `cd apps/web && bunx vitest run`. Expected: PASS. Tests that asserted the disc shallows or foam ring (for example `ambient-life.test.tsx`'s foam geometry identity) keep their intent with the new geometry. Then run `bun run typecheck && bun run test && bun run lint && bun run build` from the root. Expected: green.

- [ ] **Step 11: Commit.**

```bash
git add apps/web/src docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md
git commit -m "feat(web): shallows, foam, sea depth and the island camera follow the coast"
```

---
### Task 5: District ring model and geometry (web)

**Files:**
- Create: `apps/web/src/scene/model/district-ring.ts`, `apps/web/src/scene/model/district-ring.test.ts`, `apps/web/src/scene/models/district-ring-geometry.ts`, `apps/web/src/scene/models/district-ring-geometry.test.ts`
- Modify: `apps/web/src/scene/model/hex-space.ts` (`worldToHex`), `apps/web/src/scene/model/hex-space.test.ts`, `apps/web/src/scene/tuning.ts`

**Interfaces:**
- Consumes: `hexSide`, `hexToWorld` (Task 4); `tileHeights`, `heightAt` (`terrain.ts`); `SceneModel`, `SceneIsland`, `SceneDistrict`, `SceneStructure` (`scene-model.ts`); `Focus` (`world/selectors`).
- Produces:
  - `worldToHex(p: Point): Hex`;
  - `type RingPoint = Spot & { mx: number; mz: number }`;
  - `districtTiles(district: SceneDistrict, structures: readonly SceneStructure[]): Hex[]`;
  - `ringLoops(tiles: readonly Hex[], heights: ReadonlyMap<string, number>): RingPoint[][]`;
  - `type RingTarget = { district: string; key: string; origin: Point; loops: RingPoint[][] }`;
  - `ringTarget(model: SceneModel, focus: Focus): RingTarget | null`;
  - `type RingLeg = 'none' | 'draw' | 'fade' | 'swap'`;
  - `ringLeg(from: string | null, to: string | null): RingLeg`;
  - tuning `DISTRICT_RING_WIDTH`, `DISTRICT_RING_INSET`, `DISTRICT_RING_LIFT`;
  - `ringGeometry(loops: readonly (readonly RingPoint[])[]): THREE.BufferGeometry`, with attributes `position` and `aAlong` and an index.

The controller ran `ringLoops` in scratch:
- one hex gives one loop of 6 points, each mitre of length 1/cos 30° pointing at the centre;
- two neighbours give 10 points;
- two neighbours at different heights give 12;
- two far hexes give two loops of 6;
- a ring of six round an empty centre gives loops of 18 and 6. `districtTiles` fills that hole, so the ring is one loop.

A pinch (two tiles sharing only a corner) cannot happen on a hex grid: any two of a corner's three hexes are neighbours.

- [ ] **Step 1: Tuning.** Append to `apps/web/src/scene/tuning.ts`:

```ts
/** The district ring's ribbon (spec 24.5): its width, its inset from the tile edge, its lift. */
export const DISTRICT_RING_WIDTH = 0.15
export const DISTRICT_RING_INSET = 0.05
export const DISTRICT_RING_LIFT = 0.02
```

- [ ] **Step 2: Write the failing tests.** Add to `hex-space.test.ts`:

```ts
describe('worldToHex', () => {
  test('inverts hexToWorld', () => {
    for (const h of [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -5, r: 7 }]) {
      expect(worldToHex(hexToWorld(h))).toEqual(h)
    }
  })
})
```

Create `apps/web/src/scene/model/district-ring.test.ts`:

```ts
import { type Hex, hexKey, type WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import { hexToWorld } from './hex-space'
import { districtTiles, ringLeg, ringLoops, ringTarget } from './district-ring'
import { buildSceneModel, type SceneDistrict, type SceneStructure } from './scene-model'

const flat = (tiles: Hex[], y = 1) => new Map(tiles.map((t) => [hexKey(t), y]))
const spot = (h: Hex, y = 1) => ({ ...hexToWorld(h), y })
const district = (h: Hex): SceneDistrict => ({
  milestoneId: 'm',
  name: 'M',
  type: 'lighthouse',
  progress: 0,
  position: spot(h),
})
const task = (h: Hex, milestoneId: string | null = 'm'): SceneStructure => ({
  taskId: hexKey(h),
  milestoneId,
  kind: 'house',
  marker: null,
  position: spot(h),
})
const keys = (hs: Hex[]) => hs.map(hexKey).sort()

describe('districtTiles', () => {
  test('the landmark plus its own tasks’ plots; other districts’ and loose tasks are left out', () => {
    const tiles = districtTiles(district({ q: 5, r: 0 }), [
      task({ q: 6, r: 0 }),
      task({ q: 4, r: 1 }),
      task({ q: 1, r: 0 }, null),
      task({ q: 9, r: 0 }, 'other'),
    ])
    expect(keys(tiles)).toEqual(keys([{ q: 5, r: 0 }, { q: 6, r: 0 }, { q: 4, r: 1 }]))
  })

  test('a gap the plots enclose is filled', () => {
    const ring = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
    ]
    const tiles = districtTiles(district({ q: 0, r: 1 }), ring.map((h) => task(h)))
    expect(keys(tiles)).toContain('0,0')
    expect(tiles).toHaveLength(7)
  })

  test('a district with no tasks is its landmark hex', () => {
    expect(districtTiles(district({ q: -5, r: 5 }), [])).toEqual([{ q: -5, r: 5 }])
  })
})

describe('ringLoops', () => {
  const closes = (loop: { x: number; z: number }[]) =>
    loop.every((p, i) => {
      const n = loop[(i + 1) % loop.length] as { x: number; z: number }
      return Math.hypot(p.x - n.x, p.z - n.z) <= 1 + 1e-9
    })

  test('one hex: one loop of six corners, mitres pointing at the centre', () => {
    const loops = ringLoops([{ q: 0, r: 0 }], flat([{ q: 0, r: 0 }]))
    expect(loops).toHaveLength(1)
    const loop = loops[0] ?? []
    expect(loop).toHaveLength(6)
    expect(closes(loop)).toBe(true)
    for (const p of loop) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(1)
      expect(p.y).toBe(1)
      expect(Math.hypot(p.mx, p.mz)).toBeCloseTo(1 / Math.cos(Math.PI / 6))
      expect(p.mx * -p.x + p.mz * -p.z).toBeGreaterThan(0)
    }
  })

  test('two neighbours: one loop of ten corners', () => {
    const two = [{ q: 0, r: 0 }, { q: 1, r: 0 }]
    const loops = ringLoops(two, flat(two))
    expect(loops.map((l) => l.length)).toEqual([10])
    expect(closes(loops[0] ?? [])).toBe(true)
  })

  test('a height step adds a straight drop at each shared corner', () => {
    const two = [{ q: 0, r: 0 }, { q: 1, r: 0 }]
    const loop = ringLoops(two, new Map([['0,0', 1], ['1,0', 1.3]]))[0] ?? []
    expect(loop).toHaveLength(12)
    const drops = loop.filter((p, i) => {
      const n = loop[(i + 1) % loop.length] as typeof p
      return Math.hypot(p.x - n.x, p.z - n.z) < 1e-9 && p.y !== n.y
    })
    expect(drops).toHaveLength(2)
  })

  test('a detached plot makes a second loop', () => {
    const far = [{ q: 0, r: 0 }, { q: 5, r: 0 }]
    expect(ringLoops(far, flat(far)).map((l) => l.length)).toEqual([6, 6])
  })
})

describe('ringTarget', () => {
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
  const world: WorldDto = {
    projects: [beta],
    milestones: [mvp],
    tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
    buildings: [],
    economy: quietEconomy,
  }
  const model = buildSceneModel(world, '2026-10-09')

  test('only on a known district', () => {
    expect(ringTarget(model, { kind: 'archipelago' })).toBeNull()
    expect(ringTarget(model, { kind: 'island', projectId: beta.id })).toBeNull()
    expect(
      ringTarget(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toBeNull()
    expect(ringTarget(model, { kind: 'district', projectId: 'nope', milestoneId: mvp.id })).toBeNull()
  })

  test('a district: its loops at the island origin, keyed on its tiles and their heights', () => {
    const t = ringTarget(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id })
    if (!t) throw new Error('no ring')
    expect(t.district).toBe(`${beta.id}/${mvp.id}`)
    expect(t.origin).toEqual(model.islands[0]?.origin)
    // The landmark and its neighbouring plot make one piece.
    expect(t.loops).toHaveLength(1)
    expect(t.key).toBe(ringTarget(buildSceneModel(world, '2026-10-09'), { kind: 'district', projectId: beta.id, milestoneId: mvp.id })?.key)
  })
})

describe('ringLeg', () => {
  test('draw on arrival, fade on leaving, swap between districts, nothing when the same', () => {
    expect(ringLeg(null, 'a')).toBe('draw')
    expect(ringLeg('a', null)).toBe('fade')
    expect(ringLeg('a', 'b')).toBe('swap')
    expect(ringLeg('a', 'a')).toBe('none')
    expect(ringLeg(null, null)).toBe('none')
  })
})
```

Create `apps/web/src/scene/models/district-ring-geometry.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { RingPoint } from '../model/district-ring'
import { DISTRICT_RING_INSET, DISTRICT_RING_LIFT, DISTRICT_RING_WIDTH } from '../tuning'
import { ringGeometry } from './district-ring-geometry'

const square: RingPoint[] = [
  { x: 0, y: 1, z: 0, mx: 1, mz: 1 },
  { x: 2, y: 1, z: 0, mx: -1, mz: 1 },
  { x: 2, y: 1, z: 2, mx: -1, mz: -1 },
  { x: 0, y: 1, z: 2, mx: 1, mz: -1 },
]

describe('ringGeometry', () => {
  test('two vertices per point plus a closing pair, two triangles per segment', () => {
    const g = ringGeometry([square, square])
    expect(g.getAttribute('position').count).toBe(2 * (2 * (square.length + 1)))
    expect(g.getIndex()?.count).toBe(2 * 6 * square.length)
    g.dispose()
  })

  test('the ribbon spans inset to inset + width along the mitre, lifted', () => {
    const g = ringGeometry([square])
    const p = g.getAttribute('position')
    expect([p.getX(0), p.getY(0), p.getZ(0)]).toEqual([
      DISTRICT_RING_INSET,
      1 + DISTRICT_RING_LIFT,
      DISTRICT_RING_INSET,
    ])
    expect(p.getX(1)).toBeCloseTo(DISTRICT_RING_INSET + DISTRICT_RING_WIDTH)
    g.dispose()
  })

  test('aAlong runs 0 → 1 along each loop', () => {
    const g = ringGeometry([square])
    const a = g.getAttribute('aAlong')
    expect(a.getX(0)).toBe(0)
    expect(a.getX(a.count - 1)).toBeCloseTo(1)
    for (let i = 2; i < a.count; i++) expect(a.getX(i)).toBeGreaterThanOrEqual(a.getX(i - 2))
    g.dispose()
  })
})
```

- [ ] **Step 3: Run them and see them fail.** Run `cd apps/web && bunx vitest run src/scene/model/district-ring.test.ts src/scene/models/district-ring-geometry.test.ts src/scene/model/hex-space.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 4: Implement `worldToHex`** in `hex-space.ts`:

```ts
/** The hex whose centre is at `p` (rounded): the inverse of hexToWorld for hex centres. */
export function worldToHex(p: Point): Hex {
  const r = Math.round(p.z / 1.5)
  return { q: Math.round(p.x / SQRT3 - r / 2) + 0, r: r + 0 }
}
```

- [ ] **Step 5: Implement the model** `apps/web/src/scene/model/district-ring.ts`:

```ts
import { HEX_DIRECTIONS, type Hex, hexKey } from '@archipelago/shared'
import type { Focus } from '../../world/selectors'
import { hexSide, hexToWorld, type Point, type Spot, worldToHex } from './hex-space'
import type { SceneDistrict, SceneModel, SceneStructure } from './scene-model'
import { heightAt, tileHeights } from './terrain'

/**
 * The district's own hexes (spec 24.5): its landmark, its tasks' plots, and every hex they
 * enclose. Enclosed means the flood from just outside their bounding box cannot reach it.
 */
export function districtTiles(
  district: SceneDistrict,
  structures: readonly SceneStructure[],
): Hex[] {
  const own = [
    worldToHex(district.position),
    ...structures
      .filter((s) => s.milestoneId === district.milestoneId)
      .map((s) => worldToHex(s.position)),
  ]
  const set = new Map(own.map((h) => [hexKey(h), h]))
  const qs = own.map((h) => h.q)
  const rs = own.map((h) => h.r)
  const minQ = Math.min(...qs) - 1
  const maxQ = Math.max(...qs) + 1
  const minR = Math.min(...rs) - 1
  const maxR = Math.max(...rs) + 1
  const inBox = (h: Hex) => h.q >= minQ && h.q <= maxQ && h.r >= minR && h.r <= maxR
  const start = { q: minQ, r: minR }
  const outside = new Set([hexKey(start)])
  const queue: Hex[] = [start]
  while (queue.length > 0) {
    const h = queue.pop() as Hex
    for (const d of HEX_DIRECTIONS) {
      const n = { q: h.q + d.q, r: h.r + d.r }
      const k = hexKey(n)
      if (!inBox(n) || outside.has(k) || set.has(k)) continue
      outside.add(k)
      queue.push(n)
    }
  }
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = minR; r <= maxR; r++) {
      const k = hexKey({ q, r })
      if (!set.has(k) && !outside.has(k)) set.set(k, { q, r })
    }
  }
  return [...set.values()]
}

/** A point of the ring's outline: island-local, at its tile's height, with its mitred inward offset. */
export type RingPoint = Spot & { mx: number; mz: number }

type Side = { from: Point; to: Point; y: number; inward: Point }

const cornerKey = (p: Point) => `${Math.round(p.x * 1e4)},${Math.round(p.z * 1e4)}`

/**
 * The outline of `tiles` (spec 24.5): every side whose neighbour is not a tile, chained into
 * closed loops, one per piece. A loop holds a point per corner at its tile's height, two where
 * neighbouring tiles differ in height, so it drops straight down the step. Each point's (mx, mz)
 * is the mitred inward offset of its two sides: inset by `d`, a point moves `d · (mx, mz)`.
 */
export function ringLoops(tiles: readonly Hex[], heights: ReadonlyMap<string, number>): RingPoint[][] {
  const own = new Set(tiles.map(hexKey))
  const starts = new Map<string, Side[]>()
  for (const t of tiles) {
    const c = hexToWorld(t)
    const y = heightAt(heights, t)
    HEX_DIRECTIONS.forEach((d, i) => {
      if (own.has(hexKey({ q: t.q + d.q, r: t.r + d.r }))) return
      const [from, to] = hexSide(t, i)
      const mx = c.x - (from.x + to.x) / 2
      const mz = c.z - (from.z + to.z) / 2
      const len = Math.hypot(mx, mz)
      const side = { from, to, y, inward: { x: mx / len, z: mz / len } }
      const k = cornerKey(from)
      starts.set(k, [...(starts.get(k) ?? []), side])
    })
  }
  const used = new Set<Side>()
  const loops: RingPoint[][] = []
  for (const list of starts.values()) {
    for (const first of list) {
      if (used.has(first)) continue
      const chain: Side[] = []
      let side: Side | undefined = first
      while (side && !used.has(side)) {
        used.add(side)
        chain.push(side)
        side = starts.get(cornerKey(side.to))?.find((s) => !used.has(s))
      }
      loops.push(pointsOf(chain))
    }
  }
  return loops
}

function pointsOf(chain: readonly Side[]): RingPoint[] {
  const points: RingPoint[] = []
  chain.forEach((side, k) => {
    const prev = chain[(k + chain.length - 1) % chain.length] as Side
    const sx = prev.inward.x + side.inward.x
    const sz = prev.inward.z + side.inward.z
    const len = Math.hypot(sx, sz)
    // Two sides at a hex corner meet at 60° or 120°: never head-on, so len > 0.
    const m = { x: sx / len, z: sz / len }
    const scale = 1 / (m.x * side.inward.x + m.z * side.inward.z)
    const at = { x: side.from.x, z: side.from.z, mx: m.x * scale, mz: m.z * scale }
    if (prev.y !== side.y) points.push({ ...at, y: prev.y })
    points.push({ ...at, y: side.y })
  })
  return points
}
/** What the ring draws for a focus: the district, its tiles' key, the island origin, its loops. */
export type RingTarget = {
  /** `projectId/milestoneId`: which district, whatever its tiles. */
  district: string
  /** Changes when the tiles or their heights do. */
  key: string
  origin: Point
  loops: RingPoint[][]
}

/** The ring for a district focus (spec 24.5); none elsewhere or for an unknown id. */
export function ringTarget(model: SceneModel, focus: Focus): RingTarget | null {
  if (focus.kind !== 'district') return null
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  const district = island?.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!island || !district) return null
  const tiles = districtTiles(district, island.structures)
  const heights = tileHeights(island.tiles)
  return {
    district: `${focus.projectId}/${focus.milestoneId}`,
    key: tiles
      .map((h) => `${hexKey(h)}@${heightAt(heights, h)}`)
      .sort()
      .join(';'),
    origin: island.origin,
    loops: ringLoops(tiles, heights),
  }
}

export type RingLeg = 'none' | 'draw' | 'fade' | 'swap'

/** How the ring moves between two districts (or none): draw on, fade out, or swap at once. */
export function ringLeg(from: string | null, to: string | null): RingLeg {
  if (from === to) return 'none'
  if (from === null) return 'draw'
  if (to === null) return 'fade'
  return 'swap'
}
```

The `/** A point of the ring's outline: island-local, at its tile's height, with its mitred inward offset. */
export type RingPoint = Spot & { mx: number; mz: number }

type Side = { from: Point; to: Point; y: number; inward: Point }

const cornerKey = (p: Point) => `${Math.round(p.x * 1e4)},${Math.round(p.z * 1e4)}`

/**
 * The outline of `tiles` (spec 24.5): every side whose neighbour is not a tile, chained into
 * closed loops, one per piece. A loop holds a point per corner at its tile's height, two where
 * neighbouring tiles differ in height, so it drops straight down the step. Each point's (mx, mz)
 * is the mitred inward offset of its two sides: inset by `d`, a point moves `d · (mx, mz)`.
 */
export function ringLoops(tiles: readonly Hex[], heights: ReadonlyMap<string, number>): RingPoint[][] {
  const own = new Set(tiles.map(hexKey))
  const starts = new Map<string, Side[]>()
  for (const t of tiles) {
    const c = hexToWorld(t)
    const y = heightAt(heights, t)
    HEX_DIRECTIONS.forEach((d, i) => {
      if (own.has(hexKey({ q: t.q + d.q, r: t.r + d.r }))) return
      const [from, to] = hexSide(t, i)
      const mx = c.x - (from.x + to.x) / 2
      const mz = c.z - (from.z + to.z) / 2
      const len = Math.hypot(mx, mz)
      const side = { from, to, y, inward: { x: mx / len, z: mz / len } }
      const k = cornerKey(from)
      starts.set(k, [...(starts.get(k) ?? []), side])
    })
  }
  const used = new Set<Side>()
  const loops: RingPoint[][] = []
  for (const list of starts.values()) {
    for (const first of list) {
      if (used.has(first)) continue
      const chain: Side[] = []
      let side: Side | undefined = first
      while (side && !used.has(side)) {
        used.add(side)
        chain.push(side)
        side = starts.get(cornerKey(side.to))?.find((s) => !used.has(s))
      }
      loops.push(pointsOf(chain))
    }
  }
  return loops
}

function pointsOf(chain: readonly Side[]): RingPoint[] {
  const points: RingPoint[] = []
  chain.forEach((side, k) => {
    const prev = chain[(k + chain.length - 1) % chain.length] as Side
    const sx = prev.inward.x + side.inward.x
    const sz = prev.inward.z + side.inward.z
    const len = Math.hypot(sx, sz)
    // Two sides at a hex corner meet at 60° or 120°: never head-on, so len > 0.
    const m = { x: sx / len, z: sz / len }
    const scale = 1 / (m.x * side.inward.x + m.z * side.inward.z)
    const at = { x: side.from.x, z: side.from.z, mx: m.x * scale, mz: m.z * scale }
    if (prev.y !== side.y) points.push({ ...at, y: prev.y })
    points.push({ ...at, y: side.y })
  })
  return points
}` block above is the controller-tested `RingPoint`, `Side`, `cornerKey`, `ringLoops` and `pointsOf`. Paste it as written; it uses `HEX_DIRECTIONS`, `hexKey`, `hexSide`, `hexToWorld`, `heightAt` and the `Point`/`Spot` types imported above.

- [ ] **Step 6: Implement the geometry** `apps/web/src/scene/models/district-ring-geometry.ts`:

```ts
import * as THREE from 'three'
import type { RingPoint } from '../model/district-ring'
import { DISTRICT_RING_INSET, DISTRICT_RING_LIFT, DISTRICT_RING_WIDTH } from '../tuning'

/**
 * The district ring's ribbon (spec 24.5): per loop point, a vertex at the inset and one a width
 * further in along its mitre, lifted off the tiles; the first point repeats at the end so
 * `aAlong` (0 → 1 along each loop) can reveal it. Height steps become vertical strips because
 * both of a corner's points share its mitre. Caller disposes.
 */
export function ringGeometry(loops: readonly (readonly RingPoint[])[]): THREE.BufferGeometry {
  const positions: number[] = []
  const along: number[] = []
  const index: number[] = []
  for (const loop of loops) {
    const n = loop.length
    const lengths = [0]
    for (let i = 1; i <= n; i++) {
      const a = loop[i - 1] as RingPoint
      const b = loop[i % n] as RingPoint
      lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    }
    const total = lengths[n] || 1
    const base = positions.length / 3
    for (let i = 0; i <= n; i++) {
      const p = loop[i % n] as RingPoint
      for (const reach of [DISTRICT_RING_INSET, DISTRICT_RING_INSET + DISTRICT_RING_WIDTH]) {
        positions.push(p.x + p.mx * reach, p.y + DISTRICT_RING_LIFT, p.z + p.mz * reach)
        along.push((lengths[i] ?? 0) / total)
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}
```

- [ ] **Step 7: Run the tests and see them pass.** Run the three test files from Step 3. Expected: PASS.

- [ ] **Step 8: Gate and commit.** Run `bun run typecheck && bun run test && bun run lint`. Expected: green.

```bash
git add apps/web/src
git commit -m "feat(web): trace a district's own tiles as a mitred ring outline"
```

---
### Task 6: District ring material, component and wiring (web)

**Files:**
- Create: `apps/web/src/scene/district-ring-material.ts`, `apps/web/src/scene/district-ring-material.test.ts`, `apps/web/src/scene/district-ring.tsx`, `apps/web/src/scene/district-ring.test.tsx`
- Modify: `apps/web/src/scene/cloud-deck-material.ts` (export its colour helper), `apps/web/src/scene/model/palette.ts`, `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`, `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Consumes: `ringTarget`, `ringLeg`, `RingTarget` (Task 5); `ringGeometry` (Task 5); `CLOUD_DECK_RENDER_ORDER` (`cloud-deck-material.ts`); `CLOUD_MS`, `clampDelta` (`tuning.ts`).
- Produces:
  - `DISTRICT_RING_RENDER_ORDER` (= `CLOUD_DECK_RENDER_ORDER + 1`);
  - `districtRingUniforms` (`uReveal`, `uOpacity`, `uColor`), `DISTRICT_RING_VERTEX`, `DISTRICT_RING_FRAGMENT`, `districtRingMaterial`;
  - `DistrictRing({ model, focus, animate, onRunning? })`;
  - `scenePalette.districtRing`;
  - `TickerDemand.ring`;
  - `shaderColor(hex: string): THREE.Vector3`, exported from `cloud-deck-material.ts` (the existing `rgb` helper, renamed).

- [ ] **Step 1: Palette, colour helper, ticker.**
  - In `model/palette.ts`, add `districtRing: mix(colors.warning, colors.surfacePrimary, 0.15),` after `cloud`.
  - In `cloud-deck-material.ts`, rename `const rgb` to `export const shaderColor` and update its uses there.
  - In `ticker.ts`, add the field below to `TickerDemand`, and `|| d.ring` to `tickerWanted`'s disjunction:

```ts
  /** The district ring is drawing on or fading out (spec 24.5). */
  ring: boolean
```

  Add `ring: false` to every `TickerDemand` literal (`ticker.test.ts` and `world-scene.tsx`; the typecheck finds the rest). Add one case to `ticker.test.ts`: with everything else false and `animate: true`, `ring: true` wants the ticker, and with `animate: false` it does not.

- [ ] **Step 2: Write the failing material test** `apps/web/src/scene/district-ring-material.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { CLOUD_DECK_RENDER_ORDER, shaderColor } from './cloud-deck-material'
import {
  DISTRICT_RING_FRAGMENT,
  DISTRICT_RING_RENDER_ORDER,
  DISTRICT_RING_VERTEX,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { scenePalette } from './model/palette'

describe('district ring material', () => {
  test('draws after the cloud deck, depth-tested, without writing depth', () => {
    expect(DISTRICT_RING_RENDER_ORDER).toBe(CLOUD_DECK_RENDER_ORDER + 1)
    expect(districtRingMaterial).toBeInstanceOf(THREE.ShaderMaterial)
    expect(districtRingMaterial.transparent).toBe(true)
    expect(districtRingMaterial.depthTest).toBe(true)
    expect(districtRingMaterial.depthWrite).toBe(false)
    expect(districtRingMaterial.side).toBe(THREE.DoubleSide)
    expect(districtRingMaterial.uniforms).toBe(districtRingUniforms)
  })

  test('reveals along aAlong up to uReveal and fades by uOpacity, in the ring colour', () => {
    expect(DISTRICT_RING_VERTEX).toContain('attribute float aAlong;')
    expect(DISTRICT_RING_VERTEX).toContain('vAlong = aAlong;')
    expect(DISTRICT_RING_FRAGMENT).toContain('if ( vAlong > uReveal ) discard;')
    expect(DISTRICT_RING_FRAGMENT).toContain('gl_FragColor = vec4( uColor, uOpacity );')
    expect(districtRingUniforms.uColor.value.toArray()).toEqual(
      shaderColor(scenePalette.districtRing).toArray(),
    )
  })
})
```

- [ ] **Step 3: Write the failing component test** `apps/web/src/scene/district-ring.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { DistrictRing } from './district-ring'
import {
  DISTRICT_RING_RENDER_ORDER,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { CLOUD_MS } from './tuning'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const later = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp, later],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onLater: Focus = { kind: 'district', projectId: beta.id, milestoneId: later.id }
const frames = Math.ceil(CLOUD_MS / 100) + 1

type Props = { model: SceneModel; focus: Focus; animate?: boolean; onRunning?: (r: boolean) => void }
const tree = ({ model: m, focus, animate = true, onRunning }: Props) => (
  <DistrictRing model={m} focus={focus} animate={animate} onRunning={onRunning} />
)
const meshes = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAllByType('Mesh').map((m) => m.instance as THREE.Mesh)
const reveal = () => districtRingUniforms.uReveal.value
const opacity = () => districtRingUniforms.uOpacity.value

describe('DistrictRing', () => {
  beforeEach(() => {
    districtRingUniforms.uReveal.value = 1
    districtRingUniforms.uOpacity.value = 1
  })

  test('nothing on an island; one untappable ribbon on a district, above the clouds', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    expect(meshes(r)).toHaveLength(0)
    await r.update(tree({ model, focus: onMvp, animate: false }))
    const [mesh] = meshes(r)
    if (!mesh) throw new Error('no ring')
    expect(mesh.material).toBe(districtRingMaterial)
    expect(mesh.renderOrder).toBe(DISTRICT_RING_RENDER_ORDER)
    const hits: THREE.Intersection[] = []
    mesh.raycast({} as THREE.Raycaster, hits)
    expect(hits).toHaveLength(0)
    const origin = model.islands[0]?.origin
    expect(mesh.position.x).toBe(origin?.x)
    expect(mesh.position.z).toBe(origin?.z)
  })

  test('the first mount on a district shows it at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    expect(meshes(r)).toHaveLength(1)
    expect(reveal()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('entering a district draws the ring on over CLOUD_MS, holding the ticker meanwhile', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(reveal()).toBe(0)
    await r.advanceFrames(3, 0.1)
    expect(reveal()).toBeGreaterThan(0)
    expect(reveal()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(reveal()).toBe(1)
    expect(opacity()).toBe(1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('leaving fades it out, then removes it and releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(meshes(r)).toHaveLength(1)
    await r.advanceFrames(3, 0.1)
    expect(opacity()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(meshes(r)).toHaveLength(0)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('leaving mid draw-on fades from where it is', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.advanceFrames(3, 0.1)
    const partial = reveal()
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(reveal()).toBeCloseTo(partial)
    expect(opacity()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(meshes(r)).toHaveLength(0)
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(onRunning.mock.calls.filter(([v]) => v === true)).toHaveLength(1)
  })

  test('district to district swaps at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const before = meshes(r)[0]?.geometry
    await r.update(tree({ model, focus: onLater, onRunning }))
    expect(meshes(r)[0]?.geometry).not.toBe(before)
    expect(reveal()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('a refetch with the same tiles does nothing; new tiles rebuild without animating', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const before = meshes(r)[0]?.geometry
    await r.update(tree({ model: buildSceneModel(world, today), focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.geometry).toBe(before)
    const grown = buildSceneModel(
      {
        ...world,
        tasks: [
          ...world.tasks,
          fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 5, plotY: 1 }),
        ],
      },
      today,
    )
    await r.update(tree({ model: grown, focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.geometry).not.toBe(before)
    expect(reveal()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('without animation it appears and disappears at once', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: onMvp, animate: false }))
    expect(meshes(r)).toHaveLength(1)
    expect(reveal()).toBe(1)
    await r.update(tree({ model, focus: onBeta, animate: false }))
    expect(meshes(r)).toHaveLength(0)
  })

  test('unmounting mid draw-on releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })
})
```

- [ ] **Step 4: Run them and see them fail.** Run `cd apps/web && bunx vitest run src/scene/district-ring-material.test.ts src/scene/district-ring.test.tsx`. Expected: FAIL (modules missing).

- [ ] **Step 5: Implement the material** `apps/web/src/scene/district-ring-material.ts`:

```ts
import * as THREE from 'three'
import { CLOUD_DECK_RENDER_ORDER, shaderColor } from './cloud-deck-material'
import { scenePalette } from './model/palette'

/** Just after the cloud deck: the hole's feather never veils the ring (spec 24.5). */
export const DISTRICT_RING_RENDER_ORDER = CLOUD_DECK_RENDER_ORDER + 1

export const districtRingUniforms = {
  /** How far along each loop (0–1) the ribbon is drawn. */
  uReveal: { value: 1 },
  uOpacity: { value: 1 },
  uColor: { value: shaderColor(scenePalette.districtRing) },
}

export const DISTRICT_RING_VERTEX = `attribute float aAlong;
varying float vAlong;
void main() {
  vAlong = aAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`

export const DISTRICT_RING_FRAGMENT = `uniform float uReveal;
uniform float uOpacity;
uniform vec3 uColor;
varying float vAlong;
void main() {
  if ( vAlong > uReveal ) discard;
  gl_FragColor = vec4( uColor, uOpacity );
}`

/** The district ring (spec 24.5): unlit, revealed along its loops, faded as a whole. */
export const districtRingMaterial = new THREE.ShaderMaterial({
  uniforms: districtRingUniforms,
  vertexShader: DISTRICT_RING_VERTEX,
  fragmentShader: DISTRICT_RING_FRAGMENT,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
})
```

- [ ] **Step 6: Implement the component** `apps/web/src/scene/district-ring.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Focus } from '../world/selectors'
import {
  DISTRICT_RING_RENDER_ORDER,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { type RingTarget, ringLeg, ringTarget } from './model/district-ring'
import type { SceneModel } from './model/scene-model'
import { ringGeometry } from './models/district-ring-geometry'
import { CLOUD_MS, clampDelta } from './tuning'

const noRaycast = () => null

const write = (reveal: number, opacity: number) => {
  districtRingUniforms.uReveal.value = reveal
  districtRingUniforms.uOpacity.value = opacity
}

/** Keeps the shown ring's object while its district and tiles are unchanged. */
const same = (a: RingTarget | null, b: RingTarget | null) =>
  a?.district === b?.district && a?.key === b?.key

/**
 * The district ring (spec 24.5): a gold ribbon along the outer edges of the focused district's
 * tiles. Entering a district draws it on over CLOUD_MS, leaving fades it out, district to
 * district swaps at once; a refetch that changes the tiles redraws it in place.
 */
export function DistrictRing({
  model,
  focus,
  animate,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** A draw-on or fade started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const target = ringTarget(model, focus)
  const latest = useRef(target)
  latest.current = target
  const [shown, setShown] = useState<RingTarget | null>(() => ringTarget(model, focus))
  const district = useRef<string | null>(null)
  const mounted = useRef(false)
  const leg = useRef<{ kind: 'draw' | 'fade'; from: number; elapsed: number; fresh: boolean } | null>(
    null,
  )
  const running = useRef(onRunning)
  running.current = onRunning

  const show = (next: RingTarget | null) => setShown((s) => (same(s, next) ? s : next))
  const begin = (kind: 'draw' | 'fade', from: number) => {
    const was = leg.current !== null
    leg.current = { kind, from, elapsed: 0, fresh: true }
    if (!was) running.current?.(true)
  }
  const stop = () => {
    if (!leg.current) return
    leg.current = null
    running.current?.(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the district and its tiles' key are the trigger
  useLayoutEffect(() => {
    const next = latest.current
    const move = ringLeg(district.current, next?.district ?? null)
    district.current = next?.district ?? null
    // The first mount shows its ring at once, like the camera's first framing.
    const instant = !mounted.current || !animate
    mounted.current = true
    if (instant || move === 'swap') {
      stop()
      show(next)
      write(1, 1)
    } else if (move === 'draw') {
      show(next)
      write(0, 1)
      begin('draw', 0)
    } else if (move === 'fade') {
      begin('fade', districtRingUniforms.uOpacity.value)
    } else {
      // Same district, new tiles or heights: redraw in place.
      show(next)
    }
    invalidate()
  }, [target?.district, target?.key, animate, invalidate])

  // Unmounting mid-leg releases the ticker demand.
  useLayoutEffect(
    () => () => {
      if (leg.current) running.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const l = leg.current
    if (!l) return
    // The leg began between frames: its first frame's delta spans the idle gap, so it doesn't count.
    if (!l.fresh) l.elapsed += clampDelta(delta) * 1000
    l.fresh = false
    const t = Math.min(1, l.elapsed / CLOUD_MS)
    if (l.kind === 'draw') write(t, 1)
    else write(districtRingUniforms.uReveal.value, l.from * (1 - t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
    if (l.kind === 'fade') {
      setShown(null)
      write(1, 1)
    }
  })

  const geometry = useMemo(() => (shown ? ringGeometry(shown.loops) : null), [shown])
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!shown || !geometry) return null
  return (
    <mesh
      name="district-ring"
      geometry={geometry}
      material={districtRingMaterial}
      position={[shown.origin.x, 0, shown.origin.z]}
      renderOrder={DISTRICT_RING_RENDER_ORDER}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}
```

- [ ] **Step 7: Mount it.** In `world-scene.tsx`:
  - add `const [ringing, setRinging] = useState(false)`;
  - pass `ring: ringing` to `tickerWanted`;
  - render the ring right after `<CloudDeck … />`:

```tsx
      <DistrictRing
        model={props.model}
        focus={props.focus}
        animate={animate}
        onRunning={setRinging}
      />
```

- [ ] **Step 8: Run the tests and see them pass.** Run `cd apps/web && bunx vitest run src/scene`. Expected: PASS.

- [ ] **Step 9: Gate and commit.** Run `bun run typecheck && bun run test && bun run lint && bun run build`. Expected: green, and three.js stays in the lazy scene chunk (the ring files are under `scene/`, imported only by `world-scene.tsx`).

```bash
git add apps/web/src
git commit -m "feat(web): ring the focused district's tiles, drawn on as the hole opens"
```

---

### After the last task (controller)

- **Shader compile.** Compile `districtRingMaterial` in the headless Chromium harness (`glsl-check/` in the scratchpad), the same way the cloud deck was checked.
- **Preview sheet.** Render a sheet of islands: every footprint, crossed with a few coasts and the four reliefs, at sizes 5 and 10. Also render one district ring over a real screenshot of a district. Check:
  - the foam winding;
  - the ring sits on the tile tops at the rim;
  - nothing floats in open water.
- **Owner's check:**
  1. Reset the database.
  2. Run `bun run seed:demo`.
  3. Restart the dev servers.
  4. Islands should differ in shape, and districts should sit along each shape.
  5. Open a district: the ring draws on around its tiles.
  6. `?perf` should show no tier drop.
