# Phase 5h Cloud Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 5g's in-scene cloud ring with a cloud frame drawn over the camera view: soft wisps round the screen edges while inside an island or district, tightening as you go in.

**Architecture:** Task 1 deletes the ring and everything that served it. Task 2 adds a pure tileable noise generator and a memoised data-URL painter (`world/cloud-texture.ts`). Task 3 adds a pure focus → state mapping and a `CloudFrame` DOM overlay mounted beside the existing `Vignette` in `world-view.tsx`: CSS opacity/scale transitions, a radial mask, and a compositor-only CSS drift. Nothing touches the canvas, the ticker or the three.js chunk.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, Tailwind v4, Vitest 5 + RTL (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 22 (Phase 5h), which supersedes section 21; 17.3 for the vignette it sits beside.

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk. `world/*` must not import three or anything under `scene/` except `scene/model/*`, `scene/tuning.ts` and `scene/use-reduced-motion.ts`.
- Every colour comes from `scenePalette` (A'raf tokens or `mix` of them). The frame's colour is the existing `scenePalette.cloud`.
- No API or DTO change. No new draw call, no ticker demand.
- Values, verbatim: `CLOUD_FRAME_ALPHA = 0.7`, `CLOUD_FRAME_CLEAR = 0.6`, `CLOUD_FRAME_ISLAND_SCALE = 1.08`, `CLOUD_FRAME_MS = 600`, `CLOUD_FRAME_DRIFT_S = 60`, `CLOUD_TEXTURE_SIZE = 128`, `CLOUD_TEXTURE_PX = 384`, `CLOUD_TEXTURE_SEED = 7`.
- Commit messages: conventional (`feat(web): …`, `refactor(web): …`), no AI attribution, no `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. Dragging the phone sheet must move the frame's bottom edge with the sheet at once, never easing behind it: `bottom` is not in the transition list. Pinned in Task 3.
2. Turning reduced motion on while inside a layer must stop the drift and the transition live, without a remount. Pinned in Task 3.
3. The 128² noise must be built once per page, not on every render or every layer change. Pinned in Task 2 (memoisation).
4. A browser whose 2D canvas throws (privacy mode blocking `toDataURL`, out of memory) must fall back to the plain colour, not crash the world screen. Pinned in Task 2.
5. The card view (no WebGL, or a scene failure) has no world to frame and must show no cloud frame. Pinned in Task 3.

---

### Task 1: Remove the cloud ring

**Files:**
- Delete: `apps/web/src/scene/clouds.tsx`, `apps/web/src/scene/clouds.test.tsx`, `apps/web/src/scene/models/cloud.ts`, `apps/web/src/scene/model/clouds.ts`, `apps/web/src/scene/model/clouds.test.ts`, `apps/web/src/scene/model/clouds-coast.test.ts`, `apps/web/src/scene/model/cloud-motion.ts`, `apps/web/src/scene/model/cloud-motion.test.ts`
- Modify: `apps/web/src/scene/world-scene.tsx`, `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`, `apps/web/src/scene/materials.ts`, `apps/web/src/scene/spotlight-material.test.ts`, `apps/web/src/scene/tuning.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TickerDemand` without `clouds`. `scenePalette.cloud` stays (Task 2 uses it) and its test in `scene/model/foundations.test.ts` stays.

- [ ] **Step 1: Delete the ring's files.**

```bash
cd apps/web/src
git rm scene/clouds.tsx scene/clouds.test.tsx scene/models/cloud.ts \
  scene/model/clouds.ts scene/model/clouds.test.ts scene/model/clouds-coast.test.ts \
  scene/model/cloud-motion.ts scene/model/cloud-motion.test.ts
```

- [ ] **Step 2: Drop the `clouds` ticker demand.** In `scene/ticker.ts` delete the field and its doc comment:

```ts
  /** A cloud ring is gathering or parting (spec 21.3). */
  clouds: boolean
```

and make `tickerWanted` end at the spotlight:

```ts
export function tickerWanted(d: TickerDemand): boolean {
  return (
    d.animate &&
    (d.seaWave || d.cranes || d.effects || d.camera || d.life || d.growth || d.spotlight)
  )
}
```

In `scene/ticker.test.ts` remove `clouds: false,` from `still`, `'clouds',` from the key list, and `clouds: true,` from the reduced-motion case.

- [ ] **Step 3: Unmount the ring.** In `scene/world-scene.tsx` delete `import { CloudLayer } from './clouds'`, the line `const [clouding, setClouding] = useState(false)`, the `clouds: clouding,` entry of `tickerWanted({...})`, and the whole `<CloudLayer … />` element (the five-prop block between `<SpotlightRig … />` and `<Labels … />`).

- [ ] **Step 4: Drop the material and its test.** In `scene/materials.ts` delete:

```ts
/** Clouds sit outside the layer by design: not spotlight-patched, so they never haze (spec 21.2). */
export const cloudMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
})
```

In `scene/spotlight-material.test.ts` delete `cloudMaterial,` from the import list and the whole `test('the cloud material is not hazed (spec 21.2)', …)` block. If `THREE` is then unused there, Biome will say so; keep the import only if another test still uses it.

- [ ] **Step 5: Drop the ring's tuning.** In `scene/tuning.ts` delete the block from `// Cloud ring (spec 21): soft clouds just outside the current island or district.` through `export const CLOUD_BOB_S = 6` (every `CLOUD_*` constant: `CLOUD_BAND`, `CLOUD_DENSITY`, `CLOUD_MAX`, `CLOUD_DISTRICT_RING`, `CLOUD_HEIGHT`, `CLOUD_CENTRE`, `CLOUD_MS`, `CLOUD_TRAVEL`, `CLOUD_SWAY`, `CLOUD_SWAY_S`, `CLOUD_BOB`, `CLOUD_BOB_S`).

