# Phase 5h Cloud Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the screen-space cloud frame with a world-anchored cloud deck: one flat cloud plane over the world with a hole the shape of the current island or district, which stays with the tiles when you pan or zoom.

**Architecture:** Task 1 retires the DOM frame and moves the pure noise code into `scene/model/cloud-noise.ts`. Task 2 adds the pure deck model (`scene/model/cloud-deck.ts`): the hole per layer, the fade/slide tween and the drift step. Task 3 adds the shader material (`scene/cloud-deck-material.ts`) and the `CloudDeck` component, mounted in `world-scene.tsx`, holding a `clouds` ticker demand only while it fades or slides.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5, RTL, `@react-three/test-renderer` 9.1.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 23 (it supersedes 22.2–22.6; 22.1 and 22.7 stand). 20.1 for the layer area, 20.3's old tween for the fade/slide behaviour.

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk. `scene/model/*` and `scene/tuning.ts` are three-free. `world/*` imports nothing from `scene/` except `scene/model/*`, `scene/tuning.ts`, `scene/use-reduced-motion.ts`.
- Every colour comes from `scenePalette`; the deck colour is `scenePalette.cloud` (= `colors.surfacePrimary`).
- No API or DTO change. One new draw call.
- Values, verbatim: `CLOUD_DECK_ALPHA = 0.85`, `CLOUD_DECK_FEATHER = 2 * Math.sqrt(3)`, `CLOUD_DECK_TILE = 12`, `CLOUD_DECK_DRIFT = 0.2`, `CLOUD_MS = 600`; kept `CLOUD_TEXTURE_SIZE = 128`, `CLOUD_TEXTURE_SEED = 7`, `CLOUD_WISP_LO = 0.45`, `CLOUD_WISP_HI = 0.75`. Removed: `CLOUD_FRAME_ALPHA`, `CLOUD_FRAME_CLEAR`, `CLOUD_FRAME_ISLAND_SCALE`, `CLOUD_FRAME_MS`, `CLOUD_FRAME_DRIFT_S`, `CLOUD_TEXTURE_PX`.
- Commit messages: conventional (`feat(web): …`, `refactor(web): …`), no AI attribution, no `Co-Authored-By` trailer.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. A district whose milestone id is unknown (deleted while you are in it) falls back to its island; the deck must then use the island's hole, shallows included, not the bare land circle. Pinned in Task 2.
2. A refetch (finishing a task elsewhere) that rebuilds the same hole must not restart the fade or hold the ticker. Pinned in Task 3.
3. Leaving for the archipelago mid-slide must fade out from where the hole is, not jump to the target first. Pinned in Task 2 (`deckLeg` from a mid-leg deck) and Task 3.
4. On first load straight into an island (a deep link) the deck must show at once, not fade in over the opening flight. Pinned in Task 3.
5. The drift must wrap so the offset never grows without bound in a long session. Pinned in Task 2 (`driftStep`).

---

### Task 1: Retire the screen-space frame; move the noise into the scene model

