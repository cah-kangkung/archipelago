# Phase 5f Spotlight, Layer Taps and Layer Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entering an island or district dims everything outside it, taps outside it do nothing, the camera centre stays on the layer, and the top-centre picker lists the current layer's contents while the drawer keeps only the task search.

**Architecture:** One pure shape, the layer `Area` (a rounded rectangle, `scene/model/area.ts`), drives three things: the pan clamp (camera-motion and the rig work on an `Area` instead of a box), the spotlight (a shader patch on the shared materials reads shared uniforms, tweened by a `SpotlightRig`), and the tap rules (`WorldContents` hands `Island` an `inLayer` test). The HUD's `IslandPicker` becomes a `LayerPicker` (islands on the archipelago, milestones on an island), and 5e's drawer milestone select is removed.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, TanStack Router, three 0.186 + R3F 9.8 + drei 10.7 (`MapControls`, `Html`), Vitest 5 + RTL, `@react-three/test-renderer` 9.1, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 20 (Phase 5f), with sections 14, 16 and 19 for the systems it refines.

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk: nothing under `world/`, `layout/`, `tasks/`, `rewards/`, `economy/`, `shop/` or `app/` imports `three`, `@react-three/*`, or a `scene/` module that does. `scene/model/*`, `scene/tuning.ts` and `scene/use-reduced-motion.ts` are three-free and importable from the app.
- Every scene colour comes from `scenePalette` (A'raf tokens or `mix` of them); the spotlight only scales and greys existing colours.
- No API or DTO change. No new draw calls.
- Values, verbatim: `AREA_MARGIN = SQRT3 / 2`; `SPOTLIGHT_MS = 300`, `SPOTLIGHT_DIM = 0.55`, `SPOTLIGHT_DESATURATE = 0.8`, `SPOTLIGHT_FEATHER = Math.sqrt(3)`, `SPOTLIGHT_LABEL_OPACITY = 0.4`.
- Copy, verbatim: on the archipelago the picker's accessible name is "Island" with "All islands" first; on an island or in a district it is "Milestone" with `"<Island name> (whole island)"` first; labels `Name · N overdue` / `Name · due soon` / the name. The archipelago drawer title "Due today & overdue" is unchanged.
- Commit messages: conventional (`feat(web): …`, `test(web): …`, `docs: …`), no AI attribution, no `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. A refetch that leaves the layer's area unchanged (a task finished elsewhere) must not replay the spotlight fade or hold the ticker. Pinned in Task 4.
2. Past the sea mesh, the clear colour and the fog dim with the sea, so no bright seam appears at the edge of the dimmed world. Pinned in Task 4 (background colour, and the shader dims after `fog_fragment`).
3. A district whose milestone has no tasks yet gets an area around its landmark alone (a point box with half a hex of round), not an empty or inverted one. Pinned in Task 1.
4. Leaving for the archipelago mid-fade reverses from the current strength instead of jumping. Pinned in Task 3.
5. Placing a decoration from a district offers only lit plots, and a tap on a dimmed neighbour island clears the selection rather than navigating. Pinned in Task 5.

---

### Task 1: The layer area (pure)

**Files:**
- Create: `apps/web/src/scene/model/area.ts`, `apps/web/src/scene/model/area.test.ts`
- Modify: `apps/web/src/scene/model/camera.ts`, `apps/web/src/scene/model/camera.test.ts`

**Interfaces:**
- Produces in `scene/model/area.ts`: `type Area = Bounds & { round?: number }` (a `Bounds` is an `Area` with square corners); `areaDistance(area, p: Point): number`; `insideArea(area, p): boolean`; `clampToArea(area, p): Point`.
- Produces in `scene/model/camera.ts`: `AREA_MARGIN = SQRT3 / 2`; `layerArea(model, focus): Area | null`; `panArea(model, focus): Area`. `focusBounds` and `clampToBounds` stay (Task 2 removes them).

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/area.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { type Area, areaDistance, clampToArea, insideArea } from './area'

const circle: Area = { minX: 2, maxX: 2, minZ: -1, maxZ: -1, round: 5 }
const box: Area = { minX: -5, maxX: 5, minZ: -2, maxZ: 2 }
const rounded: Area = { minX: 0, maxX: 4, minZ: 0, maxZ: 2, round: 1 }

describe('area', () => {
  test('a point box with a round is a circle', () => {
    expect(areaDistance(circle, { x: 2, z: -1 })).toBeCloseTo(-5)
    expect(areaDistance(circle, { x: 7, z: -1 })).toBeCloseTo(0)
    expect(areaDistance(circle, { x: 2 + 3, z: -1 + 4 })).toBeCloseTo(0)
    expect(areaDistance(circle, { x: 12, z: -1 })).toBeCloseTo(5)
    expect(insideArea(circle, { x: 5, z: 2 })).toBe(true)
    expect(insideArea(circle, { x: 6, z: 3 })).toBe(false)
  })

  test('a square-cornered box measures to its sides and corners', () => {
    expect(areaDistance(box, { x: 0, z: 0 })).toBeCloseTo(-2)
    expect(areaDistance(box, { x: 8, z: 0 })).toBeCloseTo(3)
    expect(areaDistance(box, { x: 8, z: 6 })).toBeCloseTo(5)
  })

  test('a rounded box is the box grown by its round', () => {
    expect(areaDistance(rounded, { x: 5, z: 1 })).toBeCloseTo(0)
    expect(areaDistance(rounded, { x: 4 + 3, z: 2 + 4 })).toBeCloseTo(4)
    expect(insideArea(rounded, { x: -0.9, z: 1 })).toBe(true)
    expect(insideArea(rounded, { x: -0.9, z: -0.9 })).toBe(false)
  })

  test('clampToArea leaves inside points alone and pulls outside ones to the nearest edge', () => {
    expect(clampToArea(circle, { x: 3, z: 0 })).toEqual({ x: 3, z: 0 })
    const c = clampToArea(circle, { x: 2 + 30, z: -1 + 40 })
    expect(c.x).toBeCloseTo(2 + 3)
    expect(c.z).toBeCloseTo(-1 + 4)
    // A square-cornered box clamps per axis, exactly as the old box clamp did.
    expect(clampToArea(box, { x: 9, z: -9 })).toEqual({ x: 5, z: -2 })
    expect(clampToArea(box, { x: 1, z: 1 })).toEqual({ x: 1, z: 1 })
    const r = clampToArea(rounded, { x: 7, z: 6 })
    expect(r.x).toBeCloseTo(4 + 0.6)
    expect(r.z).toBeCloseTo(2 + 0.8)
  })
})
```

In `apps/web/src/scene/model/camera.test.ts`, add `AREA_MARGIN`, `layerArea`, `panArea` to the `./camera` import and `islandExtent` to the `./hex-space` import, and append:

```ts
describe('layerArea and panArea', () => {
  test('the archipelago has no layer area; its pan area is the world box', () => {
    expect(layerArea(model, { kind: 'archipelago' })).toBeNull()
    expect(panArea(model, { kind: 'archipelago' })).toEqual(model.bounds)
  })

  test('an island is a circle out to its coastline', () => {
    const { x, z } = island.origin
    expect(layerArea(model, onBeta)).toEqual({
      minX: x,
      maxX: x,
      minZ: z,
      maxZ: z,
      round: islandExtent(island.radius),
    })
    expect(panArea(model, onBeta)).toEqual(layerArea(model, onBeta))
  })

  test('a district is the box round its landmark and plots, with half a hex of round', () => {
    const district = island.districts.find((d) => d.milestoneId === mvp.id)
    if (!district) throw new Error('no mvp district')
    const spots = [
      district.position,
      ...island.structures.filter((s) => s.milestoneId === mvp.id).map((s) => s.position),
    ]
    const xs = spots.map((p) => island.origin.x + p.x)
    const zs = spots.map((p) => island.origin.z + p.z)
    expect(layerArea(model, onMvp)).toEqual({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      round: AREA_MARGIN,
    })
  })

  test('a district with no tasks is its landmark alone, with half a hex of round', () => {
    const d = island.districts.find((x) => x.milestoneId === empty.id)
    if (!d) throw new Error('no empty district')
    const x = island.origin.x + d.position.x
    const z = island.origin.z + d.position.z
    expect(layerArea(model, onEmpty)).toEqual({
      minX: x,
      maxX: x,
      minZ: z,
      maxZ: z,
      round: AREA_MARGIN,
    })
  })

  test('unknown ids fall back a level', () => {
    expect(layerArea(model, { kind: 'island', projectId: 'nope' })).toBeNull()
    expect(
      layerArea(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toEqual(layerArea(model, onBeta))
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/area.test.ts src/scene/model/camera.test.ts` — Expected: FAIL (missing module and exports).

- [ ] **Step 2: Implement.** Create `apps/web/src/scene/model/area.ts`:

```ts
import type { Point } from './hex-space'
import type { Bounds } from './scene-model'

/**
 * A rounded rectangle in world x/z: the box grown by `round`, with round corners (spec 20.1). A
 * plain `Bounds` is an area with square corners; a box shrunk to a point is a circle.
 */
export type Area = Bounds & { round?: number }

/** Signed distance from `p` to the area's edge, negative inside. The spotlight shader matches it. */
export function areaDistance(area: Area, p: Point): number {
  const qx = Math.abs(p.x - (area.minX + area.maxX) / 2) - (area.maxX - area.minX) / 2
  const qz = Math.abs(p.z - (area.minZ + area.maxZ) / 2) - (area.maxZ - area.minZ) / 2
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0))
  const inside = Math.min(Math.max(qx, qz), 0)
  return outside + inside - (area.round ?? 0)
}

export function insideArea(area: Area, p: Point): boolean {
  return areaDistance(area, p) <= 0
}

/** The nearest point of the area to `p`; `p` itself when it is inside. */
export function clampToArea(area: Area, p: Point): Point {
  const cx = Math.min(area.maxX, Math.max(area.minX, p.x))
  const cz = Math.min(area.maxZ, Math.max(area.minZ, p.z))
  const round = area.round ?? 0
  const dx = p.x - cx
  const dz = p.z - cz
  const d = Math.hypot(dx, dz)
  if (d <= round) return { x: p.x, z: p.z }
  return { x: cx + (dx / d) * round, z: cz + (dz / d) * round }
}
```

In `apps/web/src/scene/model/camera.ts`:
- Imports become:

```ts
import type { Focus } from '../../world/selectors'
import type { Area } from './area'
import { islandExtent, type Point, SQRT3, shallowsRadius } from './hex-space'
import type { Bounds, SceneIsland, SceneModel } from './scene-model'
import { toScreen } from './screen'
```

- Below `DISTRICT_MARGIN` add:

```ts
/** Half a hex of room round a district's landmark and plots: its lit and pannable area (spec 20.1). */
export const AREA_MARGIN = SQRT3 / 2
```

- In `type Level`, rename the district's `box` to `core` and document it: `| { kind: 'district'; island: SceneIsland; core: Bounds }` with the comment `/** The box through the landmark and the milestone's plots, before any margin. */` above the union. In `levelOf`, return `core` without the margin:

```ts
  return {
    kind: 'district',
    island,
    core: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
  }
```

- Add, below `corners`:

```ts
const grow = (b: Bounds, by: number): Bounds => ({
  minX: b.minX - by,
  maxX: b.maxX + by,
  minZ: b.minZ - by,
  maxZ: b.maxZ + by,
})
```

- In `focusBounds` return `grow(level.core, DISTRICT_MARGIN)` for a district; in `focusOutline` use `corners(level.kind === 'district' ? grow(level.core, DISTRICT_MARGIN) : model.bounds)`; in `cameraTarget` the district centre becomes `(level.core.minX + level.core.maxX) / 2` and `(level.core.minZ + level.core.maxZ) / 2` (a symmetric margin does not move the centre).
- Add, below `focusBounds`:

```ts
/** The current layer as a rounded rectangle: lit, live and pannable (spec 20.1); none on the archipelago. */
export function layerArea(model: SceneModel, focus: Focus): Area | null {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') return null
  if (level.kind === 'island') {
    const { origin, radius } = level.island
    return {
      minX: origin.x,
      maxX: origin.x,
      minZ: origin.z,
      maxZ: origin.z,
      round: islandExtent(radius),
    }
  }
  return { ...level.core, round: AREA_MARGIN }
}

/** Where the pan target may go: the layer area, or the whole world on the archipelago. */
export function panArea(model: SceneModel, focus: Focus): Area {
  return layerArea(model, focus) ?? model.bounds
}
```

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene/model` — Expected: PASS, the existing camera, focusBounds and scene-model tests included (behaviour of the old functions is unchanged).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene/model/area.ts apps/web/src/scene/model/area.test.ts apps/web/src/scene/model/camera.ts apps/web/src/scene/model/camera.test.ts
git commit -m "feat(web): describe each layer as a rounded-rectangle area"
```

---

### Task 2: The camera centre stays on the layer

**Files:**
- Modify: `apps/web/src/scene/model/camera-motion.ts`, `apps/web/src/scene/model/camera-motion.test.ts`
- Modify: `apps/web/src/scene/model/camera.ts`, `apps/web/src/scene/model/camera.test.ts`, `apps/web/src/scene/model/scene-model.test.ts`
- Modify: `apps/web/src/scene/camera-rig.tsx`, `apps/web/src/scene/camera-rig.test.tsx`

**Interfaces:**
- Consumes: `Area`, `areaDistance`, `clampToArea` (Task 1); `panArea`, `layerArea` (Task 1).
- Produces: `bandedTarget(area: Area, p, limit)`, `unbandedTarget(area: Area, p, limit)`, `isOutside(area: Area, p)` (same names, `Area` instead of `Bounds`). Removes `focusBounds` and `clampToBounds` from `camera.ts`.

- [ ] **Step 1: Failing tests.**

In `apps/web/src/scene/model/camera-motion.test.ts`, rename `'bandedTarget leaves points inside alone and pulls overshoot in per axis'` to `'bandedTarget leaves points inside alone and pulls overshoot in toward the edge'` (its assertions hold), and append to the same `describe`:

```ts
  test('on a circle the band stretches outward from the nearest edge point, and inverts', () => {
    const circle = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 5 }
    const p = bandedTarget(circle, { x: 20, z: 0 }, 4)
    expect(p.x).toBeCloseTo(5 + band(15, 4))
    expect(p.z).toBeCloseTo(0)
    const d = bandedTarget(circle, { x: 30, z: 40 }, 4)
    const along = band(45, 4) + 5
    expect(d.x).toBeCloseTo(0.6 * along)
    expect(d.z).toBeCloseTo(0.8 * along)
    for (const q of [
      { x: 1, z: 1 },
      { x: 20, z: 0 },
      { x: -9, z: 12 },
    ]) {
      const back = unbandedTarget(circle, bandedTarget(circle, q, 4), 4)
      expect(back.x).toBeCloseTo(q.x)
      expect(back.z).toBeCloseTo(q.z)
    }
    expect(isOutside(circle, { x: 3, z: 4 })).toBe(false)
    expect(isOutside(circle, { x: 3.01, z: 4 })).toBe(true)
  })
