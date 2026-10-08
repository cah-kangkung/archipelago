# Phase 5e Layer Focus and Island Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each layer a room: the camera stays inside the current island or district, island selection moves to a picker at the top of the scene, the island drawer gains a milestone filter that navigates, and the archipelago is spaced out on a lighter sea.

**Architecture:** Pure camera rules in `scene/model/camera.ts` (`focusBounds`, `focusOutline`, `fitZoom`, `cameraTarget` with a viewport) drive the existing `CameraRig`, which clamps pans to the current layer's bounds and zoom-out to the target zoom. The `IslandSwitcher` is replaced by a native `<select>` (`IslandPicker`) in the world HUD; the drawer's `TaskPanel` gets a native milestone `<select>` whose choices route (milestone, "All tasks") or filter locally ("No milestone", state in `WorldScreen`). `ISLAND_GAP` and four palette keys change.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, TanStack Router, three 0.186 + R3F 9.8 + drei 10.7 (`MapControls`), Vitest 5 + RTL, `@react-three/test-renderer` 9.1, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 19 (Phase 5e), with sections 13.4, 14 and 17 for the systems it refines.

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk: nothing under `world/`, `layout/`, `tasks/`, `rewards/`, `economy/`, `shop/` or `app/` imports `three`, `@react-three/*`, or a `scene/` module that does. `scene/model/*`, `scene/tuning.ts` and `scene/use-reduced-motion.ts` are three-free and importable from the app.
- Every scene colour comes from `scenePalette` (A'raf tokens or `mix` of them).
- No API or DTO change.
- Readability floors stay: `ISLAND_ZOOM` (48) and `DISTRICT_ZOOM` (72) are the minimum opening zooms of their layers.
- Copy, verbatim: picker accessible name "Island", option "All islands", urgency labels `Name · N overdue` / `Name · due soon`; milestone select accessible name "Milestone", options "All tasks", "No milestone". The archipelago drawer title "Due today & overdue" is unchanged.
- Commit messages: conventional (`feat(web): …`, `test(web): …`, `docs: …`), no AI attribution, no `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. Resizing the window, or the phone sheet changing detent, while resting on an island re-fits the zoom-out limit; the camera never stays zoomed out past the new limit. Pinned in Task 2.
2. A district whose milestone has no tasks yet still gets a sensible area (its landmark plus the margin), and an unknown milestone id falls back to the island's area. Pinned in Task 1.
3. Picking "No milestone" from inside a district lands on the island with the filter on, and it is gone after leaving the island and coming back. Pinned in Task 5.
4. With one island, or with islands that have no urgent tasks, the picker still lists them plainly and "All islands" still works. Pinned in Task 4.
5. A pan toward a neighbouring island from an island view stops at this island's shallows, well short of the neighbour. Pinned in Task 2.

---

### Task 1: Camera rules per layer (pure)

**Files:**
- Modify: `apps/web/src/scene/model/camera.ts`
- Create: `apps/web/src/scene/model/camera.test.ts`

**Interfaces:**
- Produces in `scene/model/camera.ts`:
  - `FIT_MARGIN = 0.9`, `DISTRICT_MARGIN = 2 * SQRT3`.
  - `type Viewport = { width: number; height: number }` (CSS px the camera may fill).
  - `focusBounds(model: SceneModel, focus: Focus): Bounds`.
  - `focusOutline(model: SceneModel, focus: Focus): Point[]`.
  - `fitZoom(outline: readonly Point[], viewport?: Viewport): number` — 0 without a viewport.
  - `cameraTarget(model, focus, anchor = null, viewport?: Viewport): CameraTarget` — new optional 4th parameter; without it every zoom is exactly what it was.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/scene/model/camera.test.ts`:

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import {
  ARCHIPELAGO_ZOOM,
  cameraTarget,
  DISTRICT_MARGIN,
  DISTRICT_ZOOM,
  FIT_MARGIN,
  fitZoom,
  focusBounds,
  focusOutline,
  ISLAND_ZOOM,
} from './camera'
import { shallowsRadius } from './hex-space'
import { buildSceneModel } from './scene-model'
import { toScreen } from './screen'

const today = '2026-10-08'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const empty = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const inMvp = [
  fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 }),
  fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 4, plotY: 1 }),
]
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [mvp, empty],
  tasks: inMvp,
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const island = model.islands.find((i) => i.projectId === beta.id)
if (!island) throw new Error('no beta')
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onEmpty: Focus = { kind: 'district', projectId: beta.id, milestoneId: empty.id }

