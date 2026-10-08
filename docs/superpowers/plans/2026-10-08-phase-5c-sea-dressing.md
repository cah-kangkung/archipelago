# Phase 5c Sea Dressing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the open sea read as a place: faceted gradient water, seeded open-water props, a soft horizon, an "Uncharted waters" empty state and progress-driven ambient life (boats, gulls, whale, foam).

**Architecture:** Every rule is a pure, three-free function in `scene/model/` (`sea-depth`, `sea-routes`, `sea-scatter`, `horizon`, `ambient-life`) with unit tests; scene components only turn their output into geometry and matrices. Ambient life is built in `WorldView` from the world DTO next to the scene model and passed into the lazy scene as plain data. Life adds no ticker: on `high` it rides the sea wave's 30fps ticker; on `low` or reduced motion it is posed once at t=0 and never asks for a frame.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, TanStack Query/Router, three 0.186 + R3F 9.8 + drei 10.7 (`Html`), Vitest 5 + RTL, `@react-three/test-renderer` 9.1, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 17 (Phase 5c), with sections 13.3, 16.3 and 16.4 for the systems it refines.

## Global Constraints

- Biome: single quotes, no semicolons, line width 100. `bun run lint` must stay at the one known info.
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk: nothing under `apps/web/src/world/`, `layout/`, `rewards/`, `economy/`, `shop/` or `app/` may import `three`, `@react-three/*`, or a `scene/` module that does. `scene/tuning.ts`, `scene/model/*` and `scene/use-reduced-motion.ts` are three-free and may be imported from the app. `scene/model/*` must never import from `scene/models/*` (those import three).
- Every scene colour comes from `scenePalette` (A'raf tokens only).
- No API or DTO change. Everything derives from `GET /world`.
- Scatter props, ghost island, boats, gulls, whale, splash and foam carry no `onClick`: a tap on them falls through to the sea (clears the selection).
- Life on `low` or reduced motion: boats and gulls posed at t=0 (their seeded phase), whale and foam pulse hidden/still, no frames requested.
- Copy: heading "Uncharted waters", button "Create your first island". The HUD's "No islands yet. Create one to start building." text chip and the card view's same paragraph are removed.
- Commit messages: conventional (`feat(web): …`, `test(web): …`, `docs: …`), no AI attribution or `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; per package `bun run --cwd apps/web test`; gate from the root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.

## Review Focus

1. A task whose `completedAt` is a few seconds in the future (client clock behind the server) still counts as recent for boats and gulls. Pinned in Task 5.
2. A reopened task (`status: 'todo'`, `completedAt: null`) or a done task of a project not in the scene adds no boat and no gulls. Pinned in Task 5.
3. A tap on a scatter prop or on the ghost island clears the selection like the sea, and no prop mesh swallows it. Pinned in Tasks 2 and 4.
4. Dropping from `high` to `low` mid-voyage snaps boats and gulls to their t=0 pose and stops them; frames advanced afterwards change nothing. Pinned in Task 6.
5. Creating the first island removes the empty prompt and shows the island in the same scene, with no reload. Pinned in Task 4.

---

### Task 1: Faceted gradient water

**Files:**
- Modify: `apps/web/src/scene/model/hex-space.ts`, `apps/web/src/scene/models/terrain-geometry.ts`
- Modify: `apps/web/src/scene/model/palette.ts`
- Modify: `apps/web/src/scene/tuning.ts`
- Create: `apps/web/src/scene/model/sea-depth.ts`, `apps/web/src/scene/model/sea-depth.test.ts`
- Modify: `apps/web/src/scene/materials.ts`, `apps/web/src/scene/sea.tsx`
- Create: `apps/web/src/scene/sea.test.tsx`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Produces: `SHALLOWS_MARGIN`, `shallowsRadius(radius: number): number` in `model/hex-space.ts`.
- Produces: `type Shore = { origin: Point; radius: number }`, `UNCHARTED_RADIUS = 1`, `UNCHARTED_SEED = 7`, `shoreDistance(p: Point, shores: readonly Shore[]): number`, `depthShade(distance: number): number` in `model/sea-depth.ts`.
- Produces: palette keys `seaShallow`, `seaDeep`, `foam`, `buoy`, `whale`.
- Produces: the whole "Sea dressing" tuning block (later tasks import from it).
- Produces: `Sea` props `{ bounds: Bounds; islands: readonly Shore[]; animate: boolean; onTapSea: () => void }`.

- [ ] **Step 1: Move the shallows margin into the three-free model.** In `apps/web/src/scene/model/hex-space.ts` append:

```ts
/** How far the shallows reach past an island's extent. */
export const SHALLOWS_MARGIN = 1.2

/** World distance from an island's origin to the corner of its shallows. */
export function shallowsRadius(radius: number): number {
  return islandExtent(radius) + SHALLOWS_MARGIN
}
```

In `apps/web/src/scene/models/terrain-geometry.ts` delete `export const SHALLOWS_MARGIN = 1.2`, change the import to `import { hexToWorld, shallowsRadius } from '../model/hex-space'`, add `export { SHALLOWS_MARGIN } from '../model/hex-space'` below the imports (existing importers keep working), and replace `const shallows = islandExtent(radius) + SHALLOWS_MARGIN` with `const shallows = shallowsRadius(radius)`.

- [ ] **Step 2: Palette and tuning.** In `apps/web/src/scene/model/palette.ts` add to `scenePalette` after `shallows`:

```ts
  seaShallow: mix(colors.brand, colors.brandSecondary, 0.3),
  seaDeep: mix(colors.brand, colors.textPrimary, 0.35),
  foam: colors.surfacePrimary,
  buoy: colors.error,
  whale: mix(colors.textPrimary, colors.brand, 0.4),
```

Append to `apps/web/src/scene/tuning.ts`:

```ts
// Sea dressing (spec 17).
/** Sea plane segments per side; fewer segments make bigger facets. */
export const SEA_SEGMENTS = 96
/** World units from a shallows edge at which the sea reaches its deepest colour. */
export const SEA_DEEP_DISTANCE = 18
/** Side of one scatter cell, in world units; each cell holds at most one prop. */
export const SCATTER_CELL = 6
/** Chance that a cell holds a prop. */
export const SCATTER_FILL = 0.35
/** Share of each prop type among filled cells; sums to 1. */
export const SCATTER_WEIGHTS = { rock: 0.4, islet: 0.15, sandbar: 0.25, buoy: 0.2 } as const
/** Props keep at least this far from any shallows edge. */
export const SCATTER_CLEARANCE = 2
/** Props are scattered up to this far outside the islands' bounds. */
export const SCATTER_EXTENT = 30
export const SCATTER_MAX_PER_TYPE = 80
/** Half the width of open water kept clear along a sea route. */
export const LANE_HALF_WIDTH = 1.5
/** The shortest open-water lane a boat will sail. */
export const MIN_LANE = 3
/** How far outside the shallows a boat sails. */
export const BOAT_OFFSHORE = 0.8
/** Fog starts this far past the islands' farthest corner and is solid FOG_DEPTH later. */
export const FOG_MARGIN = 10
export const FOG_DEPTH = 60
/** Corner opacity of the CSS vignette. */
export const VIGNETTE_ALPHA = 0.25
/** World units per second. */
export const BOAT_SPEED = 1.2
export const GULL_SPEED = 2.5
export const GULL_HEIGHT = 3.2
/** Gull circle radius as a share of the island's extent. */
export const GULL_ORBIT = 0.6
/** Seconds between whale breaches, chosen per world from this range. */
export const WHALE_INTERVAL_S: readonly [min: number, max: number] = [25, 40]
export const WHALE_BREACH_S = 2.4
/** The whale surfaces at least this far from every shallows edge. */
export const WHALE_CLEARANCE = 6
export const FOAM_WIDTH = 0.5
export const FOAM_OPACITY = 0.45
export const FOAM_PULSE = 0.15
export const FOAM_PULSE_S = 4
```

- [ ] **Step 3: Failing depth test.** Create `apps/web/src/scene/model/sea-depth.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { shallowsRadius } from './hex-space'
import { depthShade, shoreDistance, UNCHARTED_RADIUS } from './sea-depth'

const a = { origin: { x: 0, z: 0 }, radius: 4 }
const b = { origin: { x: 40, z: 0 }, radius: 4 }

describe('sea depth', () => {
  test('distance runs to the nearest shallows edge and is 0 inside one', () => {
    expect(shoreDistance({ x: 0, z: 0 }, [a, b])).toBe(0)
    expect(shoreDistance({ x: shallowsRadius(4) + 3, z: 0 }, [a, b])).toBeCloseTo(3)
    expect(shoreDistance({ x: 40 - shallowsRadius(4) - 2, z: 0 }, [a, b])).toBeCloseTo(2)
  })

  test('an empty world measures from the uncharted island at the origin', () => {
    expect(shoreDistance({ x: shallowsRadius(UNCHARTED_RADIUS) + 5, z: 0 }, [])).toBeCloseTo(5)
  })

  test('shade runs from 0 at the shallows to 1 at the deep distance, then stays', () => {
    expect(depthShade(0)).toBe(0)
    expect(depthShade(SEA_DEEP_DISTANCE / 2)).toBeCloseTo(0.5)
    expect(depthShade(SEA_DEEP_DISTANCE * 3)).toBe(1)
  })
})
```

- [ ] **Step 4: Run it.** `cd apps/web && bunx vitest run src/scene/model/sea-depth.test.ts` — Expected: FAIL, cannot resolve `./sea-depth`.

- [ ] **Step 5: Implement.** Create `apps/web/src/scene/model/sea-depth.ts`:

```ts
import { SEA_DEEP_DISTANCE } from '../tuning'
import { type Point, shallowsRadius } from './hex-space'

/** What the sea needs to know about an island; `SceneIsland` satisfies it. */
export type Shore = { origin: Point; radius: number }

/** The empty world's ghost island (spec 17.4): this radius, at the origin. */
export const UNCHARTED_RADIUS = 1
export const UNCHARTED_SEED = 7

const UNCHARTED: readonly Shore[] = [{ origin: { x: 0, z: 0 }, radius: UNCHARTED_RADIUS }]

/**
 * World distance from `p` to the nearest shallows edge, 0 inside one. Shallows are measured as
 * circles through their hex corners. An empty world measures from the uncharted island.
 */
export function shoreDistance(p: Point, shores: readonly Shore[]): number {
  let best = Infinity
  for (const s of shores.length > 0 ? shores : UNCHARTED) {
    const d = Math.hypot(p.x - s.origin.x, p.z - s.origin.z) - shallowsRadius(s.radius)
    if (d < best) best = d
  }
  return Math.max(0, best)
}

/** 0 at a shallows edge, 1 at `SEA_DEEP_DISTANCE` and beyond. */
export const depthShade = (distance: number): number => Math.min(1, distance / SEA_DEEP_DISTANCE)
```

- [ ] **Step 6: Run it.** Same command — Expected: PASS.

- [ ] **Step 7: Failing sea test.** Create `apps/web/src/scene/sea.test.tsx`:

```tsx
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { shallowsRadius } from './model/hex-space'
import { Sea } from './sea'

const shore = { origin: { x: 0, z: 0 }, radius: 4 }
const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 }

