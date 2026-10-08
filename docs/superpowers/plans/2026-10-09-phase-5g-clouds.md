# Phase 5g Cloud Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft low-poly clouds gather in a band just outside the current island or district and part when you leave for the archipelago, as the layer's main edge cue.

**Architecture:** Two pure modules decide everything: `scene/model/clouds.ts` (which area gets a ring, and where its puffs sit) and `scene/model/cloud-motion.ts` (how puffs gather, part, sway and bob, frame by frame). A thin `CloudLayer` component in the scene owns one instanced mesh, swaps rings on a layer change, holds a `clouds` ticker demand while a ring gathers or parts, and drifts the puffs on the `high` tier.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5, `@react-three/test-renderer` 9.1.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 21 (Phase 5g), with section 20 for the layer area and the haze it builds on.

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk; `scene/model/*` and `scene/tuning.ts` are three-free.
- Every scene colour comes from `scenePalette` (A'raf tokens or `mix` of them).
- No API or DTO change. At most one new draw call.
- Values, verbatim: `CLOUD_BAND = 2 * Math.sqrt(3)`, `CLOUD_DENSITY = 1`, `CLOUD_MAX = 120`, `CLOUD_DISTRICT_RING: 'district' | 'coast' = 'district'`, `CLOUD_HEIGHT = 3`, `CLOUD_MS = 600`, `CLOUD_TRAVEL = 1.5 * Math.sqrt(3)`, `CLOUD_SWAY = 0.3`, `CLOUD_SWAY_S = 20`, `CLOUD_BOB = 0.08`, `CLOUD_BOB_S = 6`; palette `cloud = mix(colors.surfacePrimary, colors.brandSecondary, 0.15)`.
- The cloud material is not spotlight-patched. The haze stays at `SPOTLIGHT_HAZE` 0.2.
- Commit messages: conventional (`feat(web): …`, `test(web): …`, `docs: …`), no AI attribution, no `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. Changing layer again while a ring is still gathering must part the half-grown puffs from the size they had reached, not pop them to full size first. Pinned in Task 2 (`nextLeg` from a mid-leg state).
2. A refetch that leaves the cloud area unchanged (a task finished on another island) must not restart the gather or hold the ticker. Pinned in Task 3.
3. A very large island must thin its puffs evenly at `CLOUD_MAX`, never exceed the mesh's capacity, even when two capped rings overlap during a switch. Pinned in Tasks 1 and 2.
4. Turning reduced motion on mid-gather, or unmounting the scene mid-gather, must finish the ring at once and release the ticker demand. Pinned in Task 3.
5. When a gather ends and the drift begins, puffs must not jump: the sway and bob are zero at their start. Pinned in Task 2.

---

### Task 1: Where the clouds go (pure)

**Files:**
- Create: `apps/web/src/scene/model/clouds.ts`, `apps/web/src/scene/model/clouds.test.ts`, `apps/web/src/scene/model/clouds-coast.test.ts`
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/palette.ts`, `apps/web/src/scene/model/foundations.test.ts`

**Interfaces:**
- Consumes: `Area`, `areaDistance` (`scene/model/area.ts`); `AREA_MARGIN`, `layerArea` (`scene/model/camera.ts`); `SHALLOWS_MARGIN` (`scene/model/hex-space.ts`); `hashInts`, `mulberry32` (`scene/model/random.ts`).
- Produces: the `CLOUD_*` tuning constants; `scenePalette.cloud`; `type CloudArea = { area: Area; inset: number; seed: number }`; `type CloudPuff = { x: number; z: number; nx: number; nz: number; scale: number; turn: number; phase: number }`; `cloudArea(model, focus): CloudArea | null`; `cloudRing(c: CloudArea): CloudPuff[]`; `ringLength(c: CloudArea): number`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/clouds.test.ts`:

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_BAND, CLOUD_DENSITY, CLOUD_MAX } from '../tuning'
import { type Area, areaDistance } from './area'
import { AREA_MARGIN, layerArea } from './camera'
import { cloudArea, cloudRing, ringLength } from './clouds'
import { SHALLOWS_MARGIN } from './hex-space'
import { hashInts } from './random'
import { buildSceneModel } from './scene-model'

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
const island = model.islands[0]
if (!island) throw new Error('no island')
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }

describe('cloudArea', () => {
  test('no clouds on the archipelago, or for an unknown island', () => {
    expect(cloudArea(model, { kind: 'archipelago' })).toBeNull()
    expect(cloudArea(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('an island rings its shallows, seeded by the island', () => {
    expect(cloudArea(model, onBeta)).toEqual({
      area: layerArea(model, onBeta),
      inset: SHALLOWS_MARGIN,
      seed: island.seed,
    })
  })

  test('a district rings its own area by default, seeded by its order on the island', () => {
    const index = island.districts.findIndex((d) => d.milestoneId === mvp.id)
    expect(cloudArea(model, onMvp)).toEqual({
      area: layerArea(model, onMvp),
      inset: AREA_MARGIN,
      seed: hashInts(island.seed, index + 1),
    })
  })

  test('an unknown milestone falls back to the island ring', () => {
    expect(
      cloudArea(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toEqual(cloudArea(model, onBeta))
  })
})

describe('cloudRing', () => {
  const c = cloudArea(model, onBeta)
  if (!c) throw new Error('no island ring')

  test('every puff sits in the band outside the area, inside its own middle 80%', () => {
    const ring = cloudRing(c)
    expect(ring.length).toBeGreaterThan(0)
    for (const p of ring) {
      const d = areaDistance(c.area, p)
      expect(d).toBeGreaterThanOrEqual(c.inset + 0.1 * CLOUD_BAND - 1e-9)
      expect(d).toBeLessThanOrEqual(c.inset + 0.9 * CLOUD_BAND + 1e-9)
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1)
      expect(p.scale).toBeGreaterThanOrEqual(0.8)
      expect(p.scale).toBeLessThanOrEqual(1.4)
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThan(1)
    }
  })

  test('the same area and seed give the same ring; another seed does not', () => {
    expect(cloudRing({ ...c })).toEqual(cloudRing(c))
    expect(cloudRing({ ...c, seed: c.seed + 1 })).not.toEqual(cloudRing(c))
  })

  test('the count is the band middle’s length times CLOUD_DENSITY', () => {
    const a = c.area
    const r = (a.round ?? 0) + c.inset + CLOUD_BAND / 2
    const length = 2 * (a.maxX - a.minX + (a.maxZ - a.minZ)) + 2 * Math.PI * r
    expect(ringLength(c)).toBeCloseTo(length)
    expect(cloudRing(c)).toHaveLength(Math.min(CLOUD_MAX, Math.round(length * CLOUD_DENSITY)))
  })

  test('a huge area caps at CLOUD_MAX, spread evenly round the whole ring', () => {
    const huge: Area = { minX: -200, maxX: 200, minZ: -200, maxZ: 200, round: 5 }
    const ring = cloudRing({ area: huge, inset: 1, seed: 7 })
    expect(ring).toHaveLength(CLOUD_MAX)
    // Each side of the square gets about a quarter of the puffs.
    const east = ring.filter((p) => p.x > 200).length
    expect(east).toBeGreaterThan(CLOUD_MAX * 0.2)
    expect(east).toBeLessThan(CLOUD_MAX * 0.3)
  })

  test('a point area with no round still makes a ring', () => {
    const ring = cloudRing({ area: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, inset: 1, seed: 3 })
    expect(ring.length).toBeGreaterThan(0)
  })
})
```

Create `apps/web/src/scene/model/clouds-coast.test.ts`:

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import { cloudArea } from './clouds'
import { buildSceneModel } from './scene-model'

vi.mock('../tuning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tuning')>()),
  CLOUD_DISTRICT_RING: 'coast',
}))

