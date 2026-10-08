import { FOG_DEPTH, FOG_MARGIN } from '../tuning'
import type { Bounds } from './scene-model'

export type Vec3 = { x: number; y: number; z: number }

const AXIS = 1 / Math.sqrt(3)

/** Depth of `p` in front of the camera, which always looks down -(1, 1, 1) (true isometric). */
export function viewDepth(camera: Vec3, p: Vec3): number {
  return (camera.x - p.x + camera.y - p.y + camera.z - p.z) * AXIS
}

/**
 * The camera is orthographic at a fixed distance, so zoom never changes depth (spec 17.3). Fog
 * starts past the deepest ground corner of the islands' bounds: anything on an island stands
 * at y ≥ 0, so it is nearer still and never fogged.
 */
export function fogRange(camera: Vec3, bounds: Bounds): { near: number; far: number } {
  const deepest = Math.max(
    ...[bounds.minX, bounds.maxX].flatMap((x) =>
      [bounds.minZ, bounds.maxZ].map((z) => viewDepth(camera, { x, y: 0, z })),
    ),
  )
  const near = deepest + FOG_MARGIN
  return { near, far: near + FOG_DEPTH }
}