**Files:**
- Create: `apps/web/src/scene/model/cloud-noise.ts`, `apps/web/src/scene/model/cloud-noise.test.ts` (moved from `world/cloud-texture*.ts`)
- Delete: `apps/web/src/world/cloud-frame.tsx`, `apps/web/src/world/cloud-frame.test.tsx`, `apps/web/src/world/cloud-frame-state.ts`, `apps/web/src/world/cloud-texture.ts`, `apps/web/src/world/cloud-texture.test.ts`
- Modify: `apps/web/src/world/world-view.tsx`, `apps/web/src/styles.css`, `apps/web/src/scene/tuning.ts`, `apps/web/src/layout/world-scene-integration.test.tsx`, `apps/web/src/layout/world-empty.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `cloudNoise(size: number, seed: number): Uint8ClampedArray` and `wispAlpha(noise: Uint8ClampedArray, lo: number, hi: number): Uint8ClampedArray` exported from `scene/model/cloud-noise.ts` (bodies unchanged).

- [ ] **Step 1: Move the noise.**

```bash
cd apps/web/src
git mv world/cloud-texture.ts scene/model/cloud-noise.ts
git mv world/cloud-texture.test.ts scene/model/cloud-noise.test.ts
```

In `scene/model/cloud-noise.ts`: keep `OCTAVES`, `BASE_CELLS`, `smooth`, `lerp`, `cloudNoise` and `wispAlpha` exactly as they are. Delete `paintCloudTexture`, the `texture` variable and `cloudTextureUrl`, and every import except `import { hashInts, mulberry32 } from './random'` (the path changes from `'../scene/model/random'`). Update `cloudNoise`'s doc comment reference from `spec 22.3` to `spec 23.2`.

In `scene/model/cloud-noise.test.ts`: delete the `describe('paintCloudTexture', …)` and `describe('cloudTextureUrl', …)` blocks. Make the imports:

```ts
import { describe, expect, test } from 'vitest'
import { CLOUD_WISP_HI, CLOUD_WISP_LO } from '../tuning'
import { cloudNoise, wispAlpha } from './cloud-noise'
```

- [ ] **Step 2: Remove the frame.**

```bash
git rm world/cloud-frame.tsx world/cloud-frame.test.tsx world/cloud-frame-state.ts
```

In `world/world-view.tsx` delete `import { CloudFrame } from './cloud-frame'` and the line `<CloudFrame focus={resolved.focus} coveredBottom={coveredBottom} />`.

In `styles.css` delete the comment `/* The cloud frame's drift (spec 22.4): one tile per loop, so the loop has no seam. */` and the whole `@keyframes cloud-drift { … }` block after it.

In `scene/tuning.ts` delete `CLOUD_FRAME_ALPHA`, `CLOUD_FRAME_CLEAR`, `CLOUD_FRAME_ISLAND_SCALE`, `CLOUD_FRAME_MS`, `CLOUD_FRAME_DRIFT_S` and `CLOUD_TEXTURE_PX` with their doc comments. Keep `CLOUD_TEXTURE_SIZE`, `CLOUD_TEXTURE_SEED`, `CLOUD_WISP_LO`, `CLOUD_WISP_HI`. Change the section comment to `// Cloud deck (spec 23): a cloud layer over the world with a hole the shape of the current layer.`

In `layout/world-scene-integration.test.tsx` delete the two tests `'a cloud frame shows inside an island and district, not on the archipelago'` and `'the cloud frame sits above the vignette and below the HUD'`. In `layout/world-empty.test.tsx` delete `expect(screen.queryByTestId('cloud-frame')).toBeNull()`.

- [ ] **Step 3: Prove nothing is left.**

Run: `cd apps/web && grep -rnE "CloudFrame|cloud-frame|cloud-texture|cloudTextureUrl|paintCloudTexture|CLOUD_FRAME_|CLOUD_TEXTURE_PX|cloud-drift" src`
Expected: no output.

- [ ] **Step 4: Run the moved tests.**

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-noise.test.ts`
Expected: PASS (the `cloudNoise` and `wispAlpha` suites).

- [ ] **Step 5: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint`, then:

```bash
git add -A apps/web/src
git commit -m "refactor(web): retire the screen-space cloud frame; move the cloud noise into the scene model"
```

---

### Task 2: The deck model (pure)

**Files:**
- Create: `apps/web/src/scene/model/cloud-deck.ts`, `apps/web/src/scene/model/cloud-deck.test.ts`
- Modify: `apps/web/src/scene/tuning.ts`

**Interfaces:**
- Consumes: `Area`, `areaDistance` (`scene/model/area.ts`); `layerArea` (`scene/model/camera.ts`); `easeInOutCubic` (`scene/model/camera-motion.ts`); `SHALLOWS_MARGIN` (`scene/model/hex-space.ts`); `areaKey` (`scene/model/spotlight.ts`); `type Focus` (`world/selectors.ts`); `type SceneModel` (`scene/model/scene-model.ts`).
- Produces: tuning `CLOUD_DECK_ALPHA`, `CLOUD_DECK_FEATHER`, `CLOUD_DECK_TILE`, `CLOUD_DECK_DRIFT`, `CLOUD_MS`; `growArea(area: Area, by: number): Area`; `deckHole(model: SceneModel, focus: Focus): Area | null`; `type Deck = { hole: Area | null; strength: number }`; `DECK_OFF: Deck`; `deckFor(hole: Area | null): Deck`; `deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck }`; `deckAt(from: Deck, to: Deck, t: number): Deck`; `sameDeck(a: Deck, b: Deck): boolean`; `driftStep(along: number, seconds: number): number`.

- [ ] **Step 1: Add the tuning.** In `scene/tuning.ts`, under the `// Cloud deck (spec 23): …` comment, before `CLOUD_TEXTURE_SIZE`:

```ts
/** The deck's opacity at full strength. */
export const CLOUD_DECK_ALPHA = 0.85
/** From the hole's edge to full cloud, in world units: two hexes. */
export const CLOUD_DECK_FEATHER = 2 * Math.sqrt(3)
/** World units per texture tile. */
export const CLOUD_DECK_TILE = 12
/** Drift speed along (1, 1), world units per second (`high` tier only). */
export const CLOUD_DECK_DRIFT = 0.2
/** The deck fading or its hole sliding between layers, in ms. */
export const CLOUD_MS = 600
```

- [ ] **Step 2: Failing tests.** Create `apps/web/src/scene/model/cloud-deck.test.ts`:

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_TILE } from '../tuning'
import type { Area } from './area'
import { layerArea } from './camera'
import {
  DECK_OFF,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  growArea,
  sameDeck,
} from './cloud-deck'
import { SHALLOWS_MARGIN } from './hex-space'
import { buildSceneModel } from './scene-model'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('growArea', () => {
  test('keeps the box and grows the rounding', () => {
    expect(growArea(b, 2)).toEqual({ ...b, round: 3 })
    expect(growArea({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, 2).round).toBe(2)
  })
})

describe('deckHole', () => {
  test('no deck on the archipelago or for an unknown island', () => {
    expect(deckHole(model, { kind: 'archipelago' })).toBeNull()
    expect(deckHole(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('an island keeps its shallows clear', () => {
    const land = layerArea(model, onBeta)
    if (!land) throw new Error('no island area')
    expect(deckHole(model, onBeta)).toEqual(growArea(land, SHALLOWS_MARGIN))
  })

  test('a district is its own rounded box', () => {
    expect(layerArea(model, onMvp)).not.toEqual(layerArea(model, onBeta))
    expect(deckHole(model, onMvp)).toEqual(layerArea(model, onMvp))
  })

  test('an unknown milestone falls back to the island hole, shallows included', () => {
    const lost: Focus = { kind: 'district', projectId: beta.id, milestoneId: 'nope' }
    expect(deckHole(model, lost)).toEqual(deckHole(model, onBeta))
  })
})

describe('deck tween', () => {
  test('a hole shows at full strength; none is off', () => {
    expect(deckFor(a)).toEqual({ hole: a, strength: 1 })
    expect(deckFor(null)).toEqual(DECK_OFF)
  })

  test('from off, the new hole fades in where it is', () => {
    expect(deckLeg(DECK_OFF, deckFor(a))).toEqual({
      from: { hole: a, strength: 0 },
      to: { hole: a, strength: 1 },
    })
  })

  test('hole to hole slides at full strength', () => {
    const { from, to } = deckLeg(deckFor(a), deckFor(b))
    expect(from).toEqual({ hole: a, strength: 1 })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('to the archipelago it fades out in place', () => {
    expect(deckLeg(deckFor(a), DECK_OFF)).toEqual({
      from: { hole: a, strength: 1 },
      to: { hole: a, strength: 0 },
    })
  })

  test('leaving mid-slide fades out from where the hole is', () => {
    const mid = deckAt(deckFor(a), deckFor(b), 0.5)
    const { from, to } = deckLeg(mid, DECK_OFF)
    expect(from).toEqual(mid)
    expect(to).toEqual({ hole: mid.hole, strength: 0 })
  })

  test('endpoints are exact', () => {
    const from = deckFor(a)
    const to = deckFor(b)
    expect(deckAt(from, to, 0)).toEqual(from)
    expect(deckAt(from, to, 1)).toEqual(to)
  })

  test('two decks match when both are off, or the same hole at the same strength', () => {
    expect(sameDeck(DECK_OFF, { hole: a, strength: 0 })).toBe(true)
    expect(sameDeck(deckFor(a), deckFor({ ...a }))).toBe(true)
    expect(sameDeck(deckFor(a), deckFor(b))).toBe(false)
    expect(sameDeck(deckFor(a), { hole: a, strength: 0.5 })).toBe(false)
  })
})

describe('driftStep', () => {
  test('moves at CLOUD_DECK_DRIFT per second', () => {
    expect(driftStep(0, 2)).toBeCloseTo(2 * CLOUD_DECK_DRIFT)
  })

  test('wraps at one tile, so it never grows without bound', () => {
    expect(driftStep(CLOUD_DECK_TILE - 0.1, 1)).toBeCloseTo(CLOUD_DECK_DRIFT - 0.1)
    let along = 0
    for (let i = 0; i < 10_000; i++) along = driftStep(along, 1)
    expect(along).toBeGreaterThanOrEqual(0)
    expect(along).toBeLessThan(CLOUD_DECK_TILE)
  })
})
```

- [ ] **Step 3: Run them to see them fail.**

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: FAIL, cannot resolve `./cloud-deck`.

- [ ] **Step 4: Implement.** Create `apps/web/src/scene/model/cloud-deck.ts`:

```ts
import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_TILE } from '../tuning'
import type { Area } from './area'
import { layerArea } from './camera'
import { easeInOutCubic } from './camera-motion'
import { SHALLOWS_MARGIN } from './hex-space'
import type { SceneModel } from './scene-model'
import { areaKey } from './spotlight'

/** The rounded rectangle offset outward by `by`: the same box with a larger rounding. */
export function growArea(area: Area, by: number): Area {
  return { ...area, round: (area.round ?? 0) + by }
}

/**
 * The deck's hole (spec 23.1): none on the archipelago; an island's land plus its shallows; a
 * district's rounded box. A district that falls back to its island takes the island's hole.
 */
export function deckHole(model: SceneModel, focus: Focus): Area | null {
  const area = layerArea(model, focus)
  if (!area || focus.kind === 'archipelago') return area
  const island = layerArea(model, { kind: 'island', projectId: focus.projectId })
  return island && areaKey(island) === areaKey(area) ? growArea(area, SHALLOWS_MARGIN) : area
}

/** What the deck shows: its hole and how strongly it covers the rest (0–1). */
export type Deck = { hole: Area | null; strength: number }

export const DECK_OFF: Deck = { hole: null, strength: 0 }

export function deckFor(hole: Area | null): Deck {
  return hole ? { hole, strength: 1 } : DECK_OFF
}

/**
 * The tween between what is shown and the new layer's deck: from off it fades in on the new hole,
 * hole to hole it slides at full strength, and to the archipelago it fades out in place.
 */
export function deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck } {
  if (!target.hole) return { from: current, to: { hole: current.hole, strength: 0 } }
  if (!current.hole || current.strength === 0) {
    return { from: { hole: target.hole, strength: current.strength }, to: target }
  }
  return { from: current, to: target }
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e

/** The deck `t` (0–1) of the way through a leg, eased. */
export function deckAt(from: Deck, to: Deck, t: number): Deck {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const a = from.hole
  const b = to.hole
  const hole =
    a && b
      ? {
          minX: lerp(a.minX, b.minX, e),
          maxX: lerp(a.maxX, b.maxX, e),
          minZ: lerp(a.minZ, b.minZ, e),
          maxZ: lerp(a.maxZ, b.maxZ, e),
          round: lerp(a.round ?? 0, b.round ?? 0, e),
        }
      : (b ?? a)
  return { hole, strength: lerp(from.strength, to.strength, e) }
}

/** Two decks that look the same: both off, or the same hole at the same strength. */
export function sameDeck(a: Deck, b: Deck): boolean {
  const shown = (d: Deck) => (d.hole ? d.strength : 0)
  if (shown(a) === 0 && shown(b) === 0) return true
  return shown(a) === shown(b) && areaKey(a.hole) === areaKey(b.hole)
}

/** The drift offset after `seconds`, wrapped at one texture tile. */
export function driftStep(along: number, seconds: number): number {
  return (along + seconds * CLOUD_DECK_DRIFT) % CLOUD_DECK_TILE
}
```

- [ ] **Step 5: Run the tests.**

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: PASS. If `'a district is its own rounded box'` fails on its first line, the fixture's district is falling back to the island: report it rather than changing the assertion.

- [ ] **Step 6: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint`, then:

```bash
git add apps/web/src/scene/model/cloud-deck.ts apps/web/src/scene/model/cloud-deck.test.ts apps/web/src/scene/tuning.ts
git commit -m "feat(web): model the cloud deck's hole, fade, slide and drift"
```

---

### Task 3: The deck in the scene

**Files:**
- Create: `apps/web/src/scene/cloud-deck-material.ts`, `apps/web/src/scene/cloud-deck-material.test.ts`, `apps/web/src/scene/cloud-deck.tsx`, `apps/web/src/scene/cloud-deck.test.tsx`
- Modify: `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`, `apps/web/src/scene/world-scene.tsx`

**Interfaces:**
- Consumes: Task 1 `cloudNoise`, `wispAlpha`; Task 2 everything it produces; `areaKey` (`scene/model/spotlight.ts`); `FOG_MARGIN`, `FOG_DEPTH`, `clampDelta`, `CLOUD_TEXTURE_SIZE`, `CLOUD_TEXTURE_SEED`, `CLOUD_WISP_LO`, `CLOUD_WISP_HI` (`scene/tuning.ts`); `scenePalette` (`scene/model/palette.ts`).
- Produces: `cloudDeckUniforms`, `cloudDeckMaterial: THREE.ShaderMaterial`, `writeDeck(deck: Deck): void`, `CLOUD_DECK_FRAGMENT: string`, `CLOUD_DECK_RENDER_ORDER = 10`; `CloudDeck({ model, focus, animate, drifting, onRunning })`; `TickerDemand.clouds: boolean`.

- [ ] **Step 1: Failing material tests.** Create `apps/web/src/scene/cloud-deck-material.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  CLOUD_DECK_FRAGMENT,
  cloudDeckMaterial,
  cloudDeckUniforms,
  writeDeck,
} from './cloud-deck-material'
import type { Area } from './model/area'
import { DECK_OFF } from './model/cloud-deck'
import { cloudNoise, wispAlpha } from './model/cloud-noise'
import { scenePalette } from './model/palette'
import {
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_TILE,
  CLOUD_TEXTURE_SEED,
  CLOUD_TEXTURE_SIZE,
  CLOUD_WISP_HI,
  CLOUD_WISP_LO,
} from './tuning'

describe('cloud deck material', () => {
  test('draws over everything, untouched by depth or fog', () => {
    expect(cloudDeckMaterial).toBeInstanceOf(THREE.ShaderMaterial)
    expect(cloudDeckMaterial.transparent).toBe(true)
    expect(cloudDeckMaterial.depthTest).toBe(false)
    expect(cloudDeckMaterial.depthWrite).toBe(false)
    expect(cloudDeckMaterial.fog).toBe(false)
    expect(cloudDeckMaterial.uniforms).toBe(cloudDeckUniforms)
  })

  test('the shader measures the hole with the maths of areaDistance', () => {
    expect(CLOUD_DECK_FRAGMENT).toContain('vec2 q = abs( p - centre ) - extent;')
    expect(CLOUD_DECK_FRAGMENT).toContain(
      'return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;',
    )
    expect(CLOUD_DECK_FRAGMENT).toContain('smoothstep( 0.0, uFeather, holeDistance( vWorldXZ ) )')
  })

  test('starts with the tuning, the cloud colour and the wisp texture', () => {
    expect(cloudDeckUniforms.uFeather.value).toBe(CLOUD_DECK_FEATHER)
    expect(cloudDeckUniforms.uTile.value).toBe(CLOUD_DECK_TILE)
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16) / 255)
    expect(cloudDeckUniforms.uColor.value.toArray()).toEqual([r, g, b])
    const map = cloudDeckUniforms.uMap.value
    expect(map.wrapS).toBe(THREE.RepeatWrapping)
    expect(map.wrapT).toBe(THREE.RepeatWrapping)
    expect(map.format).toBe(THREE.RedFormat)
    expect([...(map.image.data as Uint8ClampedArray)]).toEqual([
      ...wispAlpha(cloudNoise(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED), CLOUD_WISP_LO, CLOUD_WISP_HI),
    ])
  })

  test('writeDeck sets the hole and scales the opacity by strength', () => {
    const hole: Area = { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }
    writeDeck({ hole, strength: 0.5 })
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(cloudDeckUniforms.uRound.value).toBe(0.5)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * 0.5)
    writeDeck(DECK_OFF)
    expect(cloudDeckUniforms.uOpacity.value).toBe(0)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: FAIL, cannot resolve `./cloud-deck-material`.

- [ ] **Step 2: The material.** Create `apps/web/src/scene/cloud-deck-material.ts`:

```ts
import * as THREE from 'three'
import type { Deck } from './model/cloud-deck'
import { cloudNoise, wispAlpha } from './model/cloud-noise'
import { scenePalette } from './model/palette'
import {
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_TILE,
  CLOUD_TEXTURE_SEED,
  CLOUD_TEXTURE_SIZE,
  CLOUD_WISP_HI,
  CLOUD_WISP_LO,
} from './tuning'

/** Above every other mesh: the deck draws over everything outside its hole. */
export const CLOUD_DECK_RENDER_ORDER = 10

function wispTexture(): THREE.DataTexture {
  const data = wispAlpha(
    cloudNoise(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED),
    CLOUD_WISP_LO,
    CLOUD_WISP_HI,
  )
  const texture = new THREE.DataTexture(
    data,
    CLOUD_TEXTURE_SIZE,
    CLOUD_TEXTURE_SIZE,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  )
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

// sRGB straight through: the canvas is `flat` and the shader writes gl_FragColor as given.
const rgb = (hex: string) =>
  new THREE.Vector3(...[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255))

export const cloudDeckUniforms = {
  uMap: { value: wispTexture() },
  /** The hole's box as (minX, minZ, maxX, maxZ). */
  uBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRound: { value: 0 },
  uFeather: { value: CLOUD_DECK_FEATHER },
  uOpacity: { value: 0 },
  uTile: { value: CLOUD_DECK_TILE },
  uOffset: { value: new THREE.Vector2(0, 0) },
  uColor: { value: rgb(scenePalette.cloud) },
}

const VERTEX = `varying vec2 vWorldXZ;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorldXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

// The same signed distance as `areaDistance` in scene/model/area.ts.
export const CLOUD_DECK_FRAGMENT = `uniform sampler2D uMap;
uniform vec4 uBox;
uniform float uRound;
uniform float uFeather;
uniform float uOpacity;
uniform float uTile;
uniform vec2 uOffset;
uniform vec3 uColor;
varying vec2 vWorldXZ;
float holeDistance( vec2 p ) {
  vec2 centre = ( uBox.xy + uBox.zw ) * 0.5;
  vec2 extent = ( uBox.zw - uBox.xy ) * 0.5;
  vec2 q = abs( p - centre ) - extent;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;
}
void main() {
  float edge = smoothstep( 0.0, uFeather, holeDistance( vWorldXZ ) );
  float wisp = texture2D( uMap, ( vWorldXZ + uOffset ) / uTile ).r;
  gl_FragColor = vec4( uColor, wisp * edge * uOpacity );
}`

/** The cloud deck (spec 23.3): a cloud layer over the world with a hole for the current layer. */
export const cloudDeckMaterial = new THREE.ShaderMaterial({
  uniforms: cloudDeckUniforms,
  vertexShader: VERTEX,
  fragmentShader: CLOUD_DECK_FRAGMENT,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  fog: false,
})

export function writeDeck(deck: Deck): void {
  const { hole } = deck
  if (hole) {
    cloudDeckUniforms.uBox.value.set(hole.minX, hole.minZ, hole.maxX, hole.maxZ)
    cloudDeckUniforms.uRound.value = hole.round ?? 0
  }
  cloudDeckUniforms.uOpacity.value = hole ? CLOUD_DECK_ALPHA * deck.strength : 0
}
```

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: PASS.

- [ ] **Step 3: The `clouds` ticker demand.** In `scene/ticker.ts` add to `TickerDemand`, after `growth`:

```ts
  /** The cloud deck is fading or its hole sliding between layers (spec 23.3). */
  clouds: boolean
```

and make `tickerWanted`:

```ts
export function tickerWanted(d: TickerDemand): boolean {
  return (
    d.animate && (d.seaWave || d.cranes || d.effects || d.camera || d.life || d.growth || d.clouds)
  )
}
```

In `scene/ticker.test.ts` add `clouds: false,` to `still`, `'clouds',` to the key list of `'runs while anything moves, each condition on its own'`, and `clouds: true,` to the reduced-motion case. Run `cd apps/web && bunx vitest run src/scene/ticker.test.ts` and expect PASS.

- [ ] **Step 4: Failing deck tests.** Create `apps/web/src/scene/cloud-deck.test.tsx`:

```tsx
import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { CloudDeck } from './cloud-deck'
import { CLOUD_DECK_RENDER_ORDER, cloudDeckMaterial, cloudDeckUniforms } from './cloud-deck-material'
import { deckHole } from './model/cloud-deck'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { CLOUD_DECK_ALPHA, CLOUD_DECK_DRIFT, CLOUD_MS, FOG_DEPTH, FOG_MARGIN } from './tuning'

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

type Props = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  drifting?: boolean
  onRunning?: (r: boolean) => void
}
const tree = ({ model: m, focus, animate = true, drifting = false, onRunning }: Props) => (
  <CloudDeck model={m} focus={focus} animate={animate} drifting={drifting} onRunning={onRunning} />
)
const opacity = () => cloudDeckUniforms.uOpacity.value
const box = () => cloudDeckUniforms.uBox.value.toArray()
const frames = Math.ceil(CLOUD_MS / 100) + 1

describe('CloudDeck', () => {
  test('one untappable plane over the whole world, drawn above everything', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    const meshes = r.scene.findAllByType('Mesh')
    expect(meshes).toHaveLength(1)
    const mesh = meshes[0]?.instance as THREE.Mesh
    expect(mesh.material).toBe(cloudDeckMaterial)
    expect(mesh.renderOrder).toBe(CLOUD_DECK_RENDER_ORDER)
    expect(mesh.frustumCulled).toBe(false)
    const hits: THREE.Intersection[] = []
    mesh.raycast({} as THREE.Raycaster, hits)
    expect(hits).toHaveLength(0)
    mesh.geometry.computeBoundingBox()
    mesh.updateMatrixWorld()
    const size = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld)
    const b = model.bounds
    const m = FOG_MARGIN + FOG_DEPTH
    expect(size?.min.x).toBeCloseTo(b.minX - m)
    expect(size?.max.x).toBeCloseTo(b.maxX + m)
    expect(size?.min.z).toBeCloseTo(b.minZ - m)
    expect(size?.max.z).toBeCloseTo(b.maxZ + m)
  })

  test('the first mount shows its deck at once, even on a deep link', async () => {
    const onRunning = vi.fn()
    await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    const h = deckHole(model, onBeta)
    expect(box()).toEqual([h?.minX, h?.minZ, h?.maxX, h?.maxZ])
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('hidden on the archipelago; entering an island fades it in over CLOUD_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    expect(opacity()).toBe(0)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    // The first frame after the route change doesn't advance the fade.
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBe(0)
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBeGreaterThan(0)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('island to island slides the hole at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    const from = deckHole(model, onBeta)?.minX ?? 0
    const to = deckHole(model, onGamma)?.minX ?? 0
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
    await r.advanceFrames(frames, 0.1)
    expect(box()[0]).toBeCloseTo(to)
  })

  test('back to the archipelago mid-slide fades out from where the hole is', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(3, 0.1)
    const mid = box()[0]
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(2, 0.1)
    expect(box()[0]).toBe(mid)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(0)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the hole neither replays the fade nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('drifts only while drifting is on', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    const start = cloudDeckUniforms.uOffset.value.x
    await r.advanceFrames(5, 0.1)
    expect(cloudDeckUniforms.uOffset.value.x).toBe(start)
    await r.update(tree({ model, focus: onBeta, drifting: true }))
    await r.advanceFrames(5, 0.1)
    const moved = cloudDeckUniforms.uOffset.value.x - start
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThanOrEqual(5 * 0.1 * CLOUD_DECK_DRIFT + 1e-9)
    expect(cloudDeckUniforms.uOffset.value.y).toBe(cloudDeckUniforms.uOffset.value.x)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx`
Expected: FAIL, cannot resolve `./cloud-deck`.

- [ ] **Step 5: The deck component.** Create `apps/web/src/scene/cloud-deck.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Focus } from '../world/selectors'
import { CLOUD_DECK_RENDER_ORDER, cloudDeckMaterial, cloudDeckUniforms, writeDeck } from './cloud-deck-material'
import {
  DECK_OFF,
  type Deck,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  sameDeck,
} from './model/cloud-deck'
import type { SceneModel } from './model/scene-model'
import { areaKey } from './model/spotlight'
import { CLOUD_MS, clampDelta, FOG_DEPTH, FOG_MARGIN } from './tuning'

const noRaycast = () => null

/**
 * The cloud deck (spec 23.3): one plane over the world with a hole for the current layer. It fades
 * and slides with the route; a refetch with the same hole is still. Drifts while `drifting`.
 */
export function CloudDeck({
  model,
  focus,
  animate,
  drifting,
  onRunning,
}: {
  model: SceneModel
  focus: Focus
  animate: boolean
  /** The `high` tier's sea wave is on, so frames already tick. */
  drifting: boolean
  /** A fade or slide started (true) or ended (false); keeps the ticker running for it. */
  onRunning?: (running: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const hole = deckHole(model, focus)
  const key = areaKey(hole)
  const target = useRef(deckFor(hole))
  target.current = deckFor(hole)
  const shown = useRef<Deck>(DECK_OFF)
  const mounted = useRef(false)
  const leg = useRef<{ from: Deck; to: Deck; elapsed: number; fresh: boolean } | null>(null)
  const running = useRef(onRunning)
  running.current = onRunning
  const along = useRef(cloudDeckUniforms.uOffset.value.x)

  const show = (d: Deck) => {
    shown.current = d
    writeDeck(d)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the hole's value is the trigger
  useLayoutEffect(() => {
    const { from, to } = deckLeg(shown.current, target.current)
    const wasRunning = leg.current !== null
    // The first mount shows its deck at once, like the camera's first framing.
    const instant = !mounted.current || !animate || sameDeck(from, to)
    mounted.current = true
    if (instant) {
      leg.current = null
      show(to)
      if (wasRunning) running.current?.(false)
    } else {
      leg.current = { from, to, elapsed: 0, fresh: true }
      show(from)
      if (!wasRunning) running.current?.(true)
    }
    invalidate()
  }, [key, animate, invalidate])

  // Unmounting mid-leg releases the ticker demand.
  useLayoutEffect(
    () => () => {
      if (leg.current) running.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    if (drifting) {
      along.current = driftStep(along.current, clampDelta(delta))
      cloudDeckUniforms.uOffset.value.set(along.current, along.current)
    }
    const l = leg.current
    if (!l) return
    // The leg began between frames: its first frame's delta spans the idle gap, so it doesn't count.
    if (!l.fresh) l.elapsed += clampDelta(delta) * 1000
    l.fresh = false
    const t = Math.min(1, l.elapsed / CLOUD_MS)
    show(deckAt(l.from, l.to, t))
    if (t < 1) {
      invalidate()
      return
    }
    leg.current = null
    running.current?.(false)
  })

  const plane = useMemo(() => {
    const b = model.bounds
    const m = FOG_MARGIN + FOG_DEPTH
    return {
      x: (b.minX + b.maxX) / 2,
      z: (b.minZ + b.maxZ) / 2,
      width: b.maxX - b.minX + 2 * m,
      depth: b.maxZ - b.minZ + 2 * m,
    }
  }, [model.bounds])

  return (
    <mesh
      position={[plane.x, 0, plane.z]}
      rotation-x={-Math.PI / 2}
      renderOrder={CLOUD_DECK_RENDER_ORDER}
      frustumCulled={false}
      raycast={noRaycast}
      material={cloudDeckMaterial}
    >
      <planeGeometry args={[plane.width, plane.depth]} />
    </mesh>
  )
}
```

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx`
Expected: PASS. If `clampDelta` caps the 0.1 s test frames (check `MAX_FRAME_DELTA` in `scene/tuning.ts`), the drift bound `5 * 0.1 * CLOUD_DECK_DRIFT` still holds as an upper bound; do not loosen the other assertions.

- [ ] **Step 6: Mount it.** In `scene/world-scene.tsx` add `import { CloudDeck } from './cloud-deck'`, a state `const [clouding, setClouding] = useState(false)` beside `growing`, `clouds: clouding,` in the `tickerWanted({...})` call after `growth: growing,`, and mount the deck directly after `<WorldContents … />`, before `<Labels … />`:

```tsx
      <CloudDeck
        model={props.model}
        focus={props.focus}
        animate={animate}
        drifting={seaWave}
        onRunning={setClouding}
      />
```

- [ ] **Step 7: Gate.** From the root: `bun run test && bun run typecheck && bun run lint && bun run build`; then `grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists one file, the world-scene chunk. (The controller compiles the shader in headless Chromium and previews the look after this task.)

- [ ] **Step 8: Commit.**

```bash
git add apps/web/src/scene/cloud-deck-material.ts apps/web/src/scene/cloud-deck-material.test.ts \
  apps/web/src/scene/cloud-deck.tsx apps/web/src/scene/cloud-deck.test.tsx \
  apps/web/src/scene/ticker.ts apps/web/src/scene/ticker.test.ts apps/web/src/scene/world-scene.tsx
git commit -m "feat(web): lay a world-anchored cloud deck over everything outside the current layer"
```