/** Screen span (px per unit of zoom) of an outline. */
function span(outline: { x: number; z: number }[]) {
  const pts = outline.map((p) => toScreen(p.x, p.z, 1))
  const xs = pts.map((p) => p.sx)
  const ys = pts.map((p) => p.sy)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('focusBounds', () => {
  test('archipelago is the whole world; an island is its shallows square', () => {
    expect(focusBounds(model, { kind: 'archipelago' })).toEqual(model.bounds)
    const s = shallowsRadius(island.radius)
    expect(focusBounds(model, onBeta)).toEqual({
      minX: island.origin.x - s,
      maxX: island.origin.x + s,
      minZ: island.origin.z - s,
      maxZ: island.origin.z + s,
    })
  })

  test('a district box holds its landmark and every plot of its milestone, plus the margin', () => {
    const b = focusBounds(model, onMvp)
    const district = island.districts.find((d) => d.milestoneId === mvp.id)
    const spots = [
      district?.position,
      ...island.structures.filter((s) => s.milestoneId === mvp.id).map((s) => s.position),
    ]
    for (const p of spots) {
      if (!p) throw new Error('missing spot')
      const x = island.origin.x + p.x
      const z = island.origin.z + p.z
      expect(x - b.minX).toBeGreaterThanOrEqual(DISTRICT_MARGIN - 1e-9)
      expect(b.maxX - x).toBeGreaterThanOrEqual(DISTRICT_MARGIN - 1e-9)
      expect(z - b.minZ).toBeGreaterThanOrEqual(DISTRICT_MARGIN - 1e-9)
      expect(b.maxZ - z).toBeGreaterThanOrEqual(DISTRICT_MARGIN - 1e-9)
    }
  })

  test('a district with no tasks is its landmark plus the margin on every side', () => {
    const d = island.districts.find((x) => x.milestoneId === empty.id)
    if (!d) throw new Error('no empty district')
    const cx = island.origin.x + d.position.x
    const cz = island.origin.z + d.position.z
    expect(focusBounds(model, onEmpty)).toEqual({
      minX: cx - DISTRICT_MARGIN,
      maxX: cx + DISTRICT_MARGIN,
      minZ: cz - DISTRICT_MARGIN,
      maxZ: cz + DISTRICT_MARGIN,
    })
  })

  test('unknown ids fall back a level', () => {
    expect(focusBounds(model, { kind: 'island', projectId: 'nope' })).toEqual(model.bounds)
    expect(
      focusBounds(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toEqual(focusBounds(model, onBeta))
  })
})

describe('focusOutline and fitZoom', () => {
  test('an island outline is 12 points on its shallows circle', () => {
    const outline = focusOutline(model, onBeta)
    expect(outline).toHaveLength(12)
    for (const p of outline) {
      expect(Math.hypot(p.x - island.origin.x, p.z - island.origin.z)).toBeCloseTo(
        shallowsRadius(island.radius),
      )
    }
  })

  test('fitZoom is 0 without a viewport, and otherwise fits every point with the margin', () => {
    const outline = focusOutline(model, onBeta)
    expect(fitZoom(outline)).toBe(0)
    const viewport = { width: 1400, height: 800 }
    const zoom = fitZoom(outline, viewport)
    const { w, h } = span(outline)
    expect(w * zoom).toBeLessThanOrEqual(viewport.width * FIT_MARGIN + 1e-6)
    expect(h * zoom).toBeLessThanOrEqual(viewport.height * FIT_MARGIN + 1e-6)
    // Tight on at least one axis.
    expect(Math.max((w * zoom) / viewport.width, (h * zoom) / viewport.height)).toBeCloseTo(
      FIT_MARGIN,
    )
    expect(fitZoom(outline, { width: 2800, height: 1600 })).toBeCloseTo(zoom * 2)
  })
})

describe('cameraTarget with a viewport', () => {
  test('without a viewport the zooms are the floors, as before', () => {
    expect(cameraTarget(model, onBeta).zoom).toBe(ISLAND_ZOOM)
    expect(cameraTarget(model, onMvp).zoom).toBe(DISTRICT_ZOOM)
    expect(cameraTarget(model, { kind: 'archipelago' }).zoom).toBe(ARCHIPELAGO_ZOOM)
  })

  test('a roomy viewport fits the island; a cramped one stops at the floor', () => {
    const roomy = { width: 4000, height: 3000 }
    const fitted = cameraTarget(model, onBeta, null, roomy)
    expect(fitted.zoom).toBeCloseTo(fitZoom(focusOutline(model, onBeta), roomy))
    expect(fitted.zoom).toBeGreaterThan(ISLAND_ZOOM)
    expect(cameraTarget(model, onBeta, null, { width: 300, height: 300 }).zoom).toBe(ISLAND_ZOOM)
    expect(cameraTarget(model, onMvp, null, { width: 300, height: 300 }).zoom).toBe(DISTRICT_ZOOM)
  })

  test('a district target is the centre of its box', () => {
    const b = focusBounds(model, onMvp)
    const t = cameraTarget(model, onMvp, null, { width: 1000, height: 800 })
    expect(t.x).toBeCloseTo((b.minX + b.maxX) / 2)
    expect(t.z).toBeCloseTo((b.minZ + b.maxZ) / 2)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/camera.test.ts` — Expected: FAIL (missing exports).

- [ ] **Step 2: Implement.** In `apps/web/src/scene/model/camera.ts`:

Imports become:

```ts
import type { Focus } from '../../world/selectors'
import { type Point, SQRT3, shallowsRadius } from './hex-space'
import type { Bounds, SceneIsland, SceneModel } from './scene-model'
import { toScreen } from './screen'
```

Add below `MAX_ZOOM_FACTOR`:

```ts
/** The opening zoom fills at most this share of the viewport (spec 19.1). */
export const FIT_MARGIN = 0.9
/** Two hexes of room around a district's landmark and plots. */
export const DISTRICT_MARGIN = 2 * SQRT3

/** The CSS px the camera may fill: the canvas less the HUD on top and the sheet below. */
export type Viewport = { width: number; height: number }

type Level =
  | { kind: 'archipelago' }
  | { kind: 'island'; island: SceneIsland }
  | { kind: 'district'; island: SceneIsland; box: Bounds }

/** The layer a focus resolves to; unknown ids fall back a level. */
function levelOf(model: SceneModel, focus: Focus): Level {
  if (focus.kind === 'archipelago') return { kind: 'archipelago' }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return { kind: 'archipelago' }
  if (focus.kind === 'island') return { kind: 'island', island }
  const district = island.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!district) return { kind: 'island', island }
  const spots = [
    district.position,
    ...island.structures.filter((s) => s.milestoneId === focus.milestoneId).map((s) => s.position),
  ]
  const xs = spots.map((p) => island.origin.x + p.x)
  const zs = spots.map((p) => island.origin.z + p.z)
  return {
    kind: 'district',
    island,
    box: {
      minX: Math.min(...xs) - DISTRICT_MARGIN,
      maxX: Math.max(...xs) + DISTRICT_MARGIN,
      minZ: Math.min(...zs) - DISTRICT_MARGIN,
      maxZ: Math.max(...zs) + DISTRICT_MARGIN,
    },
  }
}

function islandSquare(island: SceneIsland): Bounds {
  const s = shallowsRadius(island.radius)
  return {
    minX: island.origin.x - s,
    maxX: island.origin.x + s,
    minZ: island.origin.z - s,
    maxZ: island.origin.z + s,
  }
}

const corners = (b: Bounds): Point[] => [
  { x: b.minX, z: b.minZ },
  { x: b.maxX, z: b.minZ },
  { x: b.maxX, z: b.maxZ },
  { x: b.minX, z: b.maxZ },
]

/** Where the pan target may go on this layer (spec 19.1). */
export function focusBounds(model: SceneModel, focus: Focus): Bounds {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') return model.bounds
  if (level.kind === 'island') return islandSquare(level.island)
  return level.box
}

/** What the opening zoom must show: the shallows circle of an island, else the bounds' corners. */
export function focusOutline(model: SceneModel, focus: Focus): Point[] {
  const level = levelOf(model, focus)
  if (level.kind === 'island') {
    const { origin, radius } = level.island
    const s = shallowsRadius(radius)
    return Array.from({ length: 12 }, (_, k) => ({
      x: origin.x + s * Math.cos((k * Math.PI) / 6),
      z: origin.z + s * Math.sin((k * Math.PI) / 6),
    }))
  }
  return corners(level.kind === 'district' ? level.box : model.bounds)
}

/** The largest zoom that fits every outline point in the viewport, times FIT_MARGIN; 0 without one. */
export function fitZoom(outline: readonly Point[], viewport?: Viewport): number {
  if (!viewport || outline.length === 0 || viewport.width <= 0 || viewport.height <= 0) return 0
  const pts = outline.map((p) => toScreen(p.x, p.z, 1))
  const xs = pts.map((p) => p.sx)
  const ys = pts.map((p) => p.sy)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  const byWidth = w > 0 ? viewport.width / w : Number.POSITIVE_INFINITY
  const byHeight = h > 0 ? viewport.height / h : Number.POSITIVE_INFINITY
  const fit = Math.min(byWidth, byHeight)
  return Number.isFinite(fit) ? fit * FIT_MARGIN : 0
}
```

Replace `cameraTarget` with:

```ts
/**
 * Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. In
 * archipelago view a known `anchor` island is centred instead of the middle of the world. With a
 * `viewport`, island and district zooms fit their area (spec 19.1), never below their floors.
 */
export function cameraTarget(
  model: SceneModel,
  focus: Focus,
  anchor: string | null = null,
  viewport?: Viewport,
): CameraTarget {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') {
    const { bounds } = model
    const anchored =
      focus.kind === 'archipelago' ? model.islands.find((i) => i.projectId === anchor) : undefined
    return anchored
      ? { x: anchored.origin.x, z: anchored.origin.z, zoom: ARCHIPELAGO_ZOOM }
      : {
          x: (bounds.minX + bounds.maxX) / 2,
          z: (bounds.minZ + bounds.maxZ) / 2,
          zoom: ARCHIPELAGO_ZOOM,
        }
  }
  const fit = fitZoom(focusOutline(model, focus), viewport)
  if (level.kind === 'island') {
    return {
      x: level.island.origin.x,
      z: level.island.origin.z,
      zoom: Math.max(ISLAND_ZOOM, fit),
    }
  }
  return {
    x: (level.box.minX + level.box.maxX) / 2,
    z: (level.box.minZ + level.box.maxZ) / 2,
    zoom: Math.max(DISTRICT_ZOOM, fit),
  }
}
```

Note: an unknown island id on an island/district focus now falls back to the overview *without* an anchor (as before: the old code returned `overview`). Keep `clampToBounds`, `openingIsland` and `focusKey` unchanged.

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene/model` — Expected: PASS, including the existing `describe('camera')` tests in `scene-model.test.ts` (a district with no tasks still targets its landmark exactly).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene/model/camera.ts apps/web/src/scene/model/camera.test.ts
git commit -m "feat(web): derive each layer's pan bounds and fitted zoom"
```

---

### Task 2: The camera stays inside the current layer

**Files:**
- Modify: `apps/web/src/scene/camera-rig.tsx`, `apps/web/src/scene/camera-rig.test.tsx`
- Modify: `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Consumes: `focusBounds`, `cameraTarget(model, focus, anchor, viewport)`, `Viewport` (Task 1); `visibleSize` from `scene/model/screen.ts`.
- Produces: `CameraRigProps.hudInset?: number` (canvas px the HUD covers at the top; default 0).

- [ ] **Step 1: Failing tests.** In `apps/web/src/scene/camera-rig.test.tsx`:
- Import `focusBounds` from `./model/camera` alongside `cameraTarget`.
- In every existing test that mounts on an island focus and pushes past an edge (`'a drag past the edge stretches…'`, `'grabbing a spring-back mid-way…'`, `'momentum that carries the camera past the edge…'`, and any other using `both.bounds` with an island focus), replace `both.bounds` with `focusBounds(both, onGamma)` (or the focus that test mounts). The overview tests (`'a refetch that shrinks the world…'`) keep `model.bounds`: on the archipelago they are the same thing.
- Add `hudInset` to `RigProps` and pass it through `scene(...)` to `<CameraRig hudInset={hudInset} />` (default 0).
- Append:

```ts
  test('on an island, a pan toward the neighbour stops at this island, not the world edge', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const island = focusBounds(both, onGamma)
    expect(island.minX).toBeGreaterThan(both.bounds.minX)
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = island.minX - 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(island.minX)
  })

  test('a district clamps to its own box', async () => {
    const m = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
    const withDistrict = buildSceneModel({ ...worldOf([beta, gamma]), milestones: [m] }, today)
    const onDistrict: Focus = { kind: 'district', projectId: beta.id, milestoneId: m.id }
    const r = await mount({ model: withDistrict, focus: onDistrict })
    const box = focusBounds(withDistrict, onDistrict)
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = box.maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(box.maxX)
  })

  test('the zoom-out limit is the fitted zoom, and follows a cover change at rest', async () => {
    // A big canvas, so the fit beats the floor (at 400×800 it never does).
    const big = (props: RigProps) =>
      ReactThreeTestRenderer.create(scene(props), {
        orthographic: true,
        width: 2000,
        height: 1600,
        camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom: 10 },
      })
    // The sheet starts high: little room, so the limit sits at the floor.
    const r = await big({ model: both, focus: onGamma, animate: false, covered: 1200 })
    expect(controls().minZoom).toBeCloseTo(ISLAND_ZOOM)
    expect(camera().zoom).toBeCloseTo(ISLAND_ZOOM)
    // The sheet drops: the island fits bigger, the limit rises and the camera comes in to it.
    await r.update(scene({ model: both, focus: onGamma, animate: false, covered: 0 }))
    const roomy = cameraTarget(both, onGamma, null, { width: 2000, height: 1600 })
    expect(roomy.zoom).toBeGreaterThan(ISLAND_ZOOM)
    expect(controls().minZoom).toBeCloseTo(roomy.zoom)
    expect(camera().zoom).toBeCloseTo(roomy.zoom)
  })
```

Add `fakeMilestone` to the `../test/fake-api` import. The first existing test (`'the first framing after mount snaps…'`) still expects `ISLAND_ZOOM` at 400×800 (the fit is below the floor there); keep it, it pins the floor.

Run: `cd apps/web && bunx vitest run src/scene/camera-rig.test.tsx` — Expected: the two clamp tests FAIL (the rig clamps to the whole world).

- [ ] **Step 2: Implement.** In `apps/web/src/scene/camera-rig.tsx`:
- Import `focusBounds` with `cameraTarget` from `./model/camera`, and `visibleSize` (plus the existing `Frame`, `View` types) from `./model/screen`.
- Add to `CameraRigProps`:

```ts
  /** Canvas px the HUD covers at the top; the fitted zoom leaves it clear (spec 19.1). */
  hudInset?: number
```

- Destructure `hudInset = 0`. Replace

```ts
  const frame = useFrameSize(covered)
  const target = cameraTarget(model, focus, anchor)
  const latest = useRef({ target, bounds: model.bounds, frame, animate })
  latest.current = { target, bounds: model.bounds, frame, animate }
```

with

```ts
  const frame = useFrameSize(covered)
  const room = visibleSize(frame)
  const target = cameraTarget(model, focus, anchor, {
    width: room.width,
    height: Math.max(0, room.height - hudInset),
  })
  // Pans stay inside the current layer: the whole world, one island or one district.
  const bounds = focusBounds(model, focus)
  const latest = useRef({ target, bounds, frame, animate })
  latest.current = { target, bounds, frame, animate }
```

- Replace the bounds-trigger effect

```ts
  // A refetch can shrink the world under a resting camera; one frame lets the spring check run.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bounds are the trigger
  useEffect(() => {
    invalidate()
  }, [model.bounds, invalidate])
```

with

```ts
  // A refetch can shrink the area under a resting camera; one frame lets the spring check run.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bounds are the trigger
  useEffect(() => {
    invalidate()
  }, [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, invalidate])

  // At rest, a new fit (window resize, sheet detent) moves the zoom-out limit with it, and a camera
  // left zoomed out past it comes in to the limit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fitted zoom is the trigger
  useEffect(() => {
    if (!mounted.current || motion.current.kind !== 'idle') return
    setZoomLimits(target.zoom, target.zoom * MAX_ZOOM_FACTOR)
    if (camera.zoom < target.zoom) {
      show({ ...viewOf(camera), zoom: target.zoom })
      invalidate()
    }
  }, [target.zoom])
```

Keep everything else; the spring and band already read `latest.current.bounds`.

In `apps/web/src/scene/world-scene.tsx`, pass `hudInset={props.hudInset}` to `<CameraRig … />`.

- [ ] **Step 3: Run.** `cd apps/web && bunx vitest run src/scene` — Expected: PASS. If the cover-change test shows the limit lagging one render, check that `useFrameSize` reads the new `covered` in the same render (it does: it is a plain prop).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene/camera-rig.tsx apps/web/src/scene/camera-rig.test.tsx apps/web/src/scene/world-scene.tsx
git commit -m "feat(web): keep pans and zoom-out inside the current island or district"
```

---

### Task 3: More sea between islands, and a lighter ocean

**Files:**
- Modify: `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/model/palette.ts`
- Modify: `apps/web/src/scene/model/foundations.test.ts`, `apps/web/src/scene/model/scene-model.test.ts`, `apps/web/src/scene/model/sea-routes.test.ts`

**Interfaces:**
- Produces: `ISLAND_GAP = 8`; palette keys `shallows`, `seaShallow`, `sea`, `seaDeep` with the values below. Nothing else changes shape.

- [ ] **Step 1: Failing tests.**

In `apps/web/src/scene/model/foundations.test.ts`, test `'scene colours are tokens or blends of tokens'`, replace

```ts
    expect(scenePalette.sea).toBe(colors.brand)
    expect(scenePalette.shallows).toBe(colors.brandSecondary)
```

with

```ts
    expect(scenePalette.shallows).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.6))
    expect(scenePalette.seaShallow).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.45))
    expect(scenePalette.sea).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.3))
    expect(scenePalette.seaDeep).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.15))