- [ ] **Step 6: Prove nothing is left.**

Run: `cd apps/web && grep -rnE "CloudLayer|cloudMaterial|cloud-motion|model/clouds|models/cloud|CLOUD_" src`
Expected: no output.

- [ ] **Step 7: Gate.** From the root: `bun run test && bun run typecheck && bun run lint`.
Expected: all pass; lint at the one known info.

- [ ] **Step 8: Commit.**

```bash
git add -A apps/web/src
git commit -m "refactor(web): remove the in-scene cloud ring"
```

---

### Task 2: Cloud texture

**Files:**
- Create: `apps/web/src/world/cloud-texture.ts`, `apps/web/src/world/cloud-texture.test.ts`
- Modify: `apps/web/src/scene/tuning.ts`

**Interfaces:**
- Consumes: `hashInts`, `mulberry32` (`scene/model/random.ts`); `scenePalette.cloud` (`scene/model/palette.ts`).
- Produces: the eight `CLOUD_FRAME_*` / `CLOUD_TEXTURE_*` tuning constants; `cloudNoise(size: number, seed: number): Uint8ClampedArray`; `paintCloudTexture(size: number, seed: number): string | null`; `cloudTextureUrl(): string | null` (memoised).

- [ ] **Step 1: Add the tuning.** Append to `scene/tuning.ts`, after the spotlight block:

```ts
// Cloud frame (spec 22): soft cloud round the screen edges inside an island or district.
/** The frame's opacity while shown. */
export const CLOUD_FRAME_ALPHA = 0.7
/** Where the clear centre ends, as a share of the mask ellipse (0 centre, 1 the corners). */
export const CLOUD_FRAME_CLEAR = 0.6
/** On an island the wisps sit this much further out; in a district they are drawn in (scale 1). */
export const CLOUD_FRAME_ISLAND_SCALE = 1.08
/** Fade and tighten between layers, in ms. */
export const CLOUD_FRAME_MS = 600
/** One drift loop (one texture tile), in seconds. */
export const CLOUD_FRAME_DRIFT_S = 60
/** The noise tile, in texture pixels. */
export const CLOUD_TEXTURE_SIZE = 128
/** The tile's drawn size, in CSS px. */
export const CLOUD_TEXTURE_PX = 384
export const CLOUD_TEXTURE_SEED = 7
```

