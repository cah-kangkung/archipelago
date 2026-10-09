import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { CLOUD_DECK_RENDER_ORDER, shaderColor } from './cloud-deck-material'
import {
  DISTRICT_RING_FRAGMENT,
  DISTRICT_RING_RENDER_ORDER,
  DISTRICT_RING_VERTEX,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { scenePalette } from './model/palette'

describe('district ring material', () => {
  test('draws after the cloud deck, depth-tested, without writing depth', () => {
    expect(DISTRICT_RING_RENDER_ORDER).toBe(CLOUD_DECK_RENDER_ORDER + 1)
    expect(districtRingMaterial).toBeInstanceOf(THREE.ShaderMaterial)
    expect(districtRingMaterial.transparent).toBe(true)
    expect(districtRingMaterial.depthTest).toBe(true)
    expect(districtRingMaterial.depthWrite).toBe(false)
    expect(districtRingMaterial.side).toBe(THREE.DoubleSide)
    expect(districtRingMaterial.uniforms).toBe(districtRingUniforms)
  })

  test('fades by uOpacity in the ring colour, with no draw-on attribute', () => {
    expect(DISTRICT_RING_VERTEX).not.toContain('aAlong')
    expect(DISTRICT_RING_FRAGMENT).not.toContain('uReveal')
    expect(DISTRICT_RING_FRAGMENT).not.toContain('discard')
    expect('uReveal' in districtRingUniforms).toBe(false)
    expect(DISTRICT_RING_FRAGMENT).toContain('gl_FragColor = vec4( uColor, uOpacity );')
    expect(districtRingUniforms.uColor.value.toArray()).toEqual(
      shaderColor(scenePalette.districtRing).toArray(),
    )
  })
})
