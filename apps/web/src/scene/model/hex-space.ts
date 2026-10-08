import type { Hex } from '@archipelago/shared'

export type Point = { x: number; z: number }

/** A point on the land: `y` is the height of the tile it stands on (spec 18.3). */
export type Spot = Point & { y: number }

export const SQRT3 = Math.sqrt(3)

/** Height of the flat island interior; structures and landmarks stand on it. */
export const LAND_HEIGHT = 1

/** Centre of a pointy-top hex of circumradius 1, in world units (y is up). */
export function hexToWorld(h: Hex): Point {
  return { x: SQRT3 * (h.q + h.r / 2), z: 1.5 * h.r }
}

/** World distance from an island's origin to the far corner of a hex `radius` rings out. */
export function islandExtent(radius: number): number {
  return radius * SQRT3 + 1
}

/** How far the shallows reach past an island's extent. */
export const SHALLOWS_MARGIN = 1.2

/** World distance from an island's origin to the corner of its shallows. */
export function shallowsRadius(radius: number): number {
  return islandExtent(radius) + SHALLOWS_MARGIN
}
