import { SEA_DEEP_DISTANCE } from '../tuning'
import { type Point, shallowsRadius } from './hex-space'

/** What the sea needs to know about an island; `SceneIsland` satisfies it. */
export type Shore = { origin: Point; radius: number }

/** The empty world's ghost island (spec 17.4): this radius, at the origin. */
export const UNCHARTED_RADIUS = 1
export const UNCHARTED_SEED = 7

const UNCHARTED: readonly Shore[] = [{ origin: { x: 0, z: 0 }, radius: UNCHARTED_RADIUS }]

/**
 * World distance from `p` to the nearest shallows edge, 0 inside one. Shallows are measured as
 * circles through their hex corners. An empty world measures from the uncharted island.
 */
export function shoreDistance(p: Point, shores: readonly Shore[]): number {
  let best = Infinity
  for (const s of shores.length > 0 ? shores : UNCHARTED) {
    const d = Math.hypot(p.x - s.origin.x, p.z - s.origin.z) - shallowsRadius(s.radius)
    if (d < best) best = d
  }
  return Math.max(0, best)
}

/** 0 at a shallows edge, 1 at `SEA_DEEP_DISTANCE` and beyond. */
export const depthShade = (distance: number): number => Math.min(1, distance / SEA_DEEP_DISTANCE)
