import { type Hex, hexScale, type LandmarkType, type WorldDto } from '@archipelago/shared'
import { hexToWorld, islandExtent, type Point } from './hex-space'
import { landmarkFor, type Marker, type StructureKind, structureFor } from './state'
import { islandRadius, islandTerrain, type TerrainTile } from './terrain'

export type SceneStructure = {
  taskId: string
  /** The district the task belongs to; null for the island commons. */
  milestoneId: string | null
  kind: StructureKind
  marker: Marker
  position: Point
}
export type SceneDistrict = {
  milestoneId: string
  name: string
  type: LandmarkType
  progress: number
  position: Point
}
export type SceneIsland = {
  projectId: string
  name: string
  /** The project's terrain seed; with `radius` it fully determines `tiles`. */
  seed: number
  origin: Point
  radius: number
  tiles: TerrainTile[]
  districts: SceneDistrict[]
  structures: SceneStructure[]
}
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
export type SceneModel = { islands: SceneIsland[]; bounds: Bounds }

/** Hex rings of open sea between neighbouring islands' shores. */
export const ISLAND_GAP = 3
const EMPTY_BOUNDS: Bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }

/** Positions within an island are island-local; `origin` places the island in the world. */
export function buildSceneModel(world: WorldDto, today: string): SceneModel {
  const prepared = world.projects.map((project) => {
    const milestones = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const occupied: Hex[] = [
      ...tasks.map((t) => ({ q: t.plotX, r: t.plotY })),
      ...milestones.map((m) => ({ q: m.districtQ, r: m.districtR })),
    ]
    return { project, milestones, tasks, radius: islandRadius(occupied) }
  })
  // Slots are one hex apart; scaling them by the largest island's diameter plus a gap means no
  // two islands can touch, however big one grows.
  const largest = prepared.reduce((max, p) => Math.max(max, p.radius), 0)
  const spacing = 2 * largest + ISLAND_GAP

  const islands = prepared.map(({ project, milestones, tasks, radius }) => ({
    projectId: project.id,
    name: project.name,
    seed: project.islandSeed,
    origin: hexToWorld(hexScale({ q: project.archipelagoX, r: project.archipelagoY }, spacing)),
    radius,
    tiles: islandTerrain(project.islandSeed, radius),
    districts: milestones.map((m) => ({
      milestoneId: m.id,
      name: m.name,
      ...landmarkFor(
        m,
        tasks.filter((t) => t.milestoneId === m.id),
      ),
      position: hexToWorld({ q: m.districtQ, r: m.districtR }),
    })),
    structures: tasks.map((t) => ({
      taskId: t.id,
      milestoneId: t.milestoneId,
      ...structureFor(t, today),
      position: hexToWorld({ q: t.plotX, r: t.plotY }),
    })),
  }))
  return { islands, bounds: boundsOf(islands) }
}

function boundsOf(islands: readonly SceneIsland[]): Bounds {
  if (islands.length === 0) return EMPTY_BOUNDS
  return islands.reduce<Bounds>(
    (b, island) => {
      const e = islandExtent(island.radius)
      return {
        minX: Math.min(b.minX, island.origin.x - e),
        maxX: Math.max(b.maxX, island.origin.x + e),
        minZ: Math.min(b.minZ, island.origin.z - e),
        maxZ: Math.max(b.maxZ, island.origin.z + e),
      }
    },
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}
