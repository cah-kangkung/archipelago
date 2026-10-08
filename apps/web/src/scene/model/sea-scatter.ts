import {
  LANE_HALF_WIDTH,
  SCATTER_CELL,
  SCATTER_CLEARANCE,
  SCATTER_EXTENT,
  SCATTER_FILL,
  SCATTER_MAX_PER_TYPE,
  SCATTER_WEIGHTS,
} from '../tuning'
import type { Point } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { SceneModel } from './scene-model'
import { shoreDistance } from './sea-depth'
import { routeDistance, seaRoutes } from './sea-routes'

export const SCATTER_TYPES = ['rock', 'islet', 'sandbar', 'buoy'] as const
export type ScatterType = (typeof SCATTER_TYPES)[number]
export type ScatterProp = { type: ScatterType; position: Point; turn: number }

function pickType(roll: number): ScatterType {
  let sum = 0
  for (const type of SCATTER_TYPES) {
    sum += SCATTER_WEIGHTS[type]
    if (roll < sum) return type
  }
  return 'rock'
}

/**
 * Static open-water props (spec 17.2). Each world grid cell draws its own prop from a hash of
 * its coordinates, so a new or grown island only hides props in cells it covers. The per-type cap
 * keeps the props nearest the world origin: growth at the edges is what gets dropped first.
 */
export function seaScatter(model: Pick<SceneModel, 'islands' | 'bounds'>): ScatterProp[] {
  const { islands, bounds } = model
  const routes = seaRoutes(model)
  const cell = (v: number) => Math.floor(v / SCATTER_CELL)
  const props: ScatterProp[] = []
  for (
    let cx = cell(bounds.minX - SCATTER_EXTENT);
    cx <= cell(bounds.maxX + SCATTER_EXTENT);
    cx++
  ) {
    for (
      let cz = cell(bounds.minZ - SCATTER_EXTENT);
      cz <= cell(bounds.maxZ + SCATTER_EXTENT);
      cz++
    ) {
      // Always draw in the same order, so a cell's prop never depends on its neighbours.
      const random = mulberry32(hashInts(cx, cz))
      const filled = random() < SCATTER_FILL
      const type = pickType(random())
      const position = {
        x: (cx + 0.2 + random() * 0.6) * SCATTER_CELL,
        z: (cz + 0.2 + random() * 0.6) * SCATTER_CELL,
      }
      const turn = random() * Math.PI * 2
      if (!filled) continue
      if (shoreDistance(position, islands) < SCATTER_CLEARANCE) continue
      if (routes.some((r) => routeDistance(position, r) < LANE_HALF_WIDTH)) continue
      props.push({ type, position, turn })
    }
  }
  const reach = (p: ScatterProp) => Math.hypot(p.position.x, p.position.z)
  return SCATTER_TYPES.flatMap((type) =>
    props
      .filter((p) => p.type === type)
      .sort((a, b) => reach(a) - reach(b))
      .slice(0, SCATTER_MAX_PER_TYPE),
  )
}