async function seaMesh() {
  const r = await ReactThreeTestRenderer.create(
    <Sea bounds={bounds} islands={[shore]} animate={false} onTapSea={() => {}} />,
  )
  return r.scene.find((n) => n.props.name === 'sea').instance as THREE.Mesh
}

describe('Sea', () => {
  test('is flat-shaded with vertex colours', async () => {
    const material = (await seaMesh()).material as THREE.MeshLambertMaterial
    expect(material.flatShading).toBe(true)
    expect(material.vertexColors).toBe(true)
  })

  test('is lighter at the shallows than far out', async () => {
    const geometry = (await seaMesh()).geometry
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    let near = { i: 0, gap: Infinity }
    let far = { i: 0, d: -Infinity }
    for (let i = 0; i < position.count; i++) {
      const d = Math.hypot(position.getX(i), position.getZ(i))
      const gap = Math.abs(d - shallowsRadius(4))
      if (gap < near.gap) near = { i, gap }
      if (d > far.d) far = { i, d }
    }
    const brightness = (i: number) => color.getX(i) + color.getY(i) + color.getZ(i)
    expect(brightness(near.i)).toBeGreaterThan(brightness(far.i))
  })
})
```

- [ ] **Step 8: Run it.** `bunx vitest run src/scene/sea.test.tsx` — Expected: FAIL (`vertexColors` false, no `color` attribute).

- [ ] **Step 9: Implement.** In `apps/web/src/scene/materials.ts` replace `seaMaterial` with:

```ts
/** White base: the sea's colour is all in its vertex colours (spec 17.1). */
export const seaMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
})
```

Replace `apps/web/src/scene/sea.tsx` with:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seaMaterial } from './materials'
import { scenePalette } from './model/palette'
import type { Bounds } from './model/scene-model'
import { depthShade, type Shore, shoreDistance } from './model/sea-depth'
import { SEA_LEVEL } from './models/terrain-geometry'
import { onTap } from './tap'
import { clampDelta, SEA_SEGMENTS, SEA_WAVE_HEIGHT, SEA_WAVE_SPEED } from './tuning'

/** Open water beyond the outermost island, in world units: enough to fill a desktop viewport at
 * archipelago zoom. */
const SEA_MARGIN = 250

const shallowColor = new THREE.Color(scenePalette.seaShallow)
const deepColor = new THREE.Color(scenePalette.seaDeep)
const shade = new THREE.Color()

const shoreKey = (shores: readonly Shore[]) =>
  shores.map((s) => `${s.origin.x},${s.origin.z},${s.radius}`).join(';')

/** The same array while the layout is unchanged, so a refetch does not recolour the sea. */
function useStableShores(shores: readonly Shore[]): readonly Shore[] {
  const ref = useRef(shores)
  if (shoreKey(ref.current) !== shoreKey(shores)) ref.current = shores
  return ref.current
}

export function Sea({
  bounds,
  islands,
  animate,
  onTapSea,
}: {
  bounds: Bounds
  islands: readonly Shore[]
  animate: boolean
  onTapSea: () => void
}) {
  const { minX, maxX, minZ, maxZ } = bounds
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      maxX - minX + SEA_MARGIN * 2,
      maxZ - minZ + SEA_MARGIN * 2,
      SEA_SEGMENTS,
      SEA_SEGMENTS,
    )
    g.rotateX(-Math.PI / 2)
    g.translate((minX + maxX) / 2, SEA_LEVEL, (minZ + maxZ) / 2)
    return g
  }, [minX, maxX, minZ, maxZ])
  const rest = useMemo(() => Float32Array.from(geometry.getAttribute('position').array), [geometry])
  useEffect(() => () => geometry.dispose(), [geometry])
  const invalidate = useThree((s) => s.invalidate)
  const shores = useStableShores(islands)

  // Depth gradient (spec 17.1): once per layout, never per frame.
  useLayoutEffect(() => {
    const data = new Float32Array(rest.length)
    for (let i = 0; i < rest.length / 3; i++) {
      const p = { x: rest[i * 3] ?? 0, z: rest[i * 3 + 2] ?? 0 }
      shade.lerpColors(shallowColor, deepColor, depthShade(shoreDistance(p, shores)))
      data.set([shade.r, shade.g, shade.b], i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
    invalidate()
  }, [geometry, rest, shores, invalidate])

  // Low tier (or reduced motion): the wave stops flat at sea level; the shallows ring is terrain.
  useLayoutEffect(() => {
    if (animate) return
    const position = geometry.getAttribute('position')
    ;(position.array as Float32Array).set(rest)
    position.needsUpdate = true
    invalidate()
  }, [animate, geometry, rest, invalidate])

  const time = useRef(0)
  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta) * SEA_WAVE_SPEED
    const t = time.current
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3] ?? 0
      const z = rest[i * 3 + 2] ?? 0
      position.setY(
        i,
        SEA_LEVEL + SEA_WAVE_HEIGHT * Math.sin(x * 0.6 + t) * Math.cos(z * 0.6 + t * 0.8),
      )
    }
    position.needsUpdate = true
  })

  return (
    <mesh
      name="sea"
      geometry={geometry}
      material={seaMaterial}
      onClick={onTap<MouseEvent>(onTapSea)}
    />
  )
}
```

In `apps/web/src/scene/world-contents.tsx` change the sea line to:

```tsx
      <Sea
        bounds={model.bounds}
        islands={model.islands}
        animate={seaWave}
        onTapSea={() => live.onSelect(null)}
      />
```

In `apps/web/src/scene/world-scene.tsx` change the background to `<color attach="background" args={[scenePalette.seaDeep]} />`.

- [ ] **Step 10: Run the scene tests.** `bunx vitest run src/scene` — Expected: PASS (including `models.test.ts`, which now also accepts the new palette keys).

- [ ] **Step 11: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): shade the sea from the shallows to deep water as low-poly facets"
```

---
### Task 2: Sea routes and open-water scatter

**Files:**
- Modify: `apps/web/src/scene/model/random.ts`
- Create: `apps/web/src/scene/model/random.test.ts`
- Modify: `apps/web/src/scene/model/scene-model.ts` (add `slot`)
- Create: `apps/web/src/test/sea-worlds.ts` (test helper)
- Create: `apps/web/src/scene/model/sea-routes.ts`, `apps/web/src/scene/model/sea-routes.test.ts`
- Create: `apps/web/src/scene/model/sea-scatter.ts`, `apps/web/src/scene/model/sea-scatter.test.ts`
- Create: `apps/web/src/scene/models/sea-props.ts`
- Modify: `apps/web/src/scene/models/models.test.ts`
- Create: `apps/web/src/scene/sea-scatter.tsx`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Consumes: `Shore`, `shoreDistance` (Task 1); `shallowsRadius`, `SHALLOWS_MARGIN` (Task 1); tuning block (Task 1).
- Produces: `hashInts(...values: number[]): number`, `hashString(s: string): number` in `model/random.ts`.
- Produces: `SceneIsland.slot: Hex` (the project's archipelago slot).
- Produces: `type Route = { kind: 'lane'; key: string; from: Point; to: Point } | { kind: 'loop'; key: string; center: Point; radius: number }`, `seaRoutes(model: Pick<SceneModel, 'islands' | 'bounds'>): Route[]`, `routeDistance(p: Point, route: Route): number`, `segmentDistance(p: Point, a: Point, b: Point): number` in `model/sea-routes.ts`.
- Produces: `SCATTER_TYPES`, `type ScatterType`, `type ScatterProp = { type: ScatterType; position: Point; turn: number }`, `seaScatter(model: Pick<SceneModel, 'islands' | 'bounds'>): ScatterProp[]` in `model/sea-scatter.ts`.
- Produces: `type SeaKind = ScatterType | 'boat' | 'gull' | 'whale' | 'splash'`, `SEA_KINDS`, `seaGeometry(kind: SeaKind): THREE.BufferGeometry`, `foamGeometry(shores: readonly Shore[]): THREE.BufferGeometry` in `models/sea-props.ts` (cached per kind; foam is built per call and owned by the caller).
- Produces: `StaticInstances({ name, geometry, items })` and `SeaScatter({ model })` in `scene/sea-scatter.tsx`.

- [ ] **Step 1: Failing hash test.** Create `apps/web/src/scene/model/random.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { hashInts, hashString } from './random'

describe('hashes', () => {
  test('are deterministic unsigned 32-bit integers', () => {
    expect(hashInts(3, -4)).toBe(hashInts(3, -4))
    expect(hashString('beta')).toBe(hashString('beta'))
    for (const h of [hashInts(3, -4), hashInts(-1), hashString('')]) {
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  test('neighbouring cells and swapped coordinates differ', () => {
    const seen = new Set<number>()
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) seen.add(hashInts(x, z))
    expect(seen.size).toBe(49)
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1))
    expect(hashString('ab')).not.toBe(hashString('ba'))
  })
})
```

Run `cd apps/web && bunx vitest run src/scene/model/random.test.ts` — Expected: FAIL, `hashInts` is not exported.

- [ ] **Step 2: Implement.** Append to `apps/web/src/scene/model/random.ts`:

```ts
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

Run the test — Expected: PASS.

- [ ] **Step 3: Give scene islands their slot.** In `apps/web/src/scene/model/scene-model.ts` import `type Hex` from `@archipelago/shared`, add to `SceneIsland` after `name`:

```ts
  /** The project's slot in the archipelago grid; sea routes join near slots (spec 17.5). */
  slot: Hex
```

and in `buildSceneModel`'s island literal add `slot: { q: project.archipelagoX, r: project.archipelagoY },` after `name`. Run `bunx vitest run src/scene/model/scene-model.test.ts`; if a test compares a whole island with `toEqual`, add the `slot` it now carries.

- [ ] **Step 4: Failing routes test.** First create the shared test helper `apps/web/src/test/sea-worlds.ts` (a helper module, not a test file, so importing it never re-registers tests):

```ts
import type { WorldDto } from '@archipelago/shared'
import { buildSceneModel } from '../scene/model/scene-model'
import { fakeProject } from './fake-api'

export const quietEconomy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}

/** Empty islands (ids p0, p1, …) at the given archipelago slots. */
export function worldAt(...slots: [number, number][]): WorldDto {
  const projects = slots.map(([q, r], i) =>
    fakeProject({ id: `p${i}`, name: `P${i}`, archipelagoX: q, archipelagoY: r }),
  )
  return { projects, milestones: [], tasks: [], buildings: [], economy: quietEconomy }
}

export const modelAt = (...slots: [number, number][]) =>
  buildSceneModel(worldAt(...slots), '2026-10-08')
```

