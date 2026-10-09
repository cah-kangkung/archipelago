import { hexKey, islandLand } from '@archipelago/shared'
import { hexToWorld } from '../scene/model/hex-space'
import type { Shore } from '../scene/model/sea-depth'
import { islandTerrain, shallowsHexes, shallowsRim } from '../scene/model/terrain'

/** A real shore for an island of `seed` and `size`, island-local at `origin`. */
export function shoreOf(seed: number, size: number, origin = { x: 0, z: 0 }): Shore {
  const tiles = islandTerrain(seed, size)
  const shallows = shallowsHexes(tiles)
  return {
    origin,
    radius: islandLand(seed, size).radius,
    size,
    coast: tiles.filter((t) => t.depth === 1).map(hexToWorld),
    rim: shallowsRim(tiles, shallows),
    cover: new Set([...tiles, ...shallows].map(hexKey)),
  }
}