describe("CLOUD_DISTRICT_RING = 'coast'", () => {
  test('a district keeps its island’s ring', () => {
    const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
    const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
    const world: WorldDto = {
      projects: [beta],
      milestones: [mvp],
      tasks: [],
      buildings: [],
      economy: quietEconomy,
    }
    const model = buildSceneModel(world, '2026-10-09')
    expect(
      cloudArea(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id }),
    ).toEqual(cloudArea(model, { kind: 'island', projectId: beta.id }))
  })
})
```

In `apps/web/src/scene/model/foundations.test.ts`, test `'scene colours are tokens or blends of tokens'`, add:

```ts
    expect(scenePalette.cloud).toBe(mix(colors.surfacePrimary, colors.brandSecondary, 0.15))
```

Run: `cd apps/web && bunx vitest run src/scene/model/clouds.test.ts src/scene/model/clouds-coast.test.ts src/scene/model/foundations.test.ts` — Expected: FAIL (missing module, missing palette key).

- [ ] **Step 2: Tuning and palette.** Append to `apps/web/src/scene/tuning.ts`:

```ts
// Cloud ring (spec 21): soft clouds just outside the current island or district.
/** How deep the band of clouds is, in world units: two hexes. */
export const CLOUD_BAND = 2 * Math.sqrt(3)
/** Puffs per world unit of the band's length: 1 is a closed band, about 0.4 scattered puffs. */
export const CLOUD_DENSITY = 1
/** Most puffs in one ring; past it the ring thins evenly. */
export const CLOUD_MAX = 120
/** In a district: ring the district itself, or keep the island's coastal ring. */
export const CLOUD_DISTRICT_RING: 'district' | 'coast' = 'district'
/** How high puffs float, above the tallest landmark. */
export const CLOUD_HEIGHT = 3
/** A ring gathering or parting, in ms. */
export const CLOUD_MS = 600
/** How far puffs glide in when gathering, or out when parting: one and a half hexes. */
export const CLOUD_TRAVEL = 1.5 * Math.sqrt(3)
/** Resting sway along the ring (world units) and its period (s), `high` tier only. */
export const CLOUD_SWAY = 0.3
export const CLOUD_SWAY_S = 20
/** Resting bob (world units) and its period (s), `high` tier only. */
export const CLOUD_BOB = 0.08
export const CLOUD_BOB_S = 6
```

In `apps/web/src/scene/model/palette.ts`, add to `scenePalette` (after `foam`):

```ts
  cloud: mix(colors.surfacePrimary, colors.brandSecondary, 0.15),
