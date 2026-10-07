import type { Focus } from '../../world/selectors'
import type { Bounds, SceneModel } from './scene-model'

/** Orthographic zoom = screen pixels per world unit (spec §13.4). */
export const ARCHIPELAGO_ZOOM = 10
export const ISLAND_ZOOM = 48
export const DISTRICT_ZOOM = ISLAND_ZOOM * 1.5
export const MAX_ZOOM_FACTOR = 3

export type CameraTarget = { x: number; z: number; zoom: number }

/** Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. */
export function cameraTarget(model: SceneModel, focus: Focus): CameraTarget {
  const { bounds } = model
  const overview = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    zoom: ARCHIPELAGO_ZOOM,
  }
  if (focus.kind === 'archipelago') return overview
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
