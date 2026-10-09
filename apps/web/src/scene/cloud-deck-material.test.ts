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