```

- [ ] **Step 3: Implement.** Create `apps/web/src/scene/model/clouds.ts`:

```ts
import type { Focus } from '../../world/selectors'
import { CLOUD_BAND, CLOUD_DENSITY, CLOUD_DISTRICT_RING, CLOUD_MAX } from '../tuning'
import type { Area } from './area'
import { AREA_MARGIN, layerArea } from './camera'
import { SHALLOWS_MARGIN } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { SceneModel } from './scene-model'

/** The area a ring surrounds, how far outside it the band starts, and the ring's seed (spec 21.1). */
export type CloudArea = { area: Area; inset: number; seed: number }

/** One puff on the ground it appears over, with its outward direction (unit) from the ring. */
export type CloudPuff = {
  x: number
  z: number
  nx: number
  nz: number
  scale: number
  turn: number
  /** 0–1: staggers its gather and part, and offsets its sway and bob. */
  phase: number
}

const CLOUD_SALT = 7919

/** Which ring the current layer gets: none on the archipelago (spec 21.1). */
export function cloudArea(model: SceneModel, focus: Focus): CloudArea | null {
  if (focus.kind === 'archipelago') return null
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return null
  const islandFocus: Focus = { kind: 'island', projectId: island.projectId }
  const islandArea = layerArea(model, islandFocus)
  const coast = islandArea ? { area: islandArea, inset: SHALLOWS_MARGIN, seed: island.seed } : null
  if (focus.kind === 'island' || CLOUD_DISTRICT_RING === 'coast') return coast
  const index = island.districts.findIndex((d) => d.milestoneId === focus.milestoneId)
  const area = layerArea(model, focus)
  if (index < 0 || !area) return coast
  return { area, inset: AREA_MARGIN, seed: hashInts(island.seed, index + 1) }
}

type Spot = { x: number; z: number; nx: number; nz: number }
type Segment = { length: number; at: (t: number) => Spot }

/** The band's middle line: the area grown by `r`, as four sides and four quarter circles. */
function ringPath(a: Area, r: number): Segment[] {
  const w = a.maxX - a.minX
  const h = a.maxZ - a.minZ
  const side = (x: number, z: number, dx: number, dz: number, length: number): Segment => ({
    length,
    at: (t) => ({ x: x + dx * t * length, z: z + dz * t * length, nx: dz, nz: -dx }),
  })
  const corner = (cx: number, cz: number, from: number): Segment => ({
    length: (Math.PI / 2) * r,
    at: (t) => {
      const angle = from + (t * Math.PI) / 2
      const nx = Math.cos(angle)
      const nz = Math.sin(angle)
      return { x: cx + nx * r, z: cz + nz * r, nx, nz }
    },
  })
  return [
    side(a.minX, a.minZ - r, 1, 0, w),
    corner(a.maxX, a.minZ, -Math.PI / 2),
    side(a.maxX + r, a.minZ, 0, 1, h),
    corner(a.maxX, a.maxZ, 0),
    side(a.maxX, a.maxZ + r, -1, 0, w),
    corner(a.minX, a.maxZ, Math.PI / 2),
    side(a.minX - r, a.maxZ, 0, -1, h),
    corner(a.minX, a.minZ, Math.PI),
  ]
}

function pointAt(path: readonly Segment[], s: number): Spot {
  let rest = s
  for (const [i, seg] of path.entries()) {
    if (rest <= seg.length || i === path.length - 1) {
      return seg.at(seg.length === 0 ? 0 : Math.min(1, rest / seg.length))
    }
    rest -= seg.length
  }
  throw new Error('cloudRing: empty path')
}

const middleRadius = (c: CloudArea) => (c.area.round ?? 0) + c.inset + CLOUD_BAND / 2

/** The length of the band's middle line, in world units. */
export function ringLength(c: CloudArea): number {
  return ringPath(c.area, middleRadius(c)).reduce((sum, seg) => sum + seg.length, 0)
}

/** The puffs of one ring: spread evenly along the band, jittered by a seeded hash (spec 21.1). */
export function cloudRing(c: CloudArea): CloudPuff[] {
  const path = ringPath(c.area, middleRadius(c))
  const total = path.reduce((sum, seg) => sum + seg.length, 0)
  const count = Math.min(CLOUD_MAX, Math.round(total * CLOUD_DENSITY))
  return Array.from({ length: count }, (_, i): CloudPuff => {
    const random = mulberry32(hashInts(c.seed, i, CLOUD_SALT))
    const p = pointAt(path, ((i + random()) / count) * total)
    const across = (random() - 0.5) * CLOUD_BAND * 0.8
    return {
      x: p.x + p.nx * across,
      z: p.z + p.nz * across,
      nx: p.nx,
      nz: p.nz,
      scale: 0.8 + random() * 0.6,
      turn: random() * Math.PI * 2,
      phase: random(),
    }
  })
}
```

Check the side normals: `side` returns `nx: dz, nz: -dx`, the outward normal for a counter-clockwise walk (x→ along the −z side gives (0, −1); z→ along the +x side gives (1, 0)). The band test (every puff's `areaDistance` within the band) fails if a normal points inward.

- [ ] **Step 4: Run.** `cd apps/web && bunx vitest run src/scene/model` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/scene/tuning.ts apps/web/src/scene/model
git commit -m "feat(web): place a ring of cloud puffs round the current island or district"
```

