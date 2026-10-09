# Phase 5h Procedural Clouds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cloud deck's texture with procedural clouds generated in the shader, and give the archipelago a lighter, sparser veil than an island.

**Architecture:** Task 1 swaps the look only: a new fragment shader (hash value noise, fbm, a light warp, slow density banks, a soft threshold), one wrapped drift offset, and the texture and its noise module removed. Task 2 adds the per-layer look: `Deck` gains `threshold`, `deckTarget` picks the archipelago, island or district deck, legs tween strength and threshold, and the component keys on the whole target deck.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, three 0.186 + R3F 9.8, Vitest 5, `@react-three/test-renderer` 9.1.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 23.8 (revises 23.7 and earlier parts of 23).

## Global Constraints

- Biome: single quotes, no semicolons, width 100. `bun run lint` stays at the one known info (`bunx biome check --write <files>` formats).
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk; `scene/model/*` and `scene/tuning.ts` are three-free.
- The deck colour is `scenePalette.cloud`. No API or DTO change. One draw call for the deck.
- Values, verbatim: `CLOUD_DECK_SCALE = 9`, `CLOUD_DECK_OCTAVES = 5`, `CLOUD_DECK_WARP = 0.6`, `CLOUD_DECK_BANK_SCALE = 60`, `CLOUD_DECK_BANK = 0.25`, `CLOUD_DECK_SOFT = 0.18`, `CLOUD_THRESHOLD = 0.5`, `CLOUD_ARCHIPELAGO_THRESHOLD = 0.58`, `CLOUD_VEIL = 0.65`, `CLOUD_ARCHIPELAGO_VEIL = 0.47`, `CLOUD_DECK_DRIFT_WRAP = 4500`; unchanged `CLOUD_DECK_ALPHA = 0.85`, `CLOUD_DECK_FEATHER = 2 * Math.sqrt(3)`, `CLOUD_DECK_DRIFT = 0.2`, `CLOUD_MS = 600`, `SEA_MARGIN = 250`.
- Commit messages: conventional, no AI attribution, no `Co-Authored-By` trailer. Check `git branch --show-current` prints `phase-5h-cloud-frame` before every commit.
- Commands: web `cd apps/web && bunx vitest run <file>`; gate from the root `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`. Every commit leaves the full suite green. If the API suite times out under machine load, re-run it once and report both runs.

## Review Focus

1. Going archipelago → island → archipelago quickly (before the first leg ends) must tween back from where it is, not jump. Pinned in Task 2 (`deckLeg`/`deckAt` from a mid-leg veil).
2. An island id that no longer exists (deleted elsewhere) must show the archipelago's veil, as the camera falls back to the archipelago. Pinned in Task 2 (`deckTarget`).
3. A refetch while on the archipelago or an island must not restart a leg: the key is the target deck's value, not its object identity. Pinned in Task 2.
4. A drift past the wrap must land back in [0, wrap), including exactly at the wrap. Pinned in Task 1 (`driftWrap`).
5. Leaving a district for the archipelago must close the hole and land on the archipelago's strength and threshold, not the island's. Pinned in Task 2.

---

### Task 1: Procedural clouds (shader, drift)

