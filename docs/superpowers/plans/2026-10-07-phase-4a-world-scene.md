# Phase 4a World Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder island cards with a React Three Fiber scene that renders the real world data: islands, districts, landmarks and task structures in every state. The camera is framed per route, and taps navigate or select.

**Architecture:**
- A pure scene model (`apps/web/src/scene/model/`, no Three.js imports) turns `WorldDto` into positioned islands, terrain tiles, districts and structures.
- Procedural low-poly geometries (`scene/models/`) are built once from palette colours.
- Thin R3F components (`scene/*.tsx`) draw the model with one `InstancedMesh` per model kind per island.
- `WorldView` lazy-loads the scene when WebGL exists and falls back to the Phase 2 card view otherwise. jsdom always takes the fallback.

**Tech Stack:**
- `three` 0.186, `@react-three/fiber` 9.8, `@react-three/drei` 10.7, `@react-three/test-renderer` 9.1.
- React 19.3, TanStack Router and Query, Vitest 5 + RTL, Biome 2.5, Bun 1.4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`. Section 13 is binding; sections 2, 7.3–7.6 and 11.1 give the background.

## Global Constraints

**Commands and tooling:**
- Run web commands from `apps/web`:
  - `bunx vitest run <path>` runs one test file; `bun run test` runs all.
  - `bun run typecheck` typechecks.
- From the repo root, `bun run format` and then `bun run lint` must pass before every commit.
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`: use `import type` for types and index with `?? fallback`. Do not use the `!` non-null assertion.
- Biome style: single quotes, no semicolons, line width 100.

**Scene code rules:**
- Files under `apps/web/src/scene/model/` must not import `three` or `@react-three/*`.
- Colours come only from `scenePalette` (`scene/model/palette.ts`), which is derived from `@archipelago/ui-tokens`. Never write a hex literal anywhere else in scene code.
- Hexes are pointy-top with circumradius 1 world unit, and y is up: `hexToWorld({q, r}) = {x: √3·(q + r/2), z: 1.5·r}`. The flat island interior stands at `LAND_HEIGHT = 1`.

**Fixed values:**
- Zooms (pixels per world unit): archipelago 10, island 48, district 72. Max zoom is 3× the state zoom.
- The camera sits at `target + (200, 200, 200)`, the true isometric diagonal.
- Tap slop: a pointer press is a tap only if `event.delta <= 6`.
- `<Canvas frameloop="demand" dpr={[1, 2]} orthographic flat>`.
- The animation ticker calls `invalidate()` every 33ms while `document.visibilityState === 'visible'`. There is no ticker under `prefers-reduced-motion: reduce`.

**Process:**
- Commit messages carry no AI attribution and no `Co-Authored-By` trailer.

## Review Focus

1. **A world refetch while the user has panned.** Completing a task refetches `/world`. The camera must not snap back; it snaps only when the route changes (Task 5, `focusKey` test plus `CameraRig` keyed on it).
2. **Task count changes on an island.** Adding or deleting a task must resize that kind's `InstancedMesh`: no stale instances, no missing ones (Task 4 rerender test).
3. **A selected task that disappears or lives elsewhere.** Deleting the selected task, or selecting a task outside this island, must leave no stray selection ring and must not crash (Task 4 test, Task 7 test).
4. **Typing a search after selecting.** A selection clears a filter that hides its row once. Text typed afterwards must stay (Task 6 test).
5. **Far districts and negative plots.** A district centre at `(-10, 5)` and plots on negative coordinates must still sit on flat interior land (Task 2 test: every occupied hex is a flat `LAND_HEIGHT` tile).

---

### Task 1: Dependencies and scene model foundations

**Files:**
- Modify: `apps/web/package.json` (via `bun add`), `bun.lock`, `biome.json`
- Create: `apps/web/src/scene/model/hex-space.ts`, `random.ts`, `palette.ts`, `terrain.ts`
- Test: `apps/web/src/scene/model/foundations.test.ts`

**Interfaces:**
- Consumes: `Hex`, `hexDistance`, `hexRing` from `@archipelago/shared`; `colors` from `@archipelago/ui-tokens`.
- Produces:
  - `type Point = { x: number; z: number }`, `SQRT3`, `LAND_HEIGHT = 1`, `hexToWorld(h: Hex): Point`, `islandExtent(radius: number): number` (hex-space.ts)
  - `mulberry32(seed: number): () => number` (random.ts)
  - `mix(a: string, b: string, t: number): string`, `scenePalette`, `type SceneColor = keyof typeof scenePalette` (palette.ts)
  - `type TerrainTone`, `type TerrainTile = { q; r; height; tone }`, `MIN_ISLAND_RADIUS = 4`, `SHORE_RINGS = 2`, `islandRadius(occupied: readonly Hex[]): number`, `islandTerrain(seed: number, radius: number): TerrainTile[]` (terrain.ts)

- [ ] **Step 1: Install dependencies and allow pointer handlers on scene objects**

```bash
cd apps/web
bun add three@^0.186.1 @react-three/fiber@^9.8.1 @react-three/drei@^10.7.9
bun add -d @react-three/test-renderer@^9.1.1 @types/three@^0.186.0
```

Biome treats `<mesh onClick>` as a static DOM element and errors with `a11y/noStaticElementInteractions`. Scene objects are not DOM; the task panel is the accessible surface. Add this top-level key to the root `biome.json`:

```json
"overrides": [
  {
    "includes": ["apps/web/src/scene/**"],
    "linter": { "rules": { "a11y": { "noStaticElementInteractions": "off" } } }
  }
]
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/scene/model/foundations.test.ts`:

```ts
import { colors } from '@archipelago/ui-tokens'
import { hexDistance } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mix, scenePalette } from './palette'
import { mulberry32 } from './random'
import { islandRadius, islandTerrain } from './terrain'

const origin = { q: 0, r: 0 }

describe('hexToWorld', () => {
  test('neighbours are √3 apart and the origin maps to 0', () => {
    expect(hexToWorld(origin)).toEqual({ x: 0, z: 0 })
    expect(hexToWorld({ q: 1, r: 0 })).toEqual({ x: SQRT3, z: 0 })
    const p = hexToWorld({ q: 0, r: 1 })
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(SQRT3)
  })

  test('islandExtent covers the furthest hex centre plus its corner', () => {
    for (const h of [{ q: 4, r: 0 }, { q: 4, r: -4 }, { q: 2, r: 2 }]) {
      const p = hexToWorld(h)
      expect(Math.hypot(p.x, p.z) + 1).toBeLessThanOrEqual(islandExtent(4) + 1e-9)
    }
  })
})

describe('mulberry32', () => {
  test('is deterministic per seed, differs across seeds, and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = Array.from({ length: 50 }, a)
    expect(Array.from({ length: 50 }, b)).toEqual(seqA)
    expect(Array.from({ length: 50 }, c)).not.toEqual(seqA)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('palette', () => {
  test('mix blends channels linearly', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#004990', '#ffffff', 0)).toBe('#004990')
    expect(mix('#004990', '#ffffff', 1)).toBe('#ffffff')
  })

  test('scene colours are tokens or blends of tokens', () => {
    expect(scenePalette.sea).toBe(colors.brand)
    expect(scenePalette.shallows).toBe(colors.brandSecondary)
    expect(scenePalette.grass).toBe(colors.success)
    for (const value of Object.values(scenePalette)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('islandRadius', () => {
  test('is at least 4 and keeps two shore rings beyond the furthest occupied hex', () => {
    expect(islandRadius([])).toBe(4)
    expect(islandRadius([{ q: 1, r: 0 }])).toBe(4)
    expect(islandRadius([{ q: 5, r: 0 }])).toBe(7)
    expect(islandRadius([{ q: -10, r: 5 }])).toBe(12)
  })
})

describe('islandTerrain', () => {
  test('is deterministic per seed', () => {
    expect(islandTerrain(42, 6)).toEqual(islandTerrain(42, 6))
    expect(islandTerrain(42, 6)).not.toEqual(islandTerrain(43, 6))
  })

  test('the interior is complete flat land with a plaza at the origin', () => {
    const tiles = islandTerrain(7, 6)
    const at = (q: number, r: number) => tiles.find((t) => t.q === q && t.r === r)
    expect(at(0, 0)).toEqual({ q: 0, r: 0, height: LAND_HEIGHT, tone: 'plaza' })
    const interior = tiles.filter((t) => hexDistance(origin, t) <= 4)
    expect(interior).toHaveLength(1 + 3 * 4 * 5) // hexes within 4 rings
    for (const t of interior) expect(t.height).toBe(LAND_HEIGHT)
  })

  test('the shore is lower, never beyond the radius, and the outer ring is ragged', () => {
    let dropped = 0
    for (let seed = 1; seed <= 10; seed++) {
      const tiles = islandTerrain(seed, 6)
      const shore = tiles.filter((t) => hexDistance(origin, t) > 4)
      for (const t of shore) {
        expect(hexDistance(origin, t)).toBeLessThanOrEqual(6)
        expect(t.height).toBeGreaterThan(0.5)
        expect(t.height).toBeLessThan(LAND_HEIGHT)
        expect(['shore', 'rock']).toContain(t.tone)
      }
      expect(shore.filter((t) => hexDistance(origin, t) === 5)).toHaveLength(30)
      const outer = shore.filter((t) => hexDistance(origin, t) === 6).length
      expect(outer).toBeGreaterThan(18)
      dropped += 36 - outer
    }
    expect(dropped).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/model/foundations.test.ts`
Expected: FAIL because the modules (`./hex-space` and the others) cannot be resolved.

- [ ] **Step 4: Implement**

`apps/web/src/scene/model/hex-space.ts`:

```ts
import type { Hex } from '@archipelago/shared'

export type Point = { x: number; z: number }

export const SQRT3 = Math.sqrt(3)

/** Height of the flat island interior; structures and landmarks stand on it. */
export const LAND_HEIGHT = 1

/** Centre of a pointy-top hex of circumradius 1, in world units (y is up). */
export function hexToWorld(h: Hex): Point {
  return { x: SQRT3 * (h.q + h.r / 2), z: 1.5 * h.r }
}

/** World distance from an island's origin to the far corner of a hex `radius` rings out. */
export function islandExtent(radius: number): number {
  return radius * SQRT3 + 1
}
```

`apps/web/src/scene/model/random.ts`:

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
```

`apps/web/src/scene/model/palette.ts`:

```ts
import { colors } from '@archipelago/ui-tokens'

const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)

/** Linear blend of two `#rrggbb` colours: t=0 gives `a`, t=1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Every colour the 3D scene uses, derived only from A'raf tokens. */
export const scenePalette = {
  sea: colors.brand,
  shallows: colors.brandSecondary,
  grass: colors.success,
  meadow: mix(colors.success, colors.surfacePrimary, 0.25),
  shore: mix(colors.warning, colors.surfacePrimary, 0.55),
  rock: colors.textTertiary,
  plaza: colors.borderSecondary,
  stone: colors.textSecondary,
  wall: colors.surfaceSecondary,
  wood: colors.warning,
  woodDark: mix(colors.warning, colors.brand, 0.35),
  roof: colors.brandSecondary,
  roofDark: colors.brand,
  storm: mix(colors.error, colors.textPrimary, 0.25),
  glow: mix(colors.warning, colors.surfacePrimary, 0.4),
  selection: colors.brand,
  shadow: colors.brand,
} as const

export type SceneColor = keyof typeof scenePalette
```

`apps/web/src/scene/model/terrain.ts`:

```ts
import { type Hex, hexDistance, hexRing } from '@archipelago/shared'
import { LAND_HEIGHT } from './hex-space'
import { mulberry32 } from './random'

export type TerrainTone = 'grass' | 'meadow' | 'shore' | 'rock' | 'plaza'
export type TerrainTile = { q: number; r: number; height: number; tone: TerrainTone }

