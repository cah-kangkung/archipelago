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
    const [r, g, b] = [1, 3, 5].map(
      (i) => Number.parseInt(scenePalette.cloud.slice(i, i + 2), 16) / 255,
    )
    expect(cloudDeckUniforms.uColor.value.toArray()).toEqual([r, g, b])
    const map = cloudDeckUniforms.uMap.value
    expect(map.wrapS).toBe(THREE.RepeatWrapping)
    expect(map.wrapT).toBe(THREE.RepeatWrapping)
    expect(map.format).toBe(THREE.RedFormat)
    expect([...(map.image.data as Uint8ClampedArray)]).toEqual([
      ...wispAlpha(
        cloudNoise(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED),
        CLOUD_WISP_LO,
        CLOUD_WISP_HI,
      ),
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
