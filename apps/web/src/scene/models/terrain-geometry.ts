import type * as THREE from 'three'
import { hexToWorld, islandExtent } from '../model/hex-space'
import type { TerrainTile } from '../model/terrain'
import { merge, part, prism } from './build'

export const SEA_LEVEL = 0.15
export const SHALLOWS_HEIGHT = 0.3
export const SHALLOWS_MARGIN = 1.2

/** One merged mesh per island: a hex prism per tile, on a hexagon of shallows. Caller disposes. */
export function islandGeometry(
  tiles: readonly TerrainTile[],
  radius: number,
): THREE.BufferGeometry {
  const parts = tiles.map((t) => {
    const { x, z } = hexToWorld(t)
    return part(prism(1, 1, t.height), t.tone, [x, 0, z])
  })
  const shallows = islandExtent(radius) + SHALLOWS_MARGIN
  // The island's outline is a flat-topped hexagon; turning the prism 30° matches it.
  parts.push(part(prism(shallows, shallows, SHALLOWS_HEIGHT), 'shallows', [0, 0, 0], Math.PI / 6))
  return merge(parts)
}