Then create `apps/web/src/scene/model/sea-routes.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { modelAt } from '../../test/sea-worlds'
import { BOAT_OFFSHORE, LANE_HALF_WIDTH, MIN_LANE } from '../tuning'
import { shallowsRadius } from './hex-space'
import { routeDistance, seaRoutes, segmentDistance } from './sea-routes'

describe('seaRoutes', () => {
  test('no islands, no routes', () => {
    expect(seaRoutes(modelAt())).toEqual([])
  })

  test('a lone island gets a loop just outside its shallows', () => {
    const model = modelAt([0, 0])
    const radius = model.islands[0]?.radius ?? 0
    expect(seaRoutes(model)).toEqual([
      { kind: 'loop', key: 'loop|p0', center: { x: 0, z: 0 }, radius: shallowsRadius(radius) + BOAT_OFFSHORE },
    ])
  })

  test('adjacent islands get no lane: boats circle the archipelago', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0]))
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'loop', key: 'loop|archipelago' })
  })

  test('an empty slot between two islands gives one lane through open water', () => {
    const model = modelAt([0, 0], [2, 0])
    const routes = seaRoutes(model)
    expect(routes).toHaveLength(1)
    const [lane] = routes
    if (lane?.kind !== 'lane') throw new Error('expected a lane')
    expect(lane.key).toBe('p0|p1')
    expect(Math.hypot(lane.to.x - lane.from.x, lane.to.z - lane.from.z)).toBeGreaterThanOrEqual(
      MIN_LANE,
    )
    for (const island of model.islands) {
      for (const end of [lane.from, lane.to]) {
        const d = Math.hypot(end.x - island.origin.x, end.z - island.origin.z)
        expect(d).toBeGreaterThanOrEqual(shallowsRadius(island.radius) + BOAT_OFFSHORE - 1e-9)
      }
    }
  })

  test('an island in the gap blocks the lane', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0], [2, 0]))
    expect(routes.map((r) => r.kind)).toEqual(['loop'])
  })

  test('islands three slots apart are never joined', () => {
    const routes = seaRoutes(modelAt([0, 0], [3, 0]))
    expect(routes.map((r) => r.kind)).toEqual(['loop'])
  })

  test('distances to a segment and to a loop', () => {
    const a = { x: 0, z: 0 }
    const b = { x: 10, z: 0 }
    expect(segmentDistance({ x: 5, z: 3 }, a, b)).toBeCloseTo(3)
    expect(segmentDistance({ x: -4, z: 3 }, a, b)).toBeCloseTo(5)
    const loop = { kind: 'loop' as const, key: 'l', center: a, radius: 5 }
    expect(routeDistance({ x: 7, z: 0 }, loop)).toBeCloseTo(2)
    expect(routeDistance({ x: 0, z: 1 }, loop)).toBeCloseTo(4)
    expect(LANE_HALF_WIDTH).toBeGreaterThan(0)
  })
})
```

Run `bunx vitest run src/scene/model/sea-routes.test.ts` — Expected: FAIL, cannot resolve `./sea-routes`.

- [ ] **Step 5: Implement.** Create `apps/web/src/scene/model/sea-routes.ts`:

```ts
import { hexDistance } from '@archipelago/shared'
import { BOAT_OFFSHORE, LANE_HALF_WIDTH, MIN_LANE } from '../tuning'
import { type Point, SHALLOWS_MARGIN, shallowsRadius } from './hex-space'
import type { SceneModel } from './scene-model'

/** An open-water path a boat sails (spec 17.5): out and back along a lane, or round a loop. */
export type Route =
  | { kind: 'lane'; key: string; from: Point; to: Point }
  | { kind: 'loop'; key: string; center: Point; radius: number }

/** Distance from `p` to the segment a–b. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length2 = dx * dx + dz * dz
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

export function routeDistance(p: Point, route: Route): number {
  if (route.kind === 'lane') return segmentDistance(p, route.from, route.to)
  return Math.abs(Math.hypot(p.x - route.center.x, p.z - route.center.z) - route.radius)
}

/**
 * Lanes join islands at most 2 slots apart through clear water at least `MIN_LANE` long;
 * neighbouring islands' shallows nearly touch, so in practice a lane crosses an empty slot.
 * Without a lane there is one loop. Routes depend only on the layout, never on progress.
 */
export function seaRoutes({ islands, bounds }: Pick<SceneModel, 'islands' | 'bounds'>): Route[] {
  const sorted = [...islands].sort((a, b) => (a.projectId < b.projectId ? -1 : 1))
  const lanes: Route[] = []
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (hexDistance(a.slot, b.slot) > 2) continue
      const blocked = sorted.some(
        (c) =>
          c !== a &&
          c !== b &&
          segmentDistance(c.origin, a.origin, b.origin) < shallowsRadius(c.radius) + LANE_HALF_WIDTH,
      )
      if (blocked) continue
      const dx = b.origin.x - a.origin.x
      const dz = b.origin.z - a.origin.z
      const length = Math.hypot(dx, dz)
      const start = shallowsRadius(a.radius) + BOAT_OFFSHORE
      const end = length - shallowsRadius(b.radius) - BOAT_OFFSHORE
      if (end - start < MIN_LANE) continue
      const at = (s: number): Point => ({
        x: a.origin.x + (dx / length) * s,
        z: a.origin.z + (dz / length) * s,
      })
      lanes.push({ kind: 'lane', key: `${a.projectId}|${b.projectId}`, from: at(start), to: at(end) })
    }
  })
  if (lanes.length > 0) return lanes
  const [first] = sorted
  if (!first) return []
  if (sorted.length === 1) {
    return [
      {
        kind: 'loop',
        key: `loop|${first.projectId}`,
        center: first.origin,
        radius: shallowsRadius(first.radius) + BOAT_OFFSHORE,
      },
    ]
  }
  const halfW = (bounds.maxX - bounds.minX) / 2
  const halfD = (bounds.maxZ - bounds.minZ) / 2
  return [
    {
      kind: 'loop',
      key: 'loop|archipelago',
      center: { x: bounds.minX + halfW, z: bounds.minZ + halfD },
      radius: Math.hypot(halfW, halfD) + SHALLOWS_MARGIN + BOAT_OFFSHORE,
    },
  ]
}
```

Run the routes test — Expected: PASS. If Biome reformats the long `lanes.push` line, accept its formatting.

- [ ] **Step 6: Failing scatter test.** Create `apps/web/src/scene/model/sea-scatter.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  LANE_HALF_WIDTH,
  SCATTER_CLEARANCE,
  SCATTER_EXTENT,
  SCATTER_MAX_PER_TYPE,
} from '../tuning'
import { modelAt } from '../../test/sea-worlds'
import { routeDistance, seaRoutes } from './sea-routes'
import { type ScatterProp, SCATTER_TYPES, seaScatter } from './sea-scatter'
import { shoreDistance } from './sea-depth'

const key = (p: ScatterProp) => `${p.type}@${p.position.x},${p.position.z}`

describe('seaScatter', () => {
  test('is deterministic for a layout', () => {
    expect(seaScatter(modelAt([0, 0], [1, 0]))).toEqual(seaScatter(modelAt([0, 0], [1, 0])))
  })

  test('keeps clear of every shallows and every sea route', () => {
    for (const model of [modelAt([0, 0], [1, 0]), modelAt([0, 0], [2, 0]), modelAt([0, 0])]) {
      const routes = seaRoutes(model)
      for (const p of seaScatter(model)) {
        expect(shoreDistance(p.position, model.islands)).toBeGreaterThanOrEqual(SCATTER_CLEARANCE)
        for (const r of routes) expect(routeDistance(p.position, r)).toBeGreaterThanOrEqual(LANE_HALF_WIDTH)
      }
    }
  })

  test('an empty world keeps clear of the uncharted island', () => {
    const model = modelAt()
    const props = seaScatter(model)
    expect(props.length).toBeGreaterThan(0)
    for (const p of props) expect(shoreDistance(p.position, [])).toBeGreaterThanOrEqual(SCATTER_CLEARANCE)
  })

  test('adding an island never moves a prop it does not cover', () => {
    const before = modelAt([0, 0], [1, 0])
    const after = modelAt([0, 0], [1, 0], [-1, 0])
    const kept = seaScatter(after)
    for (const type of SCATTER_TYPES) {
      // The cap must not be what drops a prop, or this test proves nothing.
      expect(kept.filter((p) => p.type === type).length).toBeLessThan(SCATTER_MAX_PER_TYPE)
    }
    const keys = new Set(kept.map(key))
    const routes = seaRoutes(after)
    for (const p of seaScatter(before)) {
      const covered =
        shoreDistance(p.position, after.islands) < SCATTER_CLEARANCE ||
        routes.some((r) => routeDistance(p.position, r) < LANE_HALF_WIDTH)
      if (!covered) expect(keys.has(key(p))).toBe(true)
    }
  })

  test('stays near the islands and caps each type', () => {
    const model = modelAt([0, 0], [4, 0], [0, 4], [-4, 0], [0, -4], [4, -4])
    const props = seaScatter(model)
    const { minX, maxX, minZ, maxZ } = model.bounds
    for (const p of props) {
      expect(p.position.x).toBeGreaterThanOrEqual(minX - SCATTER_EXTENT - 6)
      expect(p.position.x).toBeLessThanOrEqual(maxX + SCATTER_EXTENT + 6)
      expect(p.position.z).toBeGreaterThanOrEqual(minZ - SCATTER_EXTENT - 6)
      expect(p.position.z).toBeLessThanOrEqual(maxZ + SCATTER_EXTENT + 6)
    }
    for (const type of SCATTER_TYPES) {
      expect(props.filter((p) => p.type === type).length).toBeLessThanOrEqual(SCATTER_MAX_PER_TYPE)
    }
  })
})
```

Run `bunx vitest run src/scene/model/sea-scatter.test.ts` — Expected: FAIL, cannot resolve `./sea-scatter`. (The 6 in the extent checks is one `SCATTER_CELL`: a cell straddling the extent may place its prop up to one cell out.)

- [ ] **Step 7: Implement.** Create `apps/web/src/scene/model/sea-scatter.ts`:

```ts
import {
  LANE_HALF_WIDTH,
  SCATTER_CELL,
  SCATTER_CLEARANCE,
  SCATTER_EXTENT,
  SCATTER_FILL,
  SCATTER_MAX_PER_TYPE,
  SCATTER_WEIGHTS,
} from '../tuning'
import type { Point } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { SceneModel } from './scene-model'
import { shoreDistance } from './sea-depth'
import { routeDistance, seaRoutes } from './sea-routes'

export const SCATTER_TYPES = ['rock', 'islet', 'sandbar', 'buoy'] as const
export type ScatterType = (typeof SCATTER_TYPES)[number]
export type ScatterProp = { type: ScatterType; position: Point; turn: number }

function pickType(roll: number): ScatterType {
  let sum = 0
  for (const type of SCATTER_TYPES) {
    sum += SCATTER_WEIGHTS[type]
    if (roll < sum) return type
  }
  return 'rock'
}

/**
 * Static open-water props (spec 17.2). Each world grid cell draws its own prop from a hash of
 * its coordinates, so a new or grown island only hides props in cells it covers. The per-type cap
 * keeps the props nearest the world origin: growth at the edges is what gets dropped first.
 */
export function seaScatter(model: Pick<SceneModel, 'islands' | 'bounds'>): ScatterProp[] {
  const { islands, bounds } = model
  const routes = seaRoutes(model)
  const cell = (v: number) => Math.floor(v / SCATTER_CELL)
  const props: ScatterProp[] = []
  for (let cx = cell(bounds.minX - SCATTER_EXTENT); cx <= cell(bounds.maxX + SCATTER_EXTENT); cx++) {
    for (let cz = cell(bounds.minZ - SCATTER_EXTENT); cz <= cell(bounds.maxZ + SCATTER_EXTENT); cz++) {
      // Always draw in the same order, so a cell's prop never depends on its neighbours.
      const random = mulberry32(hashInts(cx, cz))
      const filled = random() < SCATTER_FILL
      const type = pickType(random())
      const position = {
        x: (cx + 0.2 + random() * 0.6) * SCATTER_CELL,
        z: (cz + 0.2 + random() * 0.6) * SCATTER_CELL,
      }
      const turn = random() * Math.PI * 2
      if (!filled) continue
      if (shoreDistance(position, islands) < SCATTER_CLEARANCE) continue
      if (routes.some((r) => routeDistance(position, r) < LANE_HALF_WIDTH)) continue
      props.push({ type, position, turn })
    }
  }
  const reach = (p: ScatterProp) => Math.hypot(p.position.x, p.position.z)
  return SCATTER_TYPES.flatMap((type) =>
    props
      .filter((p) => p.type === type)
      .sort((a, b) => reach(a) - reach(b))
      .slice(0, SCATTER_MAX_PER_TYPE),
  )
}
```

