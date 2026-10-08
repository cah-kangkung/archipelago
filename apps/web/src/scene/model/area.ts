import type { Point } from './hex-space'
import type { Bounds } from './scene-model'

/**
 * A rounded rectangle in world x/z: the box grown by `round`, with round corners (spec 20.1). A
 * plain `Bounds` is an area with square corners; a box shrunk to a point is a circle.
 */
export type Area = Bounds & { round?: number }

/** Signed distance from `p` to the area's edge, negative inside. The spotlight shader matches it. */
export function areaDistance(area: Area, p: Point): number {
  const qx = Math.abs(p.x - (area.minX + area.maxX) / 2) - (area.maxX - area.minX) / 2
  const qz = Math.abs(p.z - (area.minZ + area.maxZ) / 2) - (area.maxZ - area.minZ) / 2
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0))
  const inside = Math.min(Math.max(qx, qz), 0)
  return outside + inside - (area.round ?? 0)
}

export function insideArea(area: Area, p: Point): boolean {
  return areaDistance(area, p) <= 0
}

/** The nearest point of the area to `p`; `p` itself when it is inside. */
export function clampToArea(area: Area, p: Point): Point {
  const cx = Math.min(area.maxX, Math.max(area.minX, p.x))
  const cz = Math.min(area.maxZ, Math.max(area.minZ, p.z))
  const round = area.round ?? 0
  const dx = p.x - cx
  const dz = p.z - cz
  const d = Math.hypot(dx, dz)
  if (d <= round) return { x: p.x, z: p.z }
  return { x: cx + (dx / d) * round, z: cz + (dz / d) * round }
}
