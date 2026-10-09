# Phase 5h Cloud Veil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cloud deck's pattern spread out and random (warped, two layers, a coverage map), show a light veil on the archipelago and island layers, and cut a hole only in a district.

**Architecture:** Task 1 changes only the look: a two-channel texture, a new fragment shader, and per-layer drift offsets computed in the pure model (`layerOffset`) and written by `writeDrift`. Task 2 changes only the layering: the model's hole, veil and legs (`deckHole`, `closeHole`, `isOpen`, `VEIL`, `deckLeg`, `sameDeck`), `writeDeck`'s no-hole case, and the component's visibility.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5, `@react-three/test-renderer` 9.1.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 23.7 (revises 23.1–23.6).

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk; `scene/model/*` and `scene/tuning.ts` are three-free.
- Every colour comes from `scenePalette`; the deck colour is `scenePalette.cloud`.
- No API or DTO change. Still one draw call for the deck.
- Values, verbatim: `CLOUD_VEIL = 0.4`, `CLOUD_DECK_TILE = 22`, `CLOUD_DECK_TILE_B = 37`, `CLOUD_DECK_WARP = 10`, `CLOUD_DECK_WARP_SCALE = 45`, `CLOUD_DECK_COVER_SCALE = 140`, `CLOUD_DECK_COVER_LO = 0.45`, `CLOUD_DECK_COVER_HI = 0.7`, `CLOUD_COVER_SEED = 11`; unchanged `CLOUD_DECK_ALPHA = 0.85`, `CLOUD_DECK_FEATHER = 2 * Math.sqrt(3)`, `CLOUD_DECK_DRIFT = 0.2`, `CLOUD_MS = 600`. Rotations: layer B `[0.8, -0.6, 0.6, 0.8]`, cover `[0.28, 0.96, -0.96, 0.28]` (row-major `[[a, b], [c, d]]`).
- Commit messages: conventional, no AI attribution, no `Co-Authored-By` trailer. Check `git branch --show-current` prints `phase-5h-cloud-frame` before every commit.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green.

## Review Focus

1. Leaving a district for its island mid-opening must close the hole from where it is, not jump to fully open first. Pinned in Task 2 (`deckLeg` from a mid-leg deck).
2. A district whose milestone was deleted while you are in it must show the veil, not a stale hole. Pinned in Task 2 (`deckHole` unknown milestone).
3. After the hole has closed (island layer), entering another district must open from that district's centre, not slide from the old district. Pinned in Task 2 (`isOpen` of a closed hole).
4. A long session must not make the drift offsets lose precision or jump: each layer's offset stays in [0, 1) for any `along`. Pinned in Task 1 (`layerOffset` at large `along`).
5. Archipelago ↔ island must start no leg and hold no ticker demand (both are the veil). Pinned in Task 2.

---

### Task 1: The spread (texture, shader, per-layer drift)