```

(add `band` to its `./camera-motion` import if it is not there).

In `apps/web/src/scene/model/scene-model.test.ts`, delete the test `'clampToBounds keeps the pan target inside the world'` and `clampToBounds` from its import (Task 1's `area.test.ts` pins the same numbers on `clampToArea`).

In `apps/web/src/scene/model/camera.test.ts`:
- Delete `describe('focusBounds', …)` and `focusBounds` from the import.
- Replace the body of `'a district target is the centre of its box'` with:

```ts
    const a = layerArea(model, onMvp)
    if (!a) throw new Error('no mvp area')
    const t = cameraTarget(model, onMvp, null, { width: 1000, height: 800 })
    expect(t.x).toBeCloseTo((a.minX + a.maxX) / 2)
    expect(t.z).toBeCloseTo((a.minZ + a.maxZ) / 2)
```

- Append to `describe('focusOutline and fitZoom', …)`:

```ts
  test('a district outline is its area box grown by DISTRICT_MARGIN', () => {
    const a = layerArea(model, onMvp)
    if (!a) throw new Error('no mvp area')
    const xs = focusOutline(model, onMvp).map((p) => p.x)
    const zs = focusOutline(model, onMvp).map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(a.minX - DISTRICT_MARGIN)
    expect(Math.max(...xs)).toBeCloseTo(a.maxX + DISTRICT_MARGIN)
    expect(Math.min(...zs)).toBeCloseTo(a.minZ - DISTRICT_MARGIN)
    expect(Math.max(...zs)).toBeCloseTo(a.maxZ + DISTRICT_MARGIN)
  })