Run the scatter test — Expected: PASS.

- [ ] **Step 8: Prop models.** Create `apps/web/src/scene/models/sea-props.ts`:

```ts
import * as THREE from 'three'
import { shallowsRadius } from '../model/hex-space'
import type { Shore } from '../model/sea-depth'
import type { ScatterType } from '../model/sea-scatter'
import { FOAM_WIDTH } from '../tuning'
import { box, cone, merge, part, prism } from './build'
import { decorationBuilders } from './decorations'
import { SEA_LEVEL } from './terrain-geometry'

export type SeaKind = ScatterType | 'boat' | 'gull' | 'whale' | 'splash'
export const SEA_KINDS: readonly SeaKind[] = [
  'rock',
  'islet',
  'sandbar',
  'buoy',
  'boat',
  'gull',
  'whale',
  'splash',
]

const flatRing = (inner: number, outer: number, sides: number) =>
  new THREE.RingGeometry(inner, outer, sides).rotateX(-Math.PI / 2)

/** Base on y=0 at sea level; boats, gulls and the whale face +x. */
const builders: Record<SeaKind, () => THREE.BufferGeometry[]> = {
  rock: () => [
    part(prism(0.25, 0.45, 0.35, 5), 'rock'),
    part(prism(0.12, 0.2, 0.22, 5), 'stone', [0.3, 0, 0.15]),
  ],
  islet: () => [
    part(prism(0.7, 0.8, 0.2), 'shore'),
    part(prism(0.45, 0.6, 0.15), 'grass', [0, 0.2, 0]),
    ...decorationBuilders.palm().map((g) => g.translate(0, 0.35, 0)),
  ],
  sandbar: () => [part(prism(0.55, 0.75, 0.08).scale(1, 1, 0.5), 'shore')],
  buoy: () => [
    part(prism(0.08, 0.12, 0.35), 'buoy'),
    part(cone(0.1, 0.15, 6), 'foam', [0, 0.35, 0]),
  ],
  boat: () => [
    part(box(0.7, 0.16, 0.28), 'woodDark'),
    part(box(0.04, 0.6, 0.04), 'wood', [0, 0.16, 0]),
    part(cone(0.22, 0.45, 3), 'foam', [0.06, 0.24, 0]),
  ],
  gull: () => [
    part(box(0.12, 0.06, 0.06), 'foam'),
    part(box(0.06, 0.02, 0.44), 'foam', [0, 0.04, 0]),
  ],
  whale: () => [
    part(box(1.2, 0.35, 0.4), 'whale', [0, -0.175, 0]),
    part(box(0.12, 0.08, 0.5), 'whale', [-0.65, 0, 0]),
  ],
  splash: () => [part(flatRing(0.3, 0.6, 12), 'foam')],
}

const cache = new Map<SeaKind, THREE.BufferGeometry>()

/** Shared per kind; never disposed. */
export function seaGeometry(kind: SeaKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}

/**
 * One hex ring of foam per island at its shallows edge, merged into one mesh. A six-sided ring
 * laid flat has its corners where the turned shallows prism has them. Caller disposes.
 */
export function foamGeometry(shores: readonly Shore[]): THREE.BufferGeometry {
  return merge(
    shores.map((s) => {
      const inner = shallowsRadius(s.radius)
      return part(flatRing(inner, inner + FOAM_WIDTH, 6), 'foam', [
        s.origin.x,
        SEA_LEVEL + 0.06,
        s.origin.z,
      ])
    }),
  )
}
```

`foamGeometry([])` must not be called (`mergeGeometries` of nothing fails); Task 6 guards it.

In `apps/web/src/scene/models/models.test.ts` import `{ SEA_KINDS, seaGeometry, foamGeometry }` from `./sea-props` and add:

```ts
describe('sea props', () => {
  test.each(SEA_KINDS)('%s is non-empty and palette-coloured', (kind) => {
    expectPaletteColoured(seaGeometry(kind))
  })

  test('foam rings are palette-coloured, one ring per shore', () => {
    const one = foamGeometry([{ origin: { x: 0, z: 0 }, radius: 4 }])
    const two = foamGeometry([
      { origin: { x: 0, z: 0 }, radius: 4 },
      { origin: { x: 30, z: 0 }, radius: 4 },
    ])
    expectPaletteColoured(two)
    expect(two.getAttribute('position').count).toBe(one.getAttribute('position').count * 2)
  })
})
```

Run `bunx vitest run src/scene/models/models.test.ts` — Expected: PASS.

- [ ] **Step 9: Failing scene test.** In `apps/web/src/scene/world-contents.test.tsx` import `{ SCATTER_TYPES, seaScatter }` from `./model/sea-scatter` and add inside `describe('WorldContents')`:

```ts
  test('draws each scatter type as one instanced mesh that ignores taps', async () => {
    const { world, beta } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    const props = seaScatter(buildSceneModel(world, today))
    for (const type of SCATTER_TYPES) {
      const expected = props.filter((p) => p.type === type).length
      const meshes = named(renderer.scene, `scatter:${type}`)
      expect(meshes).toHaveLength(expected > 0 ? 1 : 0)
      expect(instanceCount(renderer.scene, `scatter:${type}`)).toBe(expected)
      for (const m of meshes) expect(m.props.onClick).toBeUndefined()
    }
    // The sea under them still clears the selection.
    await renderer.fireEvent(one(renderer.scene, 'sea'), 'click', { delta: 0 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })
```

Run `bunx vitest run src/scene/world-contents.test.tsx` — Expected: FAIL, no `scatter:*` nodes.

- [ ] **Step 10: Implement.** Create `apps/web/src/scene/sea-scatter.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import type { Point } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import { SCATTER_TYPES, seaScatter } from './model/sea-scatter'
import { seaGeometry } from './models/sea-props'
import { SEA_LEVEL } from './models/terrain-geometry'

const matrix = new THREE.Matrix4()

/** A static InstancedMesh at sea level: no taps, no frames after it is placed. */
export function StaticInstances({
  name,
  geometry,
  items,
}: {
  name: string
  geometry: THREE.BufferGeometry
  items: readonly { position: Point; turn: number }[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((item, i) => {
      matrix.makeRotationY(item.turn).setPosition(item.position.x, SEA_LEVEL, item.position.z)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, invalidate])
  if (items.length === 0) return null
  return (
    <instancedMesh
      // The instance count is fixed at construction; a new count needs a new mesh.
      key={items.length}
      ref={ref}
      name={name}
      args={[geometry, solidMaterial, items.length]}
    />
  )
}

/** Rocks, islets, sandbars and buoys in the open water (spec 17.2). */
export function SeaScatter({ model }: { model: Pick<SceneModel, 'islands' | 'bounds'> }) {
  const props = useMemo(() => seaScatter(model), [model])
  return SCATTER_TYPES.map((type) => (
    <StaticInstances
      key={type}
      name={`scatter:${type}`}
      geometry={seaGeometry(type)}
      items={props.filter((p) => p.type === type)}
    />
  ))
}
```

In `apps/web/src/scene/world-contents.tsx` import `SeaScatter` from `./sea-scatter` and render `<SeaScatter model={model} />` right after `<Sea … />`.

- [ ] **Step 11: Run the scene tests.** `bunx vitest run src/scene` — Expected: PASS.

- [ ] **Step 12: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): scatter seeded rocks, islets, sandbars and buoys off the sea routes"
```

---
### Task 3: Soft horizon — fog past the islands and a vignette

**Files:**
- Create: `apps/web/src/scene/model/horizon.ts`, `apps/web/src/scene/model/horizon.test.ts`
- Create: `apps/web/src/scene/fog-rig.tsx`, `apps/web/src/scene/fog-rig.test.tsx`
- Modify: `apps/web/src/scene/world-scene.tsx`
- Create: `apps/web/src/world/vignette.tsx`
- Modify: `apps/web/src/world/world-view.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: `scenePalette.seaDeep`, `FOG_MARGIN`, `FOG_DEPTH`, `VIGNETTE_ALPHA` (Task 1); `ISO_DISTANCE` (camera-rig).
- Produces: `viewDepth(camera: Vec3, p: Vec3): number`, `fogRange(camera: Vec3, bounds: Bounds): { near: number; far: number }` in `model/horizon.ts`.
- Produces: `FogRig({ bounds })` in `scene/fog-rig.tsx`; `Vignette()` in `world/vignette.tsx` (`data-testid="vignette"`).

- [ ] **Step 1: Failing horizon test.** Create `apps/web/src/scene/model/horizon.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { FOG_DEPTH, FOG_MARGIN } from '../tuning'
import { fogRange, viewDepth } from './horizon'

const ISO = 200
const bounds = { minX: -20, maxX: 30, minZ: -10, maxZ: 25 }
const cameraOver = (x: number, z: number) => ({ x: x + ISO, y: ISO, z: z + ISO })
const corners = [
  { x: bounds.minX, y: 0, z: bounds.minZ },
  { x: bounds.minX, y: 0, z: bounds.maxZ },
  { x: bounds.maxX, y: 0, z: bounds.minZ },
  { x: bounds.maxX, y: 0, z: bounds.maxZ },
]

describe('fogRange', () => {
  test('the camera target sits at the iso distance', () => {
    expect(viewDepth(cameraOver(0, 0), { x: 0, y: 0, z: 0 })).toBeCloseTo(ISO * Math.sqrt(3))
  })

  test('starts FOG_MARGIN past the farthest corner and is solid FOG_DEPTH later', () => {
    const camera = cameraOver(5, 5)
    const { near, far } = fogRange(camera, bounds)
    const deepest = Math.max(...corners.map((c) => viewDepth(camera, c)))
    expect(near).toBeCloseTo(deepest + FOG_MARGIN)
    expect(far).toBeCloseTo(near + FOG_DEPTH)
  })

  test('after any pan no island corner, at any height, is fogged', () => {
    for (const [x, z] of [
      [0, 0],
      [-40, 10],
      [60, -30],
    ] as const) {
      const camera = cameraOver(x, z)
      const { near } = fogRange(camera, bounds)
      for (const c of corners) {
        for (const y of [0, 1, 3]) expect(viewDepth(camera, { ...c, y })).toBeLessThan(near)
      }
    }
  })
})
```