**Files:**
- Delete: `apps/web/src/scene/model/cloud-noise.ts`, `apps/web/src/scene/model/cloud-noise.test.ts`
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/cloud-deck.ts`, `apps/web/src/scene/model/cloud-deck.test.ts`, `apps/web/src/scene/cloud-deck-material.ts`, `apps/web/src/scene/cloud-deck-material.test.ts`, `apps/web/src/scene/cloud-deck.test.tsx`

**Interfaces:**
- Consumes: the existing `Deck`, `DECK_OFF`, `VEIL`, `driftStep` (`scene/model/cloud-deck.ts`).
- Produces: tuning `CLOUD_DECK_SCALE`, `CLOUD_DECK_OCTAVES`, `CLOUD_DECK_WARP` (now 0.6), `CLOUD_DECK_BANK_SCALE`, `CLOUD_DECK_BANK`, `CLOUD_DECK_SOFT`, `CLOUD_THRESHOLD`, `CLOUD_DECK_DRIFT_WRAP`; model `driftWrap(along: number): number`; material uniforms `uThreshold` (float) and `uDrift` (vec2), `writeDrift(along: number): void` (writes `uDrift`); `layerOffset`, `Turn`, `LAYER_B_TURN`, `COVER_TURN`, `uMap`, `uOffA`, `uOffB`, `uOffCover`, `uWarpOff` removed.

- [ ] **Step 1: Tuning.** In `scene/tuning.ts` delete `CLOUD_DECK_TILE`, `CLOUD_DECK_TILE_B`, `CLOUD_DECK_WARP_SCALE`, `CLOUD_DECK_COVER_SCALE`, `CLOUD_DECK_COVER_LO`, `CLOUD_DECK_COVER_HI`, `CLOUD_COVER_SEED`, `CLOUD_TEXTURE_SIZE`, `CLOUD_TEXTURE_SEED`, `CLOUD_WISP_LO`, `CLOUD_WISP_HI` with their doc comments, and replace the `CLOUD_DECK_WARP` line and its comment with the block below (placed after `CLOUD_DECK_FEATHER`):

```ts
/** World units per base noise cell of the clouds (spec 23.8). */
export const CLOUD_DECK_SCALE = 9
/** Noise octaves summed per fbm. */
export const CLOUD_DECK_OCTAVES = 5
/** How far, in noise cells, a coarser fbm bends the cloud shapes. */
export const CLOUD_DECK_WARP = 0.6
/** World units per noise cell of the slow density banks. */
export const CLOUD_DECK_BANK_SCALE = 60
/** How far the banks shift the threshold either way: thicker banks, thinner sky. */
export const CLOUD_DECK_BANK = 0.25
/** The width of a cloud's soft edge, in fbm units. */
export const CLOUD_DECK_SOFT = 0.18
/** Density threshold on an island and in a district: higher is sparser. */
export const CLOUD_THRESHOLD = 0.5
/** The drift wraps here (world units), keeping the noise inputs small for float precision. */
export const CLOUD_DECK_DRIFT_WRAP = 4500
```

- [ ] **Step 2: Remove the texture noise.**

```bash
cd apps/web/src && git rm scene/model/cloud-noise.ts scene/model/cloud-noise.test.ts
```

- [ ] **Step 3: Failing model test.** In `scene/model/cloud-deck.test.ts` replace the whole `describe('drift', …)` block with:

```ts
describe('drift', () => {
  test('driftStep moves at CLOUD_DECK_DRIFT per second and never wraps', () => {
    expect(driftStep(0, 2)).toBeCloseTo(2 * CLOUD_DECK_DRIFT)
    expect(driftStep(1000, 1)).toBeCloseTo(1000 + CLOUD_DECK_DRIFT)
  })

  test('driftWrap keeps the shader offset in [0, CLOUD_DECK_DRIFT_WRAP)', () => {
    expect(driftWrap(12.5)).toBe(12.5)
    expect(driftWrap(CLOUD_DECK_DRIFT_WRAP)).toBe(0)
    expect(driftWrap(CLOUD_DECK_DRIFT_WRAP + 12.5)).toBe(12.5)
    for (const along of [0, 0.3, 4499.9, 1e7 + 0.7]) {
      expect(driftWrap(along)).toBeGreaterThanOrEqual(0)
      expect(driftWrap(along)).toBeLessThan(CLOUD_DECK_DRIFT_WRAP)
    }
  })
})
```

In the file's imports: from `'../tuning'` import `CLOUD_DECK_DRIFT, CLOUD_DECK_DRIFT_WRAP, CLOUD_DECK_FEATHER, CLOUD_VEIL`; from `'./cloud-deck'` drop `COVER_TURN`, `LAYER_B_TURN`, `layerOffset` and add `driftWrap`.

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: FAIL (`driftWrap` is not exported).

- [ ] **Step 4: Model.** In `scene/model/cloud-deck.ts` make the tuning import `import { CLOUD_DECK_DRIFT, CLOUD_DECK_DRIFT_WRAP, CLOUD_DECK_FEATHER, CLOUD_VEIL } from '../tuning'`, delete `Turn`, `STRAIGHT`, `LAYER_B_TURN`, `COVER_TURN`, `fract` and `layerOffset`, change `driftStep`'s doc comment to `/** The drift distance after \`seconds\` more; unbounded (see \`driftWrap\` for the shader). */`, and add after it:

```ts
/** The drift as the shader takes it: wrapped at CLOUD_DECK_DRIFT_WRAP (spec 23.8). */
export function driftWrap(along: number): number {
  return ((along % CLOUD_DECK_DRIFT_WRAP) + CLOUD_DECK_DRIFT_WRAP) % CLOUD_DECK_DRIFT_WRAP
}
```

Run the model tests. Expected: PASS.

- [ ] **Step 5: Failing material tests.** Replace `scene/cloud-deck-material.test.ts` with:

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
import { DECK_OFF, VEIL } from './model/cloud-deck'
import { scenePalette } from './model/palette'
import {
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_BANK,
  CLOUD_DECK_BANK_SCALE,
  CLOUD_DECK_DRIFT_WRAP,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_OCTAVES,
  CLOUD_DECK_SCALE,
  CLOUD_DECK_SOFT,
  CLOUD_DECK_WARP,
  CLOUD_THRESHOLD,
  CLOUD_VEIL,
} from './tuning'

const g = (n: number) => n.toFixed(4)

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

  test('the clouds are procedural: hashed noise, fbm, a warp, banks and a soft threshold', () => {
    expect(CLOUD_DECK_FRAGMENT).not.toContain('sampler2D')
    expect(CLOUD_DECK_FRAGMENT).toContain('vec2 w = fract( v * vec2( 123.34, 456.21 ) );')
    expect(CLOUD_DECK_FRAGMENT).toContain('w += dot( w, w + 45.32 );')
    expect(CLOUD_DECK_FRAGMENT).toContain('mat2 turn = mat2( 1.6, 1.2, -1.2, 1.6 );')
    expect(CLOUD_DECK_FRAGMENT).toContain(`for ( int i = 0; i < ${CLOUD_DECK_OCTAVES}; i++ )`)
    expect(CLOUD_DECK_FRAGMENT).toContain('vec2 world = vWorldXZ + uDrift;')
    expect(CLOUD_DECK_FRAGMENT).toContain(`vec2 s = world / ${g(CLOUD_DECK_SCALE)};`)
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `s += ${g(CLOUD_DECK_WARP)} * vec2( fbm( s * 0.5 + 3.1 ), fbm( s * 0.5 - 7.7 ) );`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `float bank = fbm( world / ${g(CLOUD_DECK_BANK_SCALE)} + 11.0 );`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `float t = uThreshold - ${g(CLOUD_DECK_BANK)} * ( bank - 0.5 );`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `float cloud = smoothstep( t, t + ${g(CLOUD_DECK_SOFT)}, d );`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain('gl_FragColor = vec4( uColor, cloud * edge * uOpacity );')
  })

  test('starts with the feather, the threshold and the cloud colour; no texture', () => {
    expect(cloudDeckUniforms.uFeather.value).toBe(CLOUD_DECK_FEATHER)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_THRESHOLD)
    const [r, gr, b] = [1, 3, 5].map(
      (i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16) / 255,
    )
    expect(cloudDeckUniforms.uColor.value.toArray()).toEqual([r, gr, b])
    expect('uMap' in cloudDeckUniforms).toBe(false)
  })

  test('writeDrift writes the wrapped drift along (1, 1)', () => {
    writeDrift(CLOUD_DECK_DRIFT_WRAP + 12.5)
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([12.5, 12.5])
    writeDrift(0)
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([0, 0])
  })

  test('writeDeck sets the hole and scales the opacity by strength', () => {
    const hole: Area = { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }
    writeDeck({ hole, strength: 0.5 })
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(cloudDeckUniforms.uRound.value).toBe(0.5)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * 0.5)
  })

  test('with no hole the box collapses to its centre and the whole deck shows at the veil; DECK_OFF shows nothing', () => {
    writeDeck({ hole: { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }, strength: 1 })
    writeDeck(VEIL)
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([2, 1, 2, 1])
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * CLOUD_VEIL)
    writeDeck(DECK_OFF)
    expect(cloudDeckUniforms.uOpacity.value).toBe(0)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: FAIL (the material still imports the deleted noise module; no `uThreshold`, `uDrift`, procedural fragment).

- [ ] **Step 6: Material.** Replace `scene/cloud-deck-material.ts` with:

```ts
import * as THREE from 'three'
import { type Deck, driftWrap } from './model/cloud-deck'
import { scenePalette } from './model/palette'
import {
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_BANK,
  CLOUD_DECK_BANK_SCALE,
  CLOUD_DECK_FEATHER,
  CLOUD_DECK_OCTAVES,
  CLOUD_DECK_SCALE,
  CLOUD_DECK_SOFT,
  CLOUD_DECK_WARP,
  CLOUD_THRESHOLD,
} from './tuning'