export const MIN_ISLAND_RADIUS = 4
export const SHORE_RINGS = 2
const ORIGIN: Hex = { q: 0, r: 0 }

/** Rings needed so every occupied hex is flat land with a two-ring shore beyond it. */
export function islandRadius(occupied: readonly Hex[]): number {
  const furthest = occupied.reduce((max, h) => Math.max(max, hexDistance(ORIGIN, h)), 0)
  return Math.max(MIN_ISLAND_RADIUS, furthest + SHORE_RINGS)
}

/**
 * Hex tiles for an island of `radius` rings. Everything within `radius − 2` is flat land at
 * LAND_HEIGHT; the outer two rings are a lower shore shaped by `seed`, and some hexes of the
 * outermost ring are left out for a ragged coast. Same seed and radius, same island.
 */
export function islandTerrain(seed: number, radius: number): TerrainTile[] {
  const random = mulberry32(seed)
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
        tiles.push({ q, r, height: LAND_HEIGHT, tone: a < 0.2 ? 'meadow' : 'grass' })
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/scene/model/foundations.test.ts`
Expected: PASS.

Two of these assertions are statistical: "outer > 18" and "dropped > 0" over seeds 1–10. If either fails, the generator is wrong. Fix the code, not the bound.

- [ ] **Step 6: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/package.json bun.lock biome.json apps/web/src/scene
git commit -m "feat(web): add the 3D stack and pure hex, palette and terrain model"
```

---

### Task 2: Scene model, structure states and camera targets

**Files:**
- Create: `apps/web/src/scene/model/state.ts`, `scene-model.ts`, `camera.ts`
- Test: `apps/web/src/scene/model/scene-model.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `hexToWorld`, `islandExtent`, `Point`, `LAND_HEIGHT`, `islandRadius`, `islandTerrain`, `TerrainTile`, `mulberry32`.
  - `dueStatus`, `Focus` from `apps/web/src/world/selectors.ts`.
  - `hexScale`, `nextArchipelagoSlot`, `hexKey`, `LandmarkType`, `WorldDto`, `TaskDto`, `MilestoneDto` from `@archipelago/shared`.
- Produces:
  - **state.ts**
    - `type StructureKind = 'scaffold' | 'crane' | 'hut' | 'house' | 'workshop'`
    - `type Marker = 'storm' | 'lantern' | null`
    - `STRUCTURE_KINDS: readonly StructureKind[]`
    - `structureFor(task, today): { kind: StructureKind; marker: Marker }`
    - `landmarkFor(milestone, tasks): { type: LandmarkType; progress: number }`
    - `solidSegments(progress: number, n: number): number`
  - **scene-model.ts**
    - `type SceneStructure = { taskId: string; kind: StructureKind; marker: Marker; position: Point }`. Position is island-local.
    - `type SceneDistrict = { milestoneId: string; name: string; type: LandmarkType; progress: number; position: Point }`. Position is island-local.
    - `type SceneIsland = { projectId: string; name: string; origin: Point; radius: number; tiles: TerrainTile[]; districts: SceneDistrict[]; structures: SceneStructure[] }`
    - `type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }`
    - `type SceneModel = { islands: SceneIsland[]; bounds: Bounds }`
    - `ISLAND_GAP = 3`
    - `buildSceneModel(world: WorldDto, today: string): SceneModel`
  - **camera.ts**
    - Zoom constants: `ARCHIPELAGO_ZOOM = 10`, `ISLAND_ZOOM = 48`, `DISTRICT_ZOOM = 72`, `MAX_ZOOM_FACTOR = 3`.
    - `type CameraTarget = { x: number; z: number; zoom: number }`
    - `cameraTarget(model: SceneModel, focus: Focus): CameraTarget`. World coordinates.
    - `clampToBounds(bounds: Bounds, x: number, z: number): { x: number; z: number }`
    - `focusKey(focus: Focus): string`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/model/scene-model.test.ts`:

```ts
import { type Hex, hexDistance, hexKey, nextArchipelagoSlot, type WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { addDays } from '../../world/selectors'
import {
  ARCHIPELAGO_ZOOM,
  cameraTarget,
  clampToBounds,
  DISTRICT_ZOOM,
  focusKey,
  ISLAND_ZOOM,
} from './camera'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mulberry32 } from './random'
import { buildSceneModel } from './scene-model'
import { landmarkFor, solidSegments, structureFor } from './state'

const today = '2026-10-07'
const world = (w: Partial<WorldDto>): WorldDto => ({
  projects: [],
  milestones: [],
  tasks: [],
  buildings: [],
  economy: {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  },
  ...w,
})

describe('structureFor', () => {
  test('maps status and size to a structure kind', () => {
    expect(structureFor({ status: 'todo', size: 'L', dueDate: null }, today).kind).toBe('scaffold')
    expect(structureFor({ status: 'doing', size: 'S', dueDate: null }, today).kind).toBe('crane')
    expect(structureFor({ status: 'done', size: 'S', dueDate: null }, today).kind).toBe('hut')
    expect(structureFor({ status: 'done', size: 'M', dueDate: null }, today).kind).toBe('house')
    expect(structureFor({ status: 'done', size: 'L', dueDate: null }, today).kind).toBe('workshop')
  })

  test('marks overdue with a storm and due within 48h with a lantern, never when done', () => {
    const at = (dueDate: string, status: 'todo' | 'done' = 'todo') =>
      structureFor({ status, size: 'M', dueDate }, today).marker
    expect(at(addDays(today, -1))).toBe('storm')
    expect(at(today)).toBe('lantern')
    expect(at(addDays(today, 1))).toBe('lantern')
    expect(at(addDays(today, 2))).toBeNull()
    expect(at(addDays(today, -1), 'done')).toBeNull()
  })

  test('uses the caller’s local today, not UTC', () => {
    // 2026-10-07 is already "today" in Jakarta even if UTC is still on the 6th.
    expect(structureFor({ status: 'todo', size: 'M', dueDate: '2026-10-06' }, '2026-10-07').marker).toBe('storm')
    expect(structureFor({ status: 'todo', size: 'M', dueDate: '2026-10-06' }, '2026-10-06').marker).toBe('lantern')
  })
})

describe('landmarkFor and solidSegments', () => {
  const m = fakeMilestone({ landmarkType: 'windmill' })
  test('progress is done ÷ total, 0 with no tasks, 1 once completed', () => {
    expect(landmarkFor(m, [])).toEqual({ type: 'windmill', progress: 0 })
    expect(landmarkFor(m, [{ status: 'done' }, { status: 'todo' }, { status: 'doing' }, { status: 'done' }]).progress).toBe(0.5)
    expect(landmarkFor({ ...m, completedAt: '2026-10-07T00:00:00.000Z' }, []).progress).toBe(1)
  })
  test('solid segments round up and never exceed n', () => {
    expect(solidSegments(0, 4)).toBe(0)
    expect(solidSegments(0.1, 4)).toBe(1)
    expect(solidSegments(0.5, 4)).toBe(2)
    expect(solidSegments(1, 4)).toBe(4)
  })
})

describe('buildSceneModel', () => {
  test('an empty world has no islands and default bounds', () => {
    expect(buildSceneModel(world({}), today)).toEqual({
      islands: [],
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    })
  })

  test('places structures and districts at their hexes, island-local', () => {
    const p = fakeProject({ name: 'Beta', islandSeed: 9 })
    const m = fakeMilestone({ projectId: p.id, name: 'MVP', landmarkType: 'market', districtQ: 5, districtR: 0 })
    const t = fakeTask({ projectId: p.id, milestoneId: m.id, plotX: 4, plotY: 1, status: 'done', size: 'L' })
    const [island] = buildSceneModel(world({ projects: [p], milestones: [m], tasks: [t] }), today).islands
    expect(island?.name).toBe('Beta')
    expect(island?.radius).toBe(7)
    expect(island?.origin).toEqual({ x: 0, z: 0 })
    expect(island?.districts).toEqual([
      { milestoneId: m.id, name: 'MVP', type: 'market', progress: 1, position: hexToWorld({ q: 5, r: 0 }) },
    ])
    expect(island?.structures).toEqual([
      { taskId: t.id, kind: 'workshop', marker: null, position: hexToWorld({ q: 4, r: 1 }) },
    ])
  })

  test('far districts and negative plots sit on flat interior land', () => {
    const p = fakeProject()
    const m = fakeMilestone({ projectId: p.id, districtQ: -10, districtR: 5 })
    const tasks = [
      fakeTask({ projectId: p.id, milestoneId: m.id, plotX: -11, plotY: 5 }),
      fakeTask({ projectId: p.id, plotX: -1, plotY: -2 }),
    ]
    const [island] = buildSceneModel(world({ projects: [p], milestones: [m], tasks }), today).islands
    const occupied: Hex[] = [{ q: -10, r: 5 }, { q: -11, r: 5 }, { q: -1, r: -2 }]
    for (const h of occupied) {
      const tile = island?.tiles.find((t) => t.q === h.q && t.r === h.r)
      expect(tile?.height).toBe(LAND_HEIGHT)
    }
  })

  test('islands never overlap, however large one grows', () => {
    const random = mulberry32(2026)
    for (let round = 0; round < 25; round++) {
      const taken = new Set<string>()
      const projects = Array.from({ length: 1 + Math.floor(random() * 7) }, () => {
        const slot = nextArchipelagoSlot(taken)
        taken.add(hexKey(slot))
        return fakeProject({ archipelagoX: slot.q, archipelagoY: slot.r })
      })
      const tasks = projects.flatMap((p) =>
        Array.from({ length: Math.floor(random() * 6) }, () =>
          fakeTask({ projectId: p.id, plotX: Math.floor(random() * 25) - 12, plotY: Math.floor(random() * 25) - 12 }),
        ),
      )
      const { islands, bounds } = buildSceneModel(world({ projects, tasks }), today)
      islands.forEach((a, i) => {
        expect(a.origin.x - islandExtent(a.radius)).toBeGreaterThanOrEqual(bounds.minX)
        expect(a.origin.x + islandExtent(a.radius)).toBeLessThanOrEqual(bounds.maxX)
        expect(a.origin.z - islandExtent(a.radius)).toBeGreaterThanOrEqual(bounds.minZ)
        expect(a.origin.z + islandExtent(a.radius)).toBeLessThanOrEqual(bounds.maxZ)
        for (const b of islands.slice(i + 1)) {
          const gap = Math.hypot(a.origin.x - b.origin.x, a.origin.z - b.origin.z)
          expect(gap).toBeGreaterThanOrEqual(islandExtent(a.radius) + islandExtent(b.radius))
        }
      })
    }
  })

  test('every task plot lies within its island radius', () => {
    const p = fakeProject()
    const t = fakeTask({ projectId: p.id, plotX: 3, plotY: -6 })
    const [island] = buildSceneModel(world({ projects: [p], tasks: [t] }), today).islands
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -6 })).toBeLessThanOrEqual((island?.radius ?? 0) - 2)
  })
})

describe('camera', () => {
  test('zooms meet the readability floors in spec 13.4', () => {
    expect(2 * islandExtent(4) * ARCHIPELAGO_ZOOM).toBeGreaterThanOrEqual(120)
    expect(SQRT3 * ISLAND_ZOOM).toBeGreaterThanOrEqual(56) // hex width on screen
    expect(ISLAND_ZOOM).toBeGreaterThanOrEqual(44) // hex footprint height at true isometric ≈ 1 unit
    expect(DISTRICT_ZOOM).toBe(ISLAND_ZOOM * 1.5)
  })

  test('targets the bounds centre, the island origin, or the district centre', () => {
    const p = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
    const home = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const model = buildSceneModel(world({ projects: [home, p], milestones: [m] }), today)
    const island = model.islands.find((i) => i.projectId === p.id)
    const { bounds } = model

    expect(cameraTarget(model, { kind: 'archipelago' })).toEqual({
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
      zoom: ARCHIPELAGO_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'island', projectId: p.id })).toEqual({ ...island?.origin, zoom: ISLAND_ZOOM })
    const d = hexToWorld({ q: 5, r: 0 })
    expect(cameraTarget(model, { kind: 'district', projectId: p.id, milestoneId: m.id })).toEqual({
      x: (island?.origin.x ?? 0) + d.x,
      z: (island?.origin.z ?? 0) + d.z,
      zoom: DISTRICT_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'island', projectId: 'missing' }).zoom).toBe(ARCHIPELAGO_ZOOM)
  })

  test('clampToBounds keeps the pan target inside the world', () => {
    const b = { minX: -5, maxX: 5, minZ: -2, maxZ: 2 }
    expect(clampToBounds(b, 9, -9)).toEqual({ x: 5, z: -2 })
    expect(clampToBounds(b, 1, 1)).toEqual({ x: 1, z: 1 })
  })

  test('focusKey changes with the route, not with the world', () => {
    expect(focusKey({ kind: 'archipelago' })).toBe('archipelago')
    expect(focusKey({ kind: 'island', projectId: 'a' })).toBe('island:a')
    expect(focusKey({ kind: 'district', projectId: 'a', milestoneId: 'm' })).toBe('district:a:m')
    expect(focusKey({ kind: 'island', projectId: 'a' })).not.toBe(focusKey({ kind: 'island', projectId: 'b' }))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/model/scene-model.test.ts`