```

and append to `describe('palette', …)`:

```ts
  test('the sea lightens from open water to the coast (spec 19.2)', () => {
    const light = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + Number.parseInt(hex.slice(i, i + 2), 16), 0)
    const { seaDeep, sea, seaShallow, shallows } = scenePalette
    expect(light(sea)).toBeGreaterThan(light(seaDeep))
    expect(light(seaShallow)).toBeGreaterThan(light(sea))
    expect(light(shallows)).toBeGreaterThan(light(seaShallow))
    expect([shallows, seaShallow, sea, seaDeep]).toEqual(['#99c3ed', '#73ade7', '#4d96e0', '#2680d9'])
  })
```

In `apps/web/src/scene/model/scene-model.test.ts`, test `'islands never overlap, however large one grows'`, add `ISLAND_GAP` to the `./scene-model` import and `shallowsRadius` to the `./hex-space` import, and add a second pairwise check beside the existing one so it also pins the wider sea:

```ts
          expect(gap).toBeGreaterThanOrEqual(
            shallowsRadius(a.radius) + shallowsRadius(b.radius) + ISLAND_GAP,
          )
```

(Open water between two shallows is now at least `8√3 − 4.4 ≈ 9.5` world units, which clears `ISLAND_GAP` = 8; with the old gap of 3 it was `3√3 − 4.4 ≈ 0.8`, which fails it.)

In `apps/web/src/scene/model/sea-routes.test.ts`, replace the two tests whose premise was "neighbours are too close for a lane":

```ts
  test('adjacent islands now get a lane across the wider sea (spec 19.2)', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0]))
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'lane', key: 'p0|p1' })
  })