/** Above every other mesh: the deck draws over everything outside its hole. */
export const CLOUD_DECK_RENDER_ORDER = 10

// A ShaderMaterial without `colorspace_fragment` writes gl_FragColor unconverted, so the sRGB value
// goes straight through.
const rgb = (hex: string) =>
  new THREE.Vector3(...[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255))

const glsl = (n: number) => n.toFixed(4)

export const cloudDeckUniforms = {
  /** The hole's box as (minX, minZ, maxX, maxZ). */
  uBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRound: { value: 0 },
  uFeather: { value: CLOUD_DECK_FEATHER },
  uOpacity: { value: 0 },
  /** Density threshold: higher is sparser (spec 23.8). */
  uThreshold: { value: CLOUD_THRESHOLD },
  /** The drift in world units along (1, 1), wrapped: see `driftWrap`. */
  uDrift: { value: new THREE.Vector2(0, 0) },
  uColor: { value: rgb(scenePalette.cloud) },
}

const VERTEX = `varying vec2 vWorldXZ;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorldXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

// The hole uses the same signed distance as `areaDistance` in scene/model/area.ts. The clouds are
// hashed value noise summed as fbm, lightly warped, thresholded softly against slow density banks.
export const CLOUD_DECK_FRAGMENT = `uniform vec4 uBox;
uniform float uRound;
uniform float uFeather;
uniform float uOpacity;
uniform float uThreshold;
uniform vec2 uDrift;
uniform vec3 uColor;
varying vec2 vWorldXZ;
float holeDistance( vec2 p ) {
  vec2 centre = ( uBox.xy + uBox.zw ) * 0.5;
  vec2 extent = ( uBox.zw - uBox.xy ) * 0.5;
  vec2 q = abs( p - centre ) - extent;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;
}
float hash( vec2 v ) {
  vec2 w = fract( v * vec2( 123.34, 456.21 ) );
  w += dot( w, w + 45.32 );
  return fract( w.x * w.y );
}
float noise( vec2 v ) {
  vec2 i = floor( v );
  vec2 f = fract( v );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float bottom = mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x );
  float top = mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x );
  return mix( bottom, top, u.y );
}
float fbm( vec2 v ) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2( 1.6, 1.2, -1.2, 1.6 );
  for ( int i = 0; i < ${CLOUD_DECK_OCTAVES}; i++ ) {
    sum += amp * noise( v );
    v = turn * v;
    amp *= 0.5;
  }
  return sum;
}
void main() {
  float edge = smoothstep( 0.0, uFeather, holeDistance( vWorldXZ ) );
  vec2 world = vWorldXZ + uDrift;
  vec2 s = world / ${glsl(CLOUD_DECK_SCALE)};
  s += ${glsl(CLOUD_DECK_WARP)} * vec2( fbm( s * 0.5 + 3.1 ), fbm( s * 0.5 - 7.7 ) );
  float d = fbm( s );
  float bank = fbm( world / ${glsl(CLOUD_DECK_BANK_SCALE)} + 11.0 );
  float t = uThreshold - ${glsl(CLOUD_DECK_BANK)} * ( bank - 0.5 );
  float cloud = smoothstep( t, t + ${glsl(CLOUD_DECK_SOFT)}, d );
  gl_FragColor = vec4( uColor, cloud * edge * uOpacity );
}`

/** The cloud deck (spec 23.8): procedural clouds over the world, with a hole for a district. */
export const cloudDeckMaterial = new THREE.ShaderMaterial({
  uniforms: cloudDeckUniforms,
  vertexShader: VERTEX,
  fragmentShader: CLOUD_DECK_FRAGMENT,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  fog: false,
})
```