- [ ] **Step 2: Failing tests.** Create `apps/web/src/world/cloud-texture.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { scenePalette } from '../scene/model/palette'
import { cloudNoise, paintCloudTexture } from './cloud-texture'

const SIZE = 64
const at = (n: Uint8ClampedArray, x: number, y: number) => n[y * SIZE + x] ?? Number.NaN

describe('cloudNoise', () => {
  const noise = cloudNoise(SIZE, 7)

  test('is deterministic for a size and seed', () => {
    expect(cloudNoise(SIZE, 7)).toEqual(noise)
    expect(noise).toHaveLength(SIZE * SIZE)
  })

  test('a different seed gives a different tile', () => {
    expect(cloudNoise(SIZE, 8)).not.toEqual(noise)
  })

  test('is not flat', () => {
    const mean = noise.reduce((s, v) => s + v, 0) / noise.length
    const variance = noise.reduce((s, v) => s + (v - mean) ** 2, 0) / noise.length
    expect(Math.sqrt(variance)).toBeGreaterThan(10)
  })

  test('wraps: the seam steps no further than neighbouring pixels do', () => {
    let inner = 0
    let seam = 0
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j + 1 < SIZE; j++) {
        inner = Math.max(inner, Math.abs(at(noise, j + 1, i) - at(noise, j, i)))
        inner = Math.max(inner, Math.abs(at(noise, i, j + 1) - at(noise, i, j)))
      }
      seam = Math.max(seam, Math.abs(at(noise, 0, i) - at(noise, SIZE - 1, i)))
      seam = Math.max(seam, Math.abs(at(noise, i, 0) - at(noise, i, SIZE - 1)))
    }
    expect(seam).toBeLessThanOrEqual(inner)
    // A tile that did not wrap would jump across the seam.
    expect(seam).toBeLessThan(64)
  })
})

describe('paintCloudTexture', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('without a 2D context there is no texture', () => {
    expect(paintCloudTexture(4, 7)).toBeNull()
  })

  test('paints the noise as the alpha of the cloud colour', () => {
    const image = { data: new Uint8ClampedArray(4 * 4 * 4) }
    const put = vi.fn()
    const ctx = { createImageData: () => image, putImageData: put }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x')
    expect(paintCloudTexture(4, 7)).toBe('data:image/png;base64,x')
    expect(put).toHaveBeenCalledWith(image, 0, 0)
    const hex = scenePalette.cloud
    const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const alpha = cloudNoise(4, 7)
    for (let p = 0; p < 16; p++) {
      expect([...image.data.slice(p * 4, p * 4 + 3)]).toEqual(rgb)
      expect(image.data[p * 4 + 3]).toBe(alpha[p])
    }
  })

  test('a canvas that throws gives no texture instead of an error', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(paintCloudTexture(4, 7)).toBeNull()
  })
})

describe('cloudTextureUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  test('paints once per page', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    const { cloudTextureUrl } = await import('./cloud-texture')
    expect(cloudTextureUrl()).toBeNull()
    expect(cloudTextureUrl()).toBeNull()
    expect(getContext).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run them to see them fail.**

Run: `cd apps/web && bunx vitest run src/world/cloud-texture.test.ts`
Expected: FAIL, cannot resolve `./cloud-texture`.

- [ ] **Step 4: Implement.** Create `apps/web/src/world/cloud-texture.ts`:

```ts
import { scenePalette } from '../scene/model/palette'
import { hashInts, mulberry32 } from '../scene/model/random'
import { CLOUD_TEXTURE_SEED, CLOUD_TEXTURE_SIZE } from '../scene/tuning'

const OCTAVES = 4
/** Lattice cells across the tile at the first octave; each octave doubles them. */
const BASE_CELLS = 4

const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Tileable fractal value noise (spec 22.3): `size × size` alpha values, 0–255. The lattice wraps
 * at every octave, so the tile repeats without a seam.
 */
export function cloudNoise(size: number, seed: number): Uint8ClampedArray {
  const sums = new Float64Array(size * size)
  let amplitude = 0.5
  let total = 0
  for (let octave = 0; octave < OCTAVES; octave++) {
    const cells = BASE_CELLS << octave
    const lattice = new Float64Array(cells * cells)
    for (let i = 0; i < lattice.length; i++) {
      lattice[i] = mulberry32(hashInts(seed, octave, i))()
    }
    const value = (cx: number, cy: number) => lattice[(cy % cells) * cells + (cx % cells)] ?? 0
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells
      const cy = Math.floor(fy)
      const ty = smooth(fy - cy)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells
        const cx = Math.floor(fx)
        const tx = smooth(fx - cx)
        const top = lerp(value(cx, cy), value(cx + 1, cy), tx)
        const bottom = lerp(value(cx, cy + 1), value(cx + 1, cy + 1), tx)
        sums[y * size + x] = (sums[y * size + x] ?? 0) + lerp(top, bottom, ty) * amplitude
      }
    }
    total += amplitude
    amplitude /= 2
  }
  const out = new Uint8ClampedArray(size * size)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(((sums[i] ?? 0) / total) * 255)
  return out
}

