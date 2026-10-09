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

  test('reveals along aAlong up to uReveal and fades by uOpacity, in the ring colour', () => {
    expect(DISTRICT_RING_VERTEX).toContain('attribute float aAlong;')
    expect(DISTRICT_RING_VERTEX).toContain('vAlong = aAlong;')
    expect(DISTRICT_RING_FRAGMENT).toContain('if ( vAlong > uReveal ) discard;')
    expect(DISTRICT_RING_FRAGMENT).toContain('gl_FragColor = vec4( uColor, uOpacity );')
    expect(districtRingUniforms.uColor.value.toArray()).toEqual(
      shaderColor(scenePalette.districtRing).toArray(),
    )
  })
})