---

### Task 2: How the clouds move (pure)

**Files:**
- Create: `apps/web/src/scene/model/cloud-motion.ts`, `apps/web/src/scene/model/cloud-motion.test.ts`

**Interfaces:**
- Consumes: `CloudPuff` (Task 1); `easeOutCubic` (`scene/model/camera-motion.ts`); `CLOUD_*` tuning (Task 1).
- Produces: `type CloudFrame = { x: number; y: number; z: number; scale: number; turn: number }`; `type Leaving = { puff: CloudPuff; from: number }`; `type CloudLeg = { leaving: Leaving[]; arriving: CloudPuff[]; elapsed: number }`; `puffProgress(puff, elapsed): number`; `legFrames(leg): CloudFrame[]`; `legDone(leg): boolean`; `stillFrames(ring): CloudFrame[]`; `restFrames(ring, time): CloudFrame[]`; `nextLeg(current, shown, next, capacity): CloudLeg`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/cloud-motion.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { CLOUD_BOB, CLOUD_HEIGHT, CLOUD_MS, CLOUD_SWAY, CLOUD_TRAVEL } from '../tuning'
import {
  type CloudLeg,
  legDone,
  legFrames,
  nextLeg,
  puffProgress,
  restFrames,
  stillFrames,
} from './cloud-motion'
import type { CloudPuff } from './clouds'

const puff = (over: Partial<CloudPuff> = {}): CloudPuff => ({
  x: 10,
  z: 0,
  nx: 1,
  nz: 0,
  scale: 1.2,
  turn: 0.5,
  phase: 0,
  ...over,
})
const a = puff()
const b = puff({ x: 0, z: 10, nx: 0, nz: 1, phase: 1 })

/** The isometric camera looks down (1, 1, 1): a point at height y shows over ground (x − y, z − y). */
const ground = (f: { x: number; y: number; z: number }, lift = 0) => ({
  x: f.x - (f.y - lift),
  z: f.z - (f.y - lift),
})

