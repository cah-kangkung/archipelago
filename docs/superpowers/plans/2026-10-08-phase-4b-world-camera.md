# Phase 4b World Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the world camera on top of the 4a scene. Routes fly instead of jump, panning past the world's edge stretches and springs back, the camera frames around the phone sheet, opening `/` centres on the island that needs you, off-screen urgent islands get edge markers, and the island switcher rides the task panel.

**Architecture:**
- Pure, Three.js-free maths lives in `apps/web/src/scene/model/`:
  - `screen.ts`: isometric screen projection and framing.
  - `camera-motion.ts`: fly, rubber band and spring.
  - `indicators.ts`: edge-marker placement.
  - `camera.ts`: opening island and the anchored archipelago target.
- Thin R3F components drive that maths from `useFrame`:
  - `CameraRig`: flight, band and spring state machine.
  - `Framing`: `camera.setViewOffset`.
  - `IndicatorProbe`: reports markers to a tiny external store.
- The DOM side handles the rest:
  - `PanelFrame` gains an `accessory` slot (the switcher) and reports how much canvas the phone sheet covers.
  - `WorldView` renders the edge-marker buttons.
  - `WorldScreen` computes the opening anchor.
  - `SceneBoundary` retries on route change.

**Tech Stack:**
- `three` 0.186, `@react-three/fiber` 9.8, `@react-three/drei` 10.7 (`MapControls` comes from `three-stdlib`), `@react-three/test-renderer` 9.1.
- React 19.3, TanStack Router and Query, Vitest 5 + RTL, Biome 2.5, Bun 1.4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`.
- Section 14 is binding.
- Section 13 (4a) and sections 7.3–7.5 give the background.

## Global Constraints

**Commands and tooling:**
- Run web commands from `apps/web`:
  - `bunx vitest run <path>` runs one test file; `bun run test` runs all.
  - `bun run typecheck` typechecks.
- From the repo root, `bun run format` and then `bun run lint` must pass before every commit. One pre-existing info about the deprecated `recommended` setting is expected.
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`: use `import type` for types and index with `?? fallback`. Do not use the `!` non-null assertion.
- Biome style: single quotes, no semicolons, line width 100.

**Scene code rules:**
- Files under `apps/web/src/scene/model/` must not import `three` or `@react-three/*`.
- Colours in scene code come only from `scenePalette`. DOM components use the Tailwind token classes already in use: `bg-error`, `bg-warning`, `bg-surface-primary`, `text-text-on-brand`, `text-text-primary`, `border-brand`.

**Camera geometry:**
- The camera sits at `target + (200, 200, 200)` (`ISO_DISTANCE = 200` in `scene/camera-rig.tsx`), looking at `(target.x, 0, target.z)`.
- Under that camera, a ground offset `(dx, dz)` lands on screen at `sx = zoom·(dx − dz)/√2` (right) and `sy = zoom·(dx + dz)/√6` (down).

**Fixed values (spec section 14):**
- Zooms: archipelago 10, island 48, district 72. Max zoom is 3× the state zoom (`MAX_ZOOM_FACTOR`).
- Flight: 450–900ms, ease-in-out cubic on position, log-space zoom.
- Spring-back: 300ms, ease-out cubic.
- Framing ease: 250ms.
- Rubber band: `band(over, limit) = limit · (1 − 1/(over/limit + 1))`, with `limit` = a quarter of the visible frame's short side, in world units.
- Framing counts at most 50% of `window.innerHeight` of sheet cover.
- Edge markers: 44px buttons, inset 28px, pushed at least 48px apart along the edge.
- Reduced motion: every duration is 0, so every movement snaps.
- localStorage key `archipelago.lastIsland`.
- `SceneBoundary` allows at most 2 resets per page load.

**R3F rules learned in 4a and the 4b spike:**
- drei's `MapControls` re-runs its listener effect whenever `onChange`, `onStart` or `onEnd` change identity. That effect calls `controls.dispose()` and reconnects. Pass only stable callbacks, using `useCallback` with empty deps that read refs.
- drei calls `controls.update()` in `useFrame` at priority −1, which runs before the default-priority callbacks.
- three-stdlib clamps orthographic zoom to `minZoom`/`maxZoom` only while dollying, not on every update.
- `@react-three/test-renderer`'s `advanceFrames(n, delta)` runs each subscriber `n` times in turn (not interleaved) and passes `delta` straight through. Treat `delta` as seconds and accumulate `delta * 1000` ms.

**Process:**
- Commit messages carry no AI attribution and no `Co-Authored-By` trailer.

## Review Focus

1. **A refetch during a flight.** Completing a task refetches `/world` mid-flight. The flight must still land on the destination it started with, not restart or jump (Task 3 test).
2. **A re-render during a drag.** Any `WorldScene` re-render (a refetch, a selection) must not tear down the controls. Otherwise a pan in progress dies (Task 3 test: `controls.dispose` is never called on re-render).
3. **Rotating or resizing the phone.** The view offset must be re-applied at the new canvas size, or framing drifts (Task 5 test).
4. **Deleting the island you're on.** Deleting it navigates to `/`; the remembered "previous" island no longer exists and must be skipped in favour of urgency or the last-viewed island (Task 2 test).
5. **An island whose urgency clears while its marker shows.** Completing the last overdue task must remove the marker without waiting for a pan (Task 5 test).

---
### Task 1: Screen maths and camera motion (pure)

**Files:**
- Create: `apps/web/src/scene/model/screen.ts`, `apps/web/src/scene/model/camera-motion.ts`
- Test: `apps/web/src/scene/model/camera-motion.test.ts`

**Interfaces:**
- Consumes: `Point` from `scene/model/hex-space.ts`; `Bounds` from `scene/model/scene-model.ts`; `clampToBounds(bounds, x, z)` from `scene/model/camera.ts`.
- Produces:
  - `screen.ts`:
    - `type View = { x: number; z: number; zoom: number }`
    - `type Frame = { width: number; height: number; covered: number; framed: number }`
    - `toScreen(dx, dz, zoom): { sx, sy }`
    - `fromScreen(sx, sy, zoom): { dx, dz }`
    - `MAX_FRAMED_SHARE = 0.5`
    - `framedCover(covered, windowHeight): number`
    - `viewCentre(frame): { x, y }`
    - `visibleSize(frame): { width, height }`
  - `camera-motion.ts`:
    - constants `FLY_MIN_MS = 450`, `FLY_MAX_MS = 900`, `SPRING_MS = 300`, `FRAMING_MS = 250`
    - `easeInOutCubic(t)`, `easeOutCubic(t)`
    - `hopZoom(from, to, frame): number | null`
    - `flyFrame(from, to, t, frame): View`
    - `flyDuration(from, to): number`
    - `band(over, limit)`
    - `bandLimit(frame, zoom)`
    - `bandedTarget(bounds, p, limit): Point`
    - `isOutside(bounds, p): boolean`
    - `springFrame(from, to, t): Point`

Ruling recorded for the reviewer: spec 14.1 writes `flyDuration(from, to, viewport)`. The travel measure does not depend on the frame size, so the viewport parameter is dropped.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/model/camera-motion.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  band,
  bandedTarget,
  bandLimit,
  easeInOutCubic,
  FLY_MAX_MS,
  FLY_MIN_MS,
  flyDuration,
  flyFrame,
  hopZoom,
  isOutside,
  springFrame,
} from './camera-motion'
import {
  type Frame,
  framedCover,
  fromScreen,
  toScreen,
  type View,
  viewCentre,
  visibleSize,
} from './screen'

const frame: Frame = { width: 400, height: 800, covered: 0, framed: 0 }
const bounds = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 }

describe('screen', () => {
  test('toScreen and fromScreen are inverse; +x goes right and down, +z goes left and down', () => {
    const { sx, sy } = toScreen(3, -2, 48)
    const back = fromScreen(sx, sy, 48)
    expect(back.dx).toBeCloseTo(3)
    expect(back.dz).toBeCloseTo(-2)
    expect(toScreen(1, 0, 1).sx).toBeGreaterThan(0)
    expect(toScreen(1, 0, 1).sy).toBeGreaterThan(0)
    expect(toScreen(0, 1, 1).sx).toBeLessThan(0)
    expect(toScreen(0, 1, 1).sy).toBeGreaterThan(0)
  })

  test('framedCover counts the sheet up to half the window, never below zero', () => {
    expect(framedCover(120, 800)).toBe(120)
    expect(framedCover(736, 800)).toBe(400)
    expect(framedCover(-5, 800)).toBe(0)
  })

  test('the view centre sits in the middle of the framed area; visible size drops the cover', () => {
    const covered: Frame = { width: 400, height: 800, covered: 500, framed: 400 }
    expect(viewCentre(covered)).toEqual({ x: 200, y: 200 })
    expect(visibleSize(covered)).toEqual({ width: 400, height: 300 })
    expect(viewCentre(frame)).toEqual({ x: 200, y: 400 })
  })
})

describe('flight', () => {
  const from: View = { x: 0, z: 0, zoom: 10 }
  const near: View = { x: 2, z: 1, zoom: 48 }

  test('endpoints are exact', () => {
    expect(flyFrame(from, near, 0, frame)).toEqual(from)
    expect(flyFrame(from, near, 1, frame)).toEqual(near)
    expect(flyFrame(from, near, 1.5, frame)).toEqual(near)
  })

  test('easing is monotonic and symmetric', () => {
    let last = -1
    for (let i = 0; i <= 20; i++) {
      const e = easeInOutCubic(i / 20)
      expect(e).toBeGreaterThanOrEqual(last)
      last = e
    }
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
  })

  test('a short hop zooms in log space: the midpoint zoom is the geometric mean', () => {
    expect(hopZoom(from, near, frame)).toBeNull()
    const mid = flyFrame(from, near, 0.5, frame)
    expect(mid.zoom).toBeCloseTo(Math.sqrt(10 * 48))
    expect(mid.x).toBeCloseTo(1)
  })

  test('a long hop dips its zoom so both endpoints are on screen mid-flight', () => {
    const a: View = { x: 0, z: 0, zoom: 48 }
    const b: View = { x: 60, z: -20, zoom: 48 }
    const dip = hopZoom(a, b, frame)
    expect(dip).not.toBeNull()
    const mid = flyFrame(a, b, 0.5, frame)
    expect(mid.zoom).toBeCloseTo(dip ?? 0)
    expect(mid.zoom).toBeLessThan(48)
    for (const end of [a, b]) {
      const { sx, sy } = toScreen(end.x - mid.x, end.z - mid.z, mid.zoom)
      expect(Math.abs(sx)).toBeLessThanOrEqual(frame.width / 2)
      expect(Math.abs(sy)).toBeLessThanOrEqual(frame.height / 2)
    }
  })

  test('the hop fits the visible area, not the part under the sheet', () => {
    const a: View = { x: 0, z: 0, zoom: 48 }
    const b: View = { x: 0, z: 9, zoom: 48 }
    const open: Frame = { width: 400, height: 800, covered: 0, framed: 0 }
    const sheet: Frame = { width: 400, height: 800, covered: 600, framed: 400 }
    expect(hopZoom(a, b, open)).toBeNull()
    expect(hopZoom(a, b, sheet)).not.toBeNull()
  })

  test('duration stays within 450–900ms and grows with travel', () => {
    const still = flyDuration(from, from)
    const short = flyDuration(from, near)
    const long = flyDuration(from, { x: 200, z: -200, zoom: 10 })
    expect(still).toBe(FLY_MIN_MS)
    expect(short).toBeGreaterThan(still)
    expect(long).toBeGreaterThanOrEqual(short)
    expect(long).toBe(FLY_MAX_MS)
  })
})