Expected: FAIL because `./camera`, `./scene-model` and `./state` cannot be resolved.

- [ ] **Step 3: Implement**

`apps/web/src/scene/model/state.ts`:

```ts
import type { LandmarkType, MilestoneDto, TaskDto } from '@archipelago/shared'
import { dueStatus } from '../../world/selectors'

export type StructureKind = 'scaffold' | 'crane' | 'hut' | 'house' | 'workshop'
export type Marker = 'storm' | 'lantern' | null

export const STRUCTURE_KINDS: readonly StructureKind[] = ['scaffold', 'crane', 'hut', 'house', 'workshop']

const builtBySize = { S: 'hut', M: 'house', L: 'workshop' } as const

/** What a task looks like in the world: its structure and an optional due-date marker (spec §2). */
export function structureFor(
  task: Pick<TaskDto, 'status' | 'size' | 'dueDate'>,
  today: string,
): { kind: StructureKind; marker: Marker } {
  const kind: StructureKind =
    task.status === 'todo' ? 'scaffold' : task.status === 'doing' ? 'crane' : builtBySize[task.size]
  const due = dueStatus(task, today)
  return { kind, marker: due === 'overdue' ? 'storm' : due === 'due-soon' ? 'lantern' : null }
}

export function landmarkFor(
  milestone: Pick<MilestoneDto, 'landmarkType' | 'completedAt'>,
  tasks: readonly Pick<TaskDto, 'status'>[],
): { type: LandmarkType; progress: number } {
  const type = milestone.landmarkType
  if (milestone.completedAt !== null) return { type, progress: 1 }
  if (tasks.length === 0) return { type, progress: 0 }
  return { type, progress: tasks.filter((t) => t.status === 'done').length / tasks.length }
}

/** How many of a landmark's `n` stacked segments are built at `progress`. */
export function solidSegments(progress: number, n: number): number {
  return Math.min(n, Math.ceil(progress * n))
}
```

`apps/web/src/scene/model/scene-model.ts`:

```ts
import { type Hex, hexScale, type LandmarkType, type WorldDto } from '@archipelago/shared'
import { hexToWorld, islandExtent, type Point } from './hex-space'
import { landmarkFor, type Marker, type StructureKind, structureFor } from './state'
import { islandRadius, islandTerrain, type TerrainTile } from './terrain'

export type SceneStructure = { taskId: string; kind: StructureKind; marker: Marker; position: Point }
export type SceneDistrict = {
  milestoneId: string
  name: string
  type: LandmarkType
  progress: number
  position: Point
}
export type SceneIsland = {
  projectId: string
  name: string
  origin: Point
  radius: number
  tiles: TerrainTile[]
  districts: SceneDistrict[]
  structures: SceneStructure[]
}
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
export type SceneModel = { islands: SceneIsland[]; bounds: Bounds }

/** Hex rings of open sea between neighbouring islands' shores. */
export const ISLAND_GAP = 3
const EMPTY_BOUNDS: Bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }

/** Positions within an island are island-local; `origin` places the island in the world. */
export function buildSceneModel(world: WorldDto, today: string): SceneModel {
  const prepared = world.projects.map((project) => {
    const milestones = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const occupied: Hex[] = [
      ...tasks.map((t) => ({ q: t.plotX, r: t.plotY })),
      ...milestones.map((m) => ({ q: m.districtQ, r: m.districtR })),
    ]
    return { project, milestones, tasks, radius: islandRadius(occupied) }
  })
  // Slots are one hex apart; scaling them by the largest island's diameter plus a gap means no
  // two islands can touch, however big one grows.
  const largest = prepared.reduce((max, p) => Math.max(max, p.radius), 0)
  const spacing = 2 * largest + ISLAND_GAP

  const islands = prepared.map(({ project, milestones, tasks, radius }) => ({
    projectId: project.id,
    name: project.name,
    origin: hexToWorld(hexScale({ q: project.archipelagoX, r: project.archipelagoY }, spacing)),
    radius,
    tiles: islandTerrain(project.islandSeed, radius),
    districts: milestones.map((m) => ({
      milestoneId: m.id,
      name: m.name,
      ...landmarkFor(m, tasks.filter((t) => t.milestoneId === m.id)),
      position: hexToWorld({ q: m.districtQ, r: m.districtR }),
    })),
    structures: tasks.map((t) => ({
      taskId: t.id,
      ...structureFor(t, today),
      position: hexToWorld({ q: t.plotX, r: t.plotY }),
    })),
  }))
  return { islands, bounds: boundsOf(islands) }
}

function boundsOf(islands: readonly SceneIsland[]): Bounds {
  if (islands.length === 0) return EMPTY_BOUNDS
  return islands.reduce<Bounds>(
    (b, island) => {
      const e = islandExtent(island.radius)
      return {
        minX: Math.min(b.minX, island.origin.x - e),
        maxX: Math.max(b.maxX, island.origin.x + e),
        minZ: Math.min(b.minZ, island.origin.z - e),
        maxZ: Math.max(b.maxZ, island.origin.z + e),
      }
    },
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}
```

`apps/web/src/scene/model/camera.ts`:

```ts
import type { Focus } from '../../world/selectors'
import type { Bounds, SceneModel } from './scene-model'

/** Orthographic zoom = screen pixels per world unit (spec §13.4). */
export const ARCHIPELAGO_ZOOM = 10
export const ISLAND_ZOOM = 48
export const DISTRICT_ZOOM = ISLAND_ZOOM * 1.5
export const MAX_ZOOM_FACTOR = 3

export type CameraTarget = { x: number; z: number; zoom: number }

/** Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. */
export function cameraTarget(model: SceneModel, focus: Focus): CameraTarget {
  const { bounds } = model
  const overview = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    zoom: ARCHIPELAGO_ZOOM,
  }
  if (focus.kind === 'archipelago') return overview
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return overview
  const islandTarget = { x: island.origin.x, z: island.origin.z, zoom: ISLAND_ZOOM }
  if (focus.kind === 'island') return islandTarget
  const district = island.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!district) return islandTarget
  return {
    x: island.origin.x + district.position.x,
    z: island.origin.z + district.position.z,
    zoom: DISTRICT_ZOOM,
  }
}

export function clampToBounds(bounds: Bounds, x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, z)),
  }
}

/** Identifies a route; the camera snaps when this changes and never on a mere data refresh. */
export function focusKey(focus: Focus): string {
  if (focus.kind === 'archipelago') return 'archipelago'
  if (focus.kind === 'island') return `island:${focus.projectId}`
  return `district:${focus.projectId}:${focus.milestoneId}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/scene/model`
Expected: PASS (both files).

- [ ] **Step 5: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene/model
git commit -m "feat(web): build the scene model, structure states and camera targets"
```

---
### Task 3: Procedural models and materials

**Files:**
- Create: `apps/web/src/scene/models/build.ts`, `structures.ts`, `landmarks.ts`, `terrain-geometry.ts`, `apps/web/src/scene/materials.ts`
- Test: `apps/web/src/scene/models/models.test.ts`

**Interfaces:**
- Consumes: Task 1 `scenePalette`, `SceneColor`, `hexToWorld`, `islandExtent`, `TerrainTile`; Task 2 `StructureKind`, `STRUCTURE_KINDS`; `LandmarkType`, `LANDMARK_TYPES` from `@archipelago/shared`.
- Produces:
  - **build.ts**
    - `part(geometry, color: SceneColor, at?: readonly [number, number, number], turn?: number): BufferGeometry`
    - `merge(parts: BufferGeometry[]): BufferGeometry`
    - Shapes standing on y=0: `box(w, h, d)`, `prism(top, bottom, h, sides?)`, `cone(r, h, sides)`
  - **structures.ts**
    - `type ModelKind = StructureKind | 'jib' | 'storm' | 'lantern' | 'shadow' | 'selection'`
    - `MODEL_KINDS: readonly ModelKind[]`
    - `JIB_PIVOT = [0.4, 1.3, -0.4] as const`
    - `modelGeometry(kind: ModelKind): BufferGeometry`. Cached and shared, so never dispose it.
  - **landmarks.ts:** `landmarkSegments(type: LandmarkType): BufferGeometry[]`. Bottom to top, cached and shared.
  - **terrain-geometry.ts:** `SEA_LEVEL = 0.15`, `SHALLOWS_HEIGHT = 0.3`, `SHALLOWS_MARGIN = 1.2`, `islandGeometry(tiles, radius): BufferGeometry`. A fresh geometry that the caller disposes.
  - **materials.ts:** `solidMaterial`, `ghostMaterial`, `shadowMaterial`, `seaMaterial`.

All model geometries sit with their base at y=0 and are centred on their hex, so the renderer only translates them to `(x, LAND_HEIGHT, z)`. The exception is the crane jib, which is modelled around its pivot.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/models/models.test.ts`:

```ts
import { LANDMARK_TYPES } from '@archipelago/shared'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { islandExtent } from '../model/hex-space'
import { scenePalette } from '../model/palette'
import { islandTerrain } from '../model/terrain'
import { landmarkSegments } from './landmarks'
import { MODEL_KINDS, modelGeometry } from './structures'
import { islandGeometry } from './terrain-geometry'

const FOOTPRINT = 0.85 // just inside a hex's inradius (√3/2)
const allowed = Object.values(scenePalette).map((hex) => new THREE.Color(hex))

function expectPaletteColoured(g: THREE.BufferGeometry) {
  const position = g.getAttribute('position')
  const color = g.getAttribute('color')
  expect(position.count).toBeGreaterThan(0)
  expect(color.count).toBe(position.count)
  for (let i = 0; i < color.count; i++) {
    const c = new THREE.Color(color.getX(i), color.getY(i), color.getZ(i))
    // Colours are stored as float32, so compare with a tolerance rather than exactly.
    const near = (a: THREE.Color) =>
      Math.abs(a.r - c.r) < 1e-6 && Math.abs(a.g - c.g) < 1e-6 && Math.abs(a.b - c.b) < 1e-6
    expect(allowed.some(near)).toBe(true)
  }
}

function expectInsideFootprint(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  const box = g.boundingBox ?? new THREE.Box3()
  expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
  for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
    expect(Math.abs(v)).toBeLessThanOrEqual(FOOTPRINT)
  }
}

