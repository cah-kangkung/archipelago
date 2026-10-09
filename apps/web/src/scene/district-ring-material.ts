import * as THREE from 'three'
import { CLOUD_DECK_RENDER_ORDER, shaderColor } from './cloud-deck-material'
import { scenePalette } from './model/palette'

/** Just after the cloud deck: the hole's feather never veils the ring (spec 24.5). */
export const DISTRICT_RING_RENDER_ORDER = CLOUD_DECK_RENDER_ORDER + 1

export const districtRingUniforms = {
  uOpacity: { value: 1 },
  uColor: { value: shaderColor(scenePalette.districtRing) },
}

export const DISTRICT_RING_VERTEX = `void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`

export const DISTRICT_RING_FRAGMENT = `uniform float uOpacity;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4( uColor, uOpacity );
}`

/** The district ring (spec 24.5): unlit, faded as a whole. */
export const districtRingMaterial = new THREE.ShaderMaterial({
  uniforms: districtRingUniforms,
  vertexShader: DISTRICT_RING_VERTEX,
  fragmentShader: DISTRICT_RING_FRAGMENT,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
})