```

and

```ts
  test('an island in the gap blocks the long lane but gets its own short ones', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0], [2, 0]))
    expect(routes.map((r) => r.key).sort()).toEqual(['p0|p1', 'p1|p2'])
  })
```

Run: `cd apps/web && bunx vitest run src/scene/model` — Expected: FAIL (old palette, old gap, no adjacent lanes).

- [ ] **Step 2: Implement.**

`apps/web/src/scene/model/scene-model.ts`:

```ts
/** Hex rings of open sea between neighbouring islands' shores (spec 19.2). */
export const ISLAND_GAP = 8
```

`apps/web/src/scene/model/palette.ts`, in `scenePalette`:

```ts
  sea: mix(colors.brandSecondary, colors.surfacePrimary, 0.3),
  shallows: mix(colors.brandSecondary, colors.surfacePrimary, 0.6),
  seaShallow: mix(colors.brandSecondary, colors.surfacePrimary, 0.45),
  seaDeep: mix(colors.brandSecondary, colors.surfacePrimary, 0.15),
```

(replacing the four existing lines; keep key order otherwise).

- [ ] **Step 3: Run the whole web suite.** `bun run --cwd apps/web test`. Other tests that assumed the old layout may now fail: an ambient-life test expecting a loop where neighbours now get a lane, a camera or indicator test with hard-coded world positions, a sea-scatter count. Fix each to the new layout without weakening what it checks (a lane where there was a loop, recomputed positions via `buildSceneModel`), and list every one in your report. Do not change `ISLAND_GAP` or the palette to make a test pass.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/scene
git commit -m "feat(web): space the islands out on a lighter sea"
```