```

In `apps/web/src/scene/camera-rig.test.tsx`:
- Imports: replace `clampToBounds, focusBounds` with `panArea` from `./model/camera`; add `import { type Area, clampToArea } from './model/area'` and `import { islandExtent, shallowsRadius } from './model/hex-space'`.
- Add below the `canvas` constant:

```ts
/** The box an area reaches: on an axis through its middle, the pan edge is this box's side. */
const outer = (a: Area) => {
  const r = a.round ?? 0
  return { minX: a.minX - r, maxX: a.maxX + r, minZ: a.minZ - r, maxZ: a.maxZ + r }
}
```

- Replace every `focusBounds(X, F)` with `outer(panArea(X, F))` (the pushes in those tests run along x through the island's or district's middle, so the edge is the outer box's side), and in `'a controls start mid-flight…'` replace `clampToBounds(focusBounds(both, onGamma), held.x, held.z)` with `clampToArea(panArea(both, onGamma), held)`.
- Append to `describe('CameraRig', …)`:

```ts
  test('on an island a diagonal pan stops at the coastline, inside the old shallows square', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const island = both.islands.find((i) => i.projectId === gamma.id)
    if (!island) throw new Error('no gamma')
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    c.target.x += 50
    c.target.z += 50
    camera().position.x += 50
    camera().position.z += 50
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    const v = view()
    const reach = Math.hypot(v.x - island.origin.x, v.z - island.origin.z)
    expect(reach).toBeCloseTo(islandExtent(island.radius))
    // 19.1's square let the centre reach √2 × the shallows radius on a diagonal.
    expect(reach).toBeLessThan(shallowsRadius(island.radius))
  })
```

Run: `cd apps/web && bunx vitest run src/scene` — Expected: FAIL (the circle band test, the diagonal test, and compile errors where `focusBounds`/`clampToBounds` are still imported by the rig until Step 2).

- [ ] **Step 2: Implement.**

`apps/web/src/scene/model/camera-motion.ts`:
- Replace `import { clampToBounds } from './camera'` and `import type { Bounds } from './scene-model'` with `import { type Area, areaDistance, clampToArea } from './area'`.
- Delete `bandAxis` and `unbandAxis`, and replace `bandedTarget`, `unbandedTarget` and `isOutside` with:

```ts
/** `p`'s nearest edge point and the offset from it; zero offset inside. */
function overshoot(area: Area, p: Point) {
  const edge = clampToArea(area, p)
  const dx = p.x - edge.x
  const dz = p.z - edge.z
  return { edge, dx, dz, over: Math.hypot(dx, dz) }
}

/** Where a drag that would reach `p` is shown: past the edge it stretches outward with resistance. */
export function bandedTarget(area: Area, p: Point, limit: number): Point {
  const { edge, dx, dz, over } = overshoot(area, p)
  if (over === 0) return { x: p.x, z: p.z }
  const s = band(over, limit) / over
  return { x: edge.x + dx * s, z: edge.z + dz * s }
}

/** The inverse of `bandedTarget`: where a drag must have been to be shown at `p`. */
export function unbandedTarget(area: Area, p: Point, limit: number): Point {
  const { edge, dx, dz, over } = overshoot(area, p)
  if (over === 0) return { x: p.x, z: p.z }
  const s = unband(over, limit) / over
  return { x: edge.x + dx * s, z: edge.z + dz * s }
}
```

and

```ts
export function isOutside(area: Area, p: Point): boolean {
  return areaDistance(area, p) > EDGE_TOLERANCE
}
```

(The edge point of a convex area is the same for every point along its outward direction, so `unbandedTarget` inverts `bandedTarget` exactly.)

`apps/web/src/scene/model/camera.ts`: delete `focusBounds` and `clampToBounds`.

`apps/web/src/scene/camera-rig.tsx`:
- Imports: `import { cameraTarget, focusKey, MAX_ZOOM_FACTOR, panArea } from './model/camera'` and `import { clampToArea } from './model/area'`.
- Replace

```ts
  // Pans stay inside the current layer: the whole world, one island or one district.
  const bounds = focusBounds(model, focus)
  const latest = useRef({ target, bounds, frame, animate })
  latest.current = { target, bounds, frame, animate }
```

with

```ts
  // The pan target stays on the current layer: the whole world, an island's land or a district.
  const area = panArea(model, focus)
  const latest = useRef({ target, area, frame, animate })
  latest.current = { target, area, frame, animate }