Run `cd apps/web && bunx vitest run src/scene/model/horizon.test.ts` — Expected: FAIL, cannot resolve `./horizon`.

- [ ] **Step 2: Implement.** Create `apps/web/src/scene/model/horizon.ts`:

```ts
import { FOG_DEPTH, FOG_MARGIN } from '../tuning'
import type { Bounds } from './scene-model'

export type Vec3 = { x: number; y: number; z: number }

const AXIS = 1 / Math.sqrt(3)

/** Depth of `p` in front of the camera, which always looks down -(1, 1, 1) (true isometric). */
export function viewDepth(camera: Vec3, p: Vec3): number {
  return (camera.x - p.x + camera.y - p.y + camera.z - p.z) * AXIS
}

/**
 * The camera is orthographic at a fixed distance, so zoom never changes depth (spec 17.3). Fog
 * starts past the deepest ground corner of the islands' bounds: anything on an island stands
 * at y ≥ 0, so it is nearer still and never fogged.
 */
export function fogRange(camera: Vec3, bounds: Bounds): { near: number; far: number } {
  const deepest = Math.max(
    ...[bounds.minX, bounds.maxX].flatMap((x) =>
      [bounds.minZ, bounds.maxZ].map((z) => viewDepth(camera, { x, y: 0, z })),
    ),
  )
  const near = deepest + FOG_MARGIN
  return { near, far: near + FOG_DEPTH }
}
```

Run the test — Expected: PASS.

- [ ] **Step 3: Failing fog-rig test.** Create `apps/web/src/scene/fog-rig.test.tsx`:

```tsx
import { type Camera, useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { FogRig } from './fog-rig'
import { scenePalette } from './model/palette'
import { fogRange } from './model/horizon'

const bounds = { minX: -20, maxX: 30, minZ: -10, maxZ: 25 }

describe('FogRig', () => {
  test('sets a sea-deep fog that follows the camera across a pan', async () => {
    const seen: { camera?: Camera } = {}
    function Probe() {
      seen.camera = useThree((s) => s.camera)
      return null
    }
    const r = await ReactThreeTestRenderer.create(
      <>
        <Probe />
        <FogRig bounds={bounds} />
      </>,
    )
    const cam = seen.camera
    if (!cam) throw new Error('no camera')
    cam.position.set(200, 200, 200)
    await r.advanceFrames(1, 0.016)
    const fog = (r.scene.instance as THREE.Scene).fog
    expect(fog).toBeInstanceOf(THREE.Fog)
    const f = fog as THREE.Fog
    expect(`#${f.color.getHexString()}`).toBe(scenePalette.seaDeep)
    expect(f.near).toBeCloseTo(fogRange(cam.position, bounds).near)
    cam.position.set(240, 200, 180)
    await r.advanceFrames(1, 0.016)
    expect(f.near).toBeCloseTo(fogRange(cam.position, bounds).near)
    expect(f.far).toBeCloseTo(fogRange(cam.position, bounds).far)
  })
})
```

Run `bunx vitest run src/scene/fog-rig.test.tsx` — Expected: FAIL, cannot resolve `./fog-rig`.

- [ ] **Step 4: Implement.** Create `apps/web/src/scene/fog-rig.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { fogRange } from './model/horizon'
import { scenePalette } from './model/palette'
import type { Bounds } from './model/scene-model'

/**
 * Fades everything past the archipelago's far edge into the background (spec 17.3). It updates
 * on frames that render anyway and never asks for one.
 */
export function FogRig({ bounds }: { bounds: Bounds }) {
  const scene = useThree((s) => s.scene)
  const fog = useMemo(() => new THREE.Fog(scenePalette.seaDeep, 1, 2), [])
  useLayoutEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])
  useFrame(({ camera }) => {
    const { near, far } = fogRange(camera.position, bounds)
    fog.near = near
    fog.far = far
  })
  return null
}
```

Run the fog-rig test — Expected: PASS.

In `apps/web/src/scene/world-scene.tsx` import `FogRig` and render `<FogRig bounds={props.model.bounds} />` right after the `<color attach="background" … />` line.

- [ ] **Step 5: Failing vignette test.** In `apps/web/src/layout/world-scene-integration.test.tsx` add inside the main `describe`:

```ts
  test('a vignette softens the canvas edges without catching taps', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    const vignette = screen.getByTestId('vignette')
    expect(vignette).toHaveClass('pointer-events-none')
    expect(vignette).toHaveAttribute('aria-hidden', 'true')
  })
```

Run `bunx vitest run src/layout/world-scene-integration.test.tsx` — Expected: FAIL, no `vignette`.

- [ ] **Step 6: Implement.** Create `apps/web/src/world/vignette.tsx`:

```tsx
import { scenePalette } from '../scene/model/palette'
import { VIGNETTE_ALPHA } from '../scene/tuning'

const alpha = Math.round(VIGNETTE_ALPHA * 255)
  .toString(16)
  .padStart(2, '0')

/** Darkens the canvas corners towards deep water (spec 17.3); the card view has none. */
export function Vignette() {
  return (
    <div
      data-testid="vignette"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: `radial-gradient(ellipse at center, transparent 55%, ${scenePalette.seaDeep}${alpha} 100%)`,
      }}
    />
  )
}
```

In `apps/web/src/world/world-view.tsx` import `Vignette` from `./vignette` and render `<Vignette />` directly after the `<div className="absolute inset-0">…</div>` that holds the scene, before `<EdgeIndicatorLayer …>` (later siblings — markers, overlay, HUD — stack above it).

Run the integration test — Expected: PASS. Then `bunx vitest run src/layout` — Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/scene apps/web/src/world apps/web/src/layout
git commit -m "feat(web): fade the sea past the archipelago into fog and add a vignette"
```

---
### Task 4: "Uncharted waters" empty state

**Files:**
- Create: `apps/web/src/world/uncharted-card.tsx`
- Modify: `apps/web/src/world/card-world.tsx`, `apps/web/src/world/world-hud.tsx`, `apps/web/src/world/world-view.tsx`
- Create: `apps/web/src/scene/empty-sea.tsx`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`
- Modify: `apps/web/src/scene/world-contents.test.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`
- Create: `apps/web/src/layout/world-empty.test.tsx`

**Interfaces:**
- Consumes: `UNCHARTED_RADIUS`, `UNCHARTED_SEED` (Task 1); `islandTerrain`, `islandGeometry`, `ghostMaterial`.
- Produces: `UnchartedCard({ onCreate?: () => void })` (three-free DOM).
- Produces: `EmptySea({ onCreate?: () => void })` (group `name="uncharted"`).
- Produces: `WorldContentsProps.onNewProject?: () => void`, and through it `WorldSceneProps.onNewProject?`.
- Changes: `WorldHud` loses its `empty` prop.

- [ ] **Step 1: Failing app tests.** In `apps/web/src/layout/world-scene-integration.test.tsx`:
  - in the `WorldScene` mock, destructure `onNewProject` too and render, inside the stub's root `div`, before the islands:

```tsx
        {model.islands.length === 0 && onNewProject && (
          <button type="button" onClick={onNewProject}>
            Create your first island
          </button>
        )}
```

  - replace the test `'an empty world says so over the sea'` with:

```ts
  test('an empty world offers its first island from the sea, not a HUD note', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Create your first island' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'New island' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('No islands yet. Create one to start building.')).toBeNull()
  })

  test('creating the first island replaces the empty prompt with the island', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Create your first island' }))
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Alpha')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create island' }))
    expect(await screen.findByRole('button', { name: 'open Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create your first island' })).toBeNull()
  })
```

Create `apps/web/src/layout/world-empty.test.tsx` (jsdom has no WebGL2, so this is the card view):

```tsx
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi } from '../test/fake-api'
import { renderApp } from '../test/render-app'

describe('empty world without WebGL', () => {
  test('the card view offers the first island under the same heading', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    expect(await screen.findByRole('heading', { name: 'Uncharted waters' })).toBeInTheDocument()
    expect(screen.queryByText('No islands yet. Create one to start building.')).toBeNull()
    expect(screen.queryByTestId('vignette')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Create your first island' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'New island' }),
    ).toBeInTheDocument()
  })
})
```

Run `cd apps/web && bunx vitest run src/layout/world-scene-integration.test.tsx src/layout/world-empty.test.tsx` — Expected: FAIL (no `Create your first island` button; the HUD note is still there).

- [ ] **Step 2: The card.** Create `apps/web/src/world/uncharted-card.tsx`:

```tsx
/** The empty world's prompt (spec 17.4): over the ghost island, or in the card view. */
export function UnchartedCard({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex w-64 flex-col items-center gap-3 rounded-lg bg-surface-primary/95 p-4 text-center shadow">
      <h2 className="font-semibold text-text-primary">Uncharted waters</h2>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="min-h-11 rounded-md bg-brand px-4 text-sm text-text-on-brand"
        >
          Create your first island
        </button>
      )}
    </div>
  )
}
```

In `apps/web/src/world/card-world.tsx` import it and replace

```tsx
        {summaries.length === 0 && (
          <p className="px-4 text-text-secondary">No islands yet. Create one to start building.</p>
        )}
```

with

```tsx
        {summaries.length === 0 && (
          <div className="px-4">
            <UnchartedCard onCreate={onNewProject} />
          </div>
        )}