describe('cloud motion', () => {
  test('each puff runs its own staggered window inside CLOUD_MS', () => {
    expect(puffProgress(a, 0)).toBe(0)
    expect(puffProgress(a, CLOUD_MS * 0.75)).toBe(1)
    expect(puffProgress(b, CLOUD_MS * 0.25)).toBe(0)
    expect(puffProgress(b, CLOUD_MS * 0.5)).toBeGreaterThan(0)
    expect(puffProgress(b, CLOUD_MS)).toBe(1)
  })

  test('a still puff floats CLOUD_HEIGHT up, drawn over its own ground point', () => {
    const [f] = stillFrames([a])
    expect(f?.y).toBe(CLOUD_HEIGHT)
    expect(f && ground(f)).toEqual({ x: a.x, z: a.z })
    expect(f?.scale).toBe(a.scale)
    expect(f?.turn).toBe(a.turn)
  })

  test('gathering grows from nothing while gliding in from CLOUD_TRAVEL out', () => {
    const leg: CloudLeg = { leaving: [], arriving: [a], elapsed: 0 }
    const [start] = legFrames(leg)
    expect(start?.scale).toBe(0)
    expect(start && ground(start).x).toBeCloseTo(a.x + CLOUD_TRAVEL)
    const [end] = legFrames({ ...leg, elapsed: CLOUD_MS })
    expect(end).toEqual(stillFrames([a])[0])
    expect(legDone({ ...leg, elapsed: CLOUD_MS })).toBe(true)
    expect(legDone({ ...leg, elapsed: CLOUD_MS - 1 })).toBe(false)
  })

  test('parting shrinks from its share and drifts out; a finished part draws nothing', () => {
    const leg: CloudLeg = { leaving: [{ puff: a, from: 1 }], arriving: [], elapsed: 0 }
    expect(legFrames(leg)).toEqual(stillFrames([a]))
    const mid = legFrames({ ...leg, elapsed: CLOUD_MS * 0.3 })[0]
    expect(mid?.scale).toBeLessThan(a.scale)
    expect(mid && ground(mid).x).toBeGreaterThan(a.x)
    expect(legFrames({ ...leg, elapsed: CLOUD_MS })).toEqual([])
  })

  test('from rest, the whole shown ring parts at full size while the next gathers', () => {
    const leg = nextLeg(null, [a], [b], 10)
    expect(leg).toEqual({ leaving: [{ puff: a, from: 1 }], arriving: [b], elapsed: 0 })
  })

  test('interrupted mid-gather, half-grown puffs part from the size they reached', () => {
    const current: CloudLeg = { leaving: [], arriving: [a], elapsed: CLOUD_MS * 0.3 }
    const reached = puffProgress(a, current.elapsed)
    const leg = nextLeg(current, [a], [b], 10)
    expect(leg.leaving).toEqual([{ puff: a, from: reached }])
    // No pop: the first frame of the new leg draws `a` exactly as the old leg's last frame did.
    expect(legFrames(leg)[0]).toEqual(legFrames(current)[0])
  })

  test('the next leg fits the capacity: arriving first, then the largest leaving shares', () => {
    const many = Array.from({ length: 6 }, (_, i) => puff({ x: i }))
    const leg = nextLeg(null, many, [b, b], 5)
    expect(leg.arriving).toHaveLength(2)
    expect(leg.leaving).toHaveLength(3)
    const fading: CloudLeg = {
      leaving: [{ puff: a, from: 0.01 }],
      arriving: [],
      elapsed: 0,
    }
    expect(nextLeg(fading, [], [b], 5).leaving).toEqual([])
  })

  test('at rest the drift starts from still and stays within its sway and bob', () => {
    expect(restFrames([a, b], 0)).toEqual(stillFrames([a, b]))
    for (const t of [1, 5, 13, 40]) {
      const [f] = restFrames([a], t)
      if (!f) throw new Error('no frame')
      const bob = f.y - CLOUD_HEIGHT
      expect(Math.abs(bob)).toBeLessThanOrEqual(2 * CLOUD_BOB + 1e-9)
      const g = ground(f, bob)
      // `a` faces +x, so its sway runs along z.
      expect(g.x).toBeCloseTo(a.x)
      expect(Math.abs(g.z - a.z)).toBeLessThanOrEqual(2 * CLOUD_SWAY + 1e-9)
    }
    expect(restFrames([a], 5)).not.toEqual(stillFrames([a]))
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-motion.test.ts` — Expected: FAIL (missing module).

- [ ] **Step 2: Implement.** Create `apps/web/src/scene/model/cloud-motion.ts`:

```ts
import {
  CLOUD_BOB,
  CLOUD_BOB_S,
  CLOUD_HEIGHT,
  CLOUD_MS,
  CLOUD_SWAY,
  CLOUD_SWAY_S,
  CLOUD_TRAVEL,
} from '../tuning'
import { easeOutCubic } from './camera-motion'
import type { CloudPuff } from './clouds'

/** One puff as drawn: position (world), size and turn. */
export type CloudFrame = { x: number; y: number; z: number; scale: number; turn: number }
/** A puff on its way out, from the share of its size it had when its ring was replaced. */
export type Leaving = { puff: CloudPuff; from: number }
/** A ring change: the old puffs parting while the new ones gather (spec 21.3). */
export type CloudLeg = { leaving: Leaving[]; arriving: CloudPuff[]; elapsed: number }

/** Each puff starts up to this share of CLOUD_MS late, by its phase. */
const STAGGER = 0.25
/** Leaving puffs smaller than this share are dropped from the next leg. */
const MIN_SHARE = 0.05
const TAU = Math.PI * 2

/** How far through its own staggered window a puff is, `elapsed` ms into a leg, eased (0–1). */
export function puffProgress(puff: CloudPuff, elapsed: number): number {
  const start = puff.phase * STAGGER * CLOUD_MS
  const t = (elapsed - start) / ((1 - STAGGER) * CLOUD_MS)
  return easeOutCubic(Math.min(1, Math.max(0, t)))
}

/**
 * A puff at `share` of its size, pushed `out` along its outward direction and `along` the ring,
 * lifted by `bob`. Drawn at (x + h, h, z + h): the isometric camera looks down (1, 1, 1), so that
 * shows over the ground point (x, z) (spec 21.2).
 */
function frame(p: CloudPuff, share: number, out: number, along = 0, bob = 0): CloudFrame {
  const x = p.x + p.nx * out - p.nz * along
  const z = p.z + p.nz * out + p.nx * along
  return {
    x: x + CLOUD_HEIGHT,
    y: CLOUD_HEIGHT + bob,
    z: z + CLOUD_HEIGHT,
    scale: p.scale * share,
    turn: p.turn,
  }
}

export function legFrames(leg: CloudLeg): CloudFrame[] {
  const frames: CloudFrame[] = []
  for (const { puff, from } of leg.leaving) {
    const share = from * (1 - puffProgress(puff, leg.elapsed))
    if (share > 0) frames.push(frame(puff, share, CLOUD_TRAVEL * (1 - share)))
  }
  for (const puff of leg.arriving) {
    const e = puffProgress(puff, leg.elapsed)
    frames.push(frame(puff, e, CLOUD_TRAVEL * (1 - e)))
  }
  return frames
}

export function legDone(leg: CloudLeg): boolean {
  return leg.elapsed >= CLOUD_MS
}

export function stillFrames(ring: readonly CloudPuff[]): CloudFrame[] {
  return ring.map((p) => frame(p, 1, 0))
}

/** Resting drift, `time` s after it began: a slow sway along the ring and a bob, both 0 at 0. */
export function restFrames(ring: readonly CloudPuff[], time: number): CloudFrame[] {
  const wave = (period: number, phase: number) =>
    Math.sin(TAU * (time / period + phase)) - Math.sin(TAU * phase)
  return ring.map((p) =>
    frame(p, 1, 0, CLOUD_SWAY * wave(CLOUD_SWAY_S, p.phase), CLOUD_BOB * wave(CLOUD_BOB_S, p.phase)),
  )
}

/**
 * The leg that replaces what is on screen with the `next` ring: from rest, the `shown` ring parts
 * at full size; mid-leg, every visible puff parts from the share it has reached. Fits `capacity`,
 * keeping every arriving puff and the largest leaving ones.
 */
export function nextLeg(
  current: CloudLeg | null,
  shown: readonly CloudPuff[],
  next: readonly CloudPuff[],
  capacity: number,
): CloudLeg {
  const visible: Leaving[] = current
    ? [
        ...current.leaving.map((l) => ({
          puff: l.puff,
          from: l.from * (1 - puffProgress(l.puff, current.elapsed)),
        })),
        ...current.arriving.map((p) => ({ puff: p, from: puffProgress(p, current.elapsed) })),
      ]
    : shown.map((p) => ({ puff: p, from: 1 }))
  const room = Math.max(0, capacity - next.length)
  const leaving = visible
    .filter((l) => l.from > MIN_SHARE)
    .sort((x, y) => y.from - x.from)
    .slice(0, room)
  return { leaving, arriving: [...next], elapsed: 0 }
}
```

Note on the "no pop" test: the new leg's leaving entry for `a` has `from = reached` and `elapsed = 0`, so its first frame draws `share = reached`, `out = CLOUD_TRAVEL × (1 − reached)`, which is what the old leg drew for the arriving `a` at `e = reached`. The sort is stable for equal shares, so from rest the shown order is kept.

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene/model/cloud-motion.test.ts` — Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene/model/cloud-motion.ts apps/web/src/scene/model/cloud-motion.test.ts
git commit -m "feat(web): model clouds gathering, parting and drifting"
```

---

### Task 3: Draw the cloud ring

**Files:**
- Create: `apps/web/src/scene/models/cloud.ts`, `apps/web/src/scene/clouds.tsx`, `apps/web/src/scene/clouds.test.tsx`
- Modify: `apps/web/src/scene/materials.ts`, `apps/web/src/scene/spotlight-material.test.ts`, `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`, `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Consumes: `cloudArea`, `cloudRing`, `CloudPuff` (Task 1); `CloudLeg`, `CloudFrame`, `legFrames`, `legDone`, `nextLeg`, `stillFrames`, `restFrames` (Task 2); `areaKey` (`scene/model/spotlight.ts`); `part`, `merge` (`scene/models/build.ts`); `clampDelta`, `CLOUD_MAX` (`scene/tuning.ts`).
- Produces: `cloudGeometry()`; `cloudMaterial`; `CloudLayer({ model, focus, animate, drifting, onRunning })`; `TickerDemand.clouds: boolean`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/clouds.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { CloudLayer } from './clouds'
import { stillFrames } from './model/cloud-motion'
import { cloudArea, cloudRing } from './model/clouds'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { CLOUD_MAX, CLOUD_MS } from './tuning'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [],
  tasks: [],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const archipelago: Focus = { kind: 'archipelago' }
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onGamma: Focus = { kind: 'island', projectId: gamma.id }
const ringOf = (focus: Focus) => {
  const c = cloudArea(model, focus)
  return c ? cloudRing(c) : []
}

type Props = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  drifting?: boolean
  onRunning?: (running: boolean) => void
}
const tree = ({ model: m, focus, animate = true, drifting = false, onRunning }: Props) => (
  <CloudLayer model={m} focus={focus} animate={animate} drifting={drifting} onRunning={onRunning} />
)
type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
const mesh = (r: Renderer) => {
  const [node] = r.scene.findAll((n) => n.props.name === 'clouds')
  if (!node) throw new Error('no clouds mesh')
  return node.instance as THREE.InstancedMesh
}
const positionAt = (m: THREE.InstancedMesh, i: number) => {
  const matrix = new THREE.Matrix4()
  m.getMatrixAt(i, matrix)
  return new THREE.Vector3().setFromMatrixPosition(matrix)
}
const frames = Math.ceil(CLOUD_MS / 100) + 1

describe('CloudLayer', () => {
  test('one instanced mesh that ignores taps, empty on the archipelago', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    const m = mesh(r)
    expect(m.count).toBe(0)
    expect(m.instanceMatrix.count).toBe(CLOUD_MAX * 2)
    const hits: THREE.Intersection[] = []
    m.raycast(new THREE.Raycaster(), hits)
    expect(hits).toEqual([])
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('entering an island gathers its ring, holding the ticker only while it runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    const ring = ringOf(onBeta)
    expect(mesh(r).count).toBe(ring.length)
    await r.advanceFrames(frames, 0.1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
    const [first] = stillFrames(ring)
    const at = positionAt(mesh(r), 0)
    expect(at.x).toBeCloseTo(first?.x ?? Number.NaN)
    expect(at.y).toBeCloseTo(first?.y ?? Number.NaN)
    expect(at.z).toBeCloseTo(first?.z ?? Number.NaN)
  })

  test('island to island: the old ring parts while the new one gathers, then only the new', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    expect(mesh(r).count).toBe(ringOf(onBeta).length + ringOf(onGamma).length)
    await r.advanceFrames(frames, 0.1)
    expect(mesh(r).count).toBe(ringOf(onGamma).length)
  })

  test('back to the archipelago the ring parts away to nothing', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames, 0.1)
    expect(mesh(r).count).toBe(0)
  })

  test('a refetch with the same cloud area neither restarts the gather nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, animate: false, onRunning }),
    )
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(onRunning).not.toHaveBeenCalledWith(true)
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
  })

  test('reduced motion swaps rings at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('turning reduced motion on mid-gather finishes at once and releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
  })

  test('unmounting mid-gather releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('at rest the puffs drift on the high tier and stay still otherwise', async () => {
    const still = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, drifting: false }),
    )
    await still.advanceFrames(frames, 0.1)
    const before = positionAt(mesh(still), 0)
    await still.advanceFrames(20, 0.5)
    expect(positionAt(mesh(still), 0).equals(before)).toBe(true)
    await still.unmount()

    const drifting = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, drifting: true }),
    )
    await drifting.advanceFrames(frames, 0.1)
    const rest = positionAt(mesh(drifting), 0)
    await drifting.advanceFrames(20, 0.5)
    expect(positionAt(mesh(drifting), 0).equals(rest)).toBe(false)
  })
})
```

In `apps/web/src/scene/spotlight-material.test.ts`, import `cloudMaterial` from `./materials` and add:

```ts
  test('the cloud material is not hazed (spec 21.2)', () => {
    expect(cloudMaterial.onBeforeCompile).not.toBe(patchSpotlight)
  })