then append `writeDeck` (unchanged from the current file) and the new `writeDrift`:

```ts
export function writeDeck(deck: Deck): void {
  const { hole } = deck
  const b = cloudDeckUniforms.uBox.value
  if (hole) {
    b.set(hole.minX, hole.minZ, hole.maxX, hole.maxZ)
    cloudDeckUniforms.uRound.value = hole.round ?? 0
  } else {
    // No hole: collapse the box to its centre and round inward by the feather, so the whole deck
    // shows even after a remount left a district's box behind.
    const x = (b.x + b.z) / 2
    const z = (b.y + b.w) / 2
    b.set(x, z, x, z)
    cloudDeckUniforms.uRound.value = -CLOUD_DECK_FEATHER
  }
  cloudDeckUniforms.uOpacity.value = CLOUD_DECK_ALPHA * deck.strength
}

/** Writes the drift for `along` world units along (1, 1), wrapped for the shader. */
export function writeDrift(along: number): void {
  const w = driftWrap(along)
  cloudDeckUniforms.uDrift.value.set(w, w)
}
```

Run the material tests. Expected: PASS.

- [ ] **Step 7: Deck drift tests.** In `scene/cloud-deck.test.tsx`:

Replace the test `'a fresh mount resets the drift left by an earlier one'` with:

```tsx
  test('a fresh mount resets the drift left by an earlier one', async () => {
    cloudDeckUniforms.uDrift.value.set(40, 40)
    await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([0, 0])
  })
```

Replace the test `'drifts only while drifting is on, every layer offset in [0, 1)'` with:

```tsx
  test('drifts only while drifting is on', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.advanceFrames(5, 0.1)
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([0, 0])
    await r.update(tree({ model, focus: onBeta, drifting: true }))
    await r.advanceFrames(5, 0.1)
    const [x, z] = cloudDeckUniforms.uDrift.value.toArray()
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThanOrEqual(5 * 0.1 * CLOUD_DECK_DRIFT + 1e-9)
    expect(z).toBe(x)
  })
```

