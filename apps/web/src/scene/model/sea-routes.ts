import { hexDistance } from '@archipelago/shared'
import { BOAT_OFFSHORE, LANE_HALF_WIDTH, MIN_LANE } from '../tuning'
import { type Point, SHALLOWS_MARGIN, shallowsRadius } from './hex-space'
import type { SceneModel } from './scene-model'

/** An open-water path a boat sails (spec 17.5): out and back along a lane, or round a loop. */
export type Route =
  | { kind: 'lane'; key: string; from: Point; to: Point }
  | { kind: 'loop'; key: string; center: Point; radius: number }

/** Distance from `p` to the segment a–b. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length2 = dx * dx + dz * dz
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

export function routeDistance(p: Point, route: Route): number {
  if (route.kind === 'lane') return segmentDistance(p, route.from, route.to)
  return Math.abs(Math.hypot(p.x - route.center.x, p.z - route.center.z) - route.radius)
}

/**
 * Lanes join islands at most 2 slots apart through clear water at least `MIN_LANE` long;
 * neighbouring islands' shallows nearly touch, so in practice a lane crosses an empty slot.
 * Without a lane there is one loop. Routes depend only on the layout, never on progress.
 */
export function seaRoutes({ islands, bounds }: Pick<SceneModel, 'islands' | 'bounds'>): Route[] {
  const sorted = [...islands].sort((a, b) => (a.projectId < b.projectId ? -1 : 1))
  const lanes: Route[] = []
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (hexDistance(a.slot, b.slot) > 2) continue
      const blocked = sorted.some(
        (c) =>
          c !== a &&
          c !== b &&
          segmentDistance(c.origin, a.origin, b.origin) <
            shallowsRadius(c.radius) + LANE_HALF_WIDTH,
      )
      if (blocked) continue
      const dx = b.origin.x - a.origin.x
      const dz = b.origin.z - a.origin.z
      const length = Math.hypot(dx, dz)
      const start = shallowsRadius(a.radius) + BOAT_OFFSHORE
      const end = length - shallowsRadius(b.radius) - BOAT_OFFSHORE
      if (end - start < MIN_LANE) continue
      const at = (s: number): Point => ({
        x: a.origin.x + (dx / length) * s,
        z: a.origin.z + (dz / length) * s,
      })
      lanes.push({
        kind: 'lane',
        key: `${a.projectId}|${b.projectId}`,
        from: at(start),
        to: at(end),
      })
    }
  })
  if (lanes.length > 0) return lanes
  const [first] = sorted
  if (!first) return []
  if (sorted.length === 1) {
    return [
      {
        kind: 'loop',
        key: `loop|${first.projectId}`,
        center: first.origin,
        radius: shallowsRadius(first.radius) + BOAT_OFFSHORE,
      },
    ]
  }
  const halfW = (bounds.maxX - bounds.minX) / 2
  const halfD = (bounds.maxZ - bounds.minZ) / 2
  return [
    {
      kind: 'loop',
      key: 'loop|archipelago',
      center: { x: bounds.minX + halfW, z: bounds.minZ + halfD },
      radius: Math.hypot(halfW, halfD) + SHALLOWS_MARGIN + BOAT_OFFSHORE,
    },
  ]
}