**Files:**
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/cloud-deck.ts`, `apps/web/src/scene/model/cloud-deck.test.ts`, `apps/web/src/scene/cloud-deck-material.ts`, `apps/web/src/scene/cloud-deck-material.test.ts`, `apps/web/src/scene/cloud-deck.tsx`, `apps/web/src/scene/cloud-deck.test.tsx`

**Interfaces:**
- Consumes: `cloudNoise`, `wispAlpha` (`scene/model/cloud-noise.ts`).
- Produces: tuning `CLOUD_DECK_TILE` (now 22), `CLOUD_DECK_TILE_B`, `CLOUD_DECK_WARP`, `CLOUD_DECK_WARP_SCALE`, `CLOUD_DECK_COVER_SCALE`, `CLOUD_DECK_COVER_LO`, `CLOUD_DECK_COVER_HI`, `CLOUD_COVER_SEED`; model `type Turn = readonly [number, number, number, number]`, `LAYER_B_TURN: Turn`, `COVER_TURN: Turn`, `driftStep(along: number, seconds: number): number` (no wrap), `layerOffset(along: number, scale: number, turn?: Turn): [number, number]`; material uniforms `uOffA`, `uOffB`, `uOffCover`, `uWarpOff` (replacing `uTile`, `uOffset`), `writeDrift(along: number): void`.

- [ ] **Step 1: Tuning.** In `scene/tuning.ts`, change `export const CLOUD_DECK_TILE = 12` to `22` (doc comment: `/** World units per tile of the first wisp layer. */`) and add after it:

```ts
/** World units per tile of the second, rotated wisp layer. */
export const CLOUD_DECK_TILE_B = 37
/** How far, in world units, the raw noise bends the wisps' shapes. */
export const CLOUD_DECK_WARP = 10
/** World units per tile of the bending noise. */
export const CLOUD_DECK_WARP_SCALE = 45
/** World units per tile of the coverage map: thick banks and clear sky. */
export const CLOUD_DECK_COVER_SCALE = 140
/** Coverage below LO is clear sky, above HI full cloud (0–1 of the raw noise). */
export const CLOUD_DECK_COVER_LO = 0.45
export const CLOUD_DECK_COVER_HI = 0.7
/** Seeds the raw noise in the texture's second channel. */
export const CLOUD_COVER_SEED = 11
```

- [ ] **Step 2: Failing model tests.** In `scene/model/cloud-deck.test.ts`, replace the whole `describe('driftStep', …)` block with:

```ts
describe('drift', () => {
  test('driftStep moves at CLOUD_DECK_DRIFT per second and never wraps', () => {
    expect(driftStep(0, 2)).toBeCloseTo(2 * CLOUD_DECK_DRIFT)
    expect(driftStep(1000, 1)).toBeCloseTo(1000 + CLOUD_DECK_DRIFT)
  })

  test('layerOffset is the fractional texture offset of one layer', () => {
    expect(layerOffset(11, 22)).toEqual([0.5, 0.5])
    const [u, v] = layerOffset(10, 37, LAYER_B_TURN)
    expect(u).toBeCloseTo((((0.8 - 0.6) * 10) / 37) % 1)
    expect(v).toBeCloseTo((((0.6 + 0.8) * 10) / 37) % 1)
  })

  test('layerOffset stays in [0, 1) for any along, including a turn with negative terms', () => {
    for (const along of [0, 0.3, 123.4, 1e6 + 0.7]) {
      for (const [scale, turn] of [
        [22, undefined],
        [37, LAYER_B_TURN],
        [140, COVER_TURN],
      ] as const) {
        for (const x of layerOffset(along, scale, turn)) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThan(1)
        }
      }
    }
  })
})
```

Update the test file's imports: from `'../tuning'` import only `CLOUD_DECK_DRIFT`; from `'./cloud-deck'` add `COVER_TURN`, `LAYER_B_TURN`, `layerOffset`.

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: FAIL (`layerOffset` is not exported).

- [ ] **Step 3: Model.** In `scene/model/cloud-deck.ts`, change the tuning import to `import { CLOUD_DECK_DRIFT } from '../tuning'` and replace `driftStep` with:

```ts
/** A 2×2 rotation, row-major: `[[a, b], [c, d]]` as `[a, b, c, d]`. */
export type Turn = readonly [number, number, number, number]

const STRAIGHT: Turn = [1, 0, 0, 1]
/** The second wisp layer's rotation, so the two layers never line up. */
export const LAYER_B_TURN: Turn = [0.8, -0.6, 0.6, 0.8]
/** The coverage map's rotation. */
export const COVER_TURN: Turn = [0.28, 0.96, -0.96, 0.28]

/** The drift distance after `seconds` more; unbounded (the layers share no common period). */
export function driftStep(along: number, seconds: number): number {
  return along + seconds * CLOUD_DECK_DRIFT
}

const fract = (v: number) => v - Math.floor(v)

/**
 * One layer's texture offset for a drift of `along` along (1, 1): `fract(turn · (along, along) /
 * scale)`, so the uniform stays in [0, 1) however long the session runs (spec 23.7).
 */
export function layerOffset(along: number, scale: number, turn: Turn = STRAIGHT): [number, number] {
  const [a, b, c, d] = turn
  return [fract(((a + b) * along) / scale), fract(((c + d) * along) / scale)]
}
```

Run the model tests again. Expected: PASS.

- [ ] **Step 4: Failing material tests.** In `scene/cloud-deck-material.test.ts`:

Replace the test `'the shader measures the hole with the maths of areaDistance'` with:

```ts
  test('the shader measures the hole with the maths of areaDistance', () => {
    expect(CLOUD_DECK_FRAGMENT).toContain('vec2 q = abs( p - centre ) - extent;')
    expect(CLOUD_DECK_FRAGMENT).toContain(
      'return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;',
    )
    expect(CLOUD_DECK_FRAGMENT).toContain('smoothstep( 0.0, uFeather, holeDistance( p ) )')
  })

  test('the shader warps two wisp layers and thins them by the coverage map', () => {
    const g = (n: number) => n.toFixed(4)
    expect(CLOUD_DECK_FRAGMENT).toContain(`p / ${g(CLOUD_DECK_WARP_SCALE)} + uWarpOff`)
    expect(CLOUD_DECK_FRAGMENT).toContain(`vec2 q = p + bend * ${g(CLOUD_DECK_WARP)};`)
    expect(CLOUD_DECK_FRAGMENT).toContain(`q / ${g(CLOUD_DECK_TILE)} + uOffA`)
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `turn( q, vec4( ${LAYER_B_TURN.map(g).join(', ')} ) ) / ${g(CLOUD_DECK_TILE_B)}`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `turn( p, vec4( ${COVER_TURN.map(g).join(', ')} ) ) / ${g(CLOUD_DECK_COVER_SCALE)}`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `smoothstep( ${g(CLOUD_DECK_COVER_LO)}, ${g(CLOUD_DECK_COVER_HI)}, cover )`,
    )
  })