---

### Task 4: Island picker at the top of the scene

**Files:**
- Create: `apps/web/src/world/island-picker.tsx`
- Modify: `apps/web/src/world/world-hud.tsx`, `apps/web/src/world/world-view.tsx`, `apps/web/src/layout/world-screen.tsx`
- Delete: `apps/web/src/world/island-switcher.tsx`
- Modify: `apps/web/src/layout/world-scene-integration.test.tsx`, `apps/web/src/layout/world-screen.test.tsx`

**Interfaces:**
- Consumes: `IslandSummary`, `urgencyOf` (`world/selectors.ts`).
- Produces: `IslandPicker({ summaries, currentProjectId })` and `islandOptionLabel(summary): string`; `WorldHud` gains a `summaries: IslandSummary[]` prop.

The HUD only renders over the WebGL scene (the card fallback has its own island cards), so picker tests live in `world-scene-integration.test.tsx`, which stubs WebGL and the scene.

- [ ] **Step 1: Failing tests.** In `apps/web/src/layout/world-scene-integration.test.tsx` (it already imports `fakeProject`, `fakeTask`, `fakeMilestone`, `createFakeApi`, `renderApp`, `screen`, `within`), add `addDays, todayIn` from `../world/selectors` and append to the main `describe`:

```ts
  describe('island picker', () => {
    function urgentWorld() {
      const today = todayIn('Asia/Jakarta')
      const beta = fakeProject({ name: 'Beta' })
      const gamma = fakeProject({ name: 'Gamma' })
      const calm = fakeProject({ name: 'Calm' })
      const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
      const tasks = [
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -2), plotX: 1, plotY: 0 }),
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -1), plotX: 2, plotY: 0 }),
        fakeTask({ projectId: gamma.id, dueDate: today, plotX: 1, plotY: 0 }),
      ]
      const fake = createFakeApi({
        world: { projects: [beta, gamma, calm], milestones: [mvp], tasks, buildings: [] },
      })
      return { ...fake, beta, gamma, calm, mvp }
    }
    const picker = () => screen.getByRole('combobox', { name: 'Island' })

    test('lists every island with its urgency, after "All islands"', async () => {
      const { api } = urgentWorld()
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      const labels = within(picker())
        .getAllByRole('option')
        .map((o) => o.textContent)
      expect(labels).toEqual(['All islands', 'Beta · 2 overdue', 'Gamma · due soon', 'Calm'])
    })

    test('shows where you are on every layer, on phone and desktop', async () => {
      for (const desktop of [false, true]) {
        const { api, beta, mvp } = urgentWorld()
        const { router, unmount } = renderAppWithUnmount({ api, path: '/', desktop })
        await screen.findByTestId('scene')
        expect(picker()).toHaveDisplayValue('All islands')
        await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
        expect(picker()).toHaveDisplayValue('Beta · 2 overdue')
        await act(() =>
          router.navigate({
            to: '/p/$projectId/m/$milestoneId',
            params: { projectId: beta.id, milestoneId: mvp.id },
          }),
        )
        expect(picker()).toHaveDisplayValue('Beta · 2 overdue')
        unmount()
      }
    })

    test('picking an island flies there; "All islands" goes back out', async () => {
      const { api, gamma } = urgentWorld()
      const { user, router } = renderApp({ api, path: '/', desktop: true })
      await screen.findByTestId('scene')
      await user.selectOptions(picker(), 'Gamma · due soon')
      expect(router.state.location.pathname).toBe(`/p/${gamma.id}`)
      await user.selectOptions(picker(), 'All islands')
      expect(router.state.location.pathname).toBe('/')
    })

    test('a lone calm island is listed plainly', async () => {
      const calm = fakeProject({ name: 'Calm' })
      const { api } = createFakeApi({
        world: { projects: [calm], milestones: [], tasks: [], buildings: [] },
      })
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      expect(within(picker()).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'All islands',
        'Calm',
      ])
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

`renderApp` returns no unmount; for the two loop tests define at the top of the file:

```ts
import { act, cleanup } from '@testing-library/react'
const renderAppWithUnmount = (...args: Parameters<typeof renderApp>) => ({
  ...renderApp(...args),
  unmount: cleanup,
})
```

(merge `act`/`cleanup` into the file's existing `@testing-library/react` import). Replace the existing test `'desktop: nothing covers the scene, and the switcher sits in the side panel'` body's switcher assertions with `expect(within(panel).queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()` and rename it `'desktop: nothing covers the scene, and the side panel has no island chips'`.

In `apps/web/src/layout/world-screen.test.tsx` (card fallback, no WebGL): in `'phone: island cards scroll horizontally…'` drop the `switcher` assertions and assert instead `expect(screen.queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()`; rename it `'phone: island cards scroll horizontally and the panel is a bottom sheet'`. In `'desktop: the panel is a resizable side panel'` replace the two `navigation 'Islands'` lines with the same `not.toBeInTheDocument()` check. If `'on a short phone the tallest detent leaves the strip above it on screen'` relied on the island strip as the sheet accessory, give it an accessory another way (start a shop placement, whose bar rides on the sheet) or, if it cannot get one in the card fallback, assert the tallest detent stays within the window with no strip; report which.

Run: `cd apps/web && bunx vitest run src/layout` — Expected: the picker tests FAIL.

- [ ] **Step 2: The picker.** Create `apps/web/src/world/island-picker.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router'
import type { IslandSummary } from './selectors'

const ALL = ''

/** "Name · N overdue", "Name · due soon", or just the name (spec 19.3). */
export function islandOptionLabel(s: IslandSummary): string {
  if (s.overdue > 0) return `${s.project.name} · ${s.overdue} overdue`
  if (s.dueSoon > 0) return `${s.project.name} · due soon`
  return s.project.name
}

/** Where you are, and a way to any island or back to them all (spec 19.3). */
export function IslandPicker({
  summaries,
  currentProjectId,
}: {
  summaries: IslandSummary[]
  currentProjectId: string | null
}) {
  const navigate = useNavigate()
  return (
    <label className="pointer-events-auto">
      <span className="sr-only">Island</span>
      <select
        value={currentProjectId ?? ALL}
        onChange={(e) => {
          const projectId = e.target.value
          void (projectId === ALL
            ? navigate({ to: '/' })
            : navigate({ to: '/p/$projectId', params: { projectId } }))
        }}
        className="min-h-11 max-w-[70vw] truncate rounded-full border border-border-secondary bg-surface-primary/95 px-4 text-sm font-medium text-text-primary shadow"
      >
        <option value={ALL}>All islands</option>
        {summaries.map((s) => (
          <option key={s.project.id} value={s.project.id}>
            {islandOptionLabel(s)}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 3: Into the HUD.** In `apps/web/src/world/world-hud.tsx`:
- Import `IslandPicker` from `./island-picker` and `type IslandSummary` from `./selectors`.
- Add the prop `summaries: IslandSummary[]` and destructure it.
- Restructure the returned markup so the picker is centred: its own first row on a narrow canvas (phones), the centre column of a three-column row on a wide one. Container queries key it to the scene's width, not the window's:

```tsx
    <div
      ref={root}
      data-testid="world-hud"
      className="@container pointer-events-none absolute inset-x-0 top-0 z-20 p-3"
    >
      <div className="flex flex-col gap-2 @3xl:grid @3xl:grid-cols-[1fr_auto_1fr] @3xl:items-start">
        {summaries.length > 0 && (
          <div className="flex justify-center @3xl:col-start-2 @3xl:row-start-1">
            <IslandPicker summaries={summaries} currentProjectId={project?.id ?? null} />
          </div>
        )}
        <div className="flex flex-wrap items-start gap-2 @3xl:col-start-1 @3xl:row-start-1">
          {/* the existing chips, unchanged: New island / ← Archipelago, Edit island, … */}
        </div>
      </div>
    </div>
```

Move the three existing `focus.kind === …` chip blocks into that inner chips `div` unchanged. The `ResizeObserver` on `root` keeps reporting the full height, both rows included, so edge markers stay below.

In `apps/web/src/world/world-view.tsx`, pass `summaries={summaries}` to `<WorldHud … />`.

- [ ] **Step 4: Out of the drawer.** In `apps/web/src/layout/world-screen.tsx`:
- Remove `import { IslandSwitcher } from '../world/island-switcher'`.
- In the `accessory` prop of `<PanelFrame>`, replace the final `: ( <IslandSwitcher … /> )` branch with `: undefined`, so only the placement bar and the building bar remain.

Delete `apps/web/src/world/island-switcher.tsx` (`git rm`). Confirm nothing else imports it: `grep -rn "island-switcher" apps/web/src` prints nothing.

- [ ] **Step 5: Run and commit.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, 4/4, the one known info.

```bash
git add -A apps/web/src
git commit -m "feat(web): pick islands from the top of the scene instead of the drawer"
```

---

### Task 5: Milestone filter in the island drawer

**Files:**
- Modify: `apps/web/src/tasks/task-panel.tsx`, `apps/web/src/layout/world-screen.tsx`
- Modify: `apps/web/src/layout/world-screen.test.tsx`

**Interfaces:**
- Produces in `tasks/task-panel.tsx`: `ALL_TASKS = 'all'`, `NO_MILESTONE = 'none'`; `TaskPanel` gains optional props `milestones?: readonly MilestoneDto[]`, `milestoneValue?: string`, `onMilestoneChange?: (value: string) => void`, `commonsOnly?: boolean`.

- [ ] **Step 1: Failing tests.** Append to `describe('WorldScreen', …)` in `apps/web/src/layout/world-screen.test.tsx` (its `seeded()` gives `beta` with milestone `mvp`, a loose `'Late one'` and `'MVP task'` in `mvp`, and `gamma`):

```ts
  describe('milestone filter', () => {
    const milestoneSelect = () => screen.getByRole('combobox', { name: 'Milestone' })

    test('is on island and district drawers only, with All tasks, No milestone, then milestones', async () => {
      const { api, beta } = seeded()
      const { router } = renderApp({ api, path: '/', desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Due today & overdue' })
      expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
      expect(
        within(milestoneSelect())
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['All tasks', 'No milestone', 'MVP'])
      expect(milestoneSelect()).toHaveDisplayValue('All tasks')
    })

    test('a milestone flies into its district; All tasks flies back out', async () => {
      const { api, beta, mvp } = seeded()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Beta' })
      await user.selectOptions(milestoneSelect(), 'MVP')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${mvp.id}`)
      expect(await screen.findByRole('heading', { level: 2, name: 'MVP' })).toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('MVP')
      await user.selectOptions(milestoneSelect(), 'All tasks')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    })

    test('No milestone filters the island list, and resets after leaving the island', async () => {
      const { api, beta, gamma } = seeded()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Beta' })
      expect(screen.getByText('MVP task')).toBeInTheDocument()
      await user.selectOptions(milestoneSelect(), 'No milestone')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
      expect(screen.getByText('Late one')).toBeInTheDocument()
      expect(screen.queryByText('MVP task')).not.toBeInTheDocument()
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: gamma.id } }))
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
      expect(await screen.findByText('MVP task')).toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('All tasks')
    })

    test('No milestone from inside a district lands on the island with the filter on', async () => {
      const { api, beta, mvp } = seeded()
      const { user, router } = renderApp({
        api,
        path: `/p/${beta.id}/m/${mvp.id}`,
        desktop: true,
      })
      await screen.findByRole('heading', { level: 2, name: 'MVP' })
      await user.selectOptions(milestoneSelect(), 'No milestone')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
      expect(await screen.findByText('Late one')).toBeInTheDocument()
      expect(screen.queryByText('MVP task')).not.toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('No milestone')
    })

    test('New task takes its milestone from where you are', async () => {
      const { api, beta, mvp } = seeded()
      const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'MVP' })
      await user.click(screen.getByRole('button', { name: 'New task' }))
      const dialog = await screen.findByRole('dialog', { name: 'New task' })
      expect(within(dialog).getByRole('combobox', { name: 'Milestone' })).toHaveDisplayValue('MVP')
    })
  })