describe('structure models', () => {
  test.each(MODEL_KINDS)('%s is non-empty and palette-coloured', (kind) => {
    expectPaletteColoured(modelGeometry(kind))
  })

  test.each(MODEL_KINDS.filter((k) => k !== 'jib'))('%s stays on its hex', (kind) => {
    expectInsideFootprint(modelGeometry(kind))
  })

  test('geometries are cached and shared', () => {
    expect(modelGeometry('house')).toBe(modelGeometry('house'))
  })

  test('done buildings grow with size', () => {
    const footprint = (k: 'hut' | 'house' | 'workshop') => {
      const g = modelGeometry(k)
      g.computeBoundingBox()
      const b = g.boundingBox ?? new THREE.Box3()
      return (b.max.x - b.min.x) * (b.max.z - b.min.z)
    }
    expect(footprint('hut')).toBeLessThan(footprint('house'))
    expect(footprint('house')).toBeLessThan(footprint('workshop'))
  })
})

describe('landmarks', () => {
  test.each([...LANDMARK_TYPES])('%s has at least three coloured segments on its hex', (type) => {
    const segments = landmarkSegments(type)
    expect(segments.length).toBeGreaterThanOrEqual(3)
    for (const s of segments) {
      expectPaletteColoured(s)
      expectInsideFootprint(s)
    }
  })
})

describe('islandGeometry', () => {
  test('merges every tile plus a shallows hexagon, within the shallows extent', () => {
    const tiles = islandTerrain(5, 4)
    const g = islandGeometry(tiles, 4)
    expectPaletteColoured(g)
    g.computeBoundingBox()
    const limit = islandExtent(4) + 1.2 + 1e-6
    expect(g.boundingBox?.max.x).toBeLessThanOrEqual(limit)
    expect(g.boundingBox?.min.z).toBeGreaterThanOrEqual(-limit)
    g.dispose()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/models`
Expected: FAIL because the modules cannot be resolved.

- [ ] **Step 3: Implement**

`apps/web/src/scene/models/build.ts`:

```ts
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type SceneColor, scenePalette } from '../model/palette'

type Vec3 = readonly [number, number, number]

/**
 * A palette-coloured, non-indexed copy of `geometry`, turned `turn` radians about y and moved to
 * `at`. Takes ownership of `geometry`.
 */
export function part(
  geometry: THREE.BufferGeometry,
  color: SceneColor,
  at: Vec3 = [0, 0, 0],
  turn = 0,
): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (flat !== geometry) geometry.dispose()
  // Merging needs identical attribute sets: keep position, normal and our colour only.
  flat.deleteAttribute('uv')
  flat.rotateY(turn)
  flat.translate(at[0], at[1], at[2])
  const c = new THREE.Color(scenePalette[color])
  const count = flat.getAttribute('position').count
  const data = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3)
  flat.setAttribute('color', new THREE.BufferAttribute(data, 3))
  return flat
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  if (!merged) throw new Error('merge: incompatible geometries')
  for (const p of parts) p.dispose()
  return merged
}

/** Shapes with their base on y=0, centred on x/z. */
export const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)
export const prism = (top: number, bottom: number, h: number, sides = 6) =>
  new THREE.CylinderGeometry(top, bottom, h, sides).translate(0, h / 2, 0)
export const cone = (r: number, h: number, sides: number) =>
  new THREE.ConeGeometry(r, h, sides).translate(0, h / 2, 0)
```

`apps/web/src/scene/models/structures.ts`:

```ts
import * as THREE from 'three'
import { STRUCTURE_KINDS, type StructureKind } from '../model/state'
import { box, cone, merge, part, prism } from './build'

export type ModelKind = StructureKind | 'jib' | 'storm' | 'lantern' | 'shadow' | 'selection'
export const MODEL_KINDS: readonly ModelKind[] = [
  ...STRUCTURE_KINDS,
  'jib',
  'storm',
  'lantern',
  'shadow',
  'selection',
]

/** The crane mast's top, relative to the plot centre's ground: the jib turns about this point. */
export const JIB_PIVOT = [0.4, 1.3, -0.4] as const

const quarter = Math.PI / 4

const scaffold = () => [
  part(box(0.72, 0.05, 0.72), 'plaza'),
  ...[-0.3, 0.3].flatMap((x) =>
    [-0.3, 0.3].map((z) => part(box(0.06, 0.72, 0.06), 'wood', [x, 0, z])),
  ),
  ...[0.36, 0.68].flatMap((y) => [
    part(box(0.66, 0.05, 0.05), 'woodDark', [0, y, -0.3]),
    part(box(0.66, 0.05, 0.05), 'woodDark', [0, y, 0.3]),
    part(box(0.05, 0.05, 0.66), 'woodDark', [-0.3, y, 0]),
    part(box(0.05, 0.05, 0.66), 'woodDark', [0.3, y, 0]),
  ]),
]

const builders: Record<ModelKind, () => THREE.BufferGeometry[]> = {
  scaffold,
  crane: () => [
    ...scaffold(),
    part(box(0.08, JIB_PIVOT[1], 0.08), 'stone', [JIB_PIVOT[0], 0, JIB_PIVOT[2]]),
  ],
  jib: () => [
    part(box(0.9, 0.06, 0.06), 'wood', [0.25, 0, 0]),
    part(box(0.14, 0.12, 0.12), 'stone', [-0.22, -0.12, 0]),
    part(box(0.02, 0.4, 0.02), 'stone', [0.6, -0.4, 0]),
  ],
  hut: () => [part(box(0.5, 0.35, 0.5), 'wall'), part(cone(0.45, 0.35, 4), 'wood', [0, 0.35, 0], quarter)],
  house: () => [
    part(box(0.7, 0.5, 0.6), 'wall'),
    part(cone(0.6, 0.4, 4), 'roof', [0, 0.5, 0], quarter),
    part(box(0.1, 0.25, 0.1), 'stone', [0.2, 0.6, 0.12]),
    part(box(0.16, 0.28, 0.02), 'woodDark', [0, 0, 0.31]),
  ],
  workshop: () => [
    part(box(0.9, 0.55, 0.75), 'wall'),
    part(box(0.96, 0.12, 0.8), 'roofDark', [0, 0.55, 0]),
    part(prism(0.08, 0.08, 0.5), 'stone', [0.3, 0.67, -0.2]),
    part(box(0.24, 0.32, 0.02), 'woodDark', [0, 0, 0.38]),
  ],
  storm: () => [
    part(new THREE.IcosahedronGeometry(0.24, 0), 'storm', [0, 1.55, 0]),
    part(new THREE.IcosahedronGeometry(0.18, 0), 'storm', [0.2, 1.5, 0.05]),
    part(new THREE.IcosahedronGeometry(0.18, 0), 'storm', [-0.2, 1.5, -0.05]),
  ],
  lantern: () => [
    part(box(0.04, 0.5, 0.04), 'woodDark', [-0.4, 0, 0.35]),
    part(box(0.12, 0.14, 0.12), 'glow', [-0.4, 0.5, 0.35]),
  ],
  shadow: () => [part(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), 'shadow', [0, 0.01, 0])],
  // Six segments put the ring's corners on the hex's corners once turned 30°.
  selection: () => [
    part(new THREE.RingGeometry(0.62, 0.72, 6).rotateX(-Math.PI / 2), 'selection', [0, 0.02, 0], Math.PI / 6),
  ],
}

const cache = new Map<ModelKind, THREE.BufferGeometry>()

/** One merged, vertex-coloured geometry per kind, built on first use and shared by every instance. */
export function modelGeometry(kind: ModelKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}
```

`apps/web/src/scene/models/landmarks.ts`:

```ts
import type { LandmarkType } from '@archipelago/shared'
import * as THREE from 'three'
import { box, cone, merge, part, prism } from './build'

const quarter = Math.PI / 4

/** Each landmark is a stack of segments, bottom first; progress decides how many are solid. */
const recipes: Record<LandmarkType, () => THREE.BufferGeometry[][]> = {
  lighthouse: () => [
    [part(prism(0.42, 0.48, 0.3), 'stone')],
    [part(prism(0.3, 0.36, 0.6), 'wall', [0, 0.3, 0])],
    [part(prism(0.26, 0.3, 0.5), 'roof', [0, 0.9, 0])],
    [part(prism(0.24, 0.24, 0.25), 'glow', [0, 1.4, 0]), part(cone(0.3, 0.3, 6), 'roofDark', [0, 1.65, 0])],
  ],
  town_hall: () => [
    [part(box(1.1, 0.12, 0.9), 'plaza')],
    [part(box(1.0, 0.5, 0.8), 'wall', [0, 0.12, 0]), part(box(0.24, 0.32, 0.02), 'woodDark', [0, 0.12, 0.41])],
    [part(cone(0.75, 0.4, 4), 'roofDark', [0, 0.62, 0], quarter)],
    [part(box(0.28, 0.45, 0.28), 'wall', [0, 0.85, 0]), part(cone(0.24, 0.3, 4), 'roof', [0, 1.3, 0], quarter)],
  ],
  windmill: () => [
    [part(prism(0.42, 0.5, 0.6), 'wall')],
    [part(prism(0.34, 0.42, 0.5), 'wall', [0, 0.6, 0])],
    [part(cone(0.42, 0.4, 6), 'roofDark', [0, 1.1, 0])],
    [part(box(1.1, 0.12, 0.03), 'wood', [0, 1.1, 0.45]), part(box(0.12, 1.1, 0.03), 'wood', [0, 0.55, 0.45])],
  ],
  observatory: () => [
    [part(prism(0.5, 0.56, 0.4), 'stone')],
    [part(prism(0.46, 0.46, 0.35), 'wall', [0, 0.4, 0])],
    [
      part(new THREE.SphereGeometry(0.46, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 'roof', [0, 0.75, 0]),
      part(box(0.1, 0.1, 0.5), 'stone', [0, 1.05, 0.15]),
    ],
  ],
  market: () => [
    [part(box(1.2, 0.1, 1.0), 'plaza')],
    [part(box(0.4, 0.35, 0.3), 'wood', [-0.3, 0.1, 0.2]), part(box(0.4, 0.35, 0.3), 'wood', [0.3, 0.1, -0.2])],
    [
      part(box(0.5, 0.06, 0.4), 'roof', [-0.3, 0.45, 0.2]),
      part(box(0.5, 0.06, 0.4), 'wall', [0.3, 0.45, -0.2]),
      part(box(0.04, 0.8, 0.04), 'woodDark', [0.5, 0.1, 0.4]),
      part(box(0.2, 0.12, 0.02), 'roof', [0.4, 0.75, 0.4]),
    ],
  ],
}

const cache = new Map<LandmarkType, THREE.BufferGeometry[]>()

export function landmarkSegments(type: LandmarkType): THREE.BufferGeometry[] {
  let segments = cache.get(type)
  if (!segments) {
    segments = recipes[type]().map(merge)
    cache.set(type, segments)
  }
  return segments
}
```

`apps/web/src/scene/models/terrain-geometry.ts`:

```ts
import type * as THREE from 'three'
import { hexToWorld, islandExtent } from '../model/hex-space'
import type { TerrainTile } from '../model/terrain'
import { merge, part, prism } from './build'

export const SEA_LEVEL = 0.15
export const SHALLOWS_HEIGHT = 0.3
export const SHALLOWS_MARGIN = 1.2

/** One merged mesh per island: a hex prism per tile, on a hexagon of shallows. Caller disposes. */
export function islandGeometry(tiles: readonly TerrainTile[], radius: number): THREE.BufferGeometry {
  const parts = tiles.map((t) => {
    const { x, z } = hexToWorld(t)
    return part(prism(1, 1, t.height), t.tone, [x, 0, z])
  })
  const shallows = islandExtent(radius) + SHALLOWS_MARGIN
  // The island's outline is a flat-topped hexagon; turning the prism 30° matches it.
  parts.push(part(prism(shallows, shallows, SHALLOWS_HEIGHT), 'shallows', [0, 0, 0], Math.PI / 6))
  return merge(parts)
}
```

`apps/web/src/scene/materials.ts`:

```ts
import * as THREE from 'three'
import { scenePalette } from './model/palette'

/** Shared by every mesh in the scene; never disposed. */
export const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
export const ghostMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})
export const shadowMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
})
export const seaMaterial = new THREE.MeshLambertMaterial({ color: scenePalette.sea, flatShading: true })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/scene/models`
Expected: PASS.

If a footprint assertion fails, the model's numbers are wrong. Shrink or move the part; do not loosen `FOOTPRINT`.

- [ ] **Step 5: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene
git commit -m "feat(web): add procedural low-poly models for structures, landmarks and terrain"
```

