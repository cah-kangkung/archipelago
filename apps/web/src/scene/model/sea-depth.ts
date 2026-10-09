import { hexKey, islandLand } from '@archipelago/shared'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, type Point, SHALLOWS_REACH, SQRT3, worldToHex } from './hex-space'
import { islandTerrain, type RimSide, shallowsHexes, shallowsRim } from './terrain'

/** What the sea needs to know about an island; `SceneIsland` satisfies it. */
export type Shore = {
  origin: Point
  /** The ring enclosing all land. */
  radius: number
  size: number
  /** Island-local centres of the depth-1 tiles. */
  coast: readonly Point[]
  rim: readonly RimSide[]
  /** Hex keys of the tiles and the shallows round them: the sea is 0 over any of them. */
  cover: ReadonlySet<string>
}

/** The empty world's ghost island (spec 17.4): this size, at the origin. */
export const UNCHARTED_SIZE = 1
export const UNCHARTED_SEED = 7

const unchartedTiles = islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)
const unchartedShallows = shallowsHexes(unchartedTiles)
export const UNCHARTED_SHORE: Shore = {
  origin: { x: 0, z: 0 },
  radius: islandLand(UNCHARTED_SEED, UNCHARTED_SIZE).radius,
  size: UNCHARTED_SIZE,
  coast: unchartedTiles.filter((t) => t.depth === 1).map(hexToWorld),
  rim: shallowsRim(unchartedTiles, unchartedShallows),
  cover: new Set([...unchartedTiles, ...unchartedShallows].map(hexKey)),
}

/**
 * World distance from `p` to the nearest shallows edge (spec 24.4): 0 over any tile or shallows
 * hex, else the nearest coast hex centre less SHALLOWS_REACH. An island whose enclosing disc is
 * already further than the best so far is skipped. An empty world measures from the uncharted
 * island.
 */
export function shoreDistance(p: Point, shores: readonly Shore[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const s of shores.length > 0 ? shores : [UNCHARTED_SHORE]) {
    const dx = p.x - s.origin.x
    const dz = p.z - s.origin.z
    const gap = Math.hypot(dx, dz) - (s.radius * SQRT3 + SHALLOWS_REACH)
    if (gap >= best) continue
    // Inside the enclosing disc the point may be over land or shallows.
    if (gap < 0 && s.cover.has(hexKey(worldToHex({ x: dx, z: dz })))) return 0
    for (const c of s.coast) {
      const d = Math.hypot(dx - c.x, dz - c.z) - SHALLOWS_REACH
      if (d < best) best = d
    }
  }
  return Math.max(0, best)
}

/** 0 at a shallows edge, 1 at `SEA_DEEP_DISTANCE` and beyond. */
export const depthShade = (distance: number): number => Math.min(1, distance / SEA_DEEP_DISTANCE)