```

Replace the test `'starts with the tuning, the cloud colour and the wisp texture'` with:

```ts
  test('starts with the feather, the cloud colour and a two-channel texture', () => {
    expect(cloudDeckUniforms.uFeather.value).toBe(CLOUD_DECK_FEATHER)
    const [r, g, b] = [1, 3, 5].map(
      (i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16) / 255,
    )
    expect(cloudDeckUniforms.uColor.value.toArray()).toEqual([r, g, b])
    const map = cloudDeckUniforms.uMap.value
    expect(map.wrapS).toBe(THREE.RepeatWrapping)
    expect(map.wrapT).toBe(THREE.RepeatWrapping)
    expect(map.format).toBe(THREE.RGFormat)
    expect(map.minFilter).toBe(THREE.LinearFilter)
    expect(map.magFilter).toBe(THREE.LinearFilter)
    expect(map.generateMipmaps).toBe(false)
    const data = map.image.data as Uint8Array
    const wisps = wispAlpha(
      cloudNoise(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED),
      CLOUD_WISP_LO,
      CLOUD_WISP_HI,
    )
    const cover = cloudNoise(CLOUD_TEXTURE_SIZE, CLOUD_COVER_SEED)
    expect(data).toHaveLength(CLOUD_TEXTURE_SIZE * CLOUD_TEXTURE_SIZE * 2)
    expect([...data.filter((_, i) => i % 2 === 0)]).toEqual([...wisps])
    expect([...data.filter((_, i) => i % 2 === 1)]).toEqual([...cover])
  })

  test('writeDrift gives every layer its own offset in [0, 1)', () => {
    writeDrift(123.4)
    expect(cloudDeckUniforms.uOffA.value.toArray()).toEqual(layerOffset(123.4, CLOUD_DECK_TILE))
    expect(cloudDeckUniforms.uOffB.value.toArray()).toEqual(
      layerOffset(123.4, CLOUD_DECK_TILE_B, LAYER_B_TURN),
    )
    expect(cloudDeckUniforms.uOffCover.value.toArray()).toEqual(
      layerOffset(123.4, CLOUD_DECK_COVER_SCALE, COVER_TURN),
    )
    expect(cloudDeckUniforms.uWarpOff.value.toArray()).toEqual(
      layerOffset(123.4, CLOUD_DECK_WARP_SCALE),
    )
    writeDrift(0)
  })