/** The noise as the alpha of the cloud colour, as a PNG data URL; null without a 2D canvas. */
export function paintCloudTexture(size: number, seed: number): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(size, size)
    const hex = scenePalette.cloud
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const alpha = cloudNoise(size, seed)
    for (let p = 0; p < alpha.length; p++) {
      image.data[p * 4] = r ?? 0
      image.data[p * 4 + 1] = g ?? 0
      image.data[p * 4 + 2] = b ?? 0
      image.data[p * 4 + 3] = alpha[p] ?? 0
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

let texture: string | null | undefined

/** The frame's texture, painted once per page. */
export function cloudTextureUrl(): string | null {
  if (texture === undefined) texture = paintCloudTexture(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED)
  return texture
}
```

- [ ] **Step 5: Run the tests.**

Run: `cd apps/web && bunx vitest run src/world/cloud-texture.test.ts`
Expected: PASS. If the wrap test fails, the lattice is not wrapping (check the `% cells` in `value`); do not loosen the test.

- [ ] **Step 6: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint`, then:

```bash
git add apps/web/src/world/cloud-texture.ts apps/web/src/world/cloud-texture.test.ts apps/web/src/scene/tuning.ts
git commit -m "feat(web): paint a tileable cloud texture for the cloud frame"
```

---

### Task 3: Cloud frame

**Files:**
- Create: `apps/web/src/world/cloud-frame-state.ts`, `apps/web/src/world/cloud-frame.tsx`, `apps/web/src/world/cloud-frame.test.tsx`
- Modify: `apps/web/src/styles.css`, `apps/web/src/world/world-view.tsx`, `apps/web/src/layout/world-scene-integration.test.tsx`, `apps/web/src/layout/world-empty.test.tsx`

**Interfaces:**
- Consumes: `cloudTextureUrl()` (Task 2); `CLOUD_FRAME_ALPHA`, `CLOUD_FRAME_CLEAR`, `CLOUD_FRAME_ISLAND_SCALE`, `CLOUD_FRAME_MS`, `CLOUD_FRAME_DRIFT_S`, `CLOUD_TEXTURE_PX` (Task 2); `type Focus` (`world/selectors.ts`); `usePrefersReducedMotion` (`scene/use-reduced-motion.ts`); `setReducedMotion` (`test/viewport.ts`).
- Produces: `cloudFrameState(focus: Focus): { shown: boolean; scale: number }`; `CloudFrame({ focus, coveredBottom }: { focus: Focus; coveredBottom: number })`.

- [ ] **Step 1: Failing tests.** Create `apps/web/src/world/cloud-frame.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { scenePalette } from '../scene/model/palette'
import {
  CLOUD_FRAME_ALPHA,
  CLOUD_FRAME_DRIFT_S,
  CLOUD_FRAME_ISLAND_SCALE,
  CLOUD_FRAME_MS,
} from '../scene/tuning'
import { setReducedMotion } from '../test/viewport'
import { CloudFrame } from './cloud-frame'
import { cloudFrameState } from './cloud-frame-state'
import type { Focus } from './selectors'

const archipelago: Focus = { kind: 'archipelago' }
const island: Focus = { kind: 'island', projectId: 'p1' }
const district: Focus = { kind: 'district', projectId: 'p1', milestoneId: 'm1' }

const frame = () => screen.getByTestId('cloud-frame')
const wisps = () => screen.getByTestId('cloud-frame-wisps')

describe('cloudFrameState', () => {
  test('hidden on the archipelago, at the island scale so going in only fades', () => {
    expect(cloudFrameState(archipelago)).toEqual({ shown: false, scale: CLOUD_FRAME_ISLAND_SCALE })
  })

  test('pushed out on an island, drawn in for a district', () => {
    expect(cloudFrameState(island)).toEqual({ shown: true, scale: CLOUD_FRAME_ISLAND_SCALE })
    expect(cloudFrameState(district)).toEqual({ shown: true, scale: 1 })
  })
})

describe('CloudFrame', () => {
  test('is transparent on the archipelago and shown inside a layer', () => {
    const { rerender } = render(<CloudFrame focus={archipelago} coveredBottom={0} />)
    expect(frame().style.opacity).toBe('0')
    rerender(<CloudFrame focus={island} coveredBottom={0} />)
    expect(frame().style.opacity).toBe(String(CLOUD_FRAME_ALPHA))
    expect(frame().style.transform).toBe(`scale(${CLOUD_FRAME_ISLAND_SCALE})`)
    rerender(<CloudFrame focus={district} coveredBottom={0} />)
    expect(frame().style.opacity).toBe(String(CLOUD_FRAME_ALPHA))
    expect(frame().style.transform).toBe('scale(1)')
  })

  test('never catches taps and is hidden from assistive tech', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(frame()).toHaveClass('pointer-events-none')
    expect(frame()).toHaveAttribute('aria-hidden', 'true')
  })

  test('frames only the canvas above the sheet, following it without easing', () => {
    const { rerender } = render(<CloudFrame focus={island} coveredBottom={120} />)
    expect(frame().style.bottom).toBe('120px')
    rerender(<CloudFrame focus={island} coveredBottom={300} />)
    expect(frame().style.bottom).toBe('300px')
    expect(frame().style.transition).toBe(
      `opacity ${CLOUD_FRAME_MS}ms ease-out, transform ${CLOUD_FRAME_MS}ms ease-out`,
    )
    expect(frame().style.transition).not.toContain('bottom')
  })

  test('drifts one tile per loop', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.animation).toBe(`cloud-drift ${CLOUD_FRAME_DRIFT_S}s linear infinite`)
  })

  test('under reduced motion it neither eases nor drifts, even when switched on live', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.animation).not.toBe('none')
    act(() => setReducedMotion(true))
    expect(frame().style.transition).toBe('none')
    expect(wisps().style.animation).toBe('none')
  })

  test('without a 2D canvas the wisps are the plain cloud colour', () => {
    render(<CloudFrame focus={island} coveredBottom={0} />)
    expect(wisps().style.backgroundImage).toBe('')
    expect(wisps().style.backgroundColor).not.toBe('')
    // jsdom reports colours as rgb(); compare against the palette hex.
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16))
    expect(wisps().style.backgroundColor).toBe(`rgb(${r}, ${g}, ${b})`)
  })
})
```

- [ ] **Step 2: Run them to see them fail.**

Run: `cd apps/web && bunx vitest run src/world/cloud-frame.test.tsx`
Expected: FAIL, cannot resolve `./cloud-frame`.

- [ ] **Step 3: The state.** Create `apps/web/src/world/cloud-frame-state.ts`:

```ts
import { CLOUD_FRAME_ISLAND_SCALE } from '../scene/tuning'
import type { Focus } from './selectors'

/** Whether the cloud frame shows, and how far out its wisps sit (spec 22.2). */
export function cloudFrameState(focus: Focus): { shown: boolean; scale: number } {
  switch (focus.kind) {
    case 'archipelago':
      return { shown: false, scale: CLOUD_FRAME_ISLAND_SCALE }
    case 'island':
      return { shown: true, scale: CLOUD_FRAME_ISLAND_SCALE }
    case 'district':
      return { shown: true, scale: 1 }
  }
}
```

- [ ] **Step 4: The drift keyframes.** Append to `apps/web/src/styles.css`:

```css
/* The cloud frame's drift (spec 22.4): one tile per loop, so the loop has no seam. */
@keyframes cloud-drift {
  to {
    transform: translate(var(--cloud-tile), var(--cloud-tile));
  }
}
```

- [ ] **Step 5: The frame.** Create `apps/web/src/world/cloud-frame.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { scenePalette } from '../scene/model/palette'
import {
  CLOUD_FRAME_ALPHA,
  CLOUD_FRAME_CLEAR,
  CLOUD_FRAME_DRIFT_S,
  CLOUD_FRAME_MS,
  CLOUD_TEXTURE_PX,
} from '../scene/tuning'
import { usePrefersReducedMotion } from '../scene/use-reduced-motion'
import { cloudFrameState } from './cloud-frame-state'
import { cloudTextureUrl } from './cloud-texture'
import type { Focus } from './selectors'

const mask = `radial-gradient(ellipse at center, transparent ${CLOUD_FRAME_CLEAR * 100}%, black 100%)`

/**
 * Soft cloud round the screen edges while inside an island or district (spec 22.4): a DOM overlay,
 * so it costs the canvas nothing. Only opacity and transform ease; `bottom` follows the sheet.
 */
export function CloudFrame({ focus, coveredBottom }: { focus: Focus; coveredBottom: number }) {
  const reduced = usePrefersReducedMotion()
  const { shown, scale } = cloudFrameState(focus)
  const texture = cloudTextureUrl()
  return (
    <div
      data-testid="cloud-frame"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      style={{
        bottom: coveredBottom,
        opacity: shown ? CLOUD_FRAME_ALPHA : 0,
        transform: `scale(${scale})`,
        transition: reduced
          ? 'none'
          : `opacity ${CLOUD_FRAME_MS}ms ease-out, transform ${CLOUD_FRAME_MS}ms ease-out`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <div
        data-testid="cloud-frame-wisps"
        className="absolute right-0 bottom-0"
        style={
          {
            top: -CLOUD_TEXTURE_PX,
            left: -CLOUD_TEXTURE_PX,
            ...(texture
              ? {
                  backgroundImage: `url(${texture})`,
                  backgroundSize: `${CLOUD_TEXTURE_PX}px ${CLOUD_TEXTURE_PX}px`,
                }
              : { backgroundColor: scenePalette.cloud }),
            '--cloud-tile': `${CLOUD_TEXTURE_PX}px`,
            animation: reduced ? 'none' : `cloud-drift ${CLOUD_FRAME_DRIFT_S}s linear infinite`,
          } as CSSProperties
        }
      />
    </div>
  )
}
```

- [ ] **Step 6: Run the frame tests.**

Run: `cd apps/web && bunx vitest run src/world/cloud-frame.test.tsx`
Expected: PASS.

- [ ] **Step 7: Failing mount tests.** In `apps/web/src/layout/world-scene-integration.test.tsx`, directly after the `'a vignette softens the canvas edges without catching taps'` test, add:

```tsx
  test('a cloud frame shows inside an island and district, not on the archipelago', async () => {
    const { api, beta, mvp } = seeded()
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    expect(screen.getByTestId('cloud-frame').style.opacity).toBe('0')
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    await waitFor(() => expect(screen.getByTestId('cloud-frame').style.opacity).not.toBe('0'))
    await act(() =>
      router.navigate({
        to: '/p/$projectId/m/$milestoneId',
        params: { projectId: beta.id, milestoneId: mvp.id },
      }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('cloud-frame').style.transform).toBe('scale(1)'),
    )
  })

  test('the cloud frame sits above the vignette and below the HUD', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    const vignette = screen.getByTestId('vignette')
    const cloud = screen.getByTestId('cloud-frame')
    expect(vignette.nextElementSibling).toBe(cloud)
  })
```

In `apps/web/src/layout/world-empty.test.tsx`, after `expect(screen.queryByTestId('vignette')).toBeNull()`, add:

```tsx
    expect(screen.queryByTestId('cloud-frame')).toBeNull()
```

Run: `cd apps/web && bunx vitest run src/layout/world-scene-integration.test.tsx src/layout/world-empty.test.tsx`
Expected: the two new integration tests FAIL (no `cloud-frame`); the card-view assertion passes already (it guards against mounting the frame outside the scene branch).

- [ ] **Step 8: Mount it.** In `apps/web/src/world/world-view.tsx` add `import { CloudFrame } from './cloud-frame'` (sorted with the other `./` imports) and put the frame directly after the vignette:

```tsx
        <Vignette />
        <CloudFrame focus={resolved.focus} coveredBottom={coveredBottom} />
        <EdgeIndicatorLayer store={indicators} onOpen={openIsland} />
```

- [ ] **Step 9: Run the tests.**

Run: `cd apps/web && bunx vitest run src/layout/world-scene-integration.test.tsx src/layout/world-empty.test.tsx src/world`
Expected: PASS.

- [ ] **Step 10: Gate.** From the root: `bun run test && bun run typecheck && bun run lint && bun run build`. Check the build output: three.js only in the world-scene chunk (`grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists one file, the world-scene chunk).

- [ ] **Step 11: Commit.**

```bash
git add apps/web/src/world/cloud-frame-state.ts apps/web/src/world/cloud-frame.tsx \
  apps/web/src/world/cloud-frame.test.tsx apps/web/src/styles.css apps/web/src/world/world-view.tsx \
  apps/web/src/layout/world-scene-integration.test.tsx apps/web/src/layout/world-empty.test.tsx
git commit -m "feat(web): frame the current island or district with soft cloud at the screen edges"
```