```

In `apps/web/src/world/world-hud.tsx` delete the `empty` prop (from the parameter list and its type) and the `{empty && (<p …>No islands yet…</p>)}` block; the archipelago branch keeps only the "New island" chip. In `apps/web/src/world/world-view.tsx` drop `empty={world.projects.length === 0}` from `<WorldHud>` and pass `onNewProject={onNewProject}` to `<WorldScene>`.

- [ ] **Step 3: Failing scene test.** In `apps/web/src/scene/world-contents.test.tsx` import `ghostMaterial` (already imported) and add:

```ts
  test('an empty world shows the uncharted ghost island, which ignores taps', async () => {
    const empty: WorldDto = { projects: [], milestones: [], tasks: [], buildings: [], economy }
    const { renderer, onSelect } = await render(empty, { kind: 'archipelago' })
    const ghost = one(renderer.scene, 'uncharted-terrain')
    expect((ghost.instance as THREE.Mesh).material).toBe(ghostMaterial)
    expect(ghost.props.onClick).toBeUndefined()
    await renderer.fireEvent(one(renderer.scene, 'sea'), 'click', { delta: 0 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  test('any island removes the uncharted ghost', async () => {
    const { world } = seeded()
    const { renderer } = await render(world, { kind: 'archipelago' })
    expect(named(renderer.scene, 'uncharted')).toHaveLength(0)
  })
```

(`Html` is mocked to render nothing in this file; the card itself is covered by the app tests.)

Run `bunx vitest run src/scene/world-contents.test.tsx` — Expected: FAIL, no `uncharted-terrain` node.

- [ ] **Step 4: Implement.** Create `apps/web/src/scene/empty-sea.tsx`:

```tsx
import { Html } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { UnchartedCard } from '../world/uncharted-card'
import { ghostMaterial } from './materials'
import { LAND_HEIGHT } from './model/hex-space'
import { UNCHARTED_RADIUS, UNCHARTED_SEED } from './model/sea-depth'
import { islandTerrain } from './model/terrain'
import { islandGeometry } from './models/terrain-geometry'

/** Same as the labels': the HUD (z-20) and sheet stay above the card. */
const CARD_Z: [number, number] = [10, 0]

/** The empty world (spec 17.4): a still ghost island at the origin with the first-island prompt. */
export function EmptySea({ onCreate }: { onCreate?: () => void }) {
  const geometry = useMemo(
    () => islandGeometry(islandTerrain(UNCHARTED_SEED, UNCHARTED_RADIUS), UNCHARTED_RADIUS),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <group name="uncharted">
      <mesh name="uncharted-terrain" geometry={geometry} material={ghostMaterial} />
      <Html center zIndexRange={CARD_Z} position={[0, LAND_HEIGHT + 2, 0]}>
        <UnchartedCard onCreate={onCreate} />
      </Html>
    </group>
  )
}
```

In `apps/web/src/scene/world-contents.tsx`:
  - add to `WorldContentsProps`: `/** Opens the new-island editor; offered over the empty sea. */ onNewProject?: () => void`;
  - destructure `onNewProject` alongside `rewards` (so it is not spread into `handlers`);
  - render `{model.islands.length === 0 && <EmptySea onCreate={onNewProject} />}` after `<SeaScatter … />`.

In `apps/web/src/scene/world-scene.tsx` add `onNewProject?: () => void` to `WorldSceneProps`; `<WorldContents {...props} …>` already forwards it.

- [ ] **Step 5: Run.** `bunx vitest run src/scene src/layout src/world` — Expected: PASS. Then `bun run --cwd apps/web typecheck` (or `bun run typecheck` from the root) — Expected: no errors (catches any remaining `empty=` caller).

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src
git commit -m "feat(web): show an uncharted ghost island with a first-island prompt on an empty sea"
```

---
### Task 5: Ambient life model and ticker demand

**Files:**
- Create: `apps/web/src/scene/model/ambient-life.ts`, `apps/web/src/scene/model/ambient-life.test.ts`
- Modify: `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`

**Interfaces:**
- Consumes: `seaRoutes`, `Route` (Task 2); `hashInts`, `hashString`, `mulberry32`; `shallowsRadius`, `SHALLOWS_MARGIN`, `islandExtent`; tuning block (Task 1); `worldAt`, `quietEconomy` test helpers (Task 2).
- Produces (all in `model/ambient-life.ts`):
  - `type Boat = { route: Route; phase: number }` (phase ∈ [0, 1) of one trip round the route)
  - `type GullFlock = { projectId: string; center: Point; radius: number; phase: number }`
  - `type Whale = { spot: Point; turn: number; interval: number; phase: number }`
  - `type AmbientLife = { boats: Boat[]; flocks: GullFlock[]; whale: Whale | null }`, `NO_LIFE`
  - `MAX_BOATS = 4`, `TASKS_PER_BOAT = 3`, `MAX_FLOCKS = 3`, `GULLS_PER_FLOCK = 3`, `BOAT_WINDOW_MS`, `GULL_WINDOW_MS`
  - `boatCount(done: number): number`, `hasLife(life: AmbientLife): boolean`
  - `buildAmbientLife(scene: SceneModel, world: WorldDto, now: number): AmbientLife`
  - `type Pose = { position: Point; heading: number }` (heading: radians about y; 0 faces +x)
  - `boatPose(boat: Boat, t: number): Pose`, `gullPose(flock: GullFlock, k: number, t: number): Pose`
  - `type WhalePose = { visible: boolean; y: number; pitch: number; splash: number }`, `whalePose(whale: Whale, t: number): WhalePose`
  - `foamOpacity(t: number): number`
- Produces: `TickerDemand.life: boolean`.

- [ ] **Step 1: Failing model test.** Create `apps/web/src/scene/model/ambient-life.test.ts`:

```ts
import type { TaskDto, WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeTask } from '../../test/fake-api'
import { worldAt } from '../../test/sea-worlds'
import { BOAT_SPEED, FOAM_OPACITY, FOAM_PULSE, WHALE_BREACH_S, WHALE_CLEARANCE } from '../tuning'
import {
  boatCount,
  boatPose,
  buildAmbientLife,
  foamOpacity,
  gullPose,
  MAX_FLOCKS,
  whalePose,
} from './ambient-life'
import { buildSceneModel } from './scene-model'
import { shoreDistance } from './sea-depth'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const HOUR = 3_600_000
const doneAt = (projectId: string, hoursAgo: number): TaskDto =>
  fakeTask({
    projectId,
    status: 'done',
    completedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  })

function life(world: WorldDto, now = NOW) {
  return buildAmbientLife(buildSceneModel(world, '2026-10-08'), world, now)
}
const withTasks = (world: WorldDto, tasks: TaskDto[]): WorldDto => ({ ...world, tasks })

describe('boats', () => {
  test('one boat per three completions this week, at most four', () => {
    expect([0, 1, 3, 4, 6, 7, 12, 13, 40].map(boatCount)).toEqual([0, 1, 1, 2, 2, 3, 4, 4, 4])
  })

  test('count only done tasks of scene islands completed in the last 7 days', () => {
    const world = worldAt([0, 0], [2, 0])
    const recent = [1, 2, 3, 4].map((h) => doneAt('p0', h * 24))
    const stale = doneAt('p0', 24 * 8)
    const reopened = fakeTask({ projectId: 'p0', status: 'todo', completedAt: null })
    const orphan = doneAt('gone', 1)
    expect(life(withTasks(world, [...recent, stale, reopened, orphan])).boats).toHaveLength(2)
  })

  test('a completion stamped slightly in the future still counts', () => {
    const world = withTasks(worldAt([0, 0]), [doneAt('p0', -0.01)])
    expect(life(world).boats).toHaveLength(1)
  })

  test('sail the open lane when there is one, the loop otherwise', () => {
    const lane = life(withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1)]))
    expect(lane.boats[0]?.route.kind).toBe('lane')
    const loop = life(withTasks(worldAt([0, 0], [1, 0]), [doneAt('p0', 1)]))
    expect(loop.boats[0]?.route.kind).toBe('loop')
  })

  test('a later completion adds a boat and leaves the others where they were', () => {
    const world = worldAt([0, 0], [2, 0], [0, 2])
    const three = [1, 2, 3].map((h) => doneAt('p0', h))
    const before = life(withTasks(world, three))
    const after = life(withTasks(world, [...three, doneAt('p1', 0.5)]))
    expect(after.boats).toHaveLength(2)
    expect(after.boats[0]).toEqual(before.boats[0])
  })

  test('the same world later inside the same windows gives the same life', () => {
    const world = withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1), doneAt('p1', 2)])
    expect(life(world, NOW + HOUR)).toEqual(life(world))
  })

  test('a lane boat goes out and comes back; a loop boat keeps its distance', () => {
    const { boats } = life(withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1)]))
    const boat = boats[0]
    if (boat?.route.kind !== 'lane') throw new Error('expected a lane boat')
    const { from, to } = boat.route
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    const start = boatPose(boat, 0).position
    const back = boatPose(boat, (2 * length) / BOAT_SPEED).position
    expect(back.x).toBeCloseTo(start.x)
    expect(back.z).toBeCloseTo(start.z)
    const loop = life(withTasks(worldAt([0, 0]), [doneAt('p0', 1)])).boats[0]
    if (loop?.route.kind !== 'loop') throw new Error('expected a loop boat')
    const { center, radius } = loop.route
    for (const t of [0, 3, 17]) {
      const p = boatPose(loop, t).position
      expect(Math.hypot(p.x - center.x, p.z - center.z)).toBeCloseTo(radius)
    }
  })
})

describe('gulls', () => {
  test('circle only islands with a completion in the last 24h, most recent first, at most 3', () => {
    const world = worldAt([0, 0], [2, 0], [0, 2], [2, 2], [4, 0])
    const tasks = [doneAt('p0', 5), doneAt('p1', 1), doneAt('p2', 30), doneAt('p3', 3), doneAt('p4', 2)]
    const { flocks } = life(withTasks(world, tasks))
    expect(flocks.map((f) => f.projectId)).toEqual(['p1', 'p4', 'p3'])
    expect(flocks).toHaveLength(MAX_FLOCKS)
  })

  test('three gulls spread round each circle', () => {
    const flock = life(withTasks(worldAt([0, 0]), [doneAt('p0', 1)])).flocks[0]
    if (!flock) throw new Error('expected a flock')
    const points = [0, 1, 2].map((k) => gullPose(flock, k, 0).position)
    for (const p of points) {
      expect(Math.hypot(p.x - flock.center.x, p.z - flock.center.z)).toBeCloseTo(flock.radius)
    }
    expect(new Set(points.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size).toBe(3)
  })
})

describe('whale', () => {
  test('only on a day the streak is active, clear of every island', () => {
    const world = worldAt([0, 0], [1, 0])
    expect(life(world).whale).toBeNull()
    const active: WorldDto = {
      ...world,
      economy: { ...world.economy, streak: { days: 3, activeToday: true, next: null } },
    }
    const model = buildSceneModel(active, '2026-10-08')
    const whale = buildAmbientLife(model, active, NOW).whale
    if (!whale) throw new Error('expected a whale')
    expect(shoreDistance(whale.spot, model.islands)).toBeGreaterThanOrEqual(WHALE_CLEARANCE)
    expect(whale.interval).toBeGreaterThanOrEqual(25)
    expect(whale.interval).toBeLessThanOrEqual(40)
  })

  test('breaches for WHALE_BREACH_S once per interval', () => {
    const whale = { spot: { x: 0, z: 0 }, turn: 0, interval: 30, phase: 0 }
    expect(whalePose(whale, 0.5).visible).toBe(true)
    expect(whalePose(whale, WHALE_BREACH_S + 1).visible).toBe(false)
    expect(whalePose(whale, 30.5).visible).toBe(true)
    expect(whalePose(whale, WHALE_BREACH_S / 2).splash).toBeCloseTo(0.5)
  })
})

test('foam pulses around its base opacity', () => {
  expect(foamOpacity(0)).toBeCloseTo(FOAM_OPACITY)
  for (const t of [0.7, 1.9, 3.3]) {
    expect(Math.abs(foamOpacity(t) - FOAM_OPACITY)).toBeLessThanOrEqual(FOAM_PULSE + 1e-9)
  }
})
```

Run `cd apps/web && bunx vitest run src/scene/model/ambient-life.test.ts` — Expected: FAIL, cannot resolve `./ambient-life`.

- [ ] **Step 2: Implement.** Create `apps/web/src/scene/model/ambient-life.ts`:

```ts
import type { WorldDto } from '@archipelago/shared'
import {
  BOAT_SPEED,
  FOAM_OPACITY,
  FOAM_PULSE,
  FOAM_PULSE_S,
  GULL_ORBIT,
  GULL_SPEED,
  WHALE_BREACH_S,
  WHALE_CLEARANCE,
  WHALE_INTERVAL_S,
} from '../tuning'
import { islandExtent, type Point, SHALLOWS_MARGIN } from './hex-space'
import { hashInts, hashString, mulberry32 } from './random'
import type { SceneModel } from './scene-model'
import { type Route, seaRoutes } from './sea-routes'

export type Boat = { route: Route; phase: number }
export type GullFlock = { projectId: string; center: Point; radius: number; phase: number }
export type Whale = { spot: Point; turn: number; interval: number; phase: number }
export type AmbientLife = { boats: Boat[]; flocks: GullFlock[]; whale: Whale | null }
export type Pose = { position: Point; heading: number }
export type WhalePose = { visible: boolean; y: number; pitch: number; splash: number }

export const NO_LIFE: AmbientLife = { boats: [], flocks: [], whale: null }
export const MAX_BOATS = 4
export const TASKS_PER_BOAT = 3
export const MAX_FLOCKS = 3
export const GULLS_PER_FLOCK = 3
const DAY_MS = 86_400_000
export const BOAT_WINDOW_MS = 7 * DAY_MS
export const GULL_WINDOW_MS = DAY_MS

export const boatCount = (done: number): number =>
  Math.min(MAX_BOATS, Math.ceil(done / TASKS_PER_BOAT))

export const hasLife = (life: AmbientLife): boolean =>
  life.boats.length > 0 || life.flocks.length > 0 || life.whale !== null

/** Heading (radians about y) that turns a model facing +x to travel along (dx, dz). */
const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx)

/**
 * Progress made visible at sea (spec 17.5). Seeds come from ids and routes, never list order,
 * so boat i keeps its route and phase when a later completion adds boat i+1.
 */
export function buildAmbientLife(scene: SceneModel, world: WorldDto, now: number): AmbientLife {
  const onScene = new Set(scene.islands.map((i) => i.projectId))
  // A stamp slightly ahead of this clock (server time) still counts: only age is checked.
  const completions = world.tasks.flatMap((t) =>
    t.status === 'done' && t.completedAt && onScene.has(t.projectId)
      ? [{ projectId: t.projectId, at: Date.parse(t.completedAt) }]
      : [],
  )
  const within = (ms: number) => completions.filter((c) => now - c.at <= ms)

  const routes = seaRoutes(scene)
  const count = routes.length > 0 ? boatCount(within(BOAT_WINDOW_MS).length) : 0
  const start = routes[0] ? hashString(routes[0].key) % routes.length : 0
  const boats = Array.from({ length: count }, (_, i): Boat => {
    const route = routes[(start + i) % routes.length] as Route
    return { route, phase: mulberry32(hashInts(i, hashString(route.key)))() }
  })

  const latest = new Map<string, number>()
  for (const c of within(GULL_WINDOW_MS)) {
    latest.set(c.projectId, Math.max(latest.get(c.projectId) ?? -Infinity, c.at))
  }
  const flocks = [...latest]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_FLOCKS)
    .flatMap(([projectId]): GullFlock[] => {
      const island = scene.islands.find((i) => i.projectId === projectId)
      if (!island) return []
      return [
        {
          projectId,
          center: island.origin,
          radius: islandExtent(island.radius) * GULL_ORBIT,
          phase: mulberry32(hashString(projectId))(),
        },
      ]
    })

  return { boats, flocks, whale: world.economy.streak.activeToday ? whaleFor(scene) : null }
}

/** Beyond every island: past the bounds' half-diagonal, its shallows, and the clearance. */
function whaleFor({ islands, bounds }: SceneModel): Whale {
  const ids = islands.map((i) => i.projectId).sort().join('|')
  const random = mulberry32(hashString(ids))
  const halfW = (bounds.maxX - bounds.minX) / 2
  const halfD = (bounds.maxZ - bounds.minZ) / 2
  const distance = Math.hypot(halfW, halfD) + SHALLOWS_MARGIN + WHALE_CLEARANCE
  const angle = random() * Math.PI * 2
  const [min, max] = WHALE_INTERVAL_S
  return {
    spot: {
      x: bounds.minX + halfW + Math.cos(angle) * distance,
      z: bounds.minZ + halfD + Math.sin(angle) * distance,
    },
    interval: min + random() * (max - min),
    phase: random(),
    turn: random() * Math.PI * 2,
  }
}

/** Where a boat is `t` seconds into its voyage; t = 0 is its frozen pose. */
export function boatPose({ route, phase }: Boat, t: number): Pose {
  if (route.kind === 'loop') {
    const turns = phase + (t * BOAT_SPEED) / (2 * Math.PI * route.radius)
    const a = (turns % 1) * 2 * Math.PI
    return {
      position: {
        x: route.center.x + route.radius * Math.cos(a),
        z: route.center.z + route.radius * Math.sin(a),
      },
      heading: headingOf(-Math.sin(a), Math.cos(a)),
    }
  }
  const dx = route.to.x - route.from.x
  const dz = route.to.z - route.from.z
  const length = Math.hypot(dx, dz)
  const u = (phase + (t * BOAT_SPEED) / (2 * length)) % 1
  const out = u < 0.5
  const s = out ? u * 2 : 2 - u * 2
  return {
    position: { x: route.from.x + dx * s, z: route.from.z + dz * s },
    heading: out ? headingOf(dx, dz) : headingOf(-dx, -dz),
  }
}

/** Gull `k` of a flock, spread a third of a circle apart. */
export function gullPose(flock: GullFlock, k: number, t: number): Pose {
  const a = 2 * Math.PI * (flock.phase + k / GULLS_PER_FLOCK) + (t * GULL_SPEED) / flock.radius
  return {
    position: {
      x: flock.center.x + flock.radius * Math.cos(a),
      z: flock.center.z + flock.radius * Math.sin(a),
    },
    heading: headingOf(-Math.sin(a), Math.cos(a)),
  }
}

/** A breach: up out of the water and back over `WHALE_BREACH_S`, once per interval. */
export function whalePose(whale: Whale, t: number): WhalePose {
  const cycle = (whale.phase * whale.interval + t) % whale.interval
  if (cycle > WHALE_BREACH_S) return { visible: false, y: 0, pitch: 0, splash: 0 }
  const s = cycle / WHALE_BREACH_S
  return { visible: true, y: -0.6 + Math.sin(Math.PI * s) * 1.0, pitch: (0.5 - s) * 1.2, splash: s }
}

export const foamOpacity = (t: number): number =>
  FOAM_OPACITY + FOAM_PULSE * Math.sin((2 * Math.PI * t) / FOAM_PULSE_S)
```

Note the `whalePose` test pins `phase: 0`, so `t` is the time into the cycle.

Run the test — Expected: PASS.

- [ ] **Step 3: Failing ticker test.** In `apps/web/src/scene/ticker.test.ts` add `life: false` to `still`, change the loop to `for (const key of ['seaWave', 'cranes', 'effects', 'camera', 'life'] as const)`, and add `life: true` to the reduced-motion case's object. Run `bunx vitest run src/scene/ticker.test.ts` — Expected: FAIL (type error / `life` alone does not tick).

- [ ] **Step 4: Implement.** In `apps/web/src/scene/ticker.ts` add to `TickerDemand`:

```ts
  /** Boats, gulls or a whale are moving (`high` tier, spec 17.5). */
  life: boolean
```

and make `tickerWanted` return `d.animate && (d.seaWave || d.cranes || d.effects || d.camera || d.life)`. Run the ticker test — Expected: PASS. `bun run --cwd apps/web typecheck` now fails in `world-scene.tsx` (missing `life`); Task 6 supplies it, so pass `life: false` there for now to keep this commit green.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): derive boats, gulls and the whale from recent progress"
```

---
### Task 6: Ambient life in the scene, and the wiring from the world

**Files:**
- Modify: `apps/web/src/scene/materials.ts`
- Create: `apps/web/src/scene/ambient-life.tsx`, `apps/web/src/scene/ambient-life.test.tsx`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`
- Modify: `apps/web/src/world/world-view.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: everything from Task 5's `model/ambient-life.ts`; `seaGeometry`, `foamGeometry` (Task 2); `Shore` (Task 1); `GULL_HEIGHT`, `FOAM_OPACITY` (Task 1).
- Produces: `foamMaterial`, `splashMaterial` in `materials.ts`.
- Produces: `AmbientLifeLayer({ life: AmbientLife; islands: readonly Shore[]; animate: boolean })`, drawing meshes named `boats`, `gulls`, `whale`, `splash`, `foam`.
- Produces: `WorldContentsProps.life?: AmbientLife` (default `NO_LIFE`) and `WorldSceneProps.life: AmbientLife`.

- [ ] **Step 1: Failing layer test.** Create `apps/web/src/scene/ambient-life.test.tsx`:

```tsx
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { AmbientLifeLayer } from './ambient-life'
import { foamMaterial } from './materials'
import { type AmbientLife, boatPose } from './model/ambient-life'

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

const shore = { origin: { x: 0, z: 0 }, radius: 4 }
const loop = { kind: 'loop' as const, key: 'loop|p0', center: { x: 0, z: 0 }, radius: 11 }
const life: AmbientLife = {
  boats: [
    { route: loop, phase: 0.1 },
    { route: loop, phase: 0.6 },
  ],
  flocks: [{ projectId: 'p0', center: { x: 0, z: 0 }, radius: 4.8, phase: 0.2 }],
  whale: { spot: { x: 30, z: 0 }, turn: 0, interval: 30, phase: 0 },
}

const named = (r: Renderer, name: string) => r.scene.findAll((n) => n.props.name === name)
function matrices(r: Renderer, name: string): number[][] {
  const [node] = named(r, name)
  if (!node) throw new Error(`no ${name}`)
  const mesh = node.instance as THREE.InstancedMesh
  const m = new THREE.Matrix4()
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, m)
    return [...m.elements]
  })
}
const make = (animate: boolean, l: AmbientLife = life) =>
  ReactThreeTestRenderer.create(<AmbientLifeLayer life={l} islands={[shore]} animate={animate} />)

