import type * as THREE from 'three'
import { hexToWorld, shallowsRadius } from '../model/hex-space'
import type { TerrainTile } from '../model/terrain'
import { merge, part, prism } from './build'

export { SHALLOWS_MARGIN } from '../model/hex-space'

export const SEA_LEVEL = 0.15
export const SHALLOWS_HEIGHT = 0.3

/** One merged mesh per island: a hex prism per tile, on a hexagon of shallows. Caller disposes. */
export function islandGeometry(
  tiles: readonly TerrainTile[],
  radius: number,
): THREE.BufferGeometry {
  const parts = tiles.map((t) => {
    const { x, z } = hexToWorld(t)
    return part(prism(1, 1, t.height), t.tone, [x, 0, z])
  })
  const shallows = shallowsRadius(radius)
  // The island's outline is a flat-topped hexagon; turning the prism 30° matches it.
  parts.push(part(prism(shallows, shallows, SHALLOWS_HEIGHT), 'shallows', [0, 0, 0], Math.PI / 6))
  return merge(parts)
}