```

Make the imports of that file:

```ts
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  CLOUD_DECK_FRAGMENT,
  cloudDeckMaterial,
  cloudDeckUniforms,
  writeDeck,
  writeDrift,
} from './cloud-deck-material'
import type { Area } from './model/area'
import { COVER_TURN, DECK_OFF, LAYER_B_TURN, layerOffset } from './model/cloud-deck'
import { cloudNoise, wispAlpha } from './model/cloud-noise'
import { scenePalette } from './model/palette'
import {
  CLOUD_COVER_SEED,
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_COVER_HI,
  CLOUD_DECK_COVER_LO,
  CLOUD_DECK_COVER_SCALE,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_TILE,
  CLOUD_DECK_TILE_B,
  CLOUD_DECK_WARP,
  CLOUD_DECK_WARP_SCALE,
  CLOUD_TEXTURE_SEED,
  CLOUD_TEXTURE_SIZE,
  CLOUD_WISP_HI,
  CLOUD_WISP_LO,
} from './tuning'
```

Keep the other tests (`'draws over everything…'`, `'writeDeck sets the hole…'`) unchanged.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: FAIL (`writeDrift` missing, texture is RedFormat, fragment lacks the new terms).

- [ ] **Step 5: Material.** In `scene/cloud-deck-material.ts`:

Make the imports:

```ts
import * as THREE from 'three'
import { COVER_TURN, type Deck, LAYER_B_TURN, layerOffset, type Turn } from './model/cloud-deck'
import { cloudNoise, wispAlpha } from './model/cloud-noise'
import { scenePalette } from './model/palette'
import {
  CLOUD_COVER_SEED,
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_COVER_HI,
  CLOUD_DECK_COVER_LO,
  CLOUD_DECK_COVER_SCALE,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_TILE,
  CLOUD_DECK_TILE_B,
  CLOUD_DECK_WARP,
  CLOUD_DECK_WARP_SCALE,
  CLOUD_TEXTURE_SEED,
  CLOUD_TEXTURE_SIZE,
  CLOUD_WISP_HI,
  CLOUD_WISP_LO,
} from './tuning'
```

Replace `wispTexture` with:

```ts
/** R: the wisps; G: raw noise for the bending and the coverage (spec 23.7). */
function cloudTexture(): THREE.DataTexture {
  const size = CLOUD_TEXTURE_SIZE
  const wisps = wispAlpha(cloudNoise(size, CLOUD_TEXTURE_SEED), CLOUD_WISP_LO, CLOUD_WISP_HI)
  const cover = cloudNoise(size, CLOUD_COVER_SEED)
  const data = new Uint8Array(size * size * 2)
  for (let i = 0; i < size * size; i++) {
    data[i * 2] = wisps[i] ?? 0
    data[i * 2 + 1] = cover[i] ?? 0
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

const glsl = (n: number) => n.toFixed(4)
const glslTurn = (t: Turn) => `vec4( ${t.map(glsl).join(', ')} )`
```

Make `cloudDeckUniforms`:

```ts
export const cloudDeckUniforms = {
  uMap: { value: cloudTexture() },
  /** The hole's box as (minX, minZ, maxX, maxZ). */
  uBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRound: { value: 0 },
  uFeather: { value: CLOUD_DECK_FEATHER },
  uOpacity: { value: 0 },
  /** Each layer's drift as a texture offset in [0, 1): see `layerOffset`. */
  uOffA: { value: new THREE.Vector2(0, 0) },
  uOffB: { value: new THREE.Vector2(0, 0) },
  uOffCover: { value: new THREE.Vector2(0, 0) },
  uWarpOff: { value: new THREE.Vector2(0, 0) },
  uColor: { value: rgb(scenePalette.cloud) },
}
```

Replace `CLOUD_DECK_FRAGMENT` with:

```ts
// The same signed distance as `areaDistance` in scene/model/area.ts. `turn` applies a row-major
// 2×2 rotation packed as vec4( a, b, c, d ).
export const CLOUD_DECK_FRAGMENT = `uniform sampler2D uMap;
uniform vec4 uBox;
uniform float uRound;
uniform float uFeather;
uniform float uOpacity;
uniform vec2 uOffA;
uniform vec2 uOffB;
uniform vec2 uOffCover;
uniform vec2 uWarpOff;
uniform vec3 uColor;
varying vec2 vWorldXZ;
float holeDistance( vec2 p ) {
  vec2 centre = ( uBox.xy + uBox.zw ) * 0.5;
  vec2 extent = ( uBox.zw - uBox.xy ) * 0.5;
  vec2 q = abs( p - centre ) - extent;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;
}
vec2 turn( vec2 v, vec4 m ) {
  return vec2( m.x * v.x + m.y * v.y, m.z * v.x + m.w * v.y );
}
void main() {
  vec2 p = vWorldXZ;
  float edge = smoothstep( 0.0, uFeather, holeDistance( p ) );
  vec2 warpUv = p / ${glsl(CLOUD_DECK_WARP_SCALE)} + uWarpOff;
  vec2 bend = vec2( texture2D( uMap, warpUv ).g, texture2D( uMap, warpUv + vec2( 0.5, 0.21 ) ).g ) - 0.5;
  vec2 q = p + bend * ${glsl(CLOUD_DECK_WARP)};
  float a = texture2D( uMap, q / ${glsl(CLOUD_DECK_TILE)} + uOffA ).r;
  float b = texture2D( uMap, turn( q, ${glslTurn(LAYER_B_TURN)} ) / ${glsl(CLOUD_DECK_TILE_B)} + vec2( 0.37, 0.71 ) + uOffB ).r;
  float wisp = 0.85 * max( a, b ) + 0.15 * min( a, b );
  float cover = texture2D( uMap, turn( p, ${glslTurn(COVER_TURN)} ) / ${glsl(CLOUD_DECK_COVER_SCALE)} + uOffCover ).g;
  wisp *= smoothstep( ${glsl(CLOUD_DECK_COVER_LO)}, ${glsl(CLOUD_DECK_COVER_HI)}, cover );
  gl_FragColor = vec4( uColor, wisp * edge * uOpacity );
}`
```

Add after `writeDeck`:

```ts
/** Writes each layer's offset for a drift of `along` world units along (1, 1). */
export function writeDrift(along: number): void {
  cloudDeckUniforms.uOffA.value.set(...layerOffset(along, CLOUD_DECK_TILE))
  cloudDeckUniforms.uOffB.value.set(...layerOffset(along, CLOUD_DECK_TILE_B, LAYER_B_TURN))
  cloudDeckUniforms.uOffCover.value.set(...layerOffset(along, CLOUD_DECK_COVER_SCALE, COVER_TURN))
  cloudDeckUniforms.uWarpOff.value.set(...layerOffset(along, CLOUD_DECK_WARP_SCALE))
}
```

Run the material tests. Expected: PASS.

- [ ] **Step 6: Component drift.** In `scene/cloud-deck.tsx`: import `writeDrift` from `./cloud-deck-material` (drop `cloudDeckUniforms` if no longer used); change `const along = useRef(cloudDeckUniforms.uOffset.value.x)` to `const along = useRef(0)`; and make the drift branch of `useFrame`:

```ts
    if (drifting) {
      along.current = driftStep(along.current, clampDelta(delta))
      writeDrift(along.current)
    }
```

In `scene/cloud-deck.test.tsx`: in `beforeEach` replace `cloudDeckUniforms.uOffset.value.set(0, 0)` with `writeDrift(0)` (import `writeDrift`); replace the test `'drifts only while drifting is on'` with:

```tsx
  test('drifts only while drifting is on, every layer offset in [0, 1)', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.advanceFrames(5, 0.1)
    expect(cloudDeckUniforms.uOffA.value.toArray()).toEqual([0, 0])
    await r.update(tree({ model, focus: onBeta, drifting: true }))
    await r.advanceFrames(5, 0.1)
    const [u] = cloudDeckUniforms.uOffA.value.toArray()
    expect(u).toBeGreaterThan(0)
    expect(u).toBeLessThanOrEqual((5 * 0.1 * CLOUD_DECK_DRIFT) / CLOUD_DECK_TILE + 1e-9)
    for (const off of [
      cloudDeckUniforms.uOffA,
      cloudDeckUniforms.uOffB,
      cloudDeckUniforms.uOffCover,
      cloudDeckUniforms.uWarpOff,
    ]) {
      for (const x of off.value.toArray()) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThan(1)
      }
    }
  })