describe('AmbientLifeLayer', () => {
  test('one instanced mesh per kind, sized to the life, none of it tappable', async () => {
    const r = await make(true)
    expect((named(r, 'boats')[0]?.instance as THREE.InstancedMesh).count).toBe(2)
    expect((named(r, 'gulls')[0]?.instance as THREE.InstancedMesh).count).toBe(3)
    for (const name of ['boats', 'gulls', 'whale', 'splash', 'foam']) {
      for (const n of named(r, name)) expect(n.props.onClick).toBeUndefined()
    }
  })

  test('on high, boats and gulls move from frame to frame', async () => {
    const r = await make(true)
    await r.advanceFrames(1, 0.1)
    const boats = matrices(r, 'boats')
    const gulls = matrices(r, 'gulls')
    await r.advanceFrames(2, 0.1)
    expect(matrices(r, 'boats')).not.toEqual(boats)
    expect(matrices(r, 'gulls')).not.toEqual(gulls)
  })

  test('on low, everything holds its t=0 pose; the whale is gone and the foam is still', async () => {
    const r = await make(false)
    const boats = matrices(r, 'boats')
    const gulls = matrices(r, 'gulls')
    await r.advanceFrames(5, 0.1)
    expect(matrices(r, 'boats')).toEqual(boats)
    expect(matrices(r, 'gulls')).toEqual(gulls)
    const first = life.boats[0]
    if (!first) throw new Error('no boat')
    const p = boatPose(first, 0).position
    expect(boats[0]?.[12]).toBeCloseTo(p.x)
    expect(boats[0]?.[14]).toBeCloseTo(p.z)
    expect(named(r, 'whale')).toHaveLength(0)
    expect(named(r, 'splash')).toHaveLength(0)
    expect(named(r, 'foam')).toHaveLength(1)
    expect(foamMaterial.opacity).toBeCloseTo(0.45)
  })

  test('dropping to low mid-voyage snaps back to the t=0 pose and stops', async () => {
    const r = await make(false)
    const still = matrices(r, 'boats')
    await r.update(<AmbientLifeLayer life={life} islands={[shore]} animate />)
    await r.advanceFrames(4, 0.1)
    expect(matrices(r, 'boats')).not.toEqual(still)
    await r.update(<AmbientLifeLayer life={life} islands={[shore]} animate={false} />)
    expect(matrices(r, 'boats')).toEqual(still)
    await r.advanceFrames(4, 0.1)
    expect(matrices(r, 'boats')).toEqual(still)
  })

  test('no life draws only the foam; no islands draw nothing', async () => {
    const none: AmbientLife = { boats: [], flocks: [], whale: null }
    const r = await make(true, none)
    for (const name of ['boats', 'gulls', 'whale']) expect(named(r, name)).toHaveLength(0)
    expect(named(r, 'foam')).toHaveLength(1)
    const empty = await ReactThreeTestRenderer.create(
      <AmbientLifeLayer life={none} islands={[]} animate />,
    )
    expect(empty.scene.findAll((n) => n.props.name === 'foam')).toHaveLength(0)
  })
})
```

Run `cd apps/web && bunx vitest run src/scene/ambient-life.test.tsx` — Expected: FAIL, cannot resolve `./ambient-life` / `foamMaterial`.

- [ ] **Step 2: Materials.** Append to `apps/web/src/scene/materials.ts` (import `FOAM_OPACITY` from `./tuning`):

```ts
/** Foam rings at every shallows edge; their opacity pulses on `high` (spec 17.5). */
export const foamMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: FOAM_OPACITY,
  depthWrite: false,
})
/** The whale's splash ring; it fades as it widens. */
export const splashMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
})
```

- [ ] **Step 3: Implement the layer.** Create `apps/web/src/scene/ambient-life.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { foamMaterial, solidMaterial, splashMaterial } from './materials'
import {
  type AmbientLife,
  boatPose,
  foamOpacity,
  GULLS_PER_FLOCK,
  gullPose,
  type Pose,
  whalePose,
} from './model/ambient-life'
import type { Shore } from './model/sea-depth'
import { foamGeometry, seaGeometry } from './models/sea-props'
import { SEA_LEVEL } from './models/terrain-geometry'
import { clampDelta, FOAM_OPACITY, GULL_HEIGHT } from './tuning'