---
### Task 4: Scene components (islands, structures, landmarks, sea)

**Files:**
- Create:
  - `apps/web/src/scene/tap.ts`
  - `model-instances.tsx`, `crane-jibs.tsx`, `landmark.tsx`, `island.tsx`, `sea.tsx`, `world-contents.tsx` (all under `apps/web/src/scene/`)
- Test: `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Consumes:
  - Task 2: `SceneModel`, `SceneIsland`, `SceneDistrict`, `Bounds`, `STRUCTURE_KINDS`, `solidSegments`, `LAND_HEIGHT`, `Point`.
  - Task 3: `modelGeometry`, `ModelKind`, `JIB_PIVOT`, `landmarkSegments`, `islandGeometry`, `SEA_LEVEL`, materials.
  - `Focus` from `world/selectors.ts`.
- Produces:
  - **tap.ts:** `TAP_SLOP_PX = 6`; `onTap<E>(handler: (event: ThreeEvent<E>) => void)`. It returns an R3F handler that ignores drags and stops propagation.
  - **world-contents.tsx:**
    - `type SceneHandlers = { onSelect: (taskId: string | null) => void; onOpenIsland: (projectId: string) => void; onOpenDistrict: (projectId: string, milestoneId: string) => void }`
    - `type WorldContentsProps = SceneHandlers & { model: SceneModel; focus: Focus; selectedTaskId: string | null; animate: boolean }`
    - `WorldContents(props: WorldContentsProps)`: lights, sea and every island.
  - **Scene-graph names** that tests (and Task 5) find nodes by:
    - an island group is `island:<projectId>`, holding `terrain` and `selection`;
    - each instanced mesh is named after its `ModelKind` (`scaffold`, `crane`, `hut`, …, `storm`, `lantern`, `shadow`, `jib`);
    - a landmark group is `landmark:<milestoneId>`;
    - the sea is `sea`.

**Interaction rules (spec §13.5):**
- An island that is not focused navigates on tap: `onOpenIsland`, via a group handler.
- In the focused island:
  - a structure tap selects its task;
  - a landmark tap calls `onOpenDistrict`;
  - a terrain tap calls `onSelect(null)`.
- A sea tap always calls `onSelect(null)`.
- Every handler goes through `onTap`, so a press that moved more than 6px does nothing.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/world-contents.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { addDays, type Focus } from '../world/selectors'
import { ghostMaterial, solidMaterial } from './materials'
import { buildSceneModel } from './model/scene-model'
import { WorldContents } from './world-contents'

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
type Node = Renderer['scene']

const today = '2026-10-07'
const economy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}

function seeded() {
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP', landmarkType: 'lighthouse', districtQ: 5, districtR: 0 })
  const tasks = [
    fakeTask({ projectId: beta.id, title: 'Late', status: 'todo', dueDate: addDays(today, -1), plotX: 1, plotY: 0 }),
    fakeTask({ projectId: beta.id, title: 'Soon', status: 'doing', dueDate: today, plotX: 2, plotY: 0 }),
    fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'Shipped', status: 'done', size: 'S', plotX: 4, plotY: 0 }),
    fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'Next', status: 'todo', plotX: 6, plotY: 0 }),
    fakeTask({ projectId: gamma.id, title: 'Other', status: 'done', size: 'L', plotX: 1, plotY: 0 }),
  ]
  const world: WorldDto = { projects: [beta, gamma], milestones: [mvp], tasks, buildings: [], economy }
  return { world, beta, gamma, mvp, tasks }
}

const handlers = () => ({ onSelect: vi.fn(), onOpenIsland: vi.fn(), onOpenDistrict: vi.fn() })

async function render(world: WorldDto, focus: Focus, selectedTaskId: string | null = null) {
  const h = handlers()
  const renderer = await ReactThreeTestRenderer.create(
    <WorldContents
      model={buildSceneModel(world, today)}
      focus={focus}
      selectedTaskId={selectedTaskId}
      animate={false}
      {...h}
    />,
  )
  return { renderer, ...h }
}

const named = (root: Node, name: string) => root.findAll((n) => n.props.name === name)
const one = (root: Node, name: string) => {
  const [node] = named(root, name)
  if (!node) throw new Error(`no node named ${name}`)
  return node
}
const instanceCount = (root: Node, name: string) =>
  named(root, name).reduce((sum, n) => sum + (n.instance as THREE.InstancedMesh).count, 0)

describe('WorldContents', () => {
  test('renders one instance per structure and marker, per kind', async () => {
    const { world, beta } = seeded()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(instanceCount(island, 'scaffold')).toBe(2)
    expect(instanceCount(island, 'crane')).toBe(1)
    expect(instanceCount(island, 'jib')).toBe(1)
    expect(instanceCount(island, 'hut')).toBe(1)
    expect(named(island, 'workshop')).toHaveLength(0)
    expect(instanceCount(island, 'storm')).toBe(1)
    expect(instanceCount(island, 'lantern')).toBe(1)
    expect(instanceCount(island, 'shadow')).toBe(4)
    expect(named(renderer.scene, 'sea')).toHaveLength(1)
  })

  test('a structure tap in the focused island selects its task; a drag does not', async () => {
    const { world, beta, tasks } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    const scaffolds = one(one(renderer.scene, `island:${beta.id}`), 'scaffold')
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 1, delta: 20 })
    expect(onSelect).not.toHaveBeenCalled()
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 1, delta: 2 })
    expect(onSelect).toHaveBeenCalledWith(tasks[3]?.id)
  })

  test('terrain and sea taps clear the selection', async () => {
    const { world, beta } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    await renderer.fireEvent(one(renderer.scene, 'terrain'), 'click', { delta: 0 })
    await renderer.fireEvent(one(renderer.scene, 'sea'), 'click', { delta: 0 })
    expect(onSelect.mock.calls).toEqual([[null], [null]])
  })

  test('a landmark tap opens its district; another island’s tap opens that island', async () => {
    const { world, beta, gamma, mvp } = seeded()
    const { renderer, onOpenDistrict, onOpenIsland } = await render(world, { kind: 'island', projectId: beta.id })
    await renderer.fireEvent(one(renderer.scene, `landmark:${mvp.id}`), 'click', { delta: 0 })
    expect(onOpenDistrict).toHaveBeenCalledWith(beta.id, mvp.id)
    await renderer.fireEvent(one(renderer.scene, `island:${gamma.id}`), 'click', { delta: 0 })
    expect(onOpenIsland).toHaveBeenCalledWith(gamma.id)
  })

  test('in archipelago view an island tap opens it and structures do not select', async () => {
    const { world, beta } = seeded()
    const { renderer, onOpenIsland, onSelect } = await render(world, { kind: 'archipelago' })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(one(island, 'scaffold').props.onClick).toBeUndefined()
    await renderer.fireEvent(island, 'click', { delta: 3 })
    expect(onOpenIsland).toHaveBeenCalledWith(beta.id)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('landmark segments are solid up to progress and ghosted after it', async () => {
    const { world, beta, mvp } = seeded()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const segments = one(renderer.scene, `landmark:${mvp.id}`).children
    // 1 of 2 tasks done → progress 0.5 → ceil(0.5 × 4) = 2 solid of the lighthouse's 4.
    expect(segments.map((s) => s.props.material)).toEqual([solidMaterial, solidMaterial, ghostMaterial, ghostMaterial])
  })

  test('the selected structure gets a ring; a selection elsewhere draws none', async () => {
    const { world, beta, tasks } = seeded()
    const selected = await render(world, { kind: 'island', projectId: beta.id }, tasks[0]?.id ?? null)
    expect(named(one(selected.renderer.scene, `island:${beta.id}`), 'selection')).toHaveLength(1)
    const elsewhere = await render(world, { kind: 'island', projectId: beta.id }, tasks[4]?.id ?? null)
    expect(named(one(elsewhere.renderer.scene, `island:${beta.id}`), 'selection')).toHaveLength(0)
    const gone = await render(world, { kind: 'island', projectId: beta.id }, 'deleted-task')
    expect(named(gone.renderer.scene, 'selection')).toHaveLength(0)
  })

  test('instance counts follow the data when tasks are added or removed', async () => {
    const { world, beta } = seeded()
    const focus: Focus = { kind: 'island', projectId: beta.id }
    const { renderer } = await render(world, focus)
    const more = {
      ...world,
      tasks: [...world.tasks, fakeTask({ projectId: beta.id, status: 'todo', plotX: 0, plotY: 1 })],
    }
    const props = { focus, selectedTaskId: null, animate: false, ...handlers() }
    await renderer.update(<WorldContents model={buildSceneModel(more, today)} {...props} />)
    expect(instanceCount(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toBe(3)
    const fewer = { ...world, tasks: world.tasks.filter((t) => t.status !== 'todo') }
    await renderer.update(<WorldContents model={buildSceneModel(fewer, today)} {...props} />)
    expect(named(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx`
Expected: FAIL because `./world-contents` cannot be resolved.

- [ ] **Step 3: Implement**

`apps/web/src/scene/tap.ts`:

```ts
import type { ThreeEvent } from '@react-three/fiber'

/** A press that travelled further than this (in screen pixels) was a pan, not a tap. */
export const TAP_SLOP_PX = 6

export function onTap<E>(handler: (event: ThreeEvent<E>) => void) {
  return (event: ThreeEvent<E>) => {
    if (event.delta > TAP_SLOP_PX) return
    event.stopPropagation()
    handler(event)
  }
}
```

`apps/web/src/scene/model-instances.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { solidMaterial } from './materials'
import { type ModelKind, modelGeometry } from './models/structures'
import { onTap } from './tap'

/** One InstancedMesh drawing `kind` at every point; `onPick` receives the tapped point's index. */
export function ModelInstances({
  kind,
  points,
  material = solidMaterial,
  onPick,
}: {
  kind: ModelKind
  points: readonly Point[]
  material?: THREE.Material
  onPick?: (index: number) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    points.forEach((p, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(p.x, LAND_HEIGHT, p.z))
    })
    mesh.instanceMatrix.needsUpdate = true
    // Raycasting tests against the instances' bounds, so they must follow the matrices.
    mesh.computeBoundingSphere()
    invalidate()
  }, [points, invalidate])

  if (points.length === 0) return null
  return (
    <instancedMesh
      // The instance count is fixed at construction; a new count needs a new mesh.
      key={points.length}
      ref={ref}
      name={kind}
      args={[modelGeometry(kind), material, points.length]}
      onClick={
        onPick
          ? onTap<MouseEvent>((event) => {
              if (event.instanceId !== undefined) onPick(event.instanceId)
            })
          : undefined
      }
    />
  )
}
```

`apps/web/src/scene/crane-jibs.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { solidMaterial } from './materials'
import { JIB_PIVOT, modelGeometry } from './models/structures'

const matrix = new THREE.Matrix4()

/** The turning arm on every crane; it swings only while animation is allowed. */
export function CraneJibs({ points, animate }: { points: readonly Point[]; animate: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const place = (time: number) => {
    const mesh = ref.current
    if (!mesh) return
    points.forEach((p, i) => {
      matrix.makeRotationY(time * 0.6 + i * 1.7)
      matrix.setPosition(p.x + JIB_PIVOT[0], LAND_HEIGHT + JIB_PIVOT[1], p.z + JIB_PIVOT[2])
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: place reads the latest points
  useLayoutEffect(() => place(0), [points])
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime)
  })

  if (points.length === 0) return null
  return (
    <instancedMesh
      key={points.length}
      ref={ref}
      name="jib"
      args={[modelGeometry('jib'), solidMaterial, points.length]}
    />
  )
}
```

