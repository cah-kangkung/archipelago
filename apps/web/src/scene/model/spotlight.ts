import { SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import { type Area, insideArea } from './area'
import type { Point } from './hex-space'

/** A value key for an area: a refetch that rebuilds the same area keeps the same key. */
export function areaKey(area: Area | null): string {
  if (!area) return 'none'
  return [area.minX, area.maxX, area.minZ, area.maxZ, area.round ?? 0].join('|')
}

/** A label anchored at `p` fades when it is outside the current layer's area. */
export function labelOpacity(area: Area | null, p: Point): number {
  return area && !insideArea(area, p) ? SPOTLIGHT_LABEL_OPACITY : 1
}
