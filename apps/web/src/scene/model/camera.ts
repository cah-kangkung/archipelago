import type { Focus } from '../../world/selectors'
import type { Area } from './area'
import { islandExtent, type Point, SQRT3, shallowsRadius } from './hex-space'
import type { Bounds, SceneIsland, SceneModel } from './scene-model'
import { toScreen } from './screen'

/** Orthographic zoom = screen pixels per world unit (spec §13.4). */
export const ARCHIPELAGO_ZOOM = 10
export const ISLAND_ZOOM = 48
export const DISTRICT_ZOOM = ISLAND_ZOOM * 1.5
export const MAX_ZOOM_FACTOR = 3
/** The opening zoom fills at most this share of the viewport (spec 19.1). */
export const FIT_MARGIN = 0.9
/** Two hexes of room around a district's landmark and plots. */
export const DISTRICT_MARGIN = 2 * SQRT3
/** Half a hex of room round a district's landmark and plots: its lit and pannable area (spec 20.1). */
export const AREA_MARGIN = SQRT3 / 2

export type CameraTarget = { x: number; z: number; zoom: number }

/** The CSS px the camera may fill: the canvas less the HUD on top and the sheet below. */
export type Viewport = { width: number; height: number }

/** The box through the landmark and the milestone's plots, before any margin. */
type Level =
  | { kind: 'archipelago' }
  | { kind: 'island'; island: SceneIsland }
  | { kind: 'district'; island: SceneIsland; core: Bounds }

/** The layer a focus resolves to; unknown ids fall back a level. */
function levelOf(model: SceneModel, focus: Focus): Level {
  if (focus.kind === 'archipelago') return { kind: 'archipelago' }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return { kind: 'archipelago' }
  if (focus.kind === 'island') return { kind: 'island', island }
  const district = island.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!district) return { kind: 'island', island }
  const spots = [
    district.position,
    ...island.structures.filter((s) => s.milestoneId === focus.milestoneId).map((s) => s.position),
  ]
  const xs = spots.map((p) => island.origin.x + p.x)
  const zs = spots.map((p) => island.origin.z + p.z)
  return {
    kind: 'district',
    island,
    core: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    },
  }
}

function islandSquare(island: SceneIsland): Bounds {
  const s = shallowsRadius(island.radius)
  return {
    minX: island.origin.x - s,
    maxX: island.origin.x + s,
    minZ: island.origin.z - s,
    maxZ: island.origin.z + s,
  }
}

const grow = (b: Bounds, by: number): Bounds => ({
  minX: b.minX - by,
  maxX: b.maxX + by,
  minZ: b.minZ - by,
  maxZ: b.maxZ + by,
})

const corners = (b: Bounds): Point[] => [
  { x: b.minX, z: b.minZ },
  { x: b.maxX, z: b.minZ },
  { x: b.maxX, z: b.maxZ },
  { x: b.minX, z: b.maxZ },
]

/** Where the pan target may go on this layer (spec 19.1). */
export function focusBounds(model: SceneModel, focus: Focus): Bounds {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') return model.bounds
  if (level.kind === 'island') return islandSquare(level.island)
  return grow(level.core, DISTRICT_MARGIN)
}

/** The current layer as a rounded rectangle: lit, live and pannable (spec 20.1); none on the archipelago. */
export function layerArea(model: SceneModel, focus: Focus): Area | null {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') return null
  if (level.kind === 'island') {
    const { origin, radius } = level.island
    return {
      minX: origin.x,
      maxX: origin.x,
      minZ: origin.z,
      maxZ: origin.z,
      round: islandExtent(radius),
    }
  }
  return { ...level.core, round: AREA_MARGIN }
}

/** Where the pan target may go: the layer area, or the whole world on the archipelago. */
export function panArea(model: SceneModel, focus: Focus): Area {
  return layerArea(model, focus) ?? model.bounds
}

/** What the opening zoom must show: the shallows circle of an island, else the bounds' corners. */
export function focusOutline(model: SceneModel, focus: Focus): Point[] {
  const level = levelOf(model, focus)
  if (level.kind === 'island') {
    const { origin, radius } = level.island
    const s = shallowsRadius(radius)
    return Array.from({ length: 12 }, (_, k) => ({
      x: origin.x + s * Math.cos((k * Math.PI) / 6),
      z: origin.z + s * Math.sin((k * Math.PI) / 6),
    }))
  }
  return corners(level.kind === 'district' ? grow(level.core, DISTRICT_MARGIN) : model.bounds)
}

/** The largest zoom that fits every outline point in the viewport, times FIT_MARGIN; 0 without one. */
export function fitZoom(outline: readonly Point[], viewport?: Viewport): number {
  if (!viewport || outline.length === 0 || viewport.width <= 0 || viewport.height <= 0) return 0
  const pts = outline.map((p) => toScreen(p.x, p.z, 1))
  const xs = pts.map((p) => p.sx)
  const ys = pts.map((p) => p.sy)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  const byWidth = w > 0 ? viewport.width / w : Number.POSITIVE_INFINITY
  const byHeight = h > 0 ? viewport.height / h : Number.POSITIVE_INFINITY
  const fit = Math.min(byWidth, byHeight)
  return Number.isFinite(fit) ? fit * FIT_MARGIN : 0
}

/**
 * Where the camera looks for a route, in world coordinates. Unknown ids fall back a level. In
 * archipelago view a known `anchor` island is centred instead of the middle of the world. With a
 * `viewport`, island and district zooms fit their area (spec 19.1), never below their floors.
 */
export function cameraTarget(
  model: SceneModel,
  focus: Focus,
  anchor: string | null = null,
  viewport?: Viewport,
): CameraTarget {
  const level = levelOf(model, focus)
  if (level.kind === 'archipelago') {
    const { bounds } = model
    const anchored =
      focus.kind === 'archipelago' ? model.islands.find((i) => i.projectId === anchor) : undefined
    return anchored
      ? { x: anchored.origin.x, z: anchored.origin.z, zoom: ARCHIPELAGO_ZOOM }
      : {
          x: (bounds.minX + bounds.maxX) / 2,
          z: (bounds.minZ + bounds.maxZ) / 2,
          zoom: ARCHIPELAGO_ZOOM,
        }
  }
  const fit = fitZoom(focusOutline(model, focus), viewport)
  if (level.kind === 'island') {
    return {
      x: level.island.origin.x,
      z: level.island.origin.z,
      zoom: Math.max(ISLAND_ZOOM, fit),
    }
  }
  return {
    x: (level.core.minX + level.core.maxX) / 2,
    z: (level.core.minZ + level.core.maxZ) / 2,
    zoom: Math.max(DISTRICT_ZOOM, fit),
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