`apps/web/src/scene/landmark.tsx`:

```tsx
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneDistrict } from './model/scene-model'
import { solidSegments } from './model/state'
import { ghostMaterial, solidMaterial } from './materials'
import { landmarkSegments } from './models/landmarks'
import { onTap } from './tap'

export function Landmark({ district, onOpen }: { district: SceneDistrict; onOpen?: () => void }) {
  const segments = landmarkSegments(district.type)
  const solid = solidSegments(district.progress, segments.length)
  return (
    <group
      name={`landmark:${district.milestoneId}`}
      position={[district.position.x, LAND_HEIGHT, district.position.z]}
      onClick={onOpen ? onTap<MouseEvent>(onOpen) : undefined}
    >
      {segments.map((geometry, i) => (
        <mesh
          key={geometry.uuid}
          geometry={geometry}
          material={i < solid ? solidMaterial : ghostMaterial}
        />
      ))}
    </group>
  )
}
```

`apps/web/src/scene/island.tsx`:

```tsx
import { useEffect, useMemo } from 'react'
import { CraneJibs } from './crane-jibs'
import { Landmark } from './landmark'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneIsland } from './model/scene-model'
import { STRUCTURE_KINDS } from './model/state'
import { shadowMaterial, solidMaterial } from './materials'
import { ModelInstances } from './model-instances'
import { modelGeometry } from './models/structures'
import { islandGeometry } from './models/terrain-geometry'
import { onTap } from './tap'
import type { SceneHandlers } from './world-contents'

export function Island({
  island,
  focused,
  selectedTaskId,
  animate,
  onSelect,
  onOpenIsland,
  onOpenDistrict,
}: SceneHandlers & {
  island: SceneIsland
  focused: boolean
  selectedTaskId: string | null
  animate: boolean
}) {
  const terrain = useMemo(
    () => islandGeometry(island.tiles, island.radius),
    [island.tiles, island.radius],
  )
  useEffect(() => () => terrain.dispose(), [terrain])

  const layers = useMemo(() => {
    const byKind = STRUCTURE_KINDS.map((kind) => {
      const structures = island.structures.filter((s) => s.kind === kind)
      return { kind, structures, points: structures.map((s) => s.position) }
    })
    const at = (marker: 'storm' | 'lantern') =>
      island.structures.filter((s) => s.marker === marker).map((s) => s.position)
    return {
      byKind,
      storms: at('storm'),
      lanterns: at('lantern'),
      shadows: island.structures.map((s) => s.position),
      cranes: island.structures.filter((s) => s.kind === 'crane').map((s) => s.position),
    }
  }, [island.structures])

  const selected = island.structures.find((s) => s.taskId === selectedTaskId)

  return (
    <group
      name={`island:${island.projectId}`}
      position={[island.origin.x, 0, island.origin.z]}
      onClick={focused ? undefined : onTap<MouseEvent>(() => onOpenIsland(island.projectId))}
    >
      <mesh
        name="terrain"
        geometry={terrain}
        material={solidMaterial}
        onClick={focused ? onTap<MouseEvent>(() => onSelect(null)) : undefined}
      />
      {layers.byKind.map(({ kind, structures, points }) => (
        <ModelInstances
          key={kind}
          kind={kind}
          points={points}
          onPick={focused ? (i) => onSelect(structures[i]?.taskId ?? null) : undefined}
        />
      ))}
      <ModelInstances kind="storm" points={layers.storms} />
      <ModelInstances kind="lantern" points={layers.lanterns} />
      <ModelInstances kind="shadow" points={layers.shadows} material={shadowMaterial} />
      <CraneJibs points={layers.cranes} animate={animate} />
      {island.districts.map((d) => (
        <Landmark
          key={d.milestoneId}
          district={d}
          onOpen={focused ? () => onOpenDistrict(island.projectId, d.milestoneId) : undefined}
        />
      ))}
      {selected && (
        <mesh
          name="selection"
          geometry={modelGeometry('selection')}
          material={solidMaterial}
          position={[selected.position.x, LAND_HEIGHT, selected.position.z]}
        />
      )}
    </group>
  )
}
```

`apps/web/src/scene/sea.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Bounds } from './model/scene-model'
import { seaMaterial } from './materials'
import { SEA_LEVEL } from './models/terrain-geometry'
import { onTap } from './tap'

/** Open water beyond the outermost island, in world units. */
const SEA_MARGIN = 60
const WAVE_HEIGHT = 0.05

export function Sea({
  bounds,
  animate,
  onTapSea,
}: {
  bounds: Bounds
  animate: boolean
  onTapSea: () => void
}) {
  const { minX, maxX, minZ, maxZ } = bounds
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      maxX - minX + SEA_MARGIN * 2,
      maxZ - minZ + SEA_MARGIN * 2,
      48,
      48,
    )
    g.rotateX(-Math.PI / 2)
    g.translate((minX + maxX) / 2, SEA_LEVEL, (minZ + maxZ) / 2)
    return g
  }, [minX, maxX, minZ, maxZ])
  const rest = useMemo(() => Float32Array.from(geometry.getAttribute('position').array), [geometry])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    if (!animate) return
    const position = geometry.getAttribute('position')
    const t = clock.elapsedTime
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3] ?? 0
      const z = rest[i * 3 + 2] ?? 0
      position.setY(i, SEA_LEVEL + WAVE_HEIGHT * Math.sin(x * 0.6 + t) * Math.cos(z * 0.6 + t * 0.8))
    }
    position.needsUpdate = true
  })

  return <mesh name="sea" geometry={geometry} material={seaMaterial} onClick={onTap<MouseEvent>(onTapSea)} />
}
```

`apps/web/src/scene/world-contents.tsx`:

```tsx
import type { Focus } from '../world/selectors'
import { Island } from './island'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import { Sea } from './sea'

export type SceneHandlers = {
  onSelect: (taskId: string | null) => void
  onOpenIsland: (projectId: string) => void
  onOpenDistrict: (projectId: string, milestoneId: string) => void
}

export type WorldContentsProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  animate: boolean
}

/** Everything inside the Canvas except camera, labels and ticker, so it can be tested headless. */
export function WorldContents({ model, focus, selectedTaskId, animate, ...handlers }: WorldContentsProps) {
  const focusedId = focus.kind === 'archipelago' ? null : focus.projectId
  return (
    <>
      <hemisphereLight args={[scenePalette.wall, scenePalette.sea, 0.9]} />
      <directionalLight position={[12, 20, 6]} intensity={1.6} />
      <Sea bounds={model.bounds} animate={animate} onTapSea={() => handlers.onSelect(null)} />
      {model.islands.map((island) => (
        <Island
          key={island.projectId}
          island={island}
          focused={island.projectId === focusedId}
          selectedTaskId={selectedTaskId}
          animate={animate}
          {...handlers}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/scene`
Expected: PASS.

The test renderer may log "The current testing environment is not configured to support act(...)". That warning is harmless, but silence it by adding `;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true` after the imports of this test file.

- [ ] **Step 5: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene
git commit -m "feat(web): render islands, structures, markers and landmarks as instanced meshes"
```

---
### Task 5: Canvas shell: camera rig, labels and animation ticker

**Files:**
- Create: `apps/web/src/scene/ticker.ts`, `use-reduced-motion.ts`, `camera-rig.tsx`, `labels.tsx`, `world-scene.tsx`
- Test: `apps/web/src/scene/ticker.test.ts`

**Interfaces:**
- Consumes: Task 2 `cameraTarget`, `clampToBounds`, `focusKey`, `MAX_ZOOM_FACTOR`, `ARCHIPELAGO_ZOOM`, `LAND_HEIGHT`, `scenePalette`; Task 4 `WorldContents`, `SceneHandlers`.
- Produces:
  - `TICK_MS = 33`; `startTicker(invalidate: () => void, isVisible?: () => boolean): () => void` (ticker.ts)
  - `usePrefersReducedMotion(): boolean` (use-reduced-motion.ts)
  - `ISO_DISTANCE = 200`; `CameraRig({ model, focus })` (camera-rig.tsx)
  - `Labels({ model, focus })` (labels.tsx)
  - `type WorldSceneProps = SceneHandlers & { model: SceneModel; focus: Focus; selectedTaskId: string | null }`; `WorldScene(props: WorldSceneProps)` (world-scene.tsx). Task 7 lazy-imports `WorldScene` by this name.

The Canvas, `MapControls` and `Html` need a real WebGL context, so `CameraRig`, `Labels` and `WorldScene` are checked by typecheck and by the manual check in Task 7, not by unit tests. Their logic lives in tested pure functions: `cameraTarget`, `clampToBounds`, `focusKey` (Task 2) and `startTicker` (here).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/ticker.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { startTicker, TICK_MS } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startTicker', () => {
  test('invalidates every tick while visible and stops when told', () => {
    vi.useFakeTimers()
    const invalidate = vi.fn()
    const stop = startTicker(invalidate, () => true)
    vi.advanceTimersByTime(TICK_MS * 3)
    expect(invalidate).toHaveBeenCalledTimes(3)
    stop()
    vi.advanceTimersByTime(TICK_MS * 3)
    expect(invalidate).toHaveBeenCalledTimes(3)
  })

  test('skips frames while the document is hidden', () => {
    vi.useFakeTimers()
    const invalidate = vi.fn()
    let visible = false
    const stop = startTicker(invalidate, () => visible)
    vi.advanceTimersByTime(TICK_MS * 2)
    expect(invalidate).not.toHaveBeenCalled()
    visible = true
    vi.advanceTimersByTime(TICK_MS)
    expect(invalidate).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('usePrefersReducedMotion', () => {
  test('reads the reduced-motion media query', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia
    try {
      expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
    } finally {
      window.matchMedia = original
    }
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/ticker.test.ts`
Expected: FAIL because `./ticker` cannot be resolved.

- [ ] **Step 3: Implement the tested pieces**

`apps/web/src/scene/ticker.ts`:

```ts
/** About 30fps: enough for the sea and cranes, half the cost of the display rate. */
export const TICK_MS = 33

const documentVisible = () => document.visibilityState === 'visible'

/** Requests a frame every tick while the page is visible; returns a stop function. */
export function startTicker(invalidate: () => void, isVisible = documentVisible): () => void {
  const id = setInterval(() => {
    if (isVisible()) invalidate()
  }, TICK_MS)
  return () => clearInterval(id)
}
```

`apps/web/src/scene/use-reduced-motion.ts` (same shape as `layout/use-is-desktop.ts`):

```ts
import { useEffect, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return matches
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/scene/ticker.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Canvas shell**

`apps/web/src/scene/camera-rig.tsx`:

```tsx
import { MapControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { type ComponentRef, useLayoutEffect, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { cameraTarget, clampToBounds, focusKey, MAX_ZOOM_FACTOR } from './model/camera'
import type { SceneModel } from './model/scene-model'

/** The camera sits this far along the (1, 1, 1) diagonal from its target: true isometric. */
export const ISO_DISTANCE = 200

export function CameraRig({ model, focus }: { model: SceneModel; focus: Focus }) {
  const controls = useRef<ComponentRef<typeof MapControls>>(null)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const target = cameraTarget(model, focus)
  const latest = useRef({ target, bounds: model.bounds })
  latest.current = { target, bounds: model.bounds }
  const key = focusKey(focus)

  // Snap only when the route changes: a world refetch must not yank a camera the user has panned.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route key is the trigger
  useLayoutEffect(() => {
    const t = latest.current.target
    camera.position.set(t.x + ISO_DISTANCE, ISO_DISTANCE, t.z + ISO_DISTANCE)
    camera.zoom = t.zoom
    camera.lookAt(t.x, 0, t.z)
    camera.updateProjectionMatrix()
    const c = controls.current
    if (c) {
      c.target.set(t.x, 0, t.z)
      c.update()
    }
    invalidate()
  }, [key, camera, invalidate])

  // Hard bounds for 4a; 4b replaces them with soft, rubber-banded edges.
  const clamp = () => {
    const c = controls.current
    if (!c) return
    const { x, z } = clampToBounds(latest.current.bounds, c.target.x, c.target.z)
    const dx = x - c.target.x
    const dz = z - c.target.z
    if (dx === 0 && dz === 0) return
    c.target.x = x
    c.target.z = z
    camera.position.x += dx
    camera.position.z += dz
  }

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      screenSpacePanning={false}
      minZoom={target.zoom}
      maxZoom={target.zoom * MAX_ZOOM_FACTOR}
      onChange={clamp}
    />
  )
}
```

`apps/web/src/scene/labels.tsx`:

```tsx
import { Html } from '@react-three/drei'
import type { Focus } from '../world/selectors'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneModel } from './model/scene-model'

