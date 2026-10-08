import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  foamMaterial,
  ghostMaterial,
  placementGhostMaterial,
  plotMaterial,
  seaMaterial,
  shadowMaterial,
  solidMaterial,
  splashMaterial,
} from './materials'
import { patchSpotlight, spotlightUniforms, writeSpotlight } from './spotlight-material'
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_FEATHER } from './tuning'

const shaderOf = (lib: 'lambert' | 'basic') => ({
  uniforms: {} as Record<string, THREE.IUniform>,
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
})

describe('spotlight material', () => {
  test.each(['lambert', 'basic'] as const)('patches the %s shader at its anchors', (lib) => {
    const shader = shaderOf(lib)
    patchSpotlight(shader)
    expect(shader.vertexShader).toContain('#include <project_vertex>')
    expect(shader.vertexShader).toContain('vSpotXZ = ( modelMatrix * spotWorld ).xz;')
    const frag = shader.fragmentShader
    // After the fog, so fogged sea dims with the rest.
    expect(frag.indexOf('#include <fog_fragment>')).toBeGreaterThan(-1)
    expect(frag.indexOf('spotDistance( vSpotXZ )')).toBeGreaterThan(
      frag.indexOf('#include <fog_fragment>'),
    )
    expect(frag).toContain(SPOTLIGHT_FEATHER.toFixed(4))
    expect(frag).toContain(SPOTLIGHT_DIM.toFixed(4))
    expect(frag).toContain(SPOTLIGHT_DESATURATE.toFixed(4))
    expect(shader.uniforms.uSpotStrength).toBe(spotlightUniforms.uSpotStrength)
    expect(shader.uniforms.uSpotBox).toBe(spotlightUniforms.uSpotBox)
  })

  test('throws when three moves an anchor, rather than drawing undimmed', () => {
    expect(() =>
      patchSpotlight({ uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '' }),
    ).toThrow(/anchor/)
  })

  test('every shared scene material carries the patch', () => {
    for (const m of [
      solidMaterial,
      seaMaterial,
      shadowMaterial,
      foamMaterial,
      splashMaterial,
      plotMaterial,
      ghostMaterial,
      placementGhostMaterial,
    ]) {
      expect(m.onBeforeCompile).toBe(patchSpotlight)
    }
  })

  test('writeSpotlight sets the shared uniforms; no area means strength 0', () => {
    writeSpotlight({ area: { minX: 1, maxX: 3, minZ: -2, maxZ: 4, round: 0.5 }, strength: 0.7 })
    expect(spotlightUniforms.uSpotBox.value.toArray()).toEqual([1, -2, 3, 4])
    expect(spotlightUniforms.uSpotRound.value).toBe(0.5)
    expect(spotlightUniforms.uSpotStrength.value).toBe(0.7)
    writeSpotlight({ area: null, strength: 1 })
    expect(spotlightUniforms.uSpotStrength.value).toBe(0)
  })
})
