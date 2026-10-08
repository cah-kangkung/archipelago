import * as THREE from 'three'
import { HAZE_COLOR, type Spotlight } from './model/spotlight'
import { SPOTLIGHT_FEATHER, SPOTLIGHT_HAZE } from './tuning'

/** One set of uniforms shared by every patched material: a write reaches them all (spec 20.3). */
export const spotlightUniforms = {
  /** The area's box as (minX, minZ, maxX, maxZ). */
  uSpotBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSpotRound: { value: 0 },
  uSpotStrength: { value: 0 },
}

const glsl = (n: number) => n.toFixed(4)
const glslRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => glsl(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  return `vec3( ${r}, ${g}, ${b} )`
}
const VERTEX_ANCHOR = '#include <project_vertex>'
const FRAGMENT_ANCHOR = '#include <fog_fragment>'

const VERTEX_HEAD = 'varying vec2 vSpotXZ;\n'
const VERTEX_BODY = `${VERTEX_ANCHOR}
vec4 spotWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
spotWorld = instanceMatrix * spotWorld;
#endif
vSpotXZ = ( modelMatrix * spotWorld ).xz;`

// The same signed distance as `areaDistance` in scene/model/area.ts.
const FRAGMENT_HEAD = `varying vec2 vSpotXZ;
uniform vec4 uSpotBox;
uniform float uSpotRound;
uniform float uSpotStrength;
float spotDistance( vec2 p ) {
  vec2 centre = ( uSpotBox.xy + uSpotBox.zw ) * 0.5;
  vec2 extent = ( uSpotBox.zw - uSpotBox.xy ) * 0.5;
  vec2 q = abs( p - centre ) - extent;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uSpotRound;
}
`
// After the fog and the colour-space conversion, so it works in sRGB like `hazeHex`.
const FRAGMENT_BODY = `${FRAGMENT_ANCHOR}
float spotOut = smoothstep( 0.0, ${glsl(SPOTLIGHT_FEATHER)}, spotDistance( vSpotXZ ) ) * uSpotStrength;
gl_FragColor.rgb = mix( gl_FragColor.rgb, ${glslRgb(HAZE_COLOR)}, ${glsl(SPOTLIGHT_HAZE)} * spotOut );`

type Shader = {
  uniforms: Record<string, THREE.IUniform>
  vertexShader: string
  fragmentShader: string
}

/** Hazes everything outside the spotlight's area; set as each shared material's onBeforeCompile. */
export function patchSpotlight(shader: Shader): void {
  if (
    !shader.vertexShader.includes(VERTEX_ANCHOR) ||
    !shader.fragmentShader.includes(FRAGMENT_ANCHOR)
  ) {
    throw new Error('spotlight: a shader anchor moved; update spotlight-material.ts')
  }
  Object.assign(shader.uniforms, spotlightUniforms)
  shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(VERTEX_ANCHOR, VERTEX_BODY)
  shader.fragmentShader =
    FRAGMENT_HEAD + shader.fragmentShader.replace(FRAGMENT_ANCHOR, FRAGMENT_BODY)
}

export function withSpotlight<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = patchSpotlight
  material.customProgramCacheKey = () => 'spotlight'
  return material
}

export function writeSpotlight(s: Spotlight): void {
  const { area } = s
  if (area) {
    spotlightUniforms.uSpotBox.value.set(area.minX, area.minZ, area.maxX, area.maxZ)
    spotlightUniforms.uSpotRound.value = area.round ?? 0
  }
  spotlightUniforms.uSpotStrength.value = area ? s.strength : 0
}
