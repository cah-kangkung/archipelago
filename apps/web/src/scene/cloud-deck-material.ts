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

/** Above every other mesh: the deck draws over everything outside its hole. */
export const CLOUD_DECK_RENDER_ORDER = 10

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

// A ShaderMaterial without `colorspace_fragment` writes gl_FragColor unconverted, so the sRGB value goes straight through.
const rgb = (hex: string) =>
  new THREE.Vector3(...[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255))

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

const VERTEX = `varying vec2 vWorldXZ;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorldXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

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
  } else {
    // No hole: collapse the box to its centre and round inward by the feather, so the whole deck
    // shows even when the uniforms (module-level) still hold a district's box from an earlier mount.
    const b = cloudDeckUniforms.uBox.value
    const x = (b.x + b.z) / 2
    const z = (b.y + b.w) / 2
    b.set(x, z, x, z)
    cloudDeckUniforms.uRound.value = -CLOUD_DECK_FEATHER
  }
  cloudDeckUniforms.uOpacity.value = CLOUD_DECK_ALPHA * deck.strength
}

/** Writes each layer's offset for a drift of `along` world units along (1, 1). */
export function writeDrift(along: number): void {
  cloudDeckUniforms.uOffA.value.set(...layerOffset(along, CLOUD_DECK_TILE))
  cloudDeckUniforms.uOffB.value.set(...layerOffset(along, CLOUD_DECK_TILE_B, LAYER_B_TURN))
  cloudDeckUniforms.uOffCover.value.set(...layerOffset(along, CLOUD_DECK_COVER_SCALE, COVER_TURN))
  cloudDeckUniforms.uWarpOff.value.set(...layerOffset(along, CLOUD_DECK_WARP_SCALE))
}