```

- The area-trigger effect: deps become `[area.minX, area.maxX, area.minZ, area.maxZ, area.round, invalidate]` and the biome-ignore comment says `the area is the trigger`.
- In `useFrame`, `onChange` and `onStart`, read `area` instead of `bounds` from `latest.current` and pass it to `isOutside`, `bandedTarget` and `unbandedTarget`; the spring target becomes `const to = clampToArea(area, here)`.

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene` — Expected: PASS. `grep -rn "focusBounds\|clampToBounds" apps/web/src` prints nothing.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): keep the camera centre on the island's land or the district"
```

---

### Task 3: Spotlight state and tuning (pure)

**Files:**
- Create: `apps/web/src/scene/model/spotlight.ts`, `apps/web/src/scene/model/spotlight.test.ts`
- Modify: `apps/web/src/scene/tuning.ts`

**Interfaces:**
- Consumes: `Area`, `insideArea` (Task 1); `easeInOutCubic` (`camera-motion.ts`).
- Produces in `scene/tuning.ts`: `SPOTLIGHT_MS`, `SPOTLIGHT_DIM`, `SPOTLIGHT_DESATURATE`, `SPOTLIGHT_FEATHER`, `SPOTLIGHT_LABEL_OPACITY`.
- Produces in `scene/model/spotlight.ts`: `type Spotlight = { area: Area | null; strength: number }`; `SPOTLIGHT_OFF`; `spotlightFor(area): Spotlight`; `spotlightLeg(current, target): { from: Spotlight; to: Spotlight }`; `spotlightAt(from, to, t): Spotlight`; `sameSpotlight(a, b): boolean`; `areaKey(area): string`; `dimHex(hex, strength): string`; `labelOpacity(area, p): number`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/spotlight.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import type { Area } from './area'
import {
  areaKey,
  dimHex,
  labelOpacity,
  SPOTLIGHT_OFF,
  sameSpotlight,
  spotlightAt,
  spotlightFor,
  spotlightLeg,
} from './spotlight'

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('spotlight', () => {
  test('a layer area lights at full strength; none is off', () => {
    expect(spotlightFor(a)).toEqual({ area: a, strength: 1 })
    expect(spotlightFor(null)).toEqual(SPOTLIGHT_OFF)
  })

  test('from off, the new area fades in where it is', () => {
    expect(spotlightLeg(SPOTLIGHT_OFF, spotlightFor(a))).toEqual({
      from: { area: a, strength: 0 },
      to: { area: a, strength: 1 },
    })
  })

  test('lit to lit slides the area at full strength', () => {
    const { from, to } = spotlightLeg(spotlightFor(a), spotlightFor(b))
    expect(from).toEqual({ area: a, strength: 1 })
    expect(to).toEqual({ area: b, strength: 1 })
    const mid = spotlightAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.area?.minX).toBeCloseTo(5)
    expect(mid.area?.round).toBeCloseTo(2.5)
  })

  test('to the archipelago it fades out in place, from wherever it had got to', () => {
    const half = { area: a, strength: 0.5 }
    const { from, to } = spotlightLeg(half, SPOTLIGHT_OFF)
    expect(from).toEqual(half)
    expect(to).toEqual({ area: a, strength: 0 })
    expect(spotlightAt(from, to, 0.5).strength).toBeCloseTo(0.25)
    expect(spotlightAt(from, to, 0)).toEqual(half)
    expect(spotlightAt(from, to, 1)).toEqual(to)
  })

  test('sameSpotlight and areaKey compare by value', () => {
    expect(sameSpotlight(spotlightFor({ ...a }), spotlightFor(a))).toBe(true)
    expect(sameSpotlight(spotlightFor(a), spotlightFor(b))).toBe(false)
    expect(sameSpotlight(SPOTLIGHT_OFF, { area: a, strength: 0 })).toBe(true)
    expect(areaKey({ ...a })).toBe(areaKey(a))
    expect(areaKey(a)).not.toBe(areaKey(b))
    expect(areaKey(null)).toBe('none')
  })

  test('dimHex greys and darkens like the shader, scaled by strength', () => {
    expect(dimHex('#4d96e0', 0)).toBe('#4d96e0')
    const grey = 0.299 * 0x4d + 0.587 * 0x96 + 0.114 * 0xe0
    const ch = (c: number) => Math.round((c + (grey - c) * SPOTLIGHT_DESATURATE) * SPOTLIGHT_DIM)
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    expect(dimHex('#4d96e0', 1)).toBe(`#${hex(ch(0x4d))}${hex(ch(0x96))}${hex(ch(0xe0))}`)
  })

  test('labels outside the area fade; inside, or with no area, they do not', () => {
    expect(labelOpacity(a, { x: 1, z: 1 })).toBe(1)
    expect(labelOpacity(a, { x: 9, z: 0 })).toBe(SPOTLIGHT_LABEL_OPACITY)
    expect(labelOpacity(null, { x: 99, z: 0 })).toBe(1)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/spotlight.test.ts` — Expected: FAIL (missing module).

- [ ] **Step 2: Tuning.** Append to `apps/web/src/scene/tuning.ts`:

```ts
// Spotlight (spec 20.3): outside the current layer, colours grey and darken.
/** The fade or slide between layers, in ms. */
export const SPOTLIGHT_MS = 300
/** Brightness kept outside the layer. */
export const SPOTLIGHT_DIM = 0.55
/** How far colours outside the layer go toward their own grey. */
export const SPOTLIGHT_DESATURATE = 0.8
/** The soft edge, in world units: one hex. */
export const SPOTLIGHT_FEATHER = Math.sqrt(3)
/** Labels whose anchor is outside the layer. */
export const SPOTLIGHT_LABEL_OPACITY = 0.4
```

- [ ] **Step 3: Implement.** Create `apps/web/src/scene/model/spotlight.ts`:

```ts
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import { type Area, insideArea } from './area'
import { easeInOutCubic } from './camera-motion'
import type { Point } from './hex-space'

/** What the spotlight shows: the lit area and how strongly the rest is dimmed (spec 20.3). */
export type Spotlight = { area: Area | null; strength: number }

export const SPOTLIGHT_OFF: Spotlight = { area: null, strength: 0 }

export function spotlightFor(area: Area | null): Spotlight {
  return area ? { area, strength: 1 } : SPOTLIGHT_OFF
}

/**
 * The tween between what is shown and the new layer's spotlight: from off it fades in on the new
 * area, lit to lit it slides at full strength, and to the archipelago it fades out in place.
 */
export function spotlightLeg(
  current: Spotlight,
  target: Spotlight,
): { from: Spotlight; to: Spotlight } {
  if (!target.area) return { from: current, to: { area: current.area, strength: 0 } }
  if (!current.area || current.strength === 0) {
    return { from: { area: target.area, strength: current.strength }, to: target }
  }
  return { from: current, to: target }
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e

/** The spotlight `t` (0–1) of the way through a leg, eased. */
export function spotlightAt(from: Spotlight, to: Spotlight, t: number): Spotlight {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const a = from.area
  const b = to.area
  const area =
    a && b
      ? {
          minX: lerp(a.minX, b.minX, e),
          maxX: lerp(a.maxX, b.maxX, e),
          minZ: lerp(a.minZ, b.minZ, e),
          maxZ: lerp(a.maxZ, b.maxZ, e),
          round: lerp(a.round ?? 0, b.round ?? 0, e),
        }
      : (b ?? a)
  return { area, strength: lerp(from.strength, to.strength, e) }
}

/** A value key for an area: a refetch that rebuilds the same area keeps the same key. */
export function areaKey(area: Area | null): string {
  if (!area) return 'none'
  return [area.minX, area.maxX, area.minZ, area.maxZ, area.round ?? 0].join('|')
}

/** Two spotlights that look the same: both off, or the same area at the same strength. */
export function sameSpotlight(a: Spotlight, b: Spotlight): boolean {
  const lit = (s: Spotlight) => (s.area ? s.strength : 0)
  if (lit(a) === 0 && lit(b) === 0) return true
  return lit(a) === lit(b) && areaKey(a.area) === areaKey(b.area)
}

/** `hex` as the spotlight shows it outside the layer at `strength` (the shader's maths, in sRGB). */
export function dimHex(hex: string, strength: number): string {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [r = 0, g = 0, b = 0] = c
  const grey = 0.299 * r + 0.587 * g + 0.114 * b
  const out = c.map((v) => {
    const tone = (v + (grey - v) * SPOTLIGHT_DESATURATE) * SPOTLIGHT_DIM
    const n = Math.round(v + (tone - v) * strength)
    return Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0')
  })
  return `#${out.join('')}`
}

/** A label anchored at `p` fades when it is outside the lit area. */
export function labelOpacity(area: Area | null, p: Point): number {
  return area && !insideArea(area, p) ? SPOTLIGHT_LABEL_OPACITY : 1
}
```

Note: at `strength` 1, `dimHex` computes `Math.round((v + (grey - v) * DESAT) * DIM)`, which is what the test expects. At other strengths it interpolates before rounding.

- [ ] **Step 4: Run.** `cd apps/web && bunx vitest run src/scene/model/spotlight.test.ts src/scene/tuning.test.ts` — Expected: PASS. If `tuning.test.ts` enumerates exports or asserts ranges per block, add the five constants where it expects them.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/scene/model/spotlight.ts apps/web/src/scene/model/spotlight.test.ts apps/web/src/scene/tuning.ts
git commit -m "feat(web): model the spotlight's fade and slide between layers"
```

---

### Task 4: Draw the spotlight

**Files:**
- Create: `apps/web/src/scene/spotlight-material.ts`, `apps/web/src/scene/spotlight-material.test.ts`
- Create: `apps/web/src/scene/spotlight-rig.tsx`, `apps/web/src/scene/spotlight-rig.test.tsx`
- Modify: `apps/web/src/scene/materials.ts`, `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`, `apps/web/src/scene/world-scene.tsx`, `apps/web/src/scene/labels.tsx`

**Interfaces:**
- Consumes: `layerArea` (Task 1); `Spotlight`, `spotlightFor`, `spotlightLeg`, `spotlightAt`, `sameSpotlight`, `areaKey`, `dimHex`, `labelOpacity`, the `SPOTLIGHT_*` tuning (Task 3); `scenePalette.seaDeep`.
- Produces: `spotlightUniforms`, `patchSpotlight(shader)`, `withSpotlight(material)`, `writeSpotlight(s)` in `spotlight-material.ts`; `SpotlightRig({ model, focus, animate, onRunning })`; `TickerDemand.spotlight: boolean`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/spotlight-material.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  foamMaterial,
  ghostMaterial,
  placementGhostMaterial,
  plotMaterial,
  seaMaterial,
  shadowMaterial,
  solidMaterial,
  splashMaterial,
} from './materials'
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_FEATHER } from './tuning'
import { patchSpotlight, spotlightUniforms, writeSpotlight } from './spotlight-material'

const shaderOf = (lib: 'lambert' | 'basic') => ({
  uniforms: {} as Record<string, THREE.IUniform>,
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
})

describe('spotlight material', () => {
  test.each(['lambert', 'basic'] as const)('patches the %s shader at its anchors', (lib) => {
    const shader = shaderOf(lib)
    patchSpotlight(shader)
    expect(shader.vertexShader).toContain('#include <project_vertex>')
    expect(shader.vertexShader).toContain('vSpotXZ = ( modelMatrix * spotWorld ).xz;')
    const frag = shader.fragmentShader
    // After the fog, so fogged sea dims with the rest.
    expect(frag.indexOf('#include <fog_fragment>')).toBeGreaterThan(-1)
    expect(frag.indexOf('spotDistance( vSpotXZ )')).toBeGreaterThan(
      frag.indexOf('#include <fog_fragment>'),
    )
    expect(frag).toContain(SPOTLIGHT_FEATHER.toFixed(4))
    expect(frag).toContain(SPOTLIGHT_DIM.toFixed(4))
    expect(frag).toContain(SPOTLIGHT_DESATURATE.toFixed(4))
    expect(shader.uniforms.uSpotStrength).toBe(spotlightUniforms.uSpotStrength)
    expect(shader.uniforms.uSpotBox).toBe(spotlightUniforms.uSpotBox)
  })

  test('throws when three moves an anchor, rather than drawing undimmed', () => {
    expect(() =>
      patchSpotlight({ uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '' }),
    ).toThrow(/anchor/)
  })

  test('every shared scene material carries the patch', () => {
    for (const m of [
      solidMaterial,
      seaMaterial,
      shadowMaterial,
      foamMaterial,
      splashMaterial,
      plotMaterial,
      ghostMaterial,
      placementGhostMaterial,
    ]) {
      expect(m.onBeforeCompile).toBe(patchSpotlight)
    }
  })

  test('writeSpotlight sets the shared uniforms; no area means strength 0', () => {
    writeSpotlight({ area: { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }, strength: 0.7 })
    expect(spotlightUniforms.uSpotBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(spotlightUniforms.uSpotRound.value).toBe(0.5)
    expect(spotlightUniforms.uSpotStrength.value).toBe(0.7)
    writeSpotlight({ area: null, strength: 1 })
    expect(spotlightUniforms.uSpotStrength.value).toBe(0)
  })
})
```

Create `apps/web/src/scene/spotlight-rig.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { layerArea } from './model/camera'
import { scenePalette } from './model/palette'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { dimHex } from './model/spotlight'
import { spotlightUniforms } from './spotlight-material'
import { SpotlightRig } from './spotlight-rig'
import { SPOTLIGHT_MS } from './tuning'

const today = '2026-10-08'
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

const grab: { scene?: THREE.Scene } = {}
function Grab() {
  grab.scene = useThree((s) => s.scene)
  return null
}

type Props = { model: SceneModel; focus: Focus; animate?: boolean; onRunning?: (r: boolean) => void }
const tree = ({ model: m, focus, animate = true, onRunning }: Props) => (
  <>
    <color attach="background" args={[scenePalette.seaDeep]} />
    <SpotlightRig model={m} focus={focus} animate={animate} onRunning={onRunning} />
    <Grab />
  </>
)
const strength = () => spotlightUniforms.uSpotStrength.value
const box = () => spotlightUniforms.uSpotBox.value.toArray()
const background = () => `#${(grab.scene?.background as THREE.Color).getHexString()}`
const frames = Math.ceil(SPOTLIGHT_MS / 100) + 1

describe('SpotlightRig', () => {
  test('off on the archipelago; entering an island fades it in over SPOTLIGHT_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    expect(strength()).toBe(0)
    expect(onRunning).not.toHaveBeenCalledWith(true)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.advanceFrames(2, 0.1)
    expect(strength()).toBeGreaterThan(0)
    expect(strength()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(strength()).toBe(1)
    const a = layerArea(model, onBeta)
    expect(box()).toEqual([a?.minX, a?.minZ, a?.maxX, a?.maxZ])
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(background()).toBe(dimHex(scenePalette.seaDeep, 1))
  })

  test('island to island slides the area at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    expect(strength()).toBe(1)
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    expect(strength()).toBe(1)
    const from = layerArea(model, onBeta)?.minX ?? 0
    const to = layerArea(model, onGamma)?.minX ?? 0
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
  })

  test('back to the archipelago fades out; the background returns to the plain sea', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(strength()).toBe(0)
    expect(background()).toBe(scenePalette.seaDeep)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(strength()).toBe(1)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the area neither replays the fade nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, animate: false, onRunning }),
    )
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(strength()).toBe(1)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })
})
```

In `apps/web/src/scene/ticker.test.ts`, add `spotlight: false` to every `TickerDemand` literal and add a case where only `spotlight: true` (with `animate: true`) makes `tickerWanted` true.

Run: `cd apps/web && bunx vitest run src/scene/spotlight-material.test.ts src/scene/spotlight-rig.test.tsx src/scene/ticker.test.ts` — Expected: FAIL (missing modules, missing field).

- [ ] **Step 2: The material patch.** Create `apps/web/src/scene/spotlight-material.ts`:

```ts
import * as THREE from 'three'
import type { Spotlight } from './model/spotlight'
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_FEATHER } from './tuning'