const tag =
  'pointer-events-none select-none whitespace-nowrap rounded-md bg-surface-primary/90 px-2 py-1 text-sm font-semibold text-text-primary shadow'

/** Island names in the archipelago; milestone names on the focused island. */
export function Labels({ model, focus }: { model: SceneModel; focus: Focus }) {
  if (focus.kind === 'archipelago') {
    return model.islands.map((island) => (
      <Html key={island.projectId} center position={[island.origin.x, LAND_HEIGHT + 1.6, island.origin.z]} className={tag}>
        {island.name}
      </Html>
    ))
  }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return null
  return island.districts.map((d) => (
    <Html
      key={d.milestoneId}
      center
      position={[island.origin.x + d.position.x, LAND_HEIGHT + 2.2, island.origin.z + d.position.z]}
      className={tag}
    >
      {d.name}
    </Html>
  ))
}
```

`apps/web/src/scene/world-scene.tsx`:

```tsx
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Focus } from '../world/selectors'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { Labels } from './labels'
import { ARCHIPELAGO_ZOOM } from './model/camera'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import { startTicker } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'
import { type SceneHandlers, WorldContents } from './world-contents'

export type WorldSceneProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
}

function AnimationTicker({ enabled }: { enabled: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => (enabled ? startTicker(() => invalidate()) : undefined), [enabled, invalidate])
  return null
}

/** The 3D world. Renders on demand; the ticker adds frames only for sea and crane motion. */
export function WorldScene(props: WorldSceneProps) {
  const animate = !usePrefersReducedMotion()
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      orthographic
      flat
      camera={{
        position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE],
        zoom: ARCHIPELAGO_ZOOM,
        near: 0.1,
        far: 2000,
      }}
      className="touch-none"
    >
      <color attach="background" args={[scenePalette.sea]} />
      <WorldContents {...props} animate={animate} />
      <Labels model={props.model} focus={props.focus} />
      <CameraRig model={props.model} focus={props.focus} />
      <AnimationTicker enabled={animate} />
    </Canvas>
  )
}
```

- [ ] **Step 6: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && bunx vitest run src/scene && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene
git commit -m "feat(web): add the canvas shell with isometric camera rig, labels and motion ticker"
```

---
### Task 6: Task selection in the panel, and a sheet detent the screen controls

**Files:**
- Modify: `apps/web/src/tasks/task-panel.tsx`, `apps/web/src/tasks/task-row.tsx`, `apps/web/src/layout/panel-frame.tsx`, `apps/web/src/layout/world-screen.tsx`, `apps/web/src/test/setup.ts`
- Test: `apps/web/src/tasks/task-selection.test.tsx`

**Interfaces:**
- Consumes: the existing `TaskPanel`, `TaskRow`, `PanelFrame` and `AppProviders`; `createFakeApi`, `fakeProject`, `fakeTask` from `test/fake-api.ts`; `createQueryClient` from `app/query-client.ts`.
- Produces:
  - `TaskPanel` accepts `selectedTaskId?: string | null`.
  - `TaskRow` accepts `selected?: boolean`. A selected row:
    - has `aria-current="true"` and the class `bg-brand-secondary/10`;
    - calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` when it becomes selected.
  - `PanelFrame` takes `detent: number` and `onDetentChange: Dispatch<SetStateAction<number>>` (phone and tablet only).
  - `SHEET_MIDDLE = 1` is exported from `panel-frame.tsx`.
  - `WorldScreen` owns `sheetDetent` (initially `SHEET_MIDDLE`) and `selectedTaskId` (initially `null`, cleared on route change). Task 7 wires the scene's `onSelect` to it.

This lifts a parked Phase 2b item: "Lift the sheet detent out of `MobileSheet` so the camera can frame the uncovered area."

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tasks/task-selection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppProviders } from '../app/providers'
import { createQueryClient } from '../app/query-client'
import { createFakeApi, fakeProject, fakeTask } from '../test/fake-api'
import { TaskPanel } from './task-panel'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const project = fakeProject({ name: 'Beta' })
  const tasks = [
    fakeTask({ projectId: project.id, title: 'Write docs', sortOrder: 0 }),
    fakeTask({ projectId: project.id, title: 'Ship build', sortOrder: 1 }),
  ]
  const world = { projects: [project], milestones: [], tasks, buildings: [] }
  const { api } = createFakeApi({ world })
  const worldDto = {
    ...world,
    economy: {
      balance: 0,
      streak: { days: 0, activeToday: false, next: null },
      daily: { amount: 15, claimedToday: false },
    },
  }
  const ui = (selectedTaskId: string | null) => (
    <AppProviders api={api} queryClient={createQueryClient(() => {}, false)}>
      <TaskPanel
        world={worldDto}
        focus={{ kind: 'island', projectId: project.id }}
        title="Beta"
        today="2026-10-07"
        selectedTaskId={selectedTaskId}
      />
    </AppProviders>
  )
  return { tasks, ui }
}

const row = (title: string) => screen.getByText(title).closest('li')

describe('task selection in the panel', () => {
  test('the selected row is marked current and scrolled into view', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    expect(row('Ship build')).not.toHaveAttribute('aria-current')
    rerender(ui(tasks[1]?.id ?? null))
    expect(row('Ship build')).toHaveAttribute('aria-current', 'true')
    expect(row('Write docs')).not.toHaveAttribute('aria-current')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(row('Ship build'))
  })

  test('selecting a row hidden by the search clears the search once; later typing stays', async () => {
    const user = userEvent.setup()
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    const search = screen.getByRole('searchbox', { name: 'Search tasks' })
    await user.type(search, 'docs')
    expect(screen.queryByText('Ship build')).toBeNull()

    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('')
    expect(row('Ship build')).toHaveAttribute('aria-current', 'true')

    await user.type(search, 'ship')
    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('ship')
  })

  test('a selection that is already visible leaves the search alone', async () => {
    const user = userEvent.setup()
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    const search = screen.getByRole('searchbox', { name: 'Search tasks' })
    await user.type(search, 'ship')
    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('ship')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/tasks/task-selection.test.tsx`
Expected: FAIL. TypeScript rejects `selectedTaskId`, the rows have no `aria-current`, and jsdom has no `scrollIntoView` to spy on.

- [ ] **Step 3: Implement**

`apps/web/src/test/setup.ts`: add this after the `window.scrollTo` stub:

```ts
// jsdom does not implement scrollIntoView; the task panel scrolls the selected row into view.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
```

`apps/web/src/tasks/task-row.tsx`:
- Import `useEffect` and `useRef` from `react`.
- Add `selected = false` to the props and `selected?: boolean` to the prop type.
- Inside the component, add:

```tsx
  const rowRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])
```

Then change the `<li>` to:

```tsx
    <li
      ref={rowRef}
      aria-current={selected ? 'true' : undefined}
      className={`flex items-start gap-3 border-b border-border-primary px-4 py-3 ${
        selected ? 'bg-brand-secondary/10' : ''
      }`}
    >
```

`apps/web/src/tasks/task-panel.tsx`:
- Import `useEffect`.
- Add `selectedTaskId = null` to the props and `selectedTaskId?: string | null` to the prop type.
- After `tasks` is computed, add:

```tsx
  // A new selection must be visible: clear a search that hides it. Typing afterwards is respected.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selection is the trigger
  useEffect(() => {
    if (selectedTaskId && !tasks.some((t) => t.id === selectedTaskId)) setQuery('')
  }, [selectedTaskId])
```

Then pass `selected={task.id === selectedTaskId}` to each `<TaskRow>`.

`apps/web/src/layout/panel-frame.tsx`:
- Import `type Dispatch` and `type SetStateAction` from `react`.
- Export `export const SHEET_MIDDLE = 1` (index 1 of `DETENTS`, the 50dvh detent).
- Change `PanelFrame` so the detent is owned by its caller:

```tsx
export function PanelFrame({
  title,
  detent,
  onDetentChange,
  children,
}: {
  title: string
  /** The phone sheet's detent index; ignored by the desktop side panel. */
  detent: number
  onDetentChange: Dispatch<SetStateAction<number>>
  children: ReactNode
}) {
  return useIsDesktop() ? (
    <DesktopPanel title={title}>{children}</DesktopPanel>
  ) : (
    <MobileSheet title={title} detent={detent} setDetent={onDetentChange}>
      {children}
    </MobileSheet>
  )
}
```

- In `MobileSheet`:
  - Accept `detent: number` and `setDetent: Dispatch<SetStateAction<number>>` props.
  - Delete the line `const [detent, setDetent] = useState(1)`.
  - Leave the rest of its body unchanged; it already calls `setDetent` with numbers and updater functions.

`apps/web/src/layout/world-screen.tsx`:
- Import `SHEET_MIDDLE` with `PanelFrame`.
- Add the state:

```tsx
  const [sheetDetent, setSheetDetent] = useState(SHEET_MIDDLE)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
```

- In the existing "An editor belongs to the route it was opened on" effect, also call `setSelectedTaskId(null)`. Update its comment to: "Editors and selections belong to the route they were made on."
- Render `<PanelFrame title={panelTitle} detent={sheetDetent} onDetentChange={setSheetDetent}>`.
- Pass `selectedTaskId={selectedTaskId}` to `<TaskPanel>`.

`setSheetDetent` and `setSelectedTaskId` are used by the scene's `onSelect` in Task 7. Until then the setters are unused, which is fine because they come from `useState`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/tasks src/layout`
Expected: PASS. The new file and the existing panel and world-screen tests (detent cycling, resize) all pass unchanged.

- [ ] **Step 5: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src
git commit -m "feat(web): highlight and scroll to a selected task, and lift the sheet detent"
```

---
### Task 7: Integrate the scene into the world screen, with HUD and WebGL fallback

**Files:**
- Create: `apps/web/src/scene/webgl.ts`, `apps/web/src/world/world-hud.tsx`, `apps/web/src/world/world-view.tsx`
- Rename: `apps/web/src/world/world-area.tsx` → `apps/web/src/world/card-world.tsx` (export `WorldArea` → `CardWorld`)
- Modify: `apps/web/src/layout/world-screen.tsx`, `apps/web/src/test/setup.ts`
- Test: `apps/web/src/scene/webgl.test.ts`, `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: Task 2 `buildSceneModel`; Task 5 `WorldScene`, `WorldSceneProps`; Task 6 `SHEET_MIDDLE` and the `WorldScreen` state `sheetDetent`/`selectedTaskId`; the existing `resolveFocus` result type and the `CardWorld` (ex-`WorldArea`) props.
- Produces:
  - `hasWebGL(): boolean` in `scene/webgl.ts`. Probed once and cached; `resetWebGLProbe()` exists for tests.
  - `WorldHud` (`world/world-hud.tsx`): the floating controls over the canvas.
  - `WorldView` (`world/world-view.tsx`): `CardWorld` when `hasWebGL()` is false; otherwise the lazily loaded `WorldScene` plus `WorldHud`.

