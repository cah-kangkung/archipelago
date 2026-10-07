import type { Focus } from '../../world/selectors'
import type { Bounds, SceneModel } from './scene-model'

/** Orthographic zoom = screen pixels per world unit (spec §13.4). */
export const ARCHIPELAGO_ZOOM = 10
export const ISLAND_ZOOM = 48
export const DISTRICT_ZOOM = ISLAND_ZOOM * 1.5
export const MAX_ZOOM_FACTOR = 3

export type CameraTarget = { x: number; z: number; zoom: number }

/**
 * Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. In
 * archipelago view a known `anchor` island is centred instead of the middle of the world.
 */
export function cameraTarget(
  model: SceneModel,
  focus: Focus,
  anchor: string | null = null,
): CameraTarget {
  const { bounds } = model
  const overview = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    zoom: ARCHIPELAGO_ZOOM,
  }
  if (focus.kind === 'archipelago') {
    const anchored = model.islands.find((i) => i.projectId === anchor)
    return anchored
      ? { x: anchored.origin.x, z: anchored.origin.z, zoom: ARCHIPELAGO_ZOOM }
      : overview
  }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return overview
  const islandTarget = { x: island.origin.x, z: island.origin.z, zoom: ISLAND_ZOOM }
  if (focus.kind === 'island') return islandTarget
  const district = island.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!district) return islandTarget
  return {
    x: island.origin.x + district.position.x,
    z: island.origin.z + district.position.z,
    zoom: DISTRICT_ZOOM,
  }
}

type OpeningCandidate = { project: { id: string }; overdue: number; dueSoon: number }

/**
 * The island the archipelago opens on (spec §14.2): the island just stepped out of, else the most
 * urgent one (overdue first, then due soon, then switcher order), else the last viewed. Ids that
 * are no longer in `summaries` are skipped.
 */
export function openingIsland(
  summaries: readonly OpeningCandidate[],
  previous: string | null,
  lastViewed: string | null,
): string | null {
  const known = (id: string | null): id is string =>
    id !== null && summaries.some((s) => s.project.id === id)
  if (known(previous)) return previous
  let best: OpeningCandidate | undefined
  for (const s of summaries) {
    if (s.overdue + s.dueSoon === 0) continue
    if (
      !best ||
      s.overdue > best.overdue ||
      (s.overdue === best.overdue && s.dueSoon > best.dueSoon)
    ) {
      best = s
    }
  }
  if (best) return best.project.id
  return known(lastViewed) ? lastViewed : null
}

export function clampToBounds(bounds: Bounds, x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, z)),
  }
}

/** Identifies a route; the camera snaps when this changes and never on a mere data refresh. */
export function focusKey(focus: Focus): string {
  if (focus.kind === 'archipelago') return 'archipelago'
  if (focus.kind === 'island') return `island:${focus.projectId}`
  return `district:${focus.projectId}:${focus.milestoneId}`
}