Drop `CLOUD_DECK_TILE` from that file's tuning import.

- [ ] **Step 8: Prove the texture path is gone.**

Run: `cd apps/web && grep -rnE "cloud-noise|cloudNoise|wispAlpha|layerOffset|LAYER_B_TURN|COVER_TURN|uMap|uOffA|uOffB|uOffCover|uWarpOff|CLOUD_TEXTURE_|CLOUD_WISP_|CLOUD_DECK_TILE|CLOUD_DECK_COVER|CLOUD_COVER_SEED|CLOUD_DECK_WARP_SCALE" src`
Expected: no output.

- [ ] **Step 9: Run and gate.**

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx src/scene/cloud-deck-material.test.ts src/scene/model/cloud-deck.test.ts`
Expected: PASS. Then from the root `bun run test && bun run typecheck && bun run lint && bun run build`; `grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists only the world-scene chunk.

- [ ] **Step 10: Commit.**

```bash
git add -A apps/web/src/scene
git commit -m "feat(web): generate the cloud deck's clouds in the shader instead of a texture"
```

---

### Task 2: Per-layer look (archipelago lighter and sparser)

**Files:**
- Modify: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/model/cloud-deck.ts`, `apps/web/src/scene/model/cloud-deck.test.ts`, `apps/web/src/scene/cloud-deck-material.ts`, `apps/web/src/scene/cloud-deck-material.test.ts`, `apps/web/src/scene/cloud-deck.tsx`, `apps/web/src/scene/cloud-deck.test.tsx`

**Interfaces:**
- Consumes: Task 1's material (`uThreshold`, `writeDeck`, `writeDrift`) and model (`driftStep`, `driftWrap`, `closeHole`, `isOpen`, `deckHole`, `deckAt`); `layerArea` (`scene/model/camera.ts`); `areaKey` (`scene/model/spotlight.ts`).
- Produces: tuning `CLOUD_VEIL` (now 0.65), `CLOUD_ARCHIPELAGO_VEIL`, `CLOUD_ARCHIPELAGO_THRESHOLD`; model `type Deck = { hole: Area | null; strength: number; threshold: number }`, `DECK_OFF`, `ISLAND_VEIL: Deck`, `ARCHIPELAGO_VEIL: Deck`, `deckTarget(model: SceneModel, focus: Focus): Deck`, `deckKey(d: Deck): string`, `deckLeg`, `deckAt`, `sameDeck` carrying threshold; `VEIL` and `deckFor` removed; `writeDeck` writes `uThreshold`.

- [ ] **Step 1: Tuning.** In `scene/tuning.ts` change `CLOUD_VEIL` to:

```ts
/** The deck's strength on an island: a veil, no hole (spec 23.8). */
export const CLOUD_VEIL = 0.65
/** The deck's strength on the archipelago: a lighter veil. */
export const CLOUD_ARCHIPELAGO_VEIL = 0.47
```

and after `CLOUD_THRESHOLD` add:

```ts
/** Density threshold on the archipelago: sparser than an island. */
export const CLOUD_ARCHIPELAGO_THRESHOLD = 0.58
```

- [ ] **Step 2: Failing model tests.** In `scene/model/cloud-deck.test.ts` keep the fixture (`today`, `beta`, `mvp`, `later`, `world`, `model`, `onBeta`, `onMvp`, `a`, `b`), the `describe('deckHole', …)` block and Task 1's `describe('drift', …)` block. Replace everything else (the `closeHole` and `deck legs` blocks) with:

```ts
const island: Deck = ISLAND_VEIL
const arch: Deck = ARCHIPELAGO_VEIL
const open = (hole: Area): Deck => ({ hole, strength: 1, threshold: CLOUD_THRESHOLD })