**HUD copy (spec §13.5), matching `CardWorld`:**
- Archipelago: a `New island` button. With no projects, the text "No islands yet. Create one to start building." also shows.
- Island: a `← Archipelago` link, an `Edit island` button and a `New milestone` button.
- District: a `← <project name>` link and an `Edit milestone` button.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/webgl.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hasWebGL, resetWebGLProbe } from './webgl'

afterEach(() => {
  vi.restoreAllMocks()
  resetWebGLProbe()
})

describe('hasWebGL', () => {
  test('is false when no context can be created (jsdom)', () => {
    expect(hasWebGL()).toBe(false)
  })

  test('is true when a webgl2 context exists, and probes only once', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as RenderingContext)
    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(getContext).toHaveBeenCalledTimes(1)
  })

  test('is false when probing throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasWebGL()).toBe(false)
  })
})
```

`apps/web/src/layout/world-scene-integration.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { WorldSceneProps } from '../scene/world-scene'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// Stands in for the WebGL canvas: exposes the scene's callbacks as plain buttons.
vi.mock('../scene/world-scene', () => ({
  WorldScene: ({ model, focus, selectedTaskId, onSelect, onOpenIsland, onOpenDistrict }: WorldSceneProps) => (
    <div data-testid="scene" data-focus={focus.kind} data-selected={selectedTaskId ?? ''}>
      {model.islands.map((island) => (
        <div key={island.projectId}>
          <button type="button" onClick={() => onOpenIsland(island.projectId)}>
            open {island.name}
          </button>
          {island.districts.map((d) => (
            <button key={d.milestoneId} type="button" onClick={() => onOpenDistrict(island.projectId, d.milestoneId)}>
              open district {d.name}
            </button>
          ))}
          {island.structures.map((s) => (
            <button key={s.taskId} type="button" onClick={() => onSelect(s.taskId)}>
              select {s.taskId}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}))

function seeded() {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  const loose = fakeTask({ projectId: beta.id, title: 'Loose task' })
  const inMvp = fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'MVP task', plotX: 6 })
  const fake = createFakeApi({ world: { projects: [beta], milestones: [mvp], tasks: [loose, inMvp], buildings: [] } })
  return { ...fake, beta, mvp, loose, inMvp }
}

describe('World screen with the 3D scene', () => {
  test('archipelago: the scene renders with a New island HUD button; tapping an island flies in', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: '/' })
    const scene = await screen.findByTestId('scene')
    expect(scene).toHaveAttribute('data-focus', 'archipelago')
    expect(screen.queryByTestId('island-cards')).toBeNull()
    expect(screen.getByRole('button', { name: 'New island' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'open Beta' }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    expect(await screen.findByRole('link', { name: '← Archipelago' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit island' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New milestone' })).toBeInTheDocument()
  })

  test('an empty world says so over the sea', async () => {
    const { api } = createFakeApi()
    renderApp({ api, path: '/' })
    expect(await screen.findByText('No islands yet. Create one to start building.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New island' })).toBeInTheDocument()
  })

  test('HUD buttons open the matching editors', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Edit island' })).toBeInTheDocument()
  })

  test('district: back link names the island, and Edit milestone opens its editor', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit milestone' }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Edit milestone' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('link', { name: '← Beta' }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
  })

  test('phone: selecting a structure highlights its row and raises a collapsed sheet', async () => {
    const { api, beta, loose } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const sheet = await screen.findByTestId('task-sheet')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), { key: 'ArrowDown' })
    expect(sheet).toHaveAttribute('data-detent', '0')

    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    expect(sheet).toHaveAttribute('data-detent', '1')
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', loose.id)
    expect(screen.getByText('Loose task').closest('li')).toHaveAttribute('aria-current', 'true')
  })

  test('selection never lowers an open sheet and clears when the route changes', async () => {
    const { api, beta, loose } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const sheet = await screen.findByTestId('task-sheet')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), { key: 'ArrowUp' })
    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    expect(sheet).toHaveAttribute('data-detent', '2')

    await user.click(screen.getByRole('button', { name: 'open district MVP' }))
    expect(await screen.findByRole('link', { name: '← Beta' })).toBeInTheDocument()
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', '')
  })

  test('deleting the selected task drops the selection without errors', async () => {
    const { api, beta, loose } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    await user.click(screen.getByRole('button', { name: 'Delete "Loose task"' }))
    await waitFor(() => expect(screen.queryByText('Loose task')).toBeNull())
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', '')
    confirm.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/scene/webgl.test.ts src/layout/world-scene-integration.test.tsx`
Expected: FAIL because `./webgl` cannot be resolved and the scene stub never renders.

- [ ] **Step 3: Implement**

`apps/web/src/test/setup.ts`: add the following. Without it, jsdom prints "Not implemented: HTMLCanvasElement.prototype.getContext" on every WebGL probe.

```ts
// jsdom has no canvas contexts. Answer null quietly so the WebGL probe falls back to the card view.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
```

`apps/web/src/scene/webgl.ts`:

```ts
let probed: boolean | undefined

/** Whether this browser can create a WebGL context. Probed once; the answer does not change. */
export function hasWebGL(): boolean {
  if (probed === undefined) {
    try {
      const canvas = document.createElement('canvas')
      probed = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      probed = false
    }
  }
  return probed
}

/** Test seam: forget the cached probe. */
export function resetWebGLProbe(): void {
  probed = undefined
}
```

Rename the card view:

```bash
git mv apps/web/src/world/world-area.tsx apps/web/src/world/card-world.tsx
```

In `card-world.tsx`, rename `export function WorldArea(` to `export function CardWorld(`. Add this comment above it: `/** The Phase 2 card view; the fallback when WebGL is unavailable (and the path jsdom takes). */`.

`apps/web/src/world/world-hud.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import type { resolveFocus } from './selectors'

type Resolved = ReturnType<typeof resolveFocus>

const chip =
  'pointer-events-auto inline-flex min-h-11 items-center rounded-md bg-surface-primary/95 px-3 text-sm shadow'

/** Floating controls over the canvas; the same actions the card view offers. */
export function WorldHud({
  resolved,
  empty,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
}: {
  resolved: Resolved
  empty: boolean
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const { focus, project, milestone } = resolved
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
      {focus.kind === 'archipelago' && (
        <>
          {onNewProject && (
            <button type="button" onClick={onNewProject} className={`${chip} text-brand`}>
              New island
            </button>
          )}
          {empty && (
            <p className={`${chip} text-text-secondary`}>No islands yet. Create one to start building.</p>
          )}
        </>
      )}
      {focus.kind === 'island' && (
        <>
          <Link to="/" className={`${chip} text-brand`}>
            ← Archipelago
          </Link>
          {onEditProject && (
            <button type="button" onClick={onEditProject} className={`${chip} text-text-secondary`}>
              Edit island
            </button>
          )}
          {onNewMilestone && (
            <button type="button" onClick={onNewMilestone} className={`${chip} text-brand`}>
              New milestone
            </button>
          )}
        </>
      )}
      {focus.kind === 'district' && project && milestone && (
        <>
          <Link to="/p/$projectId" params={{ projectId: project.id }} className={`${chip} text-brand`}>
            ← {project.name}
          </Link>
          {onEditMilestone && (
            <button type="button" onClick={onEditMilestone} className={`${chip} text-text-secondary`}>
              Edit milestone
            </button>
          )}
        </>
      )}
    </div>
  )
}
```

`apps/web/src/world/world-view.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import { useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useMemo } from 'react'
import { buildSceneModel } from '../scene/model/scene-model'
import { hasWebGL } from '../scene/webgl'
import { CardWorld } from './card-world'
import type { IslandSummary, resolveFocus } from './selectors'
import { WorldHud } from './world-hud'

// Three.js lives in its own chunk, so it never weighs on the login screen.
const WorldScene = lazy(() => import('../scene/world-scene').then((m) => ({ default: m.WorldScene })))

type Resolved = ReturnType<typeof resolveFocus>

export function WorldView({
  world,
  resolved,
  summaries,
  today,
  selectedTaskId,
  onSelect,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
}: {
  world: WorldDto
  resolved: Resolved
  summaries: IslandSummary[]
  today: string
  selectedTaskId: string | null
  onSelect: (taskId: string | null) => void
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const navigate = useNavigate()
  const model = useMemo(() => buildSceneModel(world, today), [world, today])
  const actions = { onNewProject, onNewMilestone, onEditProject, onEditMilestone }

  if (!hasWebGL()) {
    return <CardWorld world={world} resolved={resolved} summaries={summaries} {...actions} />
  }

  const label =
    resolved.milestone?.name ?? (resolved.project ? `${resolved.project.name} island` : 'Archipelago')
  return (
    <section aria-label={label} className="relative min-h-0 flex-1 overflow-hidden bg-brand">
      <div className="absolute inset-0">
        <Suspense fallback={<p className="p-4 text-text-on-brand">Loading the world…</p>}>
          <WorldScene
            model={model}
            focus={resolved.focus}
            selectedTaskId={selectedTaskId}
            onSelect={onSelect}
            onOpenIsland={(projectId) => void navigate({ to: '/p/$projectId', params: { projectId } })}
            onOpenDistrict={(projectId, milestoneId) =>
              void navigate({ to: '/p/$projectId/m/$milestoneId', params: { projectId, milestoneId } })
            }
          />
        </Suspense>
      </div>
      <WorldHud resolved={resolved} empty={world.projects.length === 0} {...actions} />
    </section>
  )
}
```

`apps/web/src/layout/world-screen.tsx`:
- Replace the `WorldArea` import with `import { WorldView } from '../world/world-view'`.
- Render `<WorldView>` where `<WorldArea>` was. Keep the same four `on…` editor props, and add:

```tsx
          today={today}
          selectedTaskId={selectedTask ? selectedTaskId : null}
          onSelect={(taskId) => {
            setSelectedTaskId(taskId)
            // Show the selected row: a collapsed sheet rises; a taller one stays where it is.
            if (taskId) setSheetDetent((d) => Math.max(d, SHEET_MIDDLE))
          }}
```

- Before the `return`, derive the selection so a deleted task is never considered selected:

```tsx
  const selectedTask = world.data.tasks.find((t) => t.id === selectedTaskId)
```

- Pass `selectedTaskId={selectedTask ? selectedTaskId : null}` to `<TaskPanel>` too, replacing the Task 6 prop.

- [ ] **Step 4: Run all web tests**

Run: `cd apps/web && bun run test`
Expected: PASS. The new tests pass, and the existing `world-screen.test.tsx` and `forms.test.tsx` still pass on the card fallback, because jsdom's `getContext` now returns null.

- [ ] **Step 5: Full verification and the manual check**

Run from the repo root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. All must pass.

Then check `apps/web/dist/assets`. There must be a separate chunk containing `three`, and the entry chunk must not contain it:

```bash
grep -l "WebGLRenderer" apps/web/dist/assets/*.js
```

This must list exactly one file, and it must not be the one `apps/web/dist/index.html` loads as its entry script.

Manual check:
- Start Postgres (already running in dev), the API (`bun run --cwd apps/api dev`) and the web app (`bun run --cwd apps/web dev -- --host`).
- On desktop:
  - Log in. Islands, sea and labels render.
  - Clicking an island flies (snaps) in. Clicking a landmark opens its district.
  - Clicking a structure highlights its row. Dragging pans without navigating.
  - Wheel zoom stops at the state's floor.
- On a phone on the LAN, the same checks with touch.
- With OS reduced motion on, the sea and cranes are still.

Report what you saw, including any rendering defects, in the task report. Real-device fps tuning is Phase 5 and is not in scope.

- [ ] **Step 6: Format, lint, commit**

```bash
bun run format && bun run lint
git add apps/web/src
git commit -m "feat(web): show the 3D world with a HUD, selection and a card fallback without WebGL"
```
