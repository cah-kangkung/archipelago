import type { Hex, WorldDto } from '@archipelago/shared'
import type { Focus } from '../../world/selectors'
import { insideArea } from './area'
import { AREA_MARGIN } from './camera'
import { hexToWorld } from './hex-space'

/**
 * The island-local plots that lie in the focus's layer (spec 20.4): all of them on the archipelago
 * and island layers; in a district, those inside its area. Agrees with `layerArea` less the
 * island origin; an unknown milestone falls back to the island, as `layerArea` does.
 */
export function plotsInLayer(
  world: Pick<WorldDto, 'milestones' | 'tasks'>,
  focus: Focus,
  plots: readonly Hex[],
): Hex[] {
  if (focus.kind !== 'district') return [...plots]
  const milestone = world.milestones.find(
    (m) => m.id === focus.milestoneId && m.projectId === focus.projectId,
  )
  if (!milestone) return [...plots]
  const spots = [
    hexToWorld({ q: milestone.districtQ, r: milestone.districtR }),
    ...world.tasks
      .filter((t) => t.projectId === focus.projectId && t.milestoneId === focus.milestoneId)
      .map((t) => hexToWorld({ q: t.plotX, r: t.plotY })),
  ]
  const xs = spots.map((p) => p.x)
  const zs = spots.map((p) => p.z)
  const area = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    round: AREA_MARGIN,
  }
  return plots.filter((h) => insideArea(area, hexToWorld(h)))
}
