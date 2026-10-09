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
  cloudDeckUniforms.uThreshold.value = deck.threshold
}

/** Writes the drift for `along` world units along (1, 1), wrapped for the shader. */
export function writeDrift(along: number): void {
  const w = driftWrap(along)
  cloudDeckUniforms.uDrift.value.set(w, w)
}