```

In `apps/web/src/scene/ticker.test.ts`, add `clouds: false` to every `TickerDemand` literal (`clouds: true` where the reduced-motion literal sets every flag true) and add `'clouds'` to the per-key loop.

Run: `cd apps/web && bunx vitest run src/scene/clouds.test.tsx src/scene/spotlight-material.test.ts src/scene/ticker.test.ts` — Expected: FAIL (missing module, missing export, missing field).

- [ ] **Step 2: Geometry and material.** Create `apps/web/src/scene/models/cloud.ts`:

```ts
import * as THREE from 'three'
import { merge, part } from './build'

let cached: THREE.BufferGeometry | null = null

/** One puff: four flat-shaded blobs, base near y=0, about 1.6 wide (spec 21.2). Shared, never disposed. */
export function cloudGeometry(): THREE.BufferGeometry {
  cached ??= merge([
    part(new THREE.IcosahedronGeometry(0.55, 0), 'cloud', [0, 0.45, 0]),
    part(new THREE.IcosahedronGeometry(0.4, 0), 'cloud', [0.5, 0.3, 0.1]),
    part(new THREE.IcosahedronGeometry(0.38, 0), 'cloud', [-0.45, 0.3, -0.1]),
    part(new THREE.IcosahedronGeometry(0.3, 0), 'cloud', [0.1, 0.25, 0.45]),
  ])
  return cached
}
```

In `apps/web/src/scene/materials.ts`, add (not wrapped in `withSpotlight`):

```ts
/** Clouds sit outside the layer by design: not spotlight-patched, so they never haze (spec 21.2). */
export const cloudMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
})
```

In `apps/web/src/scene/ticker.ts`, add to `TickerDemand`:

```ts
  /** A cloud ring is gathering or parting (spec 21.3). */
  clouds: boolean
