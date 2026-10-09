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
import { COVER_TURN, DECK_OFF, LAYER_B_TURN, layerOffset, VEIL } from './model/cloud-deck'
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
  CLOUD_VEIL,
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
    expect(CLOUD_DECK_FRAGMENT).toContain('smoothstep( 0.0, uFeather, holeDistance( p ) )')
  })

  test('the shader warps two wisp layers and thins them by the coverage map', () => {
    const g = (n: number) => n.toFixed(4)
    expect(CLOUD_DECK_FRAGMENT).toContain(`p / ${g(CLOUD_DECK_WARP_SCALE)} + uWarpOff`)
    expect(CLOUD_DECK_FRAGMENT).toContain('warpUv + vec2( 0.5, 0.21 )')
    expect(CLOUD_DECK_FRAGMENT).toContain(`vec2 q = p + bend * ${g(CLOUD_DECK_WARP)};`)
    expect(CLOUD_DECK_FRAGMENT).toContain(`q / ${g(CLOUD_DECK_TILE)} + uOffA`)
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `turn( q, vec4( ${LAYER_B_TURN.map(g).join(', ')} ) ) / ${g(CLOUD_DECK_TILE_B)} + vec2( 0.37, 0.71 ) + uOffB`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `turn( p, vec4( ${COVER_TURN.map(g).join(', ')} ) ) / ${g(CLOUD_DECK_COVER_SCALE)} + uOffCover`,
    )
    expect(CLOUD_DECK_FRAGMENT).toContain(
      `smoothstep( ${g(CLOUD_DECK_COVER_LO)}, ${g(CLOUD_DECK_COVER_HI)}, cover )`,
    )
  })

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