describe('deckTarget', () => {
  test('the archipelago is a lighter, sparser veil than an island', () => {
    expect(ARCHIPELAGO_VEIL).toEqual({
      hole: null,
      strength: CLOUD_ARCHIPELAGO_VEIL,
      threshold: CLOUD_ARCHIPELAGO_THRESHOLD,
    })
    expect(ISLAND_VEIL).toEqual({ hole: null, strength: CLOUD_VEIL, threshold: CLOUD_THRESHOLD })
    expect(deckTarget(model, { kind: 'archipelago' })).toEqual(ARCHIPELAGO_VEIL)
    expect(deckTarget(model, onBeta)).toEqual(ISLAND_VEIL)
  })

  test('a district is full strength with its hole', () => {
    expect(deckTarget(model, onMvp)).toEqual(open(layerArea(model, onMvp) as Area))
  })

  test('unknown ids fall back a level', () => {
    expect(deckTarget(model, { kind: 'island', projectId: 'nope' })).toEqual(ARCHIPELAGO_VEIL)
    expect(
      deckTarget(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toEqual(ISLAND_VEIL)
  })
})

describe('closeHole', () => {
  test('collapses to the centre and shows nothing anywhere', () => {
    const closed = closeHole(b)
    expect(closed).toEqual({ minX: 11, maxX: 11, minZ: 2, maxZ: 2, round: -CLOUD_DECK_FEATHER })
    expect(areaDistance(closed, { x: 11, z: 2 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(areaDistance(closed, { x: 40, z: -9 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(isOpen({ ...island, hole: closed })).toBe(false)
    expect(isOpen(open(b))).toBe(true)
    expect(isOpen(island)).toBe(false)
  })
})

describe('deck legs', () => {
  test('archipelago to island tweens strength and threshold', () => {
    const { from, to } = deckLeg(arch, island)
    expect(from).toEqual(arch)
    expect(to).toEqual(island)
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBeCloseTo((CLOUD_ARCHIPELAGO_VEIL + CLOUD_VEIL) / 2)
    expect(mid.threshold).toBeCloseTo((CLOUD_ARCHIPELAGO_THRESHOLD + CLOUD_THRESHOLD) / 2)
    expect(mid.hole).toBeNull()
  })

  test('turning back mid-leg tweens from where it is', () => {
    const mid = deckAt(arch, island, 0.5)
    const { from, to } = deckLeg(mid, arch)
    expect(from).toEqual(mid)
    expect(to).toEqual(arch)
  })

  test('island to district opens the hole from its centre, keeping the island threshold', () => {
    const { from, to } = deckLeg(island, open(b))
    expect(from).toEqual({ hole: closeHole(b), strength: CLOUD_VEIL, threshold: CLOUD_THRESHOLD })
    expect(to).toEqual(open(b))
    expect(deckAt(from, to, 0.5).hole?.minX).toBeCloseTo(10.5)
  })

  test('district to archipelago closes the hole to the archipelago strength and threshold', () => {
    expect(deckLeg(open(b), arch)).toEqual({
      from: open(b),
      to: {
        hole: closeHole(b),
        strength: CLOUD_ARCHIPELAGO_VEIL,
        threshold: CLOUD_ARCHIPELAGO_THRESHOLD,
      },
    })
  })

  test('leaving mid-opening closes from where the hole is', () => {
    const opening = deckLeg(island, open(b))
    const mid = deckAt(opening.from, opening.to, 0.5)
    const { from, to } = deckLeg(mid, island)
    expect(from).toEqual(mid)
    expect(to.strength).toBe(CLOUD_VEIL)
    expect(to.hole?.round).toBe(-CLOUD_DECK_FEATHER)
    expect(to.hole?.minX).toBeCloseTo(11)
  })

  test('after closing, the next district opens from its own centre', () => {
    const closed: Deck = { ...island, hole: closeHole(b) }
    expect(deckLeg(closed, open(a)).from).toEqual({ ...island, hole: closeHole(a) })
  })

  test('district to district slides at full strength', () => {
    const mid = deckAt(open(a), open(b), 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.threshold).toBe(CLOUD_THRESHOLD)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('endpoints are exact', () => {
    expect(deckAt(arch, island, 0)).toEqual(arch)
    expect(deckAt(arch, island, 1)).toEqual(island)
  })

  test('sameDeck compares strength, threshold and the open hole', () => {
    expect(sameDeck(island, { ...island, hole: closeHole(a) })).toBe(true)
    expect(sameDeck(island, arch)).toBe(false)
    expect(sameDeck(island, { ...island, threshold: 0.7 })).toBe(false)
    expect(sameDeck(open(a), open({ ...a }))).toBe(true)
    expect(sameDeck(open(a), open(b))).toBe(false)
    expect(sameDeck(island, DECK_OFF)).toBe(false)
  })

  test('deckKey changes with the open hole, strength or threshold, not with object identity', () => {
    expect(deckKey(open({ ...a }))).toBe(deckKey(open(a)))
    expect(deckKey(island)).toBe(deckKey({ ...island, hole: closeHole(b) }))
    const keys = new Set([deckKey(island), deckKey(arch), deckKey(open(a)), deckKey(open(b))])
    expect(keys.size).toBe(4)
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
import {
  CLOUD_ARCHIPELAGO_THRESHOLD,
  CLOUD_ARCHIPELAGO_VEIL,
  CLOUD_DECK_DRIFT,
  CLOUD_DECK_DRIFT_WRAP,
  CLOUD_DECK_FEATHER,
  CLOUD_THRESHOLD,
  CLOUD_VEIL,
} from '../tuning'
import { type Area, areaDistance } from './area'
import { layerArea } from './camera'
import {
  ARCHIPELAGO_VEIL,
  closeHole,
  DECK_OFF,
  type Deck,
  deckAt,
  deckHole,
  deckKey,
  deckLeg,
  deckTarget,
  driftStep,
  driftWrap,
  ISLAND_VEIL,
  isOpen,
  sameDeck,
} from './cloud-deck'
import { buildSceneModel } from './scene-model'
```

Run: `cd apps/web && bunx vitest run src/scene/model/cloud-deck.test.ts`
Expected: FAIL (`deckTarget`, `deckKey`, `ISLAND_VEIL`, `ARCHIPELAGO_VEIL` missing).

- [ ] **Step 3: Model.** In `scene/model/cloud-deck.ts`:

Make the tuning import:

```ts
import {
  CLOUD_ARCHIPELAGO_THRESHOLD,
  CLOUD_ARCHIPELAGO_VEIL,
  CLOUD_DECK_DRIFT,
  CLOUD_DECK_DRIFT_WRAP,
  CLOUD_DECK_FEATHER,
  CLOUD_THRESHOLD,
  CLOUD_VEIL,
} from '../tuning'
```

Replace `Deck`, `DECK_OFF`, `VEIL` and `deckFor` with:

```ts
/** What the deck shows: its hole, how strongly it covers the rest (0–1), and how sparse it is. */
export type Deck = { hole: Area | null; strength: number; threshold: number }

/** Before the first mount writes anything. */
export const DECK_OFF: Deck = { hole: null, strength: 0, threshold: CLOUD_THRESHOLD }

/** An island: a veil with no hole (spec 23.8). */
export const ISLAND_VEIL: Deck = { hole: null, strength: CLOUD_VEIL, threshold: CLOUD_THRESHOLD }

/** The archipelago: a lighter, sparser veil. */
export const ARCHIPELAGO_VEIL: Deck = {
  hole: null,
  strength: CLOUD_ARCHIPELAGO_VEIL,
  threshold: CLOUD_ARCHIPELAGO_THRESHOLD,
}

/**
 * The deck for a layer: a district's hole at full strength, else an island's veil, else the
 * archipelago's. Unknown ids fall back a level, as `layerArea` does.
 */
export function deckTarget(model: SceneModel, focus: Focus): Deck {
  const hole = deckHole(model, focus)
  if (hole) return { hole, strength: 1, threshold: CLOUD_THRESHOLD }
  if (focus.kind === 'archipelago') return ARCHIPELAGO_VEIL
  const island = layerArea(model, { kind: 'island', projectId: focus.projectId })
  return island ? ISLAND_VEIL : ARCHIPELAGO_VEIL
}
```

Replace `deckLeg` with:

```ts
/**
 * The tween between what is shown and the new layer's deck (spec 23.8): into a district the hole
 * opens from its centre as the cloud thickens; out of one it closes in place as the cloud thins to
 * the target veil; district to district it slides; veil to veil it tweens strength and threshold.
 */
export function deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck } {
  if (!target.hole) {
    if (current.hole && isOpen(current)) {
      return { from: current, to: { ...target, hole: closeHole(current.hole) } }
    }
    return { from: current, to: target }
  }
  if (!isOpen(current)) {
    return { from: { ...current, hole: closeHole(target.hole) }, to: target }
  }
  return { from: current, to: target }
}
```

In `deckAt`, make the return `return { hole, strength: lerp(from.strength, to.strength, e), threshold: lerp(from.threshold, to.threshold, e) }`.

Replace `sameDeck` with:

```ts
/** Two decks that look the same: equal strength and threshold, and both closed or the same hole. */
export function sameDeck(a: Deck, b: Deck): boolean {
  if (a.strength !== b.strength || a.threshold !== b.threshold) return false
  const openA = isOpen(a)
  const openB = isOpen(b)
  if (!openA && !openB) return true
  return openA && openB && areaKey(a.hole) === areaKey(b.hole)
}

/** A value key for a deck: a refetch that rebuilds the same deck keeps the same key. */
export function deckKey(d: Deck): string {
  return [areaKey(isOpen(d) ? d.hole : null), d.strength, d.threshold].join('|')
}
```

Run the model tests. Expected: PASS.

- [ ] **Step 4: Failing material test.** In `scene/cloud-deck-material.test.ts`:

Replace the two `writeDeck` tests with:

```ts
  test('writeDeck sets the hole, the threshold and the opacity by strength', () => {
    const hole: Area = { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }
    writeDeck({ hole, strength: 0.5, threshold: 0.55 })
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(cloudDeckUniforms.uRound.value).toBe(0.5)
    expect(cloudDeckUniforms.uThreshold.value).toBe(0.55)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * 0.5)
  })

  test('with no hole the box collapses to its centre and the whole deck shows; DECK_OFF shows nothing', () => {
    writeDeck({
      hole: { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 },
      strength: 1,
      threshold: CLOUD_THRESHOLD,
    })
    writeDeck(ARCHIPELAGO_VEIL)
    expect(cloudDeckUniforms.uBox.value.toArray()).toEqual([2, 1, 2, 1])
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(cloudDeckUniforms.uOpacity.value).toBeCloseTo(CLOUD_DECK_ALPHA * CLOUD_ARCHIPELAGO_VEIL)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_ARCHIPELAGO_THRESHOLD)
    writeDeck(DECK_OFF)
    expect(cloudDeckUniforms.uOpacity.value).toBe(0)
  })
```

In the imports: from `'./model/cloud-deck'` import `ARCHIPELAGO_VEIL, DECK_OFF` (drop `VEIL`); in the tuning import drop `CLOUD_VEIL` and add `CLOUD_ARCHIPELAGO_THRESHOLD, CLOUD_ARCHIPELAGO_VEIL`.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck-material.test.ts`
Expected: FAIL (`uThreshold` not written).

- [ ] **Step 5: writeDeck.** In `scene/cloud-deck-material.ts`, add `cloudDeckUniforms.uThreshold.value = deck.threshold` as the last line of `writeDeck`. Run the material tests. Expected: PASS.

- [ ] **Step 6: Component.** In `scene/cloud-deck.tsx`:

Make the model import:

```ts
import {
  DECK_OFF,
  type Deck,
  deckAt,
  deckKey,
  deckLeg,
  deckTarget,
  driftStep,
  sameDeck,
} from './model/cloud-deck'
```

remove `import { areaKey } from './model/spotlight'`, and replace the four lines that compute the hole, the key and the target ref with:

```ts
  const targetDeck = deckTarget(model, focus)
  const key = deckKey(targetDeck)
  const target = useRef(targetDeck)
  target.current = targetDeck
```

Change the biome-ignore comment on the main effect to `// biome-ignore lint/correctness/useExhaustiveDependencies: the target deck's value is the trigger`, and the component doc comment's `(spec 23.7)` to `(spec 23.8)`.

- [ ] **Step 7: Deck tests.** In `scene/cloud-deck.test.tsx`:

Replace `const veil = CLOUD_DECK_ALPHA * CLOUD_VEIL` with:

```tsx
const islandVeil = CLOUD_DECK_ALPHA * CLOUD_VEIL
const archVeil = CLOUD_DECK_ALPHA * CLOUD_ARCHIPELAGO_VEIL
```

and in every remaining test replace `veil` with `islandVeil`.

Replace the test `'the archipelago and an island show the veil; between them nothing runs'` with:

```tsx
  test('the archipelago shows its lighter, sparser veil; entering an island tweens to the island veil', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    const mesh = r.scene.findAllByType('Mesh')[0]?.instance as THREE.Mesh
    expect(mesh.visible).toBe(true)
    expect(opacity()).toBeCloseTo(archVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_ARCHIPELAGO_THRESHOLD)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeGreaterThan(archVeil)
    expect(opacity()).toBeLessThan(islandVeil)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_THRESHOLD)
    expect(mesh.visible).toBe(true)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('a refetch on an island neither replays the leg nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('district to archipelago closes the hole to the archipelago veil', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(opacity()).toBeCloseTo(archVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_ARCHIPELAGO_THRESHOLD)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
  })
```

In the test `'island to district opens the hole from its centre over CLOUD_MS'` keep every assertion (with `islandVeil`). In `beforeEach` keep `writeDeck(DECK_OFF)` (now with the threshold field it already carries). Make the tuning import cover `CLOUD_ARCHIPELAGO_THRESHOLD`, `CLOUD_ARCHIPELAGO_VEIL`, `CLOUD_THRESHOLD` and drop any now unused.

Run: `cd apps/web && bunx vitest run src/scene/cloud-deck.test.tsx src/scene/cloud-deck-material.test.ts src/scene/model/cloud-deck.test.ts`
Expected: PASS.

- [ ] **Step 8: Prove the old names are gone.**

Run: `cd apps/web && grep -rnE "\bVEIL\b|deckFor" src/scene`
Expected: only lines containing `ISLAND_VEIL`, `ARCHIPELAGO_VEIL`, `CLOUD_VEIL` or `CLOUD_ARCHIPELAGO_VEIL` (no bare `VEIL`, no `deckFor`).

- [ ] **Step 9: Gate and commit.** From the root `bun run test && bun run typecheck && bun run lint && bun run build`; `grep -l "WebGLRenderer" apps/web/dist/assets/*.js` lists only the world-scene chunk. Then:

```bash
git add apps/web/src/scene
git commit -m "feat(web): give the archipelago a lighter, sparser cloud veil than an island"
```