/** One set of uniforms shared by every patched material: a write reaches them all (spec 20.3). */
export const spotlightUniforms = {
  /** The area's box as (minX, minZ, maxX, maxZ). */
  uSpotBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSpotRound: { value: 0 },
  uSpotStrength: { value: 0 },
}

const glsl = (n: number) => n.toFixed(4)
const VERTEX_ANCHOR = '#include <project_vertex>'
const FRAGMENT_ANCHOR = '#include <fog_fragment>'

const VERTEX_HEAD = 'varying vec2 vSpotXZ;\n'
const VERTEX_BODY = `${VERTEX_ANCHOR}
vec4 spotWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
spotWorld = instanceMatrix * spotWorld;
#endif
vSpotXZ = ( modelMatrix * spotWorld ).xz;`

// The same signed distance as `areaDistance` in scene/model/area.ts.
const FRAGMENT_HEAD = `varying vec2 vSpotXZ;
uniform vec4 uSpotBox;
uniform float uSpotRound;
uniform float uSpotStrength;
float spotDistance( vec2 p ) {
  vec2 centre = ( uSpotBox.xy + uSpotBox.zw ) * 0.5;
  vec2 extent = ( uSpotBox.zw - uSpotBox.xy ) * 0.5;
  vec2 q = abs( p - centre ) - extent;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uSpotRound;
}
`
// After the fog and the colour-space conversion, so it works in sRGB like `dimHex`.
const FRAGMENT_BODY = `${FRAGMENT_ANCHOR}
float spotOut = smoothstep( 0.0, ${glsl(SPOTLIGHT_FEATHER)}, spotDistance( vSpotXZ ) ) * uSpotStrength;
float spotGrey = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
vec3 spotTone = mix( gl_FragColor.rgb, vec3( spotGrey ), ${glsl(SPOTLIGHT_DESATURATE)} ) * ${glsl(SPOTLIGHT_DIM)};
gl_FragColor.rgb = mix( gl_FragColor.rgb, spotTone, spotOut );`

type Shader = {
  uniforms: Record<string, THREE.IUniform>
  vertexShader: string
  fragmentShader: string
}

/** Dims everything outside the spotlight's area; set as each shared material's onBeforeCompile. */
export function patchSpotlight(shader: Shader): void {
  if (!shader.vertexShader.includes(VERTEX_ANCHOR) || !shader.fragmentShader.includes(FRAGMENT_ANCHOR)) {
    throw new Error('spotlight: a shader anchor moved; update spotlight-material.ts')
  }
  Object.assign(shader.uniforms, spotlightUniforms)
  shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(VERTEX_ANCHOR, VERTEX_BODY)
  shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace(FRAGMENT_ANCHOR, FRAGMENT_BODY)
}

