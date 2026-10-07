import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type SceneColor, scenePalette } from '../model/palette'

type Vec3 = readonly [number, number, number]

/**
 * A palette-coloured, non-indexed copy of `geometry`, turned `turn` radians about y and moved to
 * `at`. Takes ownership of `geometry`.
 */
export function part(
  geometry: THREE.BufferGeometry,
  color: SceneColor,
  at: Vec3 = [0, 0, 0],
  turn = 0,
): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (flat !== geometry) geometry.dispose()
  // Merging needs identical attribute sets: keep position, normal and our colour only.
  flat.deleteAttribute('uv')
  flat.rotateY(turn)
  flat.translate(at[0], at[1], at[2])
  const c = new THREE.Color(scenePalette[color])
  const count = flat.getAttribute('position').count
  const data = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3)
  flat.setAttribute('color', new THREE.BufferAttribute(data, 3))
  return flat
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  if (!merged) throw new Error('merge: incompatible geometries')
  for (const p of parts) p.dispose()
  return merged
}

/** Shapes with their base on y=0, centred on x/z. */
export const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)
export const prism = (top: number, bottom: number, h: number, sides = 6) =>
  new THREE.CylinderGeometry(top, bottom, h, sides).translate(0, h / 2, 0)
export const cone = (r: number, h: number, sides: number) =>
  new THREE.ConeGeometry(r, h, sides).translate(0, h / 2, 0)