```

and `|| d.clouds` inside `tickerWanted`.

- [ ] **Step 3: The layer.** Create `apps/web/src/scene/clouds.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Focus } from '../world/selectors'
import { cloudMaterial } from './materials'
import {
  type CloudFrame,
  type CloudLeg,
  legDone,
  legFrames,
  nextLeg,
  restFrames,
  stillFrames,
} from './model/cloud-motion'
import { type CloudPuff, cloudArea, cloudRing } from './model/clouds'
import type { SceneModel } from './model/scene-model'
import { areaKey } from './model/spotlight'
import { cloudGeometry } from './models/cloud'
import { CLOUD_MAX, clampDelta } from './tuning'

/** Two capped rings share the mesh during a switch. */
const CAPACITY = CLOUD_MAX * 2
const matrix = new THREE.Matrix4()
const at = new THREE.Vector3()
const size = new THREE.Vector3()
const turn = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
const noRaycast = () => {}

/** The cloud ring round the current island or district (spec 21); one draw call. */
export function CloudLayer({
  model,
  focus,
  animate,
  drifting,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  /** False under reduced motion: rings swap at once and never drift. */
  animate: boolean
  /** The `high` tier: resting puffs sway and bob. */
  drifting: boolean
  /** A gather or part started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const area = cloudArea(model, focus)
  const key = area ? `${areaKey(area.area)}#${area.inset}#${area.seed}` : 'none'
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the cloud area's value
  const ring = useMemo(() => (area ? cloudRing(area) : []), [key])
  const mesh = useRef<THREE.InstancedMesh>(null)
  // null until the first layout effect: a first mount shows its ring at once, like the camera.
  const shown = useRef<CloudPuff[] | null>(null)
  const leg = useRef<(CloudLeg & { fresh: boolean }) | null>(null)
  const time = useRef(0)
  const report = useRef(onRunning)
  report.current = onRunning

  const write = useCallback((frames: readonly CloudFrame[]) => {
    const m = mesh.current
    if (!m) return
    frames.forEach((f, i) => {
      at.set(f.x, f.y, f.z)
      turn.setFromAxisAngle(UP, f.turn)
      size.setScalar(f.scale)
      m.setMatrixAt(i, matrix.compose(at, turn, size))
    })
    m.count = frames.length
    m.instanceMatrix.needsUpdate = true
  }, [])

  useLayoutEffect(() => {
    const running = leg.current !== null
    time.current = 0
    if (shown.current === null || !animate) {
      // First mount, or reduced motion: show the ring as it is (empty on the archipelago).
      leg.current = null
      shown.current = ring
      write(stillFrames(ring))
      if (running) report.current?.(false)
      invalidate()
      return
    }
    // Reduced motion turned off with nothing to change, or a refetch with the same cloud area.
    if (!running && shown.current === ring) return
    leg.current = { ...nextLeg(leg.current, shown.current, ring, CAPACITY), fresh: true }
    shown.current = ring
    write(legFrames(leg.current))
    if (!running) report.current?.(true)
    invalidate()
  }, [ring, animate, write, invalidate])

  useEffect(
    () => () => {
      if (leg.current) report.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const step = clampDelta(delta)
    const l = leg.current
    if (l) {
      if (!l.fresh) l.elapsed += step * 1000
      l.fresh = false
      write(legFrames(l))
      if (!legDone(l)) {
        invalidate()
        return
      }
      leg.current = null
      time.current = 0
      report.current?.(false)
      return
    }
    const resting = shown.current ?? []
    if (!drifting || !animate || resting.length === 0) return
    time.current += step
    write(restFrames(resting, time.current))
  })

  return (
    <instancedMesh
      ref={mesh}
      name="clouds"
      args={[cloudGeometry(), cloudMaterial, CAPACITY]}
      raycast={noRaycast}
      // The puffs spread far from the mesh's origin; its default bounds would cull them.
      frustumCulled={false}
    />
  )
}
```

Notes:
- The mesh is built with `CAPACITY` identity instances; the first layout effect always writes, so the archipelago starts at `count` 0 and an island starts with its ring drawn still.
- A refetch keeps `ring` (the memo is keyed on the cloud area's value), so the effect does not re-run for it; when `animate` flips back on with nothing changed, the early return keeps the ring as is.

- [ ] **Step 4: Wire it.** In `apps/web/src/scene/world-scene.tsx`:
- Import `CloudLayer` from `./clouds`.
- Add `const [clouding, setClouding] = useState(false)` beside `spotting`, and `clouds: clouding` to the `tickerWanted({ … })` call.
- Mount `<CloudLayer model={props.model} focus={props.focus} animate={animate} drifting={seaWave} onRunning={setClouding} />` right after `<SpotlightRig … />`.

- [ ] **Step 5: Run.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint`, `bun run build` — Expected: all pass.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): gather a cloud ring round the current island or district"
```

---

### Task 4: Gate and the owner's check

**Files:** none (spec amendment only if a ruling changed a value)

- [ ] **Step 1: Full gate from the root.** `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` — Expected: all pass; lint at the one known info.

- [ ] **Step 2: three.js stays in the scene chunk.**

```bash
grep -l "WebGLRenderer" apps/web/dist/assets/*.js
grep -rln "from 'three'\|@react-three" apps/web/src/world apps/web/src/layout apps/web/src/tasks apps/web/src/app apps/web/src/rewards apps/web/src/economy apps/web/src/shop
```

Expected: exactly one file (the world-scene chunk); the second prints nothing.

- [ ] **Step 3: Shader compile.** The controller re-runs the headless WebGL compile harness (scratchpad `glsl-check`) with `cloudMaterial` added to its material list. Expected: every program links.

- [ ] **Step 4: Spec sync.** If a task ruled a value away from spec section 21, amend 21 and commit with `docs: …`.

- [ ] **Step 5: Owner's check (manual).** `bun run seed:demo`; sign in as `demo@archipelago.local` / `archipelago-dev`; on desktop and phone check the ring gathering on an island, swapping between islands, tightening round a district, parting on the archipelago; `?perf` shows at most one more draw call than 5f and no tier drop. Try `CLOUD_DENSITY = 0.4` (scattered) and `CLOUD_DISTRICT_RING = 'coast'` to compare.
