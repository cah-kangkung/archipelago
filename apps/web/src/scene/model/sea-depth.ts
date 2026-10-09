import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, type Point, SHALLOWS_REACH, SQRT3 } from './hex-space'
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
}

/** The empty world's ghost island (spec 17.4): this size, at the origin. */
export const UNCHARTED_SIZE = 1
export const UNCHARTED_SEED = 7

const unchartedTiles = islandTerrain(UNCHARTED_SEED, UNCHARTED_SIZE)
export const UNCHARTED_SHORE: Shore = {
  origin: { x: 0, z: 0 },
  radius: Math.max(
    ...unchartedTiles.map((t) => (Math.abs(t.q) + Math.abs(t.q + t.r) + Math.abs(t.r)) / 2),
  ),
  size: UNCHARTED_SIZE,
  coast: unchartedTiles.filter((t) => t.depth === 1).map(hexToWorld),
  rim: shallowsRim(unchartedTiles, shallowsHexes(unchartedTiles)),
}

/** Whether `p` (island-local) is ringed by the coast: no half-plane through it misses every coast point. */
function enclosed(p: Point, coast: readonly Point[]): boolean {
  const angles = coast.map((c) => Math.atan2(c.z - p.z, c.x - p.x)).sort((a, b) => a - b)
  const first = angles[0]
  const last = angles[angles.length - 1]
  if (first === undefined || last === undefined) return false
  let widest = first + 2 * Math.PI - last
  for (let i = 1; i < angles.length; i++) {
    widest = Math.max(widest, (angles[i] as number) - (angles[i - 1] as number))
  }
  return widest < Math.PI
}

/**
 * World distance from `p` to the nearest shallows edge, 0 inside one (spec 24.4): the nearest
 * coast hex centre less SHALLOWS_REACH, and 0 anywhere the coast rings (the land and its bays).
 * An island whose enclosing disc is already further than the best so far is skipped. An empty
 * world measures from the uncharted island.
 */
export function shoreDistance(p: Point, shores: readonly Shore[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const s of shores.length > 0 ? shores : [UNCHARTED_SHORE]) {
    const dx = p.x - s.origin.x
    const dz = p.z - s.origin.z
    const gap = Math.hypot(dx, dz) - (s.radius * SQRT3 + SHALLOWS_REACH)
    if (gap >= best) continue
    let near = Number.POSITIVE_INFINITY
    for (const c of s.coast) near = Math.min(near, Math.hypot(dx - c.x, dz - c.z) - SHALLOWS_REACH)
    // Past the shallows but inside the enclosing disc, the point may still be inland.
    if (near > 0 && gap < 0 && enclosed({ x: dx, z: dz }, s.coast)) near = 0
    if (near < best) best = near
  }
  return Math.max(0, best)
}

/** 0 at a shallows edge, 1 at `SEA_DEEP_DISTANCE` and beyond. */
export const depthShade = (distance: number): number => Math.min(1, distance / SEA_DEEP_DISTANCE)