const matrix = new THREE.Matrix4()

function place(mesh: THREE.InstancedMesh, i: number, pose: Pose, y: number) {
  matrix.makeRotationY(pose.heading).setPosition(pose.position.x, y, pose.position.z)
  mesh.setMatrixAt(i, matrix)
}

/**
 * Boats, gulls, the whale and coastline foam (spec 17.5). With `animate` (the `high` tier with
 * motion allowed) it moves on frames the sea's ticker already draws; otherwise it is posed once at
 * t = 0 and the whale and foam pulse are left out. Nothing here is tappable.
 */
export function AmbientLifeLayer({
  life,
  islands,
  animate,
}: {
  life: AmbientLife
  islands: readonly Shore[]
  animate: boolean
}) {
  const boats = useRef<THREE.InstancedMesh>(null)
  const gulls = useRef<THREE.InstancedMesh>(null)
  const whale = useRef<THREE.Mesh>(null)
  const splash = useRef<THREE.Mesh>(null)
  const time = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  const foam = useMemo(() => (islands.length > 0 ? foamGeometry(islands) : null), [islands])
  useEffect(() => () => foam?.dispose(), [foam])

  const pose = useCallback(
    (t: number) => {
      const b = boats.current
      if (b) {
        life.boats.forEach((boat, i) => place(b, i, boatPose(boat, t), SEA_LEVEL))
        b.instanceMatrix.needsUpdate = true
        b.computeBoundingSphere()
      }
      const g = gulls.current
      if (g) {
        life.flocks.forEach((flock, f) => {
          for (let k = 0; k < GULLS_PER_FLOCK; k++) {
            place(g, f * GULLS_PER_FLOCK + k, gullPose(flock, k, t), GULL_HEIGHT)
          }
        })
        g.instanceMatrix.needsUpdate = true
        g.computeBoundingSphere()
      }
      const w = whale.current
      const s = splash.current
      if (w && s && life.whale) {
        const p = whalePose(life.whale, t)
        w.visible = p.visible
        s.visible = p.visible
        w.position.set(life.whale.spot.x, SEA_LEVEL + p.y, life.whale.spot.z)
        w.rotation.set(0, life.whale.turn, p.pitch)
        s.scale.setScalar(0.5 + p.splash * 1.5)
        splashMaterial.opacity = 0.6 * (1 - p.splash)
      }
    },
    [life],
  )

  // Switching to `low` (or new life) snaps everything to its t = 0 pose.
  useLayoutEffect(() => {
    if (!animate) {
      time.current = 0
      foamMaterial.opacity = FOAM_OPACITY
    }
    pose(time.current)
    invalidate()
  }, [pose, animate, invalidate])

  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta)
    pose(time.current)
    foamMaterial.opacity = foamOpacity(time.current)
  })

  const gullCount = life.flocks.length * GULLS_PER_FLOCK
  return (
    <>
      {foam && <mesh name="foam" geometry={foam} material={foamMaterial} />}
      {life.boats.length > 0 && (
        <instancedMesh
          key={`boats:${life.boats.length}`}
          ref={boats}
          name="boats"
          args={[seaGeometry('boat'), solidMaterial, life.boats.length]}
        />
      )}
      {gullCount > 0 && (
        <instancedMesh
          key={`gulls:${gullCount}`}
          ref={gulls}
          name="gulls"
          args={[seaGeometry('gull'), solidMaterial, gullCount]}
        />
      )}
      {animate && life.whale && (
        <>
          <mesh ref={whale} name="whale" geometry={seaGeometry('whale')} material={solidMaterial} />
          <mesh
            ref={splash}
            name="splash"
            geometry={seaGeometry('splash')}
            material={splashMaterial}
            position={[life.whale.spot.x, SEA_LEVEL + 0.05, life.whale.spot.z]}
          />
        </>
      )}
    </>
  )
}
```

Run the layer test — Expected: PASS. If the "mid-voyage" test fails because the `animate` → `false` layout effect runs before the meshes' refs settle, check that `pose` is called after the refs exist (it is a layout effect in the same component, so the refs are set by then).

- [ ] **Step 4: Wire it into the scene.** In `apps/web/src/scene/world-contents.tsx`:
  - import `AmbientLifeLayer` from `./ambient-life` and `{ type AmbientLife, NO_LIFE }` from `./model/ambient-life`;
  - add to `WorldContentsProps`: `/** Boats, gulls and the whale (spec 17.5); none by default. */ life?: AmbientLife`;
  - destructure `life = NO_LIFE` alongside `onNewProject`;
  - render `<AmbientLifeLayer life={life} islands={model.islands} animate={seaWave} />` after `<SeaScatter … />`.

In `apps/web/src/scene/world-scene.tsx`:
  - import `{ type AmbientLife, hasLife }` from `./model/ambient-life`;
  - add `life: AmbientLife` to `WorldSceneProps`;
  - replace the temporary `life: false` in the `tickerWanted` call with `life: seaWave && hasLife(props.life)`.

- [ ] **Step 5: Failing wiring test.** In `apps/web/src/layout/world-scene-integration.test.tsx` destructure `life` in the `WorldScene` mock and add `data-boats={life.boats.length}` and `data-flocks={life.flocks.length}` to the stub's root `div`. Add:

```ts
  test('recent progress reaches the scene as boats and gulls', async () => {
    const beta = fakeProject({ name: 'Beta' })
    const justNow = new Date().toISOString()
    const tasks = [1, 2, 3, 4].map((i) =>
      fakeTask({ projectId: beta.id, status: 'done', completedAt: justNow, plotX: i, plotY: 0 }),
    )
    const { api } = createFakeApi({ world: { projects: [beta], milestones: [], tasks, buildings: [] } })
    renderApp({ api, path: '/' })
    const scene = await screen.findByTestId('scene')
    expect(scene).toHaveAttribute('data-boats', '2')
    expect(scene).toHaveAttribute('data-flocks', '1')
  })
```

Run `bunx vitest run src/layout/world-scene-integration.test.tsx` — Expected: FAIL (`life` is undefined in the stub).

- [ ] **Step 6: Implement the wiring.** In `apps/web/src/world/world-view.tsx` import `buildAmbientLife` from `../scene/model/ambient-life` and, after `model`:

```ts
  // Built with the scene model, so a refetch (a completion) is what moves the windows on.
  const life = useMemo(() => buildAmbientLife(model, world, Date.now()), [model, world])
```

and pass `life={life}` to `<WorldScene>`.

Run the integration test — Expected: PASS.

- [ ] **Step 7: Run the web suite and typecheck.** `bun run --cwd apps/web test` and `bun run typecheck` from the root — Expected: PASS, no errors.

- [ ] **Step 8: Commit.**

```bash
git add apps/web/src
git commit -m "feat(web): sail boats, circle gulls, breach the whale and pulse coastline foam"
```

---

### Task 7: Gate, device check and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (only if the device check changes a tuned value's meaning)

- [ ] **Step 1: Full gate from the repo root.** `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` — Expected: all green; lint at the one known info. Check the build output: `three` must still be only in the world-scene chunk (`world/vignette.tsx` and `world/uncharted-card.tsx` import only `scene/model/palette`, `scene/tuning` or nothing three).

- [ ] **Step 2: Look at it.** Run the web app (`bun run --cwd apps/web dev`) and check, on desktop and at phone width:
  - empty account: ghost island, "Uncharted waters", the button opens the editor; after creating, the ghost is gone and the island is framed;
  - a world with islands: faceted gradient sea, props scattered clear of shores and lanes, the far edge fading into fog, the vignette;
  - with recent completions: boats on lanes or the loop, gulls over recently active islands; with an active streak, a whale breach every 25–40s;
  - with `prefers-reduced-motion: reduce` (DevTools rendering emulation): everything still, no whale.

- [ ] **Step 3: Owner's `?perf` reading (exit criterion, spec 17.7).** Ask the owner to open the app with `?perf` on their phone and pan the busiest island for 10s on `high`. Pass: draw calls at most 12 above the 5b baseline, and no drop to `low` caused by 5c. Record the readings in the task notes; tuning changes go in `scene/tuning.ts` as a follow-up commit (`fix(web): tune sea dressing from the device reading`).

- [ ] **Step 4: Commit any doc touch-ups.**

```bash
git add docs
git commit -m "docs: note the Phase 5c device reading"
```
