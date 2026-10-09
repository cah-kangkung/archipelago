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

/** Coast hex centre to the far corner of the shallows hex beyond it (spec 24.4). */
export const SHALLOWS_REACH = SQRT3 + 1

const corner = (c: Point, degrees: number): Point => ({
  x: c.x + Math.cos((degrees * Math.PI) / 180),
  z: c.z + Math.sin((degrees * Math.PI) / 180),
})

/**
 * The side of `h` facing `HEX_DIRECTIONS[i]`, island-local: direction `i` lies at -60° * i, and the
 * side runs from the corner 30° before it to the corner 30° after.
 */
export function hexSide(h: Hex, i: number): [Point, Point] {
  const c = hexToWorld(h)
  return [corner(c, -60 * i - 30), corner(c, -60 * i + 30)]
}

/** The hex containing island-local `p`: fractional axial coordinates, cube-rounded. */
export function worldToHex(p: Point): Hex {
  const fr = p.z / 1.5
  const fq = p.x / SQRT3 - fr / 2
  const fs = -fq - fr
  let q = Math.round(fq)
  let r = Math.round(fr)
  const s = Math.round(fs)
  const dq = Math.abs(q - fq)
  const dr = Math.abs(r - fr)
  const ds = Math.abs(s - fs)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return { q: q + 0, r: r + 0 }
}