export function withSpotlight<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = patchSpotlight
  material.customProgramCacheKey = () => 'spotlight'
  return material
}

export function writeSpotlight(s: Spotlight): void {
  const { area } = s
  if (area) {
    spotlightUniforms.uSpotBox.value.set(area.minX, area.minZ, area.maxX, area.maxZ)
    spotlightUniforms.uSpotRound.value = area.round ?? 0
  }
  spotlightUniforms.uSpotStrength.value = area ? s.strength : 0
}
```

In `apps/web/src/scene/materials.ts`, import `withSpotlight` from `./spotlight-material` and wrap the constructor of each of the eight exported materials: `export const solidMaterial = withSpotlight(new THREE.MeshLambertMaterial({ … }))`, likewise `ghostMaterial`, `shadowMaterial`, `seaMaterial`, `plotMaterial`, `placementGhostMaterial`, `foamMaterial`, `splashMaterial`.

- [ ] **Step 3: The rig.** Create `apps/web/src/scene/spotlight-rig.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Focus } from '../world/selectors'
import { layerArea } from './model/camera'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import {
  areaKey,
  dimHex,
  type Spotlight,
  SPOTLIGHT_OFF,
  sameSpotlight,
  spotlightAt,
  spotlightFor,
  spotlightLeg,
} from './model/spotlight'
import { writeSpotlight } from './spotlight-material'
import { clampDelta, SPOTLIGHT_MS } from './tuning'

