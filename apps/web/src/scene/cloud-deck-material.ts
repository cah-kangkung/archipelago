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