describe('rubber band', () => {
  test('band starts at zero, rises monotonically, and never reaches the limit', () => {
    expect(band(0, 5)).toBe(0)
    expect(band(-3, 5)).toBe(0)
    let last = 0
    for (const over of [0.1, 1, 5, 50, 5000]) {
      const shown = band(over, 5)
      expect(shown).toBeGreaterThan(last)
      expect(shown).toBeLessThan(5)
      expect(shown).toBeLessThanOrEqual(over)
      last = shown
    }
    // Continuous across the edge: a tiny overshoot shows almost all of itself.
    expect(band(0.001, 5)).toBeCloseTo(0.001, 5)
  })

  test('bandLimit is a quarter of the visible short side in world units', () => {
    expect(bandLimit(frame, 10)).toBe(10)
    expect(bandLimit({ width: 400, height: 800, covered: 640, framed: 400 }, 10)).toBe(4)
  })

  test('bandedTarget leaves points inside alone and pulls overshoot in per axis', () => {
    expect(bandedTarget(bounds, { x: 3, z: -2 }, 4)).toEqual({ x: 3, z: -2 })
    const p = bandedTarget(bounds, { x: 30, z: -25 }, 4)
    expect(p.x).toBeGreaterThan(10)
    expect(p.x).toBeLessThan(14)
    expect(p.z).toBeLessThan(-5)
    expect(p.z).toBeGreaterThan(-9)
  })

  test('isOutside and the spring that brings the target home', () => {
    expect(isOutside(bounds, { x: 10, z: 5 })).toBe(false)
    expect(isOutside(bounds, { x: 10.01, z: 0 })).toBe(true)
    const from = { x: 13, z: 0 }
    const to = { x: 10, z: 0 }
    expect(springFrame(from, to, 0)).toEqual(from)
    expect(springFrame(from, to, 1)).toEqual(to)
    const mid = springFrame(from, to, 0.5)
    expect(mid.x).toBeLessThan(11.5) // ease-out: more than half way at half time
    expect(mid.x).toBeGreaterThan(10)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/scene/model/camera-motion.test.ts`
Expected: FAIL. Vite cannot resolve `./camera-motion` and `./screen`.

- [ ] **Step 3: Implement `screen.ts`**

`apps/web/src/scene/model/screen.ts`:

```ts
/** A camera view: the ground point it looks at and its orthographic zoom (pixels per world unit). */
export type View = { x: number; z: number; zoom: number }

/**
 * The canvas in CSS pixels. `covered` is how much of its bottom the phone sheet hides; `framed` is
 * the part of that cover the camera centres around (capped, see `framedCover`).
 */
export type Frame = { width: number; height: number; covered: number; framed: number }

const SQRT2 = Math.SQRT2
const SQRT6 = Math.sqrt(6)

/** Screen offset in px (x right, y down) of a ground offset under the isometric camera. */
export function toScreen(dx: number, dz: number, zoom: number): { sx: number; sy: number } {
  return { sx: (zoom * (dx - dz)) / SQRT2, sy: (zoom * (dx + dz)) / SQRT6 }
}

/** The ground offset that lands at screen offset (sx, sy). */
export function fromScreen(sx: number, sy: number, zoom: number): { dx: number; dz: number } {
  const diff = (sx * SQRT2) / zoom
  const sum = (sy * SQRT6) / zoom
  return { dx: (sum + diff) / 2, dz: (sum - diff) / 2 }
}

/** At most this share of the window height of sheet cover is framed around (spec §14.3). */
export const MAX_FRAMED_SHARE = 0.5

export function framedCover(covered: number, windowHeight: number): number {
  return Math.max(0, Math.min(covered, windowHeight * MAX_FRAMED_SHARE))
}

/** Where the look-at point lands on the canvas: the middle of the framed area. */
export function viewCentre(frame: Frame): { x: number; y: number } {
  return { x: frame.width / 2, y: (frame.height - frame.framed) / 2 }
}

/** The part of the canvas the sheet does not cover. */
export function visibleSize(frame: Frame): { width: number; height: number } {
  return { width: frame.width, height: Math.max(0, frame.height - frame.covered) }
}
```

- [ ] **Step 4: Implement `camera-motion.ts`**

`apps/web/src/scene/model/camera-motion.ts`:

```ts
import { clampToBounds } from './camera'
import type { Point } from './hex-space'
import type { Bounds } from './scene-model'
import { type Frame, toScreen, type View, visibleSize } from './screen'

export const FLY_MIN_MS = 450
export const FLY_MAX_MS = 900
export const SPRING_MS = 300
export const FRAMING_MS = 250

/** At the widest point of a hop, both endpoints sit inside this share of the visible area. */
const HOP_FILL = 0.8
/** Flight time per pixel of on-screen travel, and the travel one zoom doubling counts as. */
const MS_PER_PX = 0.5
const PX_PER_DOUBLING = 200

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

/**
 * The zoom a flight dips to so both endpoints stay on screen mid-flight, or null when they already
 * fit at the smaller of the two zooms.
 */
export function hopZoom(from: View, to: View, frame: Frame): number | null {
  const { sx, sy } = toScreen(to.x - from.x, to.z - from.z, 1)
  const { width, height } = visibleSize(frame)
  const fit = Math.min(
    sx === 0 ? Infinity : (width * HOP_FILL) / Math.abs(sx),
    sy === 0 ? Infinity : (height * HOP_FILL) / Math.abs(sy),
  )
  return fit < Math.min(from.zoom, to.zoom) ? fit : null
}

/** The view `t` (0–1) of the way through a flight. */
export function flyFrame(from: View, to: View, t: number, frame: Frame): View {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const logFrom = Math.log(from.zoom)
  const logTo = Math.log(to.zoom)
  let logZoom = logFrom + (logTo - logFrom) * e
  const hop = hopZoom(from, to, frame)
  if (hop !== null) {
    // A bump in log space that reaches the hop zoom exactly at the middle of the flight.
    const dip = (logFrom + logTo) / 2 - Math.log(hop)
    logZoom -= dip * 4 * e * (1 - e)
  }
  return {
    x: from.x + (to.x - from.x) * e,
    z: from.z + (to.z - from.z) * e,
    zoom: Math.exp(logZoom),
  }
}

/** Longer flights for more on-screen travel: pan pixels at the wider zoom plus zoom doublings. */
export function flyDuration(from: View, to: View): number {
  const { sx, sy } = toScreen(to.x - from.x, to.z - from.z, Math.min(from.zoom, to.zoom))
  const travel = Math.hypot(sx, sy) + PX_PER_DOUBLING * Math.abs(Math.log2(to.zoom / from.zoom))
  return Math.min(FLY_MAX_MS, FLY_MIN_MS + travel * MS_PER_PX)
}

/** Rubber-band displacement shown for an overshoot: 1:1 at first, never reaching `limit`. */
export function band(over: number, limit: number): number {
  if (over <= 0 || limit <= 0) return 0
  return limit * (1 - 1 / (over / limit + 1))
}

/** The furthest the band stretches: a quarter of the visible short side, in world units. */
export function bandLimit(frame: Frame, zoom: number): number {
  const { width, height } = visibleSize(frame)
  return Math.min(width, height) / 4 / zoom
}

function bandAxis(value: number, min: number, max: number, limit: number): number {
  if (value < min) return min - band(min - value, limit)
  if (value > max) return max + band(value - max, limit)
  return value
}

/** Where a drag that would reach `p` is shown: past the bounds it stretches with resistance. */
export function bandedTarget(bounds: Bounds, p: Point, limit: number): Point {
  return {
    x: bandAxis(p.x, bounds.minX, bounds.maxX, limit),
    z: bandAxis(p.z, bounds.minZ, bounds.maxZ, limit),
  }
}

export function isOutside(bounds: Bounds, p: Point): boolean {
  const inside = clampToBounds(bounds, p.x, p.z)
  return inside.x !== p.x || inside.z !== p.z
}

/** The target `t` (0–1) of the way through a spring back to the bounds. */
export function springFrame(from: Point, to: Point, t: number): Point {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeOutCubic(clamp01(t))
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run src/scene/model/camera-motion.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene/model/screen.ts apps/web/src/scene/model/camera-motion.ts apps/web/src/scene/model/camera-motion.test.ts
git commit -m "feat(web): add pure isometric screen maths, flights and the rubber band"
```

---

### Task 2: Edge-indicator placement and opening island (pure)

**Files:**
- Create: `apps/web/src/scene/model/indicators.ts`
- Modify: `apps/web/src/scene/model/camera.ts` (add `openingIsland`; give `cameraTarget` an `anchor` parameter)
- Test: `apps/web/src/scene/model/indicators.test.ts`
- Modify (test): `apps/web/src/scene/model/scene-model.test.ts` (`describe('camera')` block)

**Interfaces:**
- Consumes: `View`, `Frame`, `toScreen`, `viewCentre`, `visibleSize` from Task 1 (`scene/model/screen.ts`).
- Produces:
  - `indicators.ts`:
    - `type Urgency = 'overdue' | 'due-soon'`
    - `type IslandUrgency = { projectId: string; name: string; urgency: Urgency; count: number }`
    - `type UrgentIsland = IslandUrgency & { x: number; z: number; extent: number }`
    - `type EdgeIndicator = IslandUrgency & { left: number; top: number; angle: number }`. `left`/`top` are canvas px of the marker centre, rounded to whole px. `angle` is in radians, 0 = pointing right, positive = clockwise, rounded to 0.01.
    - `INDICATOR_INSET = 28`, `INDICATOR_SPACING = 48`
    - `edgeIndicators(islands, view, frame): EdgeIndicator[]`
  - `camera.ts`:
    - `openingIsland(summaries, previous, lastViewed): string | null`
    - `cameraTarget(model, focus, anchor: string | null = null)`. In archipelago focus, a known anchor island is centred at `ARCHIPELAGO_ZOOM`.

- [ ] **Step 1: Write the failing indicator tests**

`apps/web/src/scene/model/indicators.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  edgeIndicators,
  INDICATOR_INSET,
  INDICATOR_SPACING,
  type UrgentIsland,
} from './indicators'
import { type Frame, fromScreen, type View } from './screen'

const view: View = { x: 0, z: 0, zoom: 10 }
const frame: Frame = { width: 400, height: 800, covered: 0, framed: 0 }

/** An urgent island whose centre lands `sx`, `sy` px from the view centre. */
function islandAt(sx: number, sy: number, id = 'a', extent = 2): UrgentIsland {
  const { dx, dz } = fromScreen(sx, sy, view.zoom)
  return { projectId: id, name: id, urgency: 'overdue', count: 2, x: dx, z: dz, extent }
}

describe('edgeIndicators', () => {
  test('islands on screen, or only partly off it, get no marker', () => {
    expect(edgeIndicators([islandAt(0, 0)], view, frame)).toEqual([])
    // Centre 10px past the right edge, but its 20px-wide shore still shows.
    expect(edgeIndicators([islandAt(210, 0)], view, frame)).toEqual([])
  })

  test('a marker sits on the inset edge facing its island, on each side', () => {
    const right = edgeIndicators([islandAt(1000, 0)], view, frame)[0]
    expect(right).toMatchObject({ left: 400 - INDICATOR_INSET, top: 400, angle: 0 })
    const left = edgeIndicators([islandAt(-1000, 0)], view, frame)[0]
    expect(left).toMatchObject({ left: INDICATOR_INSET, top: 400 })
    expect(Math.abs(left?.angle ?? 0)).toBeCloseTo(Math.PI, 2)
    const up = edgeIndicators([islandAt(0, -1000)], view, frame)[0]
    expect(up).toMatchObject({ left: 200, top: INDICATOR_INSET })
    expect(up?.angle).toBeCloseTo(-Math.PI / 2, 2)
    const down = edgeIndicators([islandAt(0, 1000)], view, frame)[0]
    expect(down).toMatchObject({ left: 200, top: 800 - INDICATOR_INSET })
  })

  test('a corner-ward island lands on whichever edge its ray meets first, pointing at it', () => {
    const [marker] = edgeIndicators([islandAt(1000, 2000)], view, frame)
    expect(marker?.left).toBe(400 - INDICATOR_INSET)
    expect(marker?.top).toBeGreaterThan(400)
    expect(marker?.top).toBeLessThanOrEqual(800 - INDICATOR_INSET)
    const expected = Math.atan2(400 + 2000 - (marker?.top ?? 0), 200 + 1000 - (marker?.left ?? 0))
    expect(marker?.angle).toBeCloseTo(expected, 2)
  })

  test('markers carry the island’s name, urgency and count', () => {
    const island = { ...islandAt(1000, 0), name: 'Alpha', urgency: 'due-soon' as const, count: 3 }
    expect(edgeIndicators([island], view, frame)[0]).toMatchObject({
      projectId: 'a',
      name: 'Alpha',
      urgency: 'due-soon',
      count: 3,
    })
  })

  test('markers that would overlap are pushed apart along the edge', () => {
    const markers = edgeIndicators(
      [islandAt(1000, 0, 'a'), islandAt(1000, 10, 'b'), islandAt(1000, 12, 'c')],
      view,
      frame,
    )
    expect(markers).toHaveLength(3)
    const tops = markers.map((m) => m.top).sort((p, q) => p - q)
    for (let i = 1; i < tops.length; i++) {
      expect((tops[i] ?? 0) - (tops[i - 1] ?? 0)).toBeGreaterThanOrEqual(INDICATOR_SPACING)
    }
    for (const m of markers) expect(m.left).toBe(400 - INDICATOR_INSET)
  })

  test('a covered bottom lifts the bottom edge and the ray origin', () => {
    // 300px of sheet: the view centre sits at y = 250 and the visible area ends at y = 500.
    const sheet: Frame = { width: 400, height: 800, covered: 300, framed: 300 }
    const [marker] = edgeIndicators([islandAt(0, 1000)], view, sheet)
    expect(marker).toMatchObject({ left: 200, top: 500 - INDICATOR_INSET })
    // An island in the covered strip counts as off screen.
    expect(edgeIndicators([islandAt(0, 400)], view, sheet)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write the failing camera tests**

In `apps/web/src/scene/model/scene-model.test.ts`, add `openingIsland` to the existing import from `./camera`. Append these tests inside `describe('camera', ...)`:

```ts
  test('cameraTarget centres an archipelago anchor island, and ignores an unknown one', () => {
    const home = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
    const p = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
    const model = buildSceneModel(world({ projects: [home, p] }), today)
    const island = model.islands.find((i) => i.projectId === p.id)
    expect(cameraTarget(model, { kind: 'archipelago' }, p.id)).toEqual({
      ...island?.origin,
      zoom: ARCHIPELAGO_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'archipelago' }, 'gone')).toEqual(
      cameraTarget(model, { kind: 'archipelago' }),
    )
    // The anchor only matters in archipelago view.
    expect(cameraTarget(model, { kind: 'island', projectId: home.id }, p.id).zoom).toBe(ISLAND_ZOOM)
  })

  test('openingIsland: stepping out, then urgency, then last viewed, else none', () => {
    const s = (id: string, overdue: number, dueSoon: number) => ({
      project: { id },
      overdue,
      dueSoon,
    })
    const calm = [s('a', 0, 0), s('b', 0, 0)]
    const urgent = [s('a', 0, 3), s('b', 1, 0), s('c', 1, 2)]
    expect(openingIsland(urgent, 'a', 'b')).toBe('a')
    expect(openingIsland(urgent, null, 'a')).toBe('c') // overdue first, due-soon breaks the tie
    expect(openingIsland([s('a', 1, 0), s('b', 1, 0)], null, null)).toBe('a') // switcher order
    expect(openingIsland(calm, null, 'b')).toBe('b')
    expect(openingIsland(calm, null, null)).toBeNull()
  })

  test('openingIsland skips a deleted previous or last-viewed island', () => {
    const s = (id: string, overdue: number) => ({ project: { id }, overdue, dueSoon: 0 })
    expect(openingIsland([s('a', 0), s('b', 2)], 'deleted', null)).toBe('b')
    expect(openingIsland([s('a', 0)], 'deleted', 'also-deleted')).toBeNull()
    expect(openingIsland([s('a', 0)], 'deleted', 'a')).toBe('a')
  })
```

`ISLAND_ZOOM` and `ARCHIPELAGO_ZOOM` are already imported in this file.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/scene/model/indicators.test.ts src/scene/model/scene-model.test.ts`
Expected: FAIL. `./indicators` does not resolve, and `openingIsland` is not exported.

- [ ] **Step 4: Implement `indicators.ts`**

`apps/web/src/scene/model/indicators.ts`:

```ts
import { type Frame, toScreen, type View, viewCentre, visibleSize } from './screen'

export type Urgency = 'overdue' | 'due-soon'
export type IslandUrgency = { projectId: string; name: string; urgency: Urgency; count: number }
/** An urgent island placed in the world: its origin and how far its shore reaches. */
export type UrgentIsland = IslandUrgency & { x: number; z: number; extent: number }
/** A marker's centre in canvas px and the direction (radians, clockwise from right) it points. */
export type EdgeIndicator = IslandUrgency & { left: number; top: number; angle: number }

export const INDICATOR_INSET = 28
export const INDICATOR_SPACING = 48

type Rect = { left: number; top: number; right: number; bottom: number }
type Placed = { island: UrgentIsland; target: { x: number; y: number }; s: number }

/** Distance clockwise around `rect` from its top-left corner to a point on its border. */
function toPerimeter(rect: Rect, x: number, y: number): number {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  if (y <= rect.top) return x - rect.left
  if (x >= rect.right) return w + (y - rect.top)
  if (y >= rect.bottom) return w + h + (rect.right - x)
  return 2 * w + h + (rect.bottom - y)
}

function fromPerimeter(rect: Rect, s: number): { x: number; y: number } {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  const around = 2 * (w + h)
  const d = ((s % around) + around) % around
  if (d <= w) return { x: rect.left + d, y: rect.top }
  if (d <= w + h) return { x: rect.right, y: rect.top + (d - w) }
  if (d <= 2 * w + h) return { x: rect.right - (d - w - h), y: rect.bottom }
  return { x: rect.left, y: rect.bottom - (d - 2 * w - h) }
}

/**
 * Markers for urgent islands that lie wholly outside the visible canvas: each sits where a ray from
 * the middle of the visible area toward its island meets the inset border (spec §14.4).
 */
export function edgeIndicators(
  islands: readonly UrgentIsland[],
  view: View,
  frame: Frame,
): EdgeIndicator[] {
  const visible = visibleSize(frame)
  const centre = viewCentre(frame)
  const eye = { x: visible.width / 2, y: visible.height / 2 }
  const rect: Rect = {
    left: INDICATOR_INSET,
    top: INDICATOR_INSET,
    right: visible.width - INDICATOR_INSET,
    bottom: visible.height - INDICATOR_INSET,
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) return []

  const placed: Placed[] = []
  for (const island of islands) {
    const { sx, sy } = toScreen(island.x - view.x, island.z - view.z, view.zoom)
    const target = { x: centre.x + sx, y: centre.y + sy }
    // A ground disc of radius `extent` projects to an ellipse with these semi-axes.
    const rx = island.extent * view.zoom
    const ry = rx / Math.sqrt(3)
    const offscreen =
      target.x + rx < 0 ||
      target.x - rx > visible.width ||
      target.y + ry < 0 ||
      target.y - ry > visible.height
    if (!offscreen) continue
    const dx = target.x - eye.x
    const dy = target.y - eye.y
    const tx = dx > 0 ? (rect.right - eye.x) / dx : dx < 0 ? (rect.left - eye.x) / dx : Infinity
    const ty = dy > 0 ? (rect.bottom - eye.y) / dy : dy < 0 ? (rect.top - eye.y) / dy : Infinity
    const t = Math.min(tx, ty)
    const x = Math.min(rect.right, Math.max(rect.left, eye.x + dx * t))
    const y = Math.min(rect.bottom, Math.max(rect.top, eye.y + dy * t))
    placed.push({ island, target, s: toPerimeter(rect, x, y) })
  }

  placed.sort((a, b) => a.s - b.s)
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]
    const cur = placed[i]
    if (prev && cur && cur.s - prev.s < INDICATOR_SPACING) cur.s = prev.s + INDICATOR_SPACING
  }

  return placed.map(({ island, target, s }) => {
    const at = fromPerimeter(rect, s)
    const angle = Math.atan2(target.y - at.y, target.x - at.x)
    return {
      projectId: island.projectId,
      name: island.name,
      urgency: island.urgency,
      count: island.count,
      left: Math.round(at.x),
      top: Math.round(at.y),
      angle: Math.round(angle * 100) / 100,
    }
  })
}
```

- [ ] **Step 5: Extend `camera.ts`**

In `apps/web/src/scene/model/camera.ts`, replace `cameraTarget` and add `openingIsland`:

```ts
/**
 * Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. In
 * archipelago view a known `anchor` island is centred instead of the middle of the world.
 */
export function cameraTarget(
  model: SceneModel,
  focus: Focus,
  anchor: string | null = null,
): CameraTarget {
  const { bounds } = model
  const overview = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    zoom: ARCHIPELAGO_ZOOM,
  }
  if (focus.kind === 'archipelago') {
    const anchored = model.islands.find((i) => i.projectId === anchor)
    return anchored
      ? { x: anchored.origin.x, z: anchored.origin.z, zoom: ARCHIPELAGO_ZOOM }
      : overview
  }
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

type OpeningCandidate = { project: { id: string }; overdue: number; dueSoon: number }

/**
 * The island the archipelago opens on (spec §14.2): the island just stepped out of, else the most
 * urgent one (overdue first, then due soon, then switcher order), else the last viewed. Ids that
 * are no longer in `summaries` are skipped.
 */
export function openingIsland(
  summaries: readonly OpeningCandidate[],
  previous: string | null,
  lastViewed: string | null,
): string | null {
  const known = (id: string | null): id is string =>
    id !== null && summaries.some((s) => s.project.id === id)
  if (known(previous)) return previous
  let best: OpeningCandidate | undefined
  for (const s of summaries) {
    if (s.overdue + s.dueSoon === 0) continue
    if (
      !best ||
      s.overdue > best.overdue ||
      (s.overdue === best.overdue && s.dueSoon > best.dueSoon)
    ) {
      best = s
    }
  }
  if (best) return best.project.id
  return known(lastViewed) ? lastViewed : null
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx vitest run src/scene/model/indicators.test.ts src/scene/model/scene-model.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene/model/indicators.ts apps/web/src/scene/model/indicators.test.ts apps/web/src/scene/model/camera.ts apps/web/src/scene/model/scene-model.test.ts
git commit -m "feat(web): place edge indicators and pick the opening island"
```

---

### Task 3: Camera rig — flight, interruption, rubber band, spring

**Files:**
- Create: `apps/web/src/scene/use-frame-size.ts`
- Modify: `apps/web/src/scene/camera-rig.tsx` (full rewrite), `apps/web/src/scene/world-scene.tsx` (pass `animate` to the rig)
- Test: `apps/web/src/scene/camera-rig.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `flyFrame`, `flyDuration`, `bandedTarget`, `bandLimit`, `isOutside`, `springFrame`, `SPRING_MS`, `framedCover`, `View`, `Frame`.
  - From Task 2: `cameraTarget(model, focus, anchor)`.
  - Unchanged: `clampToBounds`, `focusKey`, `MAX_ZOOM_FACTOR`.
- Produces:
  - `useFrameSize(covered: number): Frame` (`scene/use-frame-size.ts`).
  - `CameraRig` props `{ model: SceneModel; focus: Focus; anchor?: string | null; covered?: number; animate?: boolean }`, defaulting to `null`, `0` and `true`. Tasks 4–6 pass the real `covered` and `anchor`.
  - `ISO_DISTANCE` stays exported from `camera-rig.tsx`.

Behaviour (spec 14.1):
- A `focusKey` change flies from the current view to `cameraTarget(...)`.
  - The first framing after mount snaps, and so does every route change when `animate` is false.
  - Zoom limits are lifted during a flight and set to `[target.zoom, 3×]` on landing.
- MapControls `start` (pointer-down or wheel) ends a flight or spring in place.
  - After an interrupted flight, the zoom limits widen to include the current zoom, so a wheel does not jump.
- While idle, every controls `change` re-maps the target through `bandedTarget`, keeping the unbanded "raw" target in a ref.
- On any idle frame while nobody is dragging, a target outside `model.bounds` has its momentum cancelled and springs to the clamped point over `SPRING_MS`, or snaps when `animate` is false. This covers release past the edge, momentum carried past it, and a refetch that shrinks the bounds.
- `onChange`, `onStart` and `onEnd` are stable `useCallback`s (see Global Constraints).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/scene/camera-rig.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject } from '../test/fake-api'
import type { Focus } from '../world/selectors'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { cameraTarget, ISLAND_ZOOM, MAX_ZOOM_FACTOR } from './model/camera'
import { flyDuration } from './model/camera-motion'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import type { View } from './model/screen'

type Controls = {
  target: THREE.Vector3
  minZoom: number
  maxZoom: number
  dispose: () => void
  dispatchEvent: (event: { type: string }) => void
}

const today = '2026-10-08'
const economy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0 })
const worldOf = (projects: WorldDto['projects']): WorldDto => ({
  projects,
  milestones: [],
  tasks: [],
  buildings: [],
  economy,
})
const both = buildSceneModel(worldOf([beta, gamma]), today)
const archipelago: Focus = { kind: 'archipelago' }
const onGamma: Focus = { kind: 'island', projectId: gamma.id }

const grab: { camera?: THREE.Camera & { zoom: number }; controls?: Controls } = {}
function Grab() {
  grab.camera = useThree((s) => s.camera)
  grab.controls = (useThree((s) => s.controls) ?? undefined) as unknown as Controls | undefined
  return null
}

type RigProps = { model: SceneModel; focus: Focus; animate?: boolean }
const scene = ({ model, focus, animate = true }: RigProps) => (
  <>
    <CameraRig model={model} focus={focus} animate={animate} />
    <Grab />
  </>
)

const mount = (props: RigProps) =>
  ReactThreeTestRenderer.create(scene(props), {
    orthographic: true,
    width: 400,
    height: 800,
    camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom: 10 },
  })

function camera() {
  if (!grab.camera) throw new Error('no camera')
  return grab.camera
}
function controls() {
  if (!grab.controls) throw new Error('no controls')
  return grab.controls
}
const view = (): View => ({
  x: camera().position.x - ISO_DISTANCE,
  z: camera().position.z - ISO_DISTANCE,
  zoom: camera().zoom,
})
function expectView(actual: View, expected: View) {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.z).toBeCloseTo(expected.z)
  expect(actual.zoom).toBeCloseTo(expected.zoom)
}

describe('CameraRig', () => {
  test('the first framing after mount snaps to the target and sets the zoom limits', async () => {
    await mount({ model: both, focus: onGamma })
    expectView(view(), cameraTarget(both, onGamma))
    expect(controls().minZoom).toBe(ISLAND_ZOOM)
    expect(controls().maxZoom).toBe(ISLAND_ZOOM * MAX_ZOOM_FACTOR)
  })

  test('a route change flies: partway mid-flight, on target once the duration has passed', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const start = view()
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(1, 0.1)
    const mid = view()
    expect(Math.abs(mid.x - start.x)).toBeGreaterThan(0.01)
    expect(Math.abs(mid.x - goal.x)).toBeGreaterThan(0.01)
    await r.advanceFrames(Math.ceil(flyDuration(start, goal) / 100), 0.1)
    expectView(view(), goal)
    expect(controls().minZoom).toBe(ISLAND_ZOOM)
  })

  test('a controls start mid-flight leaves the camera where it is, inside its zoom limits', async () => {
    const r = await mount({ model: both, focus: archipelago })
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(3, 0.1)
    const mid = view()
    controls().dispatchEvent({ type: 'start' })
    await r.advanceFrames(20, 0.1)
    expectView(view(), mid)
    expect(controls().minZoom).toBeLessThanOrEqual(mid.zoom)
    expect(controls().maxZoom).toBeGreaterThanOrEqual(mid.zoom)
    controls().dispatchEvent({ type: 'end' })
    await r.advanceFrames(20, 0.1)
    expectView(view(), mid)
  })

  test('reduced motion snaps on a route change', async () => {
    const r = await mount({ model: both, focus: archipelago, animate: false })
    await r.update(scene({ model: both, focus: onGamma, animate: false }))
    expectView(view(), cameraTarget(both, onGamma))
  })

  test('a refetch mid-flight neither restarts nor redirects the flight', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    const before = Math.abs(goal.x - view().x)
    await r.update(scene({ model: buildSceneModel(worldOf([beta, gamma]), today), focus: onGamma }))
    await r.advanceFrames(1, 0.1)
    expect(Math.abs(goal.x - view().x)).toBeLessThan(before)
    await r.advanceFrames(20, 0.1)
    expectView(view(), goal)
  })

  test('a re-render never tears the controls down', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const dispose = vi.spyOn(controls(), 'dispose')
    await r.update(scene({ model: buildSceneModel(worldOf([beta, gamma]), today), focus: onGamma }))
    await r.update(scene({ model: both, focus: onGamma }))
    expect(dispose).not.toHaveBeenCalled()
  })

  test('a drag past the edge stretches with resistance, then springs back on release', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const { maxX } = both.bounds
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    const stretched = view().x
    expect(stretched).toBeGreaterThan(maxX)
    expect(stretched).toBeLessThan(maxX + 400 / 4 / ISLAND_ZOOM)

    c.dispatchEvent({ type: 'end' })
    // Frame 1 notices the overshoot and starts the spring; frame 2 is 100ms into it.
    await r.advanceFrames(2, 0.1)
    expect(view().x).toBeLessThan(stretched)
    expect(view().x).toBeGreaterThan(maxX)
    await r.advanceFrames(5, 0.1)
    expect(view().x).toBeCloseTo(maxX)
  })

  test('a refetch that shrinks the world springs a resting camera back inside', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const before = view()
    const small = buildSceneModel(worldOf([beta]), today)
    expect(before.x).toBeGreaterThan(small.bounds.maxX)
    await r.update(scene({ model: small, focus: archipelago }))
    await r.advanceFrames(6, 0.1)
    expectView(view(), {
      x: small.bounds.maxX,
      z: Math.min(small.bounds.maxZ, Math.max(small.bounds.minZ, before.z)),
      zoom: before.zoom,
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/scene/camera-rig.test.tsx`
Expected: FAIL. The 4a rig snaps instead of flying ("partway" fails) and hard-clamps instead of stretching. It also passes inline `onChange`, so `dispose` is called on re-render.

- [ ] **Step 3: Add `use-frame-size.ts`**

`apps/web/src/scene/use-frame-size.ts`:

```ts
import { useThree } from '@react-three/fiber'
import { type Frame, framedCover } from './model/screen'

/** The canvas size plus how much of it the phone sheet covers, and how much of that is framed. */
export function useFrameSize(covered: number): Frame {
  const size = useThree((s) => s.size)
  return {
    width: size.width,
    height: size.height,
    covered,
    framed: framedCover(covered, window.innerHeight),
  }
}
```

- [ ] **Step 4: Rewrite `camera-rig.tsx`**

`apps/web/src/scene/camera-rig.tsx`:

```tsx
import { MapControls } from '@react-three/drei'
import { type Camera, useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { cameraTarget, clampToBounds, focusKey, MAX_ZOOM_FACTOR } from './model/camera'
import {
  bandedTarget,
  bandLimit,
  flyDuration,
  flyFrame,
  isOutside,
  SPRING_MS,
  springFrame,
} from './model/camera-motion'
import type { Point } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import type { View } from './model/screen'
import { useFrameSize } from './use-frame-size'

/** The camera sits this far along the (1, 1, 1) diagonal from its target: true isometric. */
export const ISO_DISTANCE = 200

type Controls = ComponentRef<typeof MapControls>
type Motion =
  | { kind: 'idle' }
  | { kind: 'fly'; from: View; to: View; elapsed: number; duration: number }
  | { kind: 'spring'; from: Point; to: Point; elapsed: number; duration: number }

const IDLE: Motion = { kind: 'idle' }

function viewOf(camera: Camera): View {
  return {
    x: camera.position.x - ISO_DISTANCE,
    z: camera.position.z - ISO_DISTANCE,
    zoom: camera.zoom,
  }
}

function place(camera: Camera, controls: Controls | null, v: View) {
  camera.position.set(v.x + ISO_DISTANCE, ISO_DISTANCE, v.z + ISO_DISTANCE)
  camera.lookAt(v.x, 0, v.z)
  if (camera.zoom !== v.zoom) {
    camera.zoom = v.zoom
    camera.updateProjectionMatrix()
  }
  controls?.target.set(v.x, 0, v.z)
}

export type CameraRigProps = {
  model: SceneModel
  focus: Focus
  /** Archipelago view centres this island (spec §14.2). */
  anchor?: string | null
  /** Canvas px hidden behind the phone sheet. */
  covered?: number
  /** False under reduced motion: every movement snaps. */
  animate?: boolean
}

export function CameraRig({
  model,
  focus,
  anchor = null,
  covered = 0,
  animate = true,
}: CameraRigProps) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const frame = useFrameSize(covered)
  const target = cameraTarget(model, focus, anchor)
  const latest = useRef({ target, bounds: model.bounds, frame, animate })
  latest.current = { target, bounds: model.bounds, frame, animate }
  const motion = useRef<Motion>(IDLE)
  // `shown` is the target on screen; `raw` is where the drag would have put it without the band.
  const pan = useRef<{ raw: Point | null; shown: Point }>({
    raw: null,
    shown: { x: target.x, z: target.z },
  })
  const dragging = useRef(false)
  const quiet = useRef(false)
  const mounted = useRef(false)
  const key = focusKey(focus)

  const show = useCallback(
    (v: View) => {
      place(camera, controls.current, v)
      pan.current = { raw: null, shown: { x: v.x, z: v.z } }
    },
    [camera],
  )

  // Drop pan momentum left from a fling without moving the camera.
  const cancelMomentum = useCallback(() => {
    const c = controls.current
    if (!c) return
    const keep = viewOf(camera)
    quiet.current = true
    c.enableDamping = false
    c.update()
    c.enableDamping = true
    quiet.current = false
    show(keep)
  }, [camera, show])

  const setZoomLimits = useCallback((min: number, max: number) => {
    const c = controls.current
    if (!c) return
    c.minZoom = min
    c.maxZoom = max
  }, [])

  // A route change flies; the first framing after mount, and reduced motion, snap. A refetch keeps
  // the same key, so it never moves the camera.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route key is the trigger
  useLayoutEffect(() => {
    const { target: to, animate: smooth } = latest.current
    cancelMomentum()
    const from = viewOf(camera)
    const duration = smooth && mounted.current ? flyDuration(from, to) : 0
    mounted.current = true
    if (duration === 0) {
      motion.current = IDLE
      show(to)
      setZoomLimits(to.zoom, to.zoom * MAX_ZOOM_FACTOR)
    } else {
      setZoomLimits(0, Infinity)
      motion.current = { kind: 'fly', from, to, elapsed: 0, duration }
    }
    invalidate()
  }, [key, camera, invalidate])

  // A refetch can shrink the world under a resting camera; one frame lets the spring check run.
  useEffect(() => {
    invalidate()
  }, [model.bounds, invalidate])

  useFrame((_, delta) => {
    const m = motion.current
    if (m.kind === 'fly') {
      m.elapsed += delta * 1000
      const t = Math.min(1, m.elapsed / m.duration)
      show(flyFrame(m.from, m.to, t, latest.current.frame))
      if (t < 1) {
        invalidate()
        return
      }
      motion.current = IDLE
      setZoomLimits(m.to.zoom, m.to.zoom * MAX_ZOOM_FACTOR)
      return
    }
    if (m.kind === 'spring') {
      m.elapsed += delta * 1000
      const t = Math.min(1, m.elapsed / m.duration)
      show({ ...springFrame(m.from, m.to, t), zoom: camera.zoom })
      if (t < 1) invalidate()
      else motion.current = IDLE
      return
    }
    // At rest past the edge (released there, flung there, or the world shrank): spring home.
    if (dragging.current) return
    const here = viewOf(camera)
    const { bounds, animate: smooth } = latest.current
    if (!isOutside(bounds, here)) return
    cancelMomentum()
    const to = clampToBounds(bounds, here.x, here.z)
    if (!smooth) {
      show({ ...to, zoom: here.zoom })
      return
    }
    motion.current = { kind: 'spring', from: { x: here.x, z: here.z }, to, elapsed: 0, duration: SPRING_MS }
    invalidate()
  })

  // Past the bounds a drag stretches with resistance instead of stopping dead.
  const onChange = useCallback(() => {
    const c = controls.current
    if (!c || quiet.current || motion.current.kind !== 'idle') return
    const { bounds, frame: f } = latest.current
    const { raw, shown } = pan.current
    const base = raw ?? shown
    const want = { x: base.x + c.target.x - shown.x, z: base.z + c.target.z - shown.z }
    const next = bandedTarget(bounds, want, bandLimit(f, camera.zoom))
    camera.position.x += next.x - c.target.x
    camera.position.z += next.z - c.target.z
    c.target.x = next.x
    c.target.z = next.z
    pan.current = { raw: want, shown: next }
  }, [camera])

  // A touch or wheel takes over from any flight or spring, right where the camera is.
  const onStart = useCallback(() => {
    dragging.current = true
    const m = motion.current
    if (m.kind === 'idle') return
    motion.current = IDLE
    const here = viewOf(camera)
    pan.current = { raw: null, shown: { x: here.x, z: here.z } }
    if (m.kind === 'fly') {
      setZoomLimits(
        Math.min(m.to.zoom, here.zoom),
        Math.max(m.to.zoom * MAX_ZOOM_FACTOR, here.zoom),
      )
    }
  }, [camera, setZoomLimits])

  const onEnd = useCallback(() => {
    dragging.current = false
    invalidate()
  }, [invalidate])

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      screenSpacePanning={false}
      onChange={onChange}
      onStart={onStart}
      onEnd={onEnd}
    />
  )
}
```

- [ ] **Step 5: Pass reduced motion to the rig**

In `apps/web/src/scene/world-scene.tsx`, change the rig line to:

```tsx
      <CameraRig model={props.model} focus={props.focus} animate={animate} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx vitest run src/scene/camera-rig.test.tsx src/scene/world-contents.test.tsx`
Expected: PASS (8 rig tests plus the existing scene tests).

If `ReactThreeTestRenderer.create`'s options reject `camera`/`width`/`height` at the type level, check `CreateOptions` in `@react-three/test-renderer/dist/declarations/src/types/public.d.ts`. Do not cast it away blindly; the options themselves work at runtime, as verified in the planning spike.

- [ ] **Step 7: Typecheck, format, lint, commit**

```bash
cd apps/web && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene/use-frame-size.ts apps/web/src/scene/camera-rig.tsx apps/web/src/scene/camera-rig.test.tsx apps/web/src/scene/world-scene.tsx
git commit -m "feat(web): fly between routes, stretch past the world edge and spring back"
```

---

### Task 4: Switcher rides the panel; the sheet reports what it covers; sheet drag fixes

**Files:**
- Modify:
  - `apps/web/src/layout/panel-frame.tsx` (accessory slot, cover reporting, drag fixes)
  - `apps/web/src/world/island-switcher.tsx` (`variant` prop)
  - `apps/web/src/layout/world-screen.tsx` (switcher into the panel, `cover` state)
  - `apps/web/src/world/world-view.tsx` and `apps/web/src/scene/world-scene.tsx` (pass `coveredBottom` through to `CameraRig`)
- Test:
  - `apps/web/src/layout/world-screen.test.tsx`
  - `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: `CameraRig`'s `covered` prop from Task 3.
- Produces:
  - `PanelFrame` props gain `accessory?: ReactNode` and `onCoverChange?: (px: number) => void`.
    - Phone: the reported value is the settled detent height in px plus the accessory strip's height.
    - Desktop: never reported. `WorldScreen` uses 0 there.
  - `IslandSwitcher` props gain `variant: 'floating' | 'panel'`.
  - `WorldView` and `WorldScene` props gain `coveredBottom: number`.

Ruling recorded for the reviewer: spec 14.3 says `PanelFrame` "reports the sheet's top edge through a `ResizeObserver`". This plan derives the cover from the settled detent (`120px` / `50%` / `92%` of `window.innerHeight`) plus the strip's `offsetHeight`, observed with `ResizeObserver` where it exists. That is the same number on a real device, and it stays deterministic in jsdom, which has no layout and no `ResizeObserver`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/layout/world-screen.test.tsx`:

(a) In the first test (`'phone: island cards scroll horizontally, …'`), replace the line `const switcher = screen.getByRole('navigation', { name: 'Islands' })` with:

```ts
    const switcher = within(screen.getByTestId('task-sheet')).getByRole('navigation', {
      name: 'Islands',
    })
    expect(screen.getAllByRole('navigation', { name: 'Islands' })).toHaveLength(1)
```

(b) In `'desktop: the panel is a resizable side panel'`, add after `const panel = …`:

```ts
    expect(within(panel).getByRole('navigation', { name: 'Islands' })).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Islands' })).toHaveLength(1)
```

(c) Replace the test `'a cancelled drag cleans up and keyboard resizing still works'` with:

```ts
    test('a cancelled drag restores the previous detent and keyboard resizing still works', async () => {
      setHeight(800)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('button', { name: 'Resize task sheet' })
      expect(sheet).toHaveAttribute('data-detent', '1')
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 300, pointerId: 1 })
      expect(sheet.style.height).not.toMatch(/dvh|^120px$/)
      fireEvent.pointerCancel(window, { clientY: 0, pointerId: 1 })
      expect(sheet).toHaveAttribute('data-detent', '1')
      expect(sheet.style.height).toBe('50dvh')
      // Later moves must not resize: listeners are gone.
      fireEvent.pointerMove(window, { clientY: 0, pointerId: 1 })
      expect(sheet.style.height).toBe('50dvh')
      fireEvent.keyDown(handle, { key: 'ArrowDown' })
      expect(sheet).toHaveAttribute('data-detent', '0')
    })

    test('the click that ends a mouse drag does not also step the detent', async () => {
      setHeight(800)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('button', { name: 'Resize task sheet' })
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      await act(async () => {
        await Promise.resolve()
      })
      fireEvent.click(handle, { detail: 1 })
      expect(sheet).toHaveAttribute('data-detent', '2')
      // A fresh tap (pointer-down, then click) steps again.
      fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      fireEvent.click(handle, { detail: 1 })
      expect(sheet).toHaveAttribute('data-detent', '0')
    })
```

The existing test `'a drag that ends without a click does not swallow the next keyboard activation'` stays unchanged and must keep passing.

In `apps/web/src/layout/world-scene-integration.test.tsx`:

(d) In the mocked `WorldScene`, destructure `coveredBottom` as well and add `data-covered={coveredBottom}` to the `data-testid="scene"` div.

(e) Append inside `describe('World screen with the 3D scene', …)`:

```ts
  test('the scene learns how much of it the phone sheet covers; none on desktop', async () => {
    const { api, beta } = seeded()
    renderApp({ api, path: `/p/${beta.id}` })
    const scene = await screen.findByTestId('scene')
    // jsdom: window.innerHeight is 768 and the switcher strip has no layout height.
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '384'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), {
      key: 'ArrowDown',
    })
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '120'))
  })

  test('desktop: nothing covers the scene, and the switcher sits in the side panel', async () => {
    const { api, beta } = seeded()
    renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    expect(await screen.findByTestId('scene')).toHaveAttribute('data-covered', '0')
    const panel = screen.getByTestId('task-side-panel')
    expect(within(panel).getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/layout/world-screen.test.tsx src/layout/world-scene-integration.test.tsx`
Expected: FAIL.
- The switcher is not inside the sheet or panel.
- A cancelled drag snaps to the detent nearest `clientY` 0.
- The trailing click steps the detent.
- `data-covered` is missing.

- [ ] **Step 3: Give `IslandSwitcher` a variant**

Replace `apps/web/src/world/island-switcher.tsx` with:

```tsx
import { Link } from '@tanstack/react-router'
import { type IslandSummary, urgencyOf } from './selectors'

const dot = { overdue: 'bg-error', 'due-soon': 'bg-warning', none: '' } as const
const label = { overdue: 'overdue', 'due-soon': 'due soon', none: '' } as const

/**
 * Island chips. `floating` rides on top of the phone sheet over the world (transparent strip,
 * chips with their own surface); `panel` heads the desktop side panel (spec §14.5).
 */
export function IslandSwitcher({
  summaries,
  currentProjectId,
  variant,
}: {
  summaries: IslandSummary[]
  currentProjectId: string | null
  variant: 'floating' | 'panel'
}) {
  if (summaries.length === 0) return null
  const floating = variant === 'floating'
  return (
    <nav
      aria-label="Islands"
      className={
        floating ? 'shrink-0' : 'shrink-0 border-b border-border-primary bg-surface-primary'
      }
    >
      <ul className="flex gap-2 overflow-x-auto px-4 py-2">
        {summaries.map((s) => {
          const urgency = urgencyOf(s)
          const current = s.project.id === currentProjectId
          return (
            <li key={s.project.id} className="shrink-0">
              <Link
                to="/p/$projectId"
                params={{ projectId: s.project.id }}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${
                  floating ? 'shadow' : ''
                } ${
                  current
                    ? 'border-brand bg-brand text-text-on-brand'
                    : 'border-border-secondary bg-surface-primary text-text-primary'
                }`}
              >
                {s.project.name}
                {urgency !== 'none' && (
                  <>
                    <span aria-hidden className={`h-2 w-2 rounded-full ${dot[urgency]}`} />
                    <span className="sr-only">{label[urgency]}</span>
                  </>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 4: Update `PanelFrame`**

In `apps/web/src/layout/panel-frame.tsx`:

(a) Add `MouseEvent` and `useLayoutEffect` to the React import.

(b) Make the detent sizes take the window height:

```ts
const DETENTS = [
  { label: '120px', px: (_vh: number) => 120 },
  { label: '50dvh', px: (vh: number) => vh * 0.5 },
  { label: '92dvh', px: (vh: number) => vh * 0.92 },
]
```

Update every `.px()` call in `MobileSheet`'s drag code to `.px(window.innerHeight)`. That is the `startHeight` fallback and both calls in the nearest-detent loop.

(c) Give `PanelFrame` the new props and pass them down:

```tsx
export function PanelFrame({
  title,
  detent,
  onDetentChange,
  accessory,
  onCoverChange,
  children,
}: {
  title: string
  /** The phone sheet's detent index; ignored by the desktop side panel. */
  detent: number
  onDetentChange: Dispatch<SetStateAction<number>>
  /** Rides above the phone sheet; heads the desktop panel. */
  accessory?: ReactNode
  /** Phone only: canvas px the settled sheet and its accessory cover. */
  onCoverChange?: (px: number) => void
  children: ReactNode
}) {
  return useIsDesktop() ? (
    <DesktopPanel title={title} accessory={accessory}>
      {children}
    </DesktopPanel>
  ) : (
    <MobileSheet
      title={title}
      detent={detent}
      setDetent={onDetentChange}
      accessory={accessory}
      onCoverChange={onCoverChange}
    >
      {children}
    </MobileSheet>
  )
}
```

(d) In `MobileSheet`:
- Accept `accessory?: ReactNode` and `onCoverChange?: (px: number) => void` in its props.
- Add the following after `const startDrag = useDrag()`:

```tsx
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripHeight, setStripHeight] = useState(0)
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    setStripHeight(strip.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setStripHeight(strip.offsetHeight))
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])

  // The world frames around the settled sheet (spec §14.3); a drag in progress does not count.
  useEffect(() => {
    onCoverChange?.(Math.round((DETENTS[detent]?.px(windowHeight) ?? 0) + stripHeight))
  }, [detent, stripHeight, windowHeight, onCoverChange])
```

(e) In `MobileSheet`'s `onPointerDown`, replace the end callback with:

```tsx
      (end) => {
        setDragHeight(null)
        // A cancelled gesture leaves the sheet where it was. `dragged` stays set until the next
        // pointer-down, so the click that ends a mouse drag does not also step the detent.
        if (end.type === 'pointercancel' || !dragged.current) return
        const height = heightAt(end.clientY)
        let nearest = 0
        DETENTS.forEach((d, i) => {
          const best = DETENTS[nearest]
          const vh = window.innerHeight
          if (best && Math.abs(d.px(vh) - height) < Math.abs(best.px(vh) - height)) nearest = i
        })
        setDetent(nearest)
      },
```

(The `queueMicrotask` block is removed.)

(f) Replace `onClick` and `onKeyDown`:

```tsx
  const onClick = (_event: MouseEvent<HTMLButtonElement>) => {
    if (dragged.current) return
    setDetent((d) => (d + 1) % DETENTS.length)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Keyboard activation is never the tail of a drag.
    if (event.key === 'Enter' || event.key === ' ') dragged.current = false
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setDetent((d) => Math.min(DETENTS.length - 1, d + 1))
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setDetent((d) => Math.max(0, d - 1))
    }
  }
```

If Biome flags the unused `_event` parameter, drop the parameter entirely.

(g) Render the accessory as the sheet section's first child:

```tsx
      {accessory && (
        <div ref={stripRef} className="absolute inset-x-0 bottom-full">
          {accessory}
        </div>
      )}
```

(h) `DesktopPanel` takes `accessory?: ReactNode` and renders `{accessory}` between the resize button and the scrolling `div`.

- [ ] **Step 5: Wire `WorldScreen`, `WorldView` and `WorldScene`**

In `apps/web/src/layout/world-screen.tsx`:
- Add `const [cover, setCover] = useState(0)` next to the other state.
- Delete the `<IslandSwitcher … />` line above `<WorldView>`.
- Pass `coveredBottom={isDesktop ? 0 : cover}` to `<WorldView>`.
- Give `<PanelFrame>` these two props:

```tsx
        accessory={
          <IslandSwitcher
            summaries={summaries}
            currentProjectId={project?.id ?? null}
            variant={isDesktop ? 'panel' : 'floating'}
          />
        }
        onCoverChange={setCover}
```

In `apps/web/src/world/world-view.tsx`:
- Add `coveredBottom: number` to the props, destructured and typed.
- Pass `coveredBottom={coveredBottom}` to `<WorldScene>`.

In `apps/web/src/scene/world-scene.tsx`:
- Add `coveredBottom: number` to `WorldSceneProps`.
- Render the rig as:

```tsx
      <CameraRig
        model={props.model}
        focus={props.focus}
        covered={props.coveredBottom}
        animate={animate}
      />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx vitest run src/layout src/world src/tasks`
Expected: PASS.

- [ ] **Step 7: Run the full web suite, typecheck, format, lint, commit**

```bash
cd apps/web && bun run test && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/layout apps/web/src/world apps/web/src/scene/world-scene.tsx
git commit -m "feat(web): move the island switcher onto the task panel and frame the world around the sheet"
```

---

### Task 5: Sheet-aware framing and edge indicators

**Files:**
- Create:
  - `apps/web/src/scene/framing.tsx`
  - `apps/web/src/scene/indicator-store.ts`
  - `apps/web/src/scene/indicator-probe.tsx`
  - `apps/web/src/world/edge-indicators.tsx`
- Modify: `apps/web/src/scene/world-scene.tsx`, `apps/web/src/world/world-view.tsx`
- Test:
  - Create `apps/web/src/scene/framing-and-indicators.test.tsx`
  - Modify `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `framedCover`, `easeOutCubic`, `FRAMING_MS`.
  - From Task 2: `edgeIndicators`, `IslandUrgency`, `UrgentIsland`, `EdgeIndicator`.
  - From Task 3: `useFrameSize`, `ISO_DISTANCE`.
  - From Task 4: `coveredBottom` on `WorldSceneProps`.
- Produces:
  - `indicator-store.ts` (no three import, so `WorldView` may import it):
    - `type IndicatorStore = { get(): readonly EdgeIndicator[]; set(next: readonly EdgeIndicator[]): void; subscribe(listener: () => void): () => void }`
    - `createIndicatorStore(): IndicatorStore`. `set` notifies only when the list's JSON differs.
  - `Framing({ covered, animate })` and `IndicatorProbe({ model, urgent, currentProjectId, covered, store })`, both R3F components.
  - `EdgeIndicatorLayer({ store, onOpen })`, a DOM component.
  - `WorldSceneProps` gains `urgent: readonly IslandUrgency[]` and `indicators: IndicatorStore`.

- [ ] **Step 1: Write the failing scene tests**

`apps/web/src/scene/framing-and-indicators.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { ReactNode } from 'react'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject } from '../test/fake-api'
import { ISO_DISTANCE } from './camera-rig'
import { Framing } from './framing'
import { createIndicatorStore } from './indicator-store'
import { IndicatorProbe } from './indicator-probe'
import type { IslandUrgency } from './model/indicators'
import { buildSceneModel } from './model/scene-model'

const grab: { camera?: THREE.OrthographicCamera; setSize?: (w: number, h: number) => void } = {}
function Grab() {
  grab.camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  grab.setSize = useThree((s) => s.setSize)
  return null
}
function view() {
  const v = grab.camera?.view
  if (!v) throw new Error('no view offset set')
  return v
}

const create = (node: ReactNode, zoom = 10) =>
  ReactThreeTestRenderer.create(
    <>
      {node}
      <Grab />
    </>,
    {
      orthographic: true,
      width: 400,
      height: 800,
      camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom },
    },
  )

describe('Framing', () => {
  // jsdom's window.innerHeight is 768, so at most 384px of cover is framed.
  test('offsets the projection by half the framed cover, capped at half the window', async () => {
    const r = await create(<Framing covered={300} animate={false} />)
    await r.advanceFrames(1, 0.016)
    expect(view()).toMatchObject({ enabled: true, offsetX: 0, offsetY: 150, fullWidth: 400 })
    await r.update(
      <>
        <Framing covered={700} animate={false} />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(view().offsetY).toBe(192)
    await r.update(
      <>
        <Framing covered={0} animate={false} />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(view().enabled).toBe(false)
  })

  test('eases to a new cover over 250ms', async () => {
    const r = await create(<Framing covered={120} animate />)
    await r.advanceFrames(1, 0.016)
    expect(view().offsetY).toBe(60)
    await r.update(
      <>
        <Framing covered={300} animate />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.1)
    expect(view().offsetY).toBeGreaterThan(60)
    expect(view().offsetY).toBeLessThan(150)
    await r.advanceFrames(3, 0.1)
    expect(view().offsetY).toBe(150)
  })

  test('re-applies the offset at the new size when the canvas resizes', async () => {
    const r = await create(<Framing covered={300} animate={false} />)
    await r.advanceFrames(1, 0.016)
    await ReactThreeTestRenderer.act(async () => grab.setSize?.(500, 900))
    await r.advanceFrames(1, 0.016)
    expect(view()).toMatchObject({ fullWidth: 500, fullHeight: 900, offsetY: 150 })
  })
})

describe('indicators', () => {
  const economy: WorldDto['economy'] = {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  }
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0 })
  const model = buildSceneModel(
    { projects: [beta, gamma], milestones: [], tasks: [], buildings: [], economy },
    '2026-10-08',
  )
  const urgentGamma: IslandUrgency = {
    projectId: gamma.id,
    name: 'Gamma',
    urgency: 'overdue',
    count: 2,
  }
  const probe = (
    store: ReturnType<typeof createIndicatorStore>,
    urgent: IslandUrgency[],
    current: string | null,
  ) => (
    <IndicatorProbe
      model={model}
      urgent={urgent}
      currentProjectId={current}
      covered={0}
      store={store}
    />
  )

  test('the store notifies only when the markers change', () => {
    const store = createIndicatorStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    const marker = { ...urgentGamma, left: 1, top: 2, angle: 0 }
    store.set([marker])
    store.set([{ ...marker }])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get()).toEqual([marker])
    stop()
    store.set([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('an off-screen urgent island gets a marker; the current island never does', async () => {
    // Camera on Beta at island zoom: Gamma is far off screen.
    const store = createIndicatorStore()
    const r = await create(probe(store, [urgentGamma], beta.id), 48)
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([expect.objectContaining({ projectId: gamma.id, name: 'Gamma' })])

    await r.update(
      <>
        {probe(store, [urgentGamma], gamma.id)}
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([])
  })

  test('a marker disappears when its island stops being urgent', async () => {
    const store = createIndicatorStore()
    const r = await create(probe(store, [urgentGamma], beta.id), 48)
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toHaveLength(1)
    await r.update(
      <>
        {probe(store, [], beta.id)}
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([])
  })
})
```

- [ ] **Step 2: Write the failing app test**

In `apps/web/src/layout/world-scene-integration.test.tsx`:
- In the mocked `WorldScene`, also destructure `indicators`.
- Add this button inside the `data-testid="scene"` div:

```tsx
      <button
        type="button"
        onClick={() =>
          indicators.set([
            {
              projectId: model.islands[0]?.projectId ?? '',
              name: model.islands[0]?.name ?? '',
              urgency: 'overdue',
              count: 2,
              left: 10,
              top: 20,
              angle: 0,
            },
          ])
        }
      >
        report indicator
      </button>
```

Append the test:

```ts
  test('an off-screen urgent island shows a labelled edge marker that opens it', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'report indicator' }))
    const marker = screen.getByRole('button', { name: 'Beta island, 2 overdue, off screen' })
    expect(marker).toHaveStyle({ left: '10px', top: '20px' })
    await user.click(marker)
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/scene/framing-and-indicators.test.tsx src/layout/world-scene-integration.test.tsx`
Expected: FAIL. The new modules do not resolve, and the stub's `indicators` is undefined.

- [ ] **Step 4: Implement the store**

`apps/web/src/scene/indicator-store.ts`:

```ts
import type { EdgeIndicator } from './model/indicators'

/** Hands edge markers from the render loop to the DOM without re-rendering the scene each frame. */
export type IndicatorStore = {
  get: () => readonly EdgeIndicator[]
  set: (next: readonly EdgeIndicator[]) => void
  subscribe: (listener: () => void) => () => void
}

export function createIndicatorStore(): IndicatorStore {
  let current: readonly EdgeIndicator[] = []
  let key = '[]'
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next) {
      const nextKey = JSON.stringify(next)
      if (nextKey === key) return
      key = nextKey
      current = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
```

- [ ] **Step 5: Implement `Framing` and `IndicatorProbe`**

`apps/web/src/scene/framing.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { easeOutCubic, FRAMING_MS } from './model/camera-motion'
import { framedCover } from './model/screen'

/**
 * Shifts the projection up by half the framed sheet cover, so the look-at point sits in the middle
 * of the part of the canvas the sheet leaves visible (spec §14.3).
 */
export function Framing({ covered, animate }: { covered: number; animate: boolean }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const goal = framedCover(covered, window.innerHeight)
  const ease = useRef({ from: goal, to: goal, shown: goal, elapsed: 0 })
  const applied = useRef('')

  useLayoutEffect(() => {
    const e = ease.current
    if (e.to === goal) return
    ease.current = { from: e.shown, to: goal, shown: animate ? e.shown : goal, elapsed: 0 }
    invalidate()
  }, [goal, animate, invalidate])

  useFrame((_, delta) => {
    const e = ease.current
    if (e.shown !== e.to) {
      e.elapsed += delta * 1000
      const t = Math.min(1, e.elapsed / FRAMING_MS)
      e.shown = t >= 1 ? e.to : e.from + (e.to - e.from) * easeOutCubic(t)
      if (t < 1) invalidate()
    }
    // A resize resets the frustum, so the offset is re-applied whenever the size changes too.
    const key = `${e.shown}:${size.width}:${size.height}`
    if (key === applied.current) return
    applied.current = key
    if (e.shown > 0) {
      camera.setViewOffset(size.width, size.height, 0, e.shown / 2, size.width, size.height)
    } else {
      camera.clearViewOffset()
    }
    camera.updateProjectionMatrix()
  })

  return null
}
```

`apps/web/src/scene/indicator-probe.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { ISO_DISTANCE } from './camera-rig'
import type { IndicatorStore } from './indicator-store'
import { islandExtent } from './model/hex-space'
import { edgeIndicators, type IslandUrgency, type UrgentIsland } from './model/indicators'
import type { SceneModel } from './model/scene-model'
import { useFrameSize } from './use-frame-size'

/** After each rendered frame, works out which urgent islands need an edge marker. */
export function IndicatorProbe({
  model,
  urgent,
  currentProjectId,
  covered,
  store,
}: {
  model: SceneModel
  urgent: readonly IslandUrgency[]
  currentProjectId: string | null
  covered: number
  store: IndicatorStore
}) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const frame = useFrameSize(covered)

  // Urgency can change without the camera moving (a task completed): draw a frame to re-check.
  useEffect(() => {
    invalidate()
  }, [urgent, currentProjectId, invalidate])

  useFrame(() => {
    const islands: UrgentIsland[] = []
    for (const u of urgent) {
      if (u.projectId === currentProjectId) continue
      const island = model.islands.find((i) => i.projectId === u.projectId)
      if (!island) continue
      islands.push({
        ...u,
        x: island.origin.x,
        z: island.origin.z,
        extent: islandExtent(island.radius),
      })
    }
    const view = {
      x: camera.position.x - ISO_DISTANCE,
      z: camera.position.z - ISO_DISTANCE,
      zoom: camera.zoom,
    }
    store.set(edgeIndicators(islands, view, frame))
  })

  return null
}
```

- [ ] **Step 6: Implement the marker layer**

`apps/web/src/world/edge-indicators.tsx`:

```tsx
import { useSyncExternalStore } from 'react'
import type { IndicatorStore } from '../scene/indicator-store'

const look = {
  overdue: { button: 'bg-error text-text-on-brand', arrow: 'border-l-error', words: 'overdue' },
  'due-soon': {
    button: 'bg-warning text-text-primary',
    arrow: 'border-l-warning',
    words: 'due soon',
  },
} as const

/** Buttons at the screen edge pointing toward off-screen urgent islands (spec §14.4). */
export function EdgeIndicatorLayer({
  store,
  onOpen,
}: {
  store: IndicatorStore
  onOpen: (projectId: string) => void
}) {
  const indicators = useSyncExternalStore(store.subscribe, store.get, store.get)
  if (indicators.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {indicators.map((i) => {
        const style = look[i.urgency]
        return (
          <button
            key={i.projectId}
            type="button"
            onClick={() => onOpen(i.projectId)}
            aria-label={`${i.name} island, ${i.count} ${style.words}, off screen`}
            style={{ left: i.left, top: i.top }}
            className={`pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold shadow ${style.button}`}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ transform: `rotate(${i.angle}rad)` }}
            >
              <span
                className={`absolute top-1/2 -right-2 -translate-y-1/2 border-y-[6px] border-l-8 border-y-transparent ${style.arrow}`}
              />
            </span>
            <span aria-hidden>{i.count}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 7: Wire the scene and the view**

In `apps/web/src/scene/world-scene.tsx`:
- Import `Framing`, `IndicatorProbe`, `type IndicatorStore` and `type IslandUrgency`.
- Extend `WorldSceneProps` with `urgent: readonly IslandUrgency[]` and `indicators: IndicatorStore`.
- Render these directly after `<CameraRig … />`:

```tsx
      <Framing covered={props.coveredBottom} animate={animate} />
      <IndicatorProbe
        model={props.model}
        urgent={props.urgent}
        currentProjectId={props.focus.kind === 'archipelago' ? null : props.focus.projectId}
        covered={props.coveredBottom}
        store={props.indicators}
      />
```

In `apps/web/src/world/world-view.tsx`:
- Import `useState`, `createIndicatorStore` (`../scene/indicator-store`), `type IslandUrgency` (`../scene/model/indicators`), `urgencyOf` (`./selectors`) and `EdgeIndicatorLayer` (`./edge-indicators`).
- After `const model = useMemo(…)`, add:

```tsx
  const [indicators] = useState(createIndicatorStore)
  const urgent = useMemo(
    () =>
      summaries.flatMap((s): IslandUrgency[] => {
        const urgency = urgencyOf(s)
        if (urgency === 'none') return []
        const count = urgency === 'overdue' ? s.overdue : s.dueSoon
        return [{ projectId: s.project.id, name: s.project.name, urgency, count }]
      }),
    [summaries],
  )
  const openIsland = (projectId: string) =>
    void navigate({ to: '/p/$projectId', params: { projectId } })
```

- Pass `urgent={urgent}`, `indicators={indicators}` and `onOpenIsland={openIsland}` to `<WorldScene>`. This replaces the inline `onOpenIsland` arrow.
- Render `<EdgeIndicatorLayer store={indicators} onOpen={openIsland} />` between the canvas `div` and `<WorldHud …/>`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bunx vitest run src/scene src/layout`
Expected: PASS.

- [ ] **Step 9: Full suite, typecheck, format, lint, commit**

```bash
cd apps/web && bun run test && bun run typecheck && cd ../.. && bun run format && bun run lint
git add apps/web/src/scene apps/web/src/world apps/web/src/layout
git commit -m "feat(web): frame the world above the sheet and point at off-screen urgent islands"
```

---

### Task 6: Opening focus wiring, scene-boundary retry, final verification

**Files:**
- Create: `apps/web/src/world/last-island.ts`
- Modify:
  - `apps/web/src/layout/world-screen.tsx` (anchor)
  - `apps/web/src/world/world-view.tsx` (`anchor` prop, boundary `resetKey`)
  - `apps/web/src/scene/world-scene.tsx` (`anchor` to the rig)
  - `apps/web/src/world/scene-boundary.tsx` (retry)
- Test:
  - `apps/web/src/layout/world-scene-integration.test.tsx`
  - `apps/web/src/layout/world-scene-fallback.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 2: `openingIsland(summaries, previous, lastViewed)`.
  - From Task 3: `CameraRig`'s `anchor` prop.
  - Unchanged: `focusKey(focus)`.
- Produces:
  - `readLastIsland(): string | null` and `writeLastIsland(projectId: string): void`. Both are try/catch-guarded and use key `archipelago.lastIsland`.
  - `WorldView` and `WorldScene` props gain `anchor: string | null`.
  - `SceneBoundary` props gain `resetKey: string`.
  - Exports `MAX_SCENE_RETRIES = 2` and the test seam `resetSceneRetries()`.

- [ ] **Step 1: Write the failing opening-focus tests**

In `apps/web/src/layout/world-scene-integration.test.tsx`:
- Add `anchor` to the mocked `WorldScene`'s destructured props.
- Add `data-anchor={anchor ?? ''}` to the `data-testid="scene"` div.
- Append:

```ts
  describe('opening focus', () => {
    function twoIslands({ gammaOverdue }: { gammaOverdue: boolean }) {
      const beta = fakeProject({ name: 'Beta', archipelagoX: 0 })
      const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1 })
      const tasks = gammaOverdue
        ? [fakeTask({ projectId: gamma.id, title: 'Late', dueDate: '2000-01-01' })]
        : []
      const { api } = createFakeApi({
        world: { projects: [beta, gamma], milestones: [], tasks, buildings: [] },
      })
      return { api, beta, gamma }
    }

    test('a fresh load centres the most urgent island; stepping out centres the one left', async () => {
      const { api, beta, gamma } = twoIslands({ gammaOverdue: true })
      const { user } = renderApp({ api, path: '/' })
      expect(await screen.findByTestId('scene')).toHaveAttribute('data-anchor', gamma.id)
      await user.click(screen.getByRole('button', { name: 'open Beta' }))
      await user.click(await screen.findByRole('link', { name: '← Archipelago' }))
      await waitFor(() =>
        expect(screen.getByTestId('scene')).toHaveAttribute('data-anchor', beta.id),
      )
    })

    test('with nothing urgent, the last-viewed island from an earlier visit is centred', async () => {
      const { api, gamma } = twoIslands({ gammaOverdue: false })
      localStorage.setItem('archipelago.lastIsland', gamma.id)
      renderApp({ api, path: '/' })
      expect(await screen.findByTestId('scene')).toHaveAttribute('data-anchor', gamma.id)
    })

    test('showing an island remembers it; storage that throws breaks nothing', async () => {
      const { api, beta } = twoIslands({ gammaOverdue: false })
      renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      await waitFor(() => expect(localStorage.getItem('archipelago.lastIsland')).toBe(beta.id))
      cleanup()

      const deny = () => {
        throw new Error('storage denied')
      }
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(deny)
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(deny)
      const { router } = renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      await router.navigate({ to: '/' })
      await waitFor(() =>
        expect(screen.getByTestId('scene')).toHaveAttribute('data-anchor', beta.id),
      )
      get.mockRestore()
      set.mockRestore()
    })
  })
```

Add `cleanup` to the `@testing-library/react` import.

- [ ] **Step 2: Write the failing boundary tests**

Replace `apps/web/src/layout/world-scene-fallback.test.tsx` with:

```tsx
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeApi, fakeProject } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { resetSceneRetries } from '../world/scene-boundary'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// The probe passed, but the renderer could not get a context (or the chunk failed to load).
const scene = vi.hoisted(() => ({ broken: true, attempts: 0 }))
vi.mock('../scene/world-scene', () => ({
  WorldScene: () => {
    scene.attempts += 1
    if (scene.broken) throw new Error('Error creating WebGL context.')
    return <div data-testid="scene" />
  },
}))

const beta = fakeProject({ name: 'Beta' })
const world = { projects: [beta], milestones: [], tasks: [], buildings: [] }

let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  scene.broken = true
  scene.attempts = 0
  resetSceneRetries()
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => quiet.mockRestore())

async function go(router: ReturnType<typeof renderApp>['router'], to: string) {
  await act(async () => {
    await router.navigate({ to })
  })
}

describe('World screen when the 3D scene fails', () => {
  test('falls back to the card view instead of the root error screen', async () => {
    const { api } = createFakeApi({ world })
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(within(cards).getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong loading Archipelago.')).toBeNull()
    // The HUD hides: the card view carries its own New island button, so there is exactly one.
    expect(screen.getAllByRole('button', { name: 'New island' })).toHaveLength(1)
  })

  test('a route change gives a failed scene another try', async () => {
    const { api } = createFakeApi({ world })
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('island-cards')
    scene.broken = false
    await go(router, `/p/${beta.id}`)
    expect(await screen.findByTestId('scene')).toBeInTheDocument()
  })

  test('after two failed retries the cards stay for the rest of the page load', async () => {
    const { api } = createFakeApi({ world })
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('island-cards')
    const tries: number[] = []
    for (const to of [`/p/${beta.id}`, '/', `/p/${beta.id}`]) {
      const before = scene.attempts
      await go(router, to)
      tries.push(scene.attempts - before)
    }
    expect(tries[0]).toBeGreaterThan(0)
    expect(tries[1]).toBeGreaterThan(0)
    expect(tries[2]).toBe(0)
    expect(screen.getByTestId('island-cards')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/layout/world-scene-integration.test.tsx src/layout/world-scene-fallback.test.tsx`
Expected: FAIL. `data-anchor` is empty, `resetSceneRetries` is not exported, and the boundary never retries.

- [ ] **Step 4: Add the last-island store**

`apps/web/src/world/last-island.ts`:

```ts
const KEY = 'archipelago.lastIsland'

/** The island shown most recently, from an earlier visit; null if unknown or storage is blocked. */
export function readLastIsland(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeLastIsland(projectId: string): void {
  try {
    localStorage.setItem(KEY, projectId)
  } catch {
    // Storage can be unavailable (private mode); the island just isn't remembered.
  }
}
```

- [ ] **Step 5: Compute the anchor in `WorldScreen`**

In `apps/web/src/layout/world-screen.tsx`:
- Import `openingIsland` from `../scene/model/camera`, and `readLastIsland` and `writeLastIsland` from `../world/last-island`.
- Add `useRef` to the React import if it is not already there.
- Insert this before the first early `return`, after the existing route-reset effect:

```tsx
  // The island of the latest island or district route: where the archipelago opens on step-out.
  const lastProject = useRef<string | null>(null)
  const shownProjectId = resolved?.project?.id
  useEffect(() => {
    if (!shownProjectId) return
    lastProject.current = shownProjectId
    writeLastIsland(shownProjectId)
  }, [shownProjectId])
```

- After `const summaries = …`, add:

```tsx
  const anchor =
    resolved.focus.kind === 'archipelago'
      ? openingIsland(summaries, lastProject.current, readLastIsland())
      : null
```

- Pass `anchor={anchor}` to `<WorldView>`.

- [ ] **Step 6: Pass the anchor through and retry the boundary**

In `apps/web/src/world/world-view.tsx`:
- Add `anchor: string | null` to the props and pass `anchor={anchor}` to `<WorldScene>`.
- Import `focusKey` from `../scene/model/camera`.
- Change the boundary to `<SceneBoundary fallback={cards} resetKey={focusKey(resolved.focus)}>`.

In `apps/web/src/scene/world-scene.tsx`:
- Add `anchor: string | null` to `WorldSceneProps`.
- Pass `anchor={props.anchor}` to `<CameraRig>`.

Replace `apps/web/src/world/scene-boundary.tsx` with:

```tsx
import { Component, type ReactNode } from 'react'

/** How many times per page load a failed scene is retried on a later route change (spec §14.6). */
export const MAX_SCENE_RETRIES = 2
let retriesLeft = MAX_SCENE_RETRIES

/** Test seam: restore the per-page-load retry budget. */
export function resetSceneRetries(): void {
  retriesLeft = MAX_SCENE_RETRIES
}

/**
 * Catches a failed scene chunk load or a renderer that cannot get a context, and shows
 * `fallback` (the card view) in place of the world instead of the root error screen. A route
 * change (`resetKey`) tries the scene again, at most `MAX_SCENE_RETRIES` times per page load, so a
 * transient failure recovers but a device that always fails settles on the cards.
 */
export class SceneBoundary extends Component<
  { fallback: ReactNode; resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (!this.state.failed || prev.resetKey === this.props.resetKey || retriesLeft <= 0) return
    retriesLeft -= 1
    this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bunx vitest run src/layout`
Expected: PASS.

- [ ] **Step 8: Full verification**

From the repo root:

```bash
bun run test && bun run typecheck && bun run format && bun run lint && bun run build
```

Expected:
- All test tasks green.
- Typecheck 4/4.
- Lint clean apart from the known `recommended` info.
- Build succeeds.

Then confirm Three.js is still only in the lazy scene chunk:

```bash
grep -l "WebGLRenderer" apps/web/dist/assets/*.js
```

Expected: exactly one file, the `world-scene-*` chunk.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): open the archipelago on the island that needs you and retry a failed scene"
```

- [ ] **Step 10: Manual check (hand to the boss; do not block on it)**

Run `bun run --cwd apps/api dev` and `bun run --cwd apps/web dev -- --host`, then check on desktop and on a phone over the LAN:
- Flights: route changes fly. A switcher hop between far islands zooms out and back in. Grabbing the map mid-flight stops it dead.
- Rubber band at all four edges: the drag stretches, and release springs back.
- Framing: at each sheet detent the focused island sits centred in the visible area. At the top detent it does not lurch.
- Indicators: they track the edge while panning, are red or amber, and tapping one flies there.
- Switcher: the chips ride above the sheet and read clearly over the world.
- Opening `/`: it centres on the most urgent island; stepping out of an island centres that island.
- Reduced motion (OS setting): everything snaps.