```

If the task form's milestone field shows its empty option with different text than you expect, read it from `editors/task-form.tsx`; the assertion that matters is that a district pre-selects its milestone. Within the dialog, scope the "Milestone" query with `within(dialog)` (the drawer has its own "Milestone" select).

Run: `cd apps/web && bunx vitest run src/layout/world-screen.test.tsx` — Expected: the new tests FAIL.

- [ ] **Step 2: The control.** In `apps/web/src/tasks/task-panel.tsx`:
- Change the type import to `import type { MilestoneDto, TaskDto, WorldDto } from '@archipelago/shared'`.
- Add, above the component:

```ts
/** Milestone select values that are not milestone ids (spec 19.4). */
export const ALL_TASKS = 'all'
export const NO_MILESTONE = 'none'
```

- Add the props (with their docs) and destructure them:

```ts
  /** The island's milestones in order; with `onMilestoneChange`, shows the milestone select. */
  milestones?: readonly MilestoneDto[]
  /** ALL_TASKS, NO_MILESTONE or a milestone id. */
  milestoneValue?: string
  onMilestoneChange?: (value: string) => void
  /** Only tasks with no milestone ("No milestone" on the island). */
  commonsOnly?: boolean
```

- Filter: `const tasks = panelTasks(world, focus, today).filter((t) => (!commonsOnly || t.milestoneId === null) && (needle === '' || t.title.toLowerCase().includes(needle)))`.
- Markup: keep the title row with just the `<h2>`; move "New task" into a second row beside the select. Replace the current header `div` with:

```tsx
      <div className="px-4 pt-3">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      {focus.kind !== 'archipelago' && (onNewTask || (milestones && onMilestoneChange)) && (
        <div className="flex items-center gap-2 px-4 pt-2">
          {milestones && onMilestoneChange && (
            <label className="min-w-0 flex-1">
              <span className="sr-only">Milestone</span>
              <select
                value={milestoneValue ?? ALL_TASKS}
                onChange={(e) => onMilestoneChange(e.target.value)}
                className="min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base"
              >
                <option value={ALL_TASKS}>All tasks</option>
                <option value={NO_MILESTONE}>No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onNewTask && (
            <button
              type="button"
              onClick={onNewTask}
              className="ml-auto min-h-11 shrink-0 rounded-md bg-brand px-3 text-sm font-medium text-text-on-brand"
            >
              New task
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 3: The state and the routing.** In `apps/web/src/layout/world-screen.tsx`:
- Import `ALL_TASKS, NO_MILESTONE` with `TaskPanel` from `../tasks/task-panel`.
- Next to the other `useState`s:

```ts
  // "No milestone" on an island: the project it applies to. A route change resets it, except the
  // one hop from a district to its island that the filter itself asks for (spec 19.4).
  const [commonsFor, setCommonsFor] = useState<string | null>(null)
  const pendingCommons = useRef<string | null>(null)
```

- In the existing route-change effect (the one that clears the editor and selections on `[params.projectId, params.milestoneId]`), add:

```ts
    setCommonsFor(pendingCommons.current)
    pendingCommons.current = null
```

- Below `const { project, milestone } = resolved`:

```ts
  const commonsOnly = resolved.focus.kind === 'island' && commonsFor === resolved.focus.projectId
  const islandMilestones = project
    ? world.data.milestones
        .filter((m) => m.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  const milestoneValue =
    resolved.focus.kind === 'district'
      ? resolved.focus.milestoneId
      : commonsOnly
        ? NO_MILESTONE
        : ALL_TASKS
  const pickMilestone = (value: string) => {
    if (!project) return
    const inDistrict = resolved.focus.kind === 'district'
    if (value === ALL_TASKS) {
      if (inDistrict) void navigate({ to: '/p/$projectId', params: { projectId: project.id } })
      else setCommonsFor(null)
      return
    }
    if (value === NO_MILESTONE) {
      if (inDistrict) {
        pendingCommons.current = project.id
        void navigate({ to: '/p/$projectId', params: { projectId: project.id } })
      } else setCommonsFor(project.id)
      return
    }
    void navigate({
      to: '/p/$projectId/m/$milestoneId',
      params: { projectId: project.id, milestoneId: value },
    })
  }
```

- Pass to `<TaskPanel …>`: `milestones={project ? islandMilestones : undefined}`, `milestoneValue={milestoneValue}`, `onMilestoneChange={project ? pickMilestone : undefined}`, `commonsOnly={commonsOnly}`.

`openNewTask` already opens with `milestoneId: null` on the island and the district's milestone in a district, which is what spec 19.4 asks; leave it.

- [ ] **Step 4: Run and commit.** `bun run --cwd apps/web test`, `bun run typecheck`, `bun run lint` — Expected: all pass, 4/4, the one known info. Existing task-panel tests that looked for "New task" in the title row still find it by role.

```bash
git add apps/web/src
git commit -m "feat(web): filter the island drawer by milestone, flying into districts"
```

---

### Task 6: Gate and the owner's check

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

- [ ] **Step 3: Spec sync.** If a task ruled a value away from spec section 19, amend 19 and commit with `docs: …`.

- [ ] **Step 4: Owner's check (manual).** Run `bun run seed:demo`, sign in as `demo@archipelago.local` / `archipelago-dev`, and check on desktop and phone: the picker on every layer; island and district pans stop at their edges and zoom-out stops at the fit; the milestone filter; the spacing and the lighter sea. `?perf` shows no regression from 5d.