```

and add `CLOUD_DECK_TILE` to that file's tuning import.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx src/scene/cloud-deck-material.test.ts src/scene/model/cloud-deck.test.ts`
Expected: PASS.

- [ ] **Step 7: Prove the old uniforms are gone.**

Run: `cd apps/web && grep -rnE "uTile|uOffset|wispTexture|RedFormat" src`
Expected: no output.

- [ ] **Step 8: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint && bun run build`; `grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists only the world-scene chunk. Then:

```bash
git add apps/web/src/scene
git commit -m "feat(web): spread the cloud deck out: warped, two rotated wisp layers and a coverage map"
```

---

### Task 2: The veil and the district-only hole

**Files:**
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/cloud-deck.ts`, `apps/web/src/scene/model/cloud-deck.test.ts`, `apps/web/src/scene/cloud-deck-material.ts`, `apps/web/src/scene/cloud-deck-material.test.ts`, `apps/web/src/scene/cloud-deck.tsx`, `apps/web/src/scene/cloud-deck.test.tsx`

**Interfaces:**
- Consumes: Task 1's material and model; `areaDistance` (`scene/model/area.ts`); `layerArea` (`scene/model/camera.ts`); `areaKey` (`scene/model/spotlight.ts`).
- Produces: tuning `CLOUD_VEIL`; model `deckHole(model, focus): Area | null` (district only), `closeHole(area: Area): Area`, `isOpen(d: Deck): boolean`, `VEIL: Deck`, `deckFor`, `deckLeg`, `sameDeck` with the 23.7 rules; `growArea` removed; `writeDeck` writes `uRound = -CLOUD_DECK_FEATHER` without a hole and opacity `CLOUD_DECK_ALPHA · strength` always.

- [ ] **Step 1: Tuning.** In `scene/tuning.ts`, after `CLOUD_DECK_ALPHA`, add:

```ts
/** The deck's strength on the archipelago and island layers: a light veil, no hole (spec 23.7). */
export const CLOUD_VEIL = 0.4
```

- [ ] **Step 2: Failing model tests.** In `scene/model/cloud-deck.test.ts`:

Replace the fixture block (from `const mvp = …` through `const onMvp …`) with:

```ts
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
```

Delete `describe('growArea', …)`. Replace `describe('deckHole', …)` and `describe('deck tween', …)` with:

```ts
describe('deckHole', () => {
  test('no hole on the archipelago, on an island, or for an unknown island', () => {
    expect(deckHole(model, { kind: 'archipelago' })).toBeNull()
    expect(deckHole(model, onBeta)).toBeNull()
    expect(deckHole(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('a district is its own rounded box', () => {
    expect(layerArea(model, onMvp)).not.toEqual(layerArea(model, onBeta))
    expect(deckHole(model, onMvp)).toEqual(layerArea(model, onMvp))
  })

  test('a district whose milestone is gone shows the veil', () => {
    expect(deckHole(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' })).toBeNull()
  })
})

describe('closeHole', () => {
  test('collapses to the centre and shows nothing anywhere', () => {
    const closed = closeHole(b)
    expect(closed).toEqual({ minX: 11, maxX: 11, minZ: 2, maxZ: 2, round: -CLOUD_DECK_FEATHER })
    expect(areaDistance(closed, { x: 11, z: 2 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(areaDistance(closed, { x: 40, z: -9 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(isOpen({ hole: closed, strength: CLOUD_VEIL })).toBe(false)
    expect(isOpen(deckFor(b))).toBe(true)
    expect(isOpen(VEIL)).toBe(false)
  })
})

describe('deck legs', () => {
  test('no hole is the veil; a hole is full strength', () => {
    expect(deckFor(null)).toEqual(VEIL)
    expect(VEIL).toEqual({ hole: null, strength: CLOUD_VEIL })
    expect(deckFor(a)).toEqual({ hole: a, strength: 1 })
  })

  test('island to district opens the hole from its centre as the cloud thickens', () => {
    const { from, to } = deckLeg(VEIL, deckFor(b))
    expect(from).toEqual({ hole: closeHole(b), strength: CLOUD_VEIL })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBeGreaterThan(CLOUD_VEIL)
    expect(mid.strength).toBeLessThan(1)
    expect(mid.hole?.minX).toBeCloseTo(10.5)
  })

  test('district to island closes the hole in place as the cloud thins', () => {
    expect(deckLeg(deckFor(b), VEIL)).toEqual({
      from: { hole: b, strength: 1 },
      to: { hole: closeHole(b), strength: CLOUD_VEIL },
    })
  })

  test('leaving mid-opening closes from where the hole is', () => {
    const opening = deckLeg(VEIL, deckFor(b))
    const mid = deckAt(opening.from, opening.to, 0.5)
    const { from, to } = deckLeg(mid, VEIL)
    expect(from).toEqual(mid)
    expect(to.strength).toBe(CLOUD_VEIL)
    expect(to.hole?.round).toBe(-CLOUD_DECK_FEATHER)
    expect(to.hole?.minX).toBeCloseTo(11)
  })

  test('after closing, the next district opens from its own centre', () => {
    const closed = { hole: closeHole(b), strength: CLOUD_VEIL }
    expect(deckLeg(closed, deckFor(a)).from).toEqual({ hole: closeHole(a), strength: CLOUD_VEIL })
  })

  test('district to district slides at full strength', () => {
    const { from, to } = deckLeg(deckFor(a), deckFor(b))
    expect(from).toEqual({ hole: a, strength: 1 })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('veil to veil is the same deck', () => {
    const { from, to } = deckLeg(VEIL, VEIL)
    expect(sameDeck(from, to)).toBe(true)
  })

  test('endpoints are exact', () => {
    const from = deckFor(a)
    const to = deckFor(b)
    expect(deckAt(from, to, 0)).toEqual(from)
    expect(deckAt(from, to, 1)).toEqual(to)
  })

  test('sameDeck: equal strength, and both closed or the same open hole', () => {
    expect(sameDeck(VEIL, { hole: closeHole(a), strength: CLOUD_VEIL })).toBe(true)
    expect(sameDeck(deckFor(a), deckFor({ ...a }))).toBe(true)
    expect(sameDeck(deckFor(a), deckFor(b))).toBe(false)
    expect(sameDeck(VEIL, DECK_OFF)).toBe(false)
    expect(sameDeck(deckFor(a), { hole: a, strength: 0.5 })).toBe(false)
  })
})
```

Make the file's imports:

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_FEATHER, CLOUD_VEIL } from '../tuning'
import { type Area, areaDistance } from './area'
import { layerArea } from './camera'
import {
  COVER_TURN,
  closeHole,
  DECK_OFF,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  isOpen,
  LAYER_B_TURN,
  layerOffset,
  sameDeck,
  VEIL,
} from './cloud-deck'
import { buildSceneModel } from './scene-model'
```

(The `a` and `b` areas stay as they are: `a` a circle of round 4 at the origin, `b` the box 10–12 × 2–2 with round 1.)

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: FAIL (`closeHole`, `isOpen`, `VEIL` missing; island hole still returned).

- [ ] **Step 3: Model.** In `scene/model/cloud-deck.ts`:

Make the tuning import `import { CLOUD_DECK_DRIFT, CLOUD_DECK_FEATHER, CLOUD_VEIL } from '../tuning'` and remove the `SHALLOWS_MARGIN` import. Delete `growArea`. Replace `deckHole`, `DECK_OFF`, `deckFor`, `deckLeg` and `sameDeck` with:

```ts
/**
 * The deck's hole (spec 23.7): a district's rounded box, and nothing elsewhere. A district that
 * falls back to its island (an unknown milestone) shows the veil.
 */
export function deckHole(model: SceneModel, focus: Focus): Area | null {
  if (focus.kind !== 'district') return null
  const area = layerArea(model, focus)
  const island = layerArea(model, { kind: 'island', projectId: focus.projectId })
  if (!area || !island || areaKey(area) === areaKey(island)) return null
  return area
}

/** What the deck shows: its hole and how strongly it covers the rest (0–1). */
export type Deck = { hole: Area | null; strength: number }

/** Before the first mount writes anything. */
export const DECK_OFF: Deck = { hole: null, strength: 0 }

/** The archipelago and island layers: a light veil with no hole. */
export const VEIL: Deck = { hole: null, strength: CLOUD_VEIL }

export function deckFor(hole: Area | null): Deck {
  return hole ? { hole, strength: 1 } : VEIL
}

/** The hole shrunk to its centre and rounded inward by the feather: it shows nothing. */
export function closeHole(area: Area): Area {
  const x = (area.minX + area.maxX) / 2
  const z = (area.minZ + area.maxZ) / 2
  return { minX: x, maxX: x, minZ: z, maxZ: z, round: -CLOUD_DECK_FEATHER }
}

/** The deck cuts a visible hole: one is set and not closed. */
export function isOpen(d: Deck): boolean {
  return d.hole !== null && (d.hole.round ?? 0) > -CLOUD_DECK_FEATHER
}

/**
 * The tween between what is shown and the new layer's deck (spec 23.7): into a district the hole
 * opens from its centre as the cloud thickens; out of one it closes in place as the cloud thins to
 * the veil; district to district it slides at full strength.
 */
export function deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck } {
  if (!target.hole) {
    if (current.hole && isOpen(current)) {
      return { from: current, to: { hole: closeHole(current.hole), strength: target.strength } }
    }
    return { from: current, to: target }
  }
  if (!isOpen(current)) {
    return { from: { hole: closeHole(target.hole), strength: current.strength }, to: target }
  }
  return { from: current, to: target }
}
```

Keep `deckAt` unchanged. Replace `sameDeck` with:

```ts
/** Two decks that look the same: equal strength, and both closed or the same open hole. */
export function sameDeck(a: Deck, b: Deck): boolean {
  if (a.strength !== b.strength) return false
  const openA = isOpen(a)
  const openB = isOpen(b)
  if (!openA && !openB) return true
  return openA && openB && areaKey(a.hole) === areaKey(b.hole)
}
```

Run the model tests. Expected: PASS.

- [ ] **Step 4: Failing material test.** In `scene/cloud-deck-material.test.ts`, replace the test `'writeDeck sets the hole and scales the opacity by strength'` with:

```ts
  test('writeDeck sets the hole and scales the opacity by strength', () => {
    const hole: Area = { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }
    writeDeck({ hole, strength: 0.5 })
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(cloudDeckUniforms.uRound.value).toBe(0.5)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * 0.5)
  })

  test('with no hole the whole deck shows at the veil, the box left in place', () => {
    writeDeck({ hole: { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }, strength: 1 })
    writeDeck(VEIL)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * CLOUD_VEIL)
    writeDeck(DECK_OFF)
    expect(cloudDeckUniforms.uOpacity.value).toBe(0)
  })
```

Add `VEIL` to the `./model/cloud-deck` import and `CLOUD_VEIL` to the tuning import.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: FAIL (no-hole opacity is 0 and `uRound` unchanged).

- [ ] **Step 5: writeDeck.** In `scene/cloud-deck-material.ts`, replace `writeDeck` with:

```ts
export function writeDeck(deck: Deck): void {
  const { hole } = deck
  if (hole) {
    cloudDeckUniforms.uBox.value.set(hole.minX, hole.minZ, hole.maxX, hole.maxZ)
    cloudDeckUniforms.uRound.value = hole.round ?? 0
  } else {
    // No hole: round inward by the feather so the whole deck shows; the box stays where it was.
    cloudDeckUniforms.uRound.value = -CLOUD_DECK_FEATHER
  }
  cloudDeckUniforms.uOpacity.value = CLOUD_DECK_ALPHA * deck.strength
}
```

Run the material tests. Expected: PASS.

- [ ] **Step 6: Component visibility.** In `scene/cloud-deck.tsx`, change the visibility line in `show` to:

```ts
    // A deck with no strength shows nothing: skip its full-screen blended pass.
    if (mesh.current) mesh.current.visible = d.strength > 0
```

and update the component's doc comment to: `The cloud deck (spec 23.7): one plane over the world, a veil on the archipelago and island layers and a hole in a district. It opens, closes and slides with the route; a refetch with the same hole is still. Drifts while \`drifting\`.`

- [ ] **Step 7: Deck tests.** Replace `scene/cloud-deck.test.tsx`'s fixture and every test except `'one untappable plane over the whole world, drawn above everything'` and the drift test from Task 1. The fixture:

```tsx
const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const later = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [mvp, later],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const archipelago: Focus = { kind: 'archipelago' }
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onLater: Focus = { kind: 'district', projectId: beta.id, milestoneId: later.id }
const veil = CLOUD_DECK_ALPHA * CLOUD_VEIL
```

Keep `Props`, `tree`, `opacity`, `box`, `frames` and the `beforeEach` (with `writeDrift(0)`). The tests:

```tsx
  test('the archipelago and an island show the veil; between them nothing runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    const mesh = r.scene.findAllByType('Mesh')[0]?.instance as THREE.Mesh
    expect(mesh.visible).toBe(true)
    expect(opacity()).toBeCloseTo(veil)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeCloseTo(veil)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('the first mount in a district shows its hole at once', async () => {
    const onRunning = vi.fn()
    await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    const h = deckHole(model, onMvp)
    expect(box()).toEqual([h?.minX, h?.minZ, h?.maxX, h?.maxZ])
    expect(cloudDeckUniforms.uRound.value).toBe(h?.round)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('island to district opens the hole from its centre over CLOUD_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    const h = deckHole(model, onMvp)
    if (!h) throw new Error('no district hole')
    // The first frame after the route change doesn't advance the leg: the hole is still closed.
    await r.advanceFrames(1, 0.1)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(box()[0]).toBeCloseTo((h.minX + h.maxX) / 2)
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBeGreaterThan(veil)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()).toEqual([h.minX, h.minZ, h.maxX, h.maxZ])
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('district to island closes the hole in place and thins to the veil', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    const h = deckHole(model, onMvp)
    if (!h) throw new Error('no district hole')
    await r.update(tree({ model, focus: onBeta }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(opacity()).toBeCloseTo(veil)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(box()[0]).toBeCloseTo((h.minX + h.maxX) / 2)
  })

  test('district to district slides the hole at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    await r.update(tree({ model, focus: onLater }))
    await r.advanceFrames(2, 0.1)
    const from = deckHole(model, onMvp)?.minX ?? 0
    const to = deckHole(model, onLater)?.minX ?? 0
    expect(from).not.toBe(to)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
    await r.advanceFrames(frames, 0.1)
    expect(box()[0]).toBeCloseTo(to)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onMvp, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the hole neither replays the leg nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onMvp, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('unmounting mid-leg releases the ticker demand', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('turning animation off mid-leg finishes the leg at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.update(tree({ model, focus: onMvp, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })
```

Delete the old tests `'the first mount shows its deck at once, even on a deep link'`, `'hidden on the archipelago; entering an island fades it in over CLOUD_MS'`, `'island to island slides the hole at full strength'`, `'back to the archipelago mid-slide fades out from where the hole is'`, `'the mesh is hidden while the deck shows nothing'` and `'a deep link to an island is visible from the first render'`; their behaviour is replaced by the tests above. Make the imports cover `fakeMilestone`, `CLOUD_DECK_FEATHER` and `CLOUD_VEIL`, and drop any that become unused.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx src/scene/cloud-deck-material.test.ts src/scene/model/cloud-deck.test.ts`
Expected: PASS. If `'district to district…'` fails on `expect(from).not.toBe(to)`, the `later` fixture falls back to its island: report it rather than change the assertion.

- [ ] **Step 8: Prove the island hole is gone.**

Run: `cd apps/web && grep -rnE "growArea|SHALLOWS_MARGIN" src/scene/model/cloud-deck.ts src/scene/cloud-deck.tsx`
Expected: no output.

- [ ] **Step 9: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint && bun run build`; `grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists only the world-scene chunk. Then:

```bash
git add apps/web/src/scene
git commit -m "feat(web): veil the archipelago and island layers and open the cloud deck's hole only in a district"
```
