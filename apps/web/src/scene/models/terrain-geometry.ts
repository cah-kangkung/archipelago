import type { Hex } from '@archipelago/shared'
import type * as THREE from 'three'
import { hexToWorld } from '../model/hex-space'
import type { TerrainTile } from '../model/terrain'
import { merge, part, prism } from './build'

export { SHALLOWS_MARGIN } from '../model/hex-space'

export const SEA_LEVEL = 0.15
export const SHALLOWS_HEIGHT = 0.3

/** One merged mesh per island: a hex prism per tile and a low one per shallows hex. Caller disposes. */
export function islandGeometry(
  tiles: readonly TerrainTile[],
  shallows: readonly Hex[],
): THREE.BufferGeometry {
  const parts = tiles.map((t) => {
    const { x, z } = hexToWorld(t)
    return part(prism(1, 1, t.height), t.tone, [x, 0, z])
  })
  for (const h of shallows) {
    const { x, z } = hexToWorld(h)
    parts.push(part(prism(1, 1, SHALLOWS_HEIGHT), 'shallows', [x, 0, z]))
  }
  return merge(parts)
}