/** Fades and slides the spotlight with the route (spec 20.3); a refetch with the same area is still. */
export function SpotlightRig({
  model,
  focus,
  animate,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** A fade or slide started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const scene = useThree((s) => s.scene)
  const area = layerArea(model, focus)
  const key = areaKey(area)
  const target = useRef(spotlightFor(area))
  target.current = spotlightFor(area)
  const shown = useRef<Spotlight>(SPOTLIGHT_OFF)
  const leg = useRef<{ from: Spotlight; to: Spotlight; elapsed: number } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning

  const show = useCallback(
    (s: Spotlight) => {
      shown.current = s
      writeSpotlight(s)
      // The clear colour shows past the sea mesh: dim it with the sea so no seam appears.
      if (scene.background instanceof THREE.Color) {
        scene.background.set(dimHex(scenePalette.seaDeep, s.area ? s.strength : 0))
      }
    },
    [scene],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: the area's value is the trigger
  useLayoutEffect(() => {
    const { from, to } = spotlightLeg(shown.current, target.current)
    const wasRunning = leg.current !== null
    if (!animate || sameSpotlight(from, to)) {
      leg.current = null
      show(to)
      if (wasRunning) running.current?.(false)
    } else {
      leg.current = { from, to, elapsed: 0 }
      show(from)
      if (!wasRunning) running.current?.(true)
    }
    invalidate()
  }, [key, animate, show, invalidate])

  useFrame((_, delta) => {
    const l = leg.current
    if (!l) return
    l.elapsed += clampDelta(delta) * 1000
    const t = Math.min(1, l.elapsed / SPOTLIGHT_MS)
    show(spotlightAt(l.from, l.to, t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
  })

  return null
}
```

Note on the first effect run: the `<color attach="background">` sibling attaches before this layout effect only if it is mounted earlier in the tree; keep `SpotlightRig` after it in `WorldScene` (Step 4).

In `apps/web/src/scene/ticker.ts`, add to `TickerDemand`:

```ts
  /** The spotlight is fading or sliding between layers (spec 20.3). */
  spotlight: boolean
```

and add `|| d.spotlight` inside `tickerWanted`.

- [ ] **Step 4: Wire it.** In `apps/web/src/scene/world-scene.tsx`:
- Import `SpotlightRig` from `./spotlight-rig`.
- Add `const [spotting, setSpotting] = useState(false)` beside `growing`, and `spotlight: spotting` to the `tickerWanted({ … })` call.
- Mount `<SpotlightRig model={props.model} focus={props.focus} animate={animate} onRunning={setSpotting} />` right after `<WorldContents … />` (after the `<color attach="background">` element).

In `apps/web/src/scene/labels.tsx`:
- Import `layerArea` from `./model/camera` and `labelOpacity` from `./model/spotlight`.
- In the district-label branch, compute `const area = layerArea(model, focus)` once and give each `<Html>` `style={{ opacity: labelOpacity(area, { x: island.origin.x + d.position.x, z: island.origin.z + d.position.z }) }}`. (Island labels only show on the archipelago, where there is no area. Edge markers and reward floats are unchanged: the markers are the HUD's shortcut to other urgent islands.)

- [ ] **Step 5: Run.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint`, `bun run build` — Expected: all pass. The GLSL itself only compiles in a real browser; the owner's check (Task 7) covers it, so keep the shader text exactly as given.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): dim everything outside the current island or district"
```

---

### Task 5: Taps outside the layer do nothing

**Files:**
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/island.tsx`
- Modify: `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Consumes: `layerArea` (Task 1); `insideArea` (Task 1).
- Produces: `Island` gains props `opensIsland: boolean`, `opensDistricts: boolean`, `inLayer: (p: Point) => boolean` (world x/z).

- [ ] **Step 1: Failing tests.** In `apps/web/src/scene/world-contents.test.tsx`, replace the test `'a landmark tap opens its district; another island’s tap opens that island'` with:

```ts
  test('a landmark tap opens its district; another island’s tap only clears (spec 20.4)', async () => {
    const { world, beta, gamma, mvp } = seeded()
    const { renderer, onOpenDistrict, onOpenIsland, onSelect } = await render(world, {
      kind: 'island',
      projectId: beta.id,
    })
    await renderer.fireEvent(one(renderer.scene, `landmark:${mvp.id}`), 'click', { delta: 0 })
    expect(onOpenDistrict).toHaveBeenCalledWith(beta.id, mvp.id)
    await renderer.fireEvent(one(renderer.scene, `island:${gamma.id}`), 'click', { delta: 0 })
    expect(onOpenIsland).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  test('in a district no landmark opens, and decorations outside it do not select', async () => {
    const s = decorated()
    const other = fakeMilestone({ projectId: s.beta.id, name: 'Later', districtQ: -5, districtR: 5 })
    const world = { ...s.world, milestones: [...s.world.milestones, other] }
    const { renderer, onSelectBuilding, onSelect } = await render(world, {
      kind: 'district',
      projectId: s.beta.id,
      milestoneId: s.mvp.id,
    })
    expect(one(renderer.scene, `landmark:${other.id}`).props.onClick).toBeUndefined()
    expect(one(renderer.scene, `landmark:${s.mvp.id}`).props.onClick).toBeUndefined()
    // The pine at (0, 1) is far from MVP's district at (5, 0).
    await renderer.fireEvent(one(renderer.scene, 'pine'), 'click', { instanceId: 0, delta: 0 })
    expect(onSelectBuilding).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  test('placing from a district offers only the plots inside it', async () => {
    const { world, beta, mvp } = decorated()
    const plots = [
      { q: 4, r: 0 },
      { q: -2, r: 1 },
    ]
    const { renderer, onPickPlot } = await render(
      world,
      { kind: 'district', projectId: beta.id, milestoneId: mvp.id },
      null,
      { placement: { projectId: beta.id, plots, ghost: null } },
    )
    const glow = one(renderer.scene, 'plot')
    expect((glow.instance as THREE.InstancedMesh).count).toBe(1)
    await renderer.fireEvent(glow, 'click', { instanceId: 0, delta: 0 })
    expect(onPickPlot).toHaveBeenCalledWith({ q: 4, r: 0 })
  })
```

(`decorated` is defined inside the `describe` further down; move these two tests below it, or hoist `decorated` above the first test that needs it.)

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx` — Expected: the three tests FAIL.

- [ ] **Step 2: Implement.** In `apps/web/src/scene/world-contents.tsx`:
- Import `insideArea` from `./model/area`, `layerArea` from `./model/camera`, `type Point` from `./model/hex-space`.
- Below `pickable`:

```ts
  // Outside the current layer nothing answers a tap (spec 20.4). Keyed on the area's value so a
  // refetch with the same area keeps the same function (Island memoises its live plots on it).
  const area = layerArea(model, focus)
  const key = areaKey(area)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the area's value is the key
  const inLayer = useCallback((p: Point) => !area || insideArea(area, p), [key])
```

  (import `useCallback` from `react` and `areaKey` from `./model/spotlight`; place this above any early return so the hook order is fixed).

- Pass to every `<Island>`: `opensIsland={focus.kind === 'archipelago'}`, `opensDistricts={focus.kind === 'island'}`, `inLayer={inLayer}`.

In `apps/web/src/scene/island.tsx`:
- Import `type Point` from `./model/hex-space` (it already imports `hexToWorld` from there).
- Add to the props type (with docs) and destructure:

```ts
  /** A tap on this (unfocused) island opens it; otherwise it only clears, like open sea. */
  opensIsland: boolean
  /** A landmark tap opens its district (the island layer only). */
  opensDistricts: boolean
  /** Whether a world-space point is inside the current layer (spec 20.4). */
  inLayer: (p: Point) => boolean
```

- Add `const world = (p: Point): Point => ({ x: island.origin.x + p.x, z: island.origin.z + p.z })`.
- Placement plots: replace the `plotPoints` memo with

```ts
  // biome-ignore lint/correctness/useExhaustiveDependencies: `world` reads the origin listed here
  const livePlots = useMemo(
    () => placement?.plots.filter((h) => inLayer(world(hexToWorld(h)))) ?? [],
    [placement?.plots, inLayer, island.origin.x, island.origin.z],
  )
  const plotPoints = useMemo(
    (): Spot[] => livePlots.map((h) => ({ ...hexToWorld(h), y: heightAt(heights, h) })),
    [livePlots, heights],
  )
```

and in the plot `ModelInstances` `onPick`, read `livePlots[i]` instead of `placement.plots[i]`.
- The group: `onClick={focused ? undefined : onTap<MouseEvent>(() => (opensIsland ? onOpenIsland(island.projectId) : onSelect(null)))}`.
- Decorations: the `onPick` becomes

```ts
          onPick={
            focused
              ? (i) => {
                  const d = decorations[i]
                  if (!d) return
                  if (inLayer(world(d.position))) onSelectBuilding(d.buildingId)
                  else onSelect(null)
                }
              : undefined
          }
```

- Landmarks: `onOpen={focused && opensDistricts ? () => onOpenDistrict(island.projectId, d.milestoneId) : undefined}`.

- [ ] **Step 3: Run.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, including `'while placing, nothing else answers a tap'` and `'in archipelago view an island tap opens it…'`.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): make taps outside the current layer do nothing"
```

---

### Task 6: The layer picker replaces the drawer's milestone filter

**Files:**
- Create: `apps/web/src/world/layer-picker.tsx`
- Delete: `apps/web/src/world/island-picker.tsx`
- Modify: `apps/web/src/world/selectors.ts`, `apps/web/src/world/world-hud.tsx`
- Modify: `apps/web/src/tasks/task-panel.tsx`, `apps/web/src/layout/world-screen.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`, `apps/web/src/layout/world-screen.test.tsx`

**Interfaces:**
- Produces: `IslandSummary.milestoneUrgency: Record<string, { overdue: number; dueSoon: number }>`; `LayerPicker({ summaries, projectId, milestoneId })`; `urgencyLabel(name, urgency): string`. Removes `IslandPicker`, `islandOptionLabel`, `ALL_TASKS`, `NO_MILESTONE` and `TaskPanel`'s `milestones`/`milestoneValue`/`onMilestoneChange`/`commonsOnly` props.

- [ ] **Step 1: Failing tests.** In `apps/web/src/layout/world-scene-integration.test.tsx`:
- Delete the test `'a task picked in the scene is shown even under the No milestone filter'`.
- Replace the whole `describe('island picker', …)` block with:

```ts
  describe('layer picker', () => {
    function urgentWorld() {
      const today = todayIn('Asia/Jakarta')
      const beta = fakeProject({ name: 'Beta' })
      const gamma = fakeProject({ name: 'Gamma' })
      const calm = fakeProject({ name: 'Calm' })
      const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP', sortOrder: 0 })
      const later = fakeMilestone({ projectId: beta.id, name: 'Later', sortOrder: 1 })
      const tasks = [
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -2), plotX: 1, plotY: 0 }),
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -1), plotX: 2, plotY: 0 }),
        fakeTask({ projectId: beta.id, milestoneId: mvp.id, dueDate: today, plotX: 3, plotY: 0 }),
        fakeTask({ projectId: gamma.id, dueDate: today, plotX: 1, plotY: 0 }),
      ]
      const fake = createFakeApi({
        world: { projects: [beta, gamma, calm], milestones: [mvp, later], tasks, buildings: [] },
      })
      return { ...fake, beta, gamma, calm, mvp, later }
    }
    const islandPicker = () => screen.getByRole('combobox', { name: 'Island' })
    const milestonePicker = () => screen.getByRole('combobox', { name: 'Milestone' })
    const labels = (el: HTMLElement) =>
      within(el)
        .getAllByRole('option')
        .map((o) => o.textContent)

    test('on the archipelago it lists every island with its urgency, after "All islands"', async () => {
      const { api } = urgentWorld()
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      expect(labels(islandPicker())).toEqual([
        'All islands',
        'Beta · 2 overdue',
        'Gamma · due soon',
        'Calm',
      ])
      expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
    })

    test('on an island and in a district it lists that island’s milestones, on phone and desktop', async () => {
      for (const desktop of [false, true]) {
        const { api, beta, mvp } = urgentWorld()
        const { router, unmount } = renderAppWithUnmount({ api, path: `/p/${beta.id}`, desktop })
        await screen.findByTestId('scene')
        expect(screen.queryByRole('combobox', { name: 'Island' })).not.toBeInTheDocument()
        expect(labels(milestonePicker())).toEqual([
          'Beta (whole island)',
          'MVP · due soon',
          'Later',
        ])
        expect(milestonePicker()).toHaveDisplayValue('Beta (whole island)')
        await act(() =>
          router.navigate({
            to: '/p/$projectId/m/$milestoneId',
            params: { projectId: beta.id, milestoneId: mvp.id },
          }),
        )
        expect(milestonePicker()).toHaveDisplayValue('MVP · due soon')
        unmount()
      }
    })

    test('picking a milestone flies into it; the first option flies back to the island', async () => {
      const { api, beta, later } = urgentWorld()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByTestId('scene')
      await user.selectOptions(milestonePicker(), 'Later')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${later.id}`)
      await user.selectOptions(milestonePicker(), 'Beta (whole island)')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    })

    test('picking an island flies there; "All islands" is the way back from the archipelago list', async () => {
      const { api, gamma } = urgentWorld()
      const { user, router } = renderApp({ api, path: '/', desktop: true })
      await screen.findByTestId('scene')
      await user.selectOptions(islandPicker(), 'Gamma · due soon')
      expect(router.state.location.pathname).toBe(`/p/${gamma.id}`)
    })

    test('an island with no milestones lists only itself', async () => {
      const { api, calm } = urgentWorld()
      renderApp({ api, path: `/p/${calm.id}` })
      await screen.findByTestId('scene')
      expect(labels(milestonePicker())).toEqual(['Calm (whole island)'])
    })

    test('a lone calm island is listed plainly on the archipelago', async () => {
      const calm = fakeProject({ name: 'Calm' })
      const { api } = createFakeApi({
        world: { projects: [calm], milestones: [], tasks: [], buildings: [] },
      })
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      expect(labels(islandPicker())).toEqual(['All islands', 'Calm'])
    })

    test('no island chips remain in the drawer or above the sheet', async () => {
      for (const desktop of [false, true]) {
        const { api, beta } = urgentWorld()
        const { unmount } = renderAppWithUnmount({ api, path: `/p/${beta.id}`, desktop })
        await screen.findByTestId('scene')
        expect(screen.queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()
        unmount()
      }
    })
  })
```

If `fakeMilestone` does not take `sortOrder`, drop it and rely on creation order, and say so in the report. These run with the drawer open beside the scene; the drawer's own "Milestone" select is removed in Step 4, so `getByRole('combobox', { name: 'Milestone' })` finds the picker alone.

In `apps/web/src/layout/world-screen.test.tsx`, replace the whole `describe('milestone filter', …)` block with these two tests (the "New task" one is kept from it):

```ts
  test('the drawer has no milestone select on any layer (spec 20.5)', async () => {
    const { api, beta, mvp } = seeded()
    const { router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'Beta' })
    expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
    await act(() =>
      router.navigate({
        to: '/p/$projectId/m/$milestoneId',
        params: { projectId: beta.id, milestoneId: mvp.id },
      }),
    )
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
  })

  test('New task takes its milestone from where you are', async () => {
    const { api, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.click(screen.getByRole('button', { name: 'New task' }))
    const dialog = await screen.findByRole('dialog', { name: 'New task' })
    expect(within(dialog).getByRole('combobox', { name: 'Milestone' })).toHaveDisplayValue('MVP')
  })
```

Run: `cd apps/web && bunx vitest run src/layout` — Expected: the layer-picker tests and the no-milestone-select test FAIL.

- [ ] **Step 2: Milestone urgency.** In `apps/web/src/world/selectors.ts`, add to `IslandSummary`:

```ts
  /** Open overdue and due-soon counts per milestone id (spec 20.5). */
  milestoneUrgency: Record<string, { overdue: number; dueSoon: number }>
```

and in `islandSummaries` compute the milestones once and the counts from them:

```ts
  return world.projects.map((project) => {
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const statuses = tasks.map((t) => dueStatus(t, today))
    const milestones = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const count = (milestoneId: string, status: DueStatus) =>
      tasks.filter((t, i) => t.milestoneId === milestoneId && statuses[i] === status).length
    return {
      project,
      milestones,
      milestoneUrgency: Object.fromEntries(
        milestones.map((m) => [
          m.id,
          { overdue: count(m.id, 'overdue'), dueSoon: count(m.id, 'due-soon') },
        ]),
      ),
      open: tasks.filter((t) => t.status !== 'done').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: statuses.filter((s) => s === 'overdue').length,
      dueSoon: statuses.filter((s) => s === 'due-soon').length,
    }
  })
```

(`dueStatus` already returns `'none'` for done tasks, so only open tasks count.) Fix any test that builds an `IslandSummary` literal by adding `milestoneUrgency: {}`; `bun run typecheck` lists them.

- [ ] **Step 3: The picker.** Create `apps/web/src/world/layer-picker.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router'
import type { IslandSummary } from './selectors'

const TOP = ''
const NO_URGENCY = { overdue: 0, dueSoon: 0 }

const selectClass =
  'min-h-11 max-w-[70vw] truncate rounded-full border border-border-secondary bg-surface-primary/95 px-4 text-sm font-medium text-text-primary shadow'

/** "Name · N overdue", "Name · due soon", or just the name (spec 19.3, 20.5). */
export function urgencyLabel(name: string, u: { overdue: number; dueSoon: number }): string {
  if (u.overdue > 0) return `${name} · ${u.overdue} overdue`
  if (u.dueSoon > 0) return `${name} · due soon`
  return name
}

/** The current layer's contents: islands on the archipelago, milestones on an island (spec 20.5). */
export function LayerPicker({
  summaries,
  projectId,
  milestoneId,
}: {
  summaries: IslandSummary[]
  projectId: string | null
  milestoneId: string | null
}) {
  const navigate = useNavigate()
  const island = projectId ? summaries.find((s) => s.project.id === projectId) : undefined
  if (!island) {
    return (
      <label className="pointer-events-auto">
        <span className="sr-only">Island</span>
        <select
          value={TOP}
          onChange={(e) => {
            const id = e.target.value
            if (id !== TOP) void navigate({ to: '/p/$projectId', params: { projectId: id } })
          }}
          className={selectClass}
        >
          <option value={TOP}>All islands</option>
          {summaries.map((s) => (
            <option key={s.project.id} value={s.project.id}>
              {urgencyLabel(s.project.name, s)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  const { project } = island
  return (
    <label className="pointer-events-auto">
      <span className="sr-only">Milestone</span>
      <select
        value={milestoneId ?? TOP}
        onChange={(e) => {
          const id = e.target.value
          void (id === TOP
            ? navigate({ to: '/p/$projectId', params: { projectId: project.id } })
            : navigate({
                to: '/p/$projectId/m/$milestoneId',
                params: { projectId: project.id, milestoneId: id },
              }))
        }}
        className={selectClass}
      >
        <option value={TOP}>{`${project.name} (whole island)`}</option>
        {island.milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {urgencyLabel(m.name, island.milestoneUrgency[m.id] ?? NO_URGENCY)}
          </option>
        ))}
      </select>
    </label>
  )
}
```

`git rm apps/web/src/world/island-picker.tsx`. In `apps/web/src/world/world-hud.tsx`, import `LayerPicker` from `./layer-picker` instead of `IslandPicker`, and render `<LayerPicker summaries={summaries} projectId={project?.id ?? null} milestoneId={milestone?.id ?? null} />` in the picker slot. `grep -rn "island-picker\|islandOptionLabel\|IslandPicker" apps/web/src` must print nothing.

- [ ] **Step 4: Out of the drawer.** In `apps/web/src/tasks/task-panel.tsx`:
- Delete `ALL_TASKS`, `NO_MILESTONE`, the four props (`milestones`, `milestoneValue`, `onMilestoneChange`, `commonsOnly`) with their docs, and the `MilestoneDto` type import if nothing else uses it.
- The filter goes back to `panelTasks(world, focus, today).filter((t) => needle === '' || t.title.toLowerCase().includes(needle))`.
- The second header row keeps only "New task": its condition becomes `focus.kind !== 'archipelago' && onNewTask`, and the `<label>`/`<select>` block goes. Keep the button's classes.

In `apps/web/src/layout/world-screen.tsx`:
- Import only `TaskPanel` from `../tasks/task-panel`.
- Delete `commonsFor`/`setCommonsFor`, `pendingCommons` (and their comment), the two lines in the route-change effect that use them, `commonsOnly`, `islandMilestones`, `milestoneValue` and `pickMilestone`, and the four `TaskPanel` props.
- In the scene's `onSelect`, delete the comment and the line `if (world.data.tasks.find((t) => t.id === taskId)?.milestoneId) setCommonsFor(null)`.
- Remove any import (`useRef`, `ALL_TASKS`…) left unused; `bun run lint` flags them.

- [ ] **Step 5: Run and commit.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, the one known info.

```bash
git add -A apps/web/src
git commit -m "feat(web): pick milestones from the top of the scene; drop the drawer milestone filter"
```

---

### Task 7: Gate and the owner's check

**Files:** none (spec amendment only if a ruling changed a value)

- [ ] **Step 1: Full gate from the root.**

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Expected: every suite passes; typecheck 4/4; lint at the one known info; build succeeds.

- [ ] **Step 2: three.js stays in the scene chunk.**

```bash
grep -l "WebGLRenderer" apps/web/dist/assets/*.js
grep -rln "from 'three'\|@react-three" apps/web/src/world apps/web/src/layout apps/web/src/tasks apps/web/src/app apps/web/src/rewards apps/web/src/economy apps/web/src/shop
```

Expected: exactly one file (the world-scene chunk); the second prints nothing.

- [ ] **Step 3: Spec sync.** If a task ruled a value away from spec section 20, amend 20 and commit with `docs: …`.

- [ ] **Step 4: Owner's check (manual).** Run `bun run seed:demo`, sign in as `demo@archipelago.local` / `archipelago-dev`, and check on desktop and phone: the spotlight fades in on an island, slides between islands and into districts, and fades out on the archipelago; dimmed tiles ignore taps; the centre stops at the coastline; the picker lists islands, then milestones; the drawer has only the search. `?perf` shows no new draw calls and no tier drop.
