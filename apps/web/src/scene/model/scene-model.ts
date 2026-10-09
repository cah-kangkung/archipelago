import {
  type DecorationType,
  type Hex,
  hexKey,
  hexScale,
  isDecorationType,
  islandLand,
  islandSize,
  type LandmarkType,
  type WorldDto,
} from '@archipelago/shared'
import { islandOccupied } from '../../world/selectors'
import { hexToWorld, islandExtent, type Point, type Spot } from './hex-space'
import { type Dock, islandGrowth, pathHexes, type SceneryPiece } from './island-growth'
import { landmarkFor, type Marker, type StructureKind, structureFor } from './state'
import {
  heightAt,
  islandTerrain,
  type Stage,
  stageFor,
  type TerrainTile,
  tileHeights,
} from './terrain'

export type SceneStructure = {
  taskId: string
  /** The district the task belongs to; null for the island commons. */
  milestoneId: string | null
  kind: StructureKind
  marker: Marker
  position: Spot
}
export type SceneDistrict = {
  milestoneId: string
  name: string
  type: LandmarkType
  progress: number
  position: Spot
}
export type SceneDecoration = {
  buildingId: string
  type: DecorationType
  position: Spot
  /** 60° steps, 0…5. */
  rotation: number
}
export type SceneIsland = {
  projectId: string
  name: string
  /** The project's slot in the archipelago grid; sea routes join near slots (spec 17.5). */
  slot: Hex
  /** The project's terrain seed; with `size` it fully determines `tiles`. */
  seed: number
  origin: Point
  /** The island's growth size (spec 24.1); with `seed` it fully determines its land. */
  size: number
  /** The ring enclosing all land. */
  radius: number
  tiles: TerrainTile[]
  /** Growth stage from the island's finished tasks (spec 18.1). */
  stage: Stage
  /** Hexes of the paths to districts with a finished task (spec 18.4). */
  paths: Hex[]
  scenery: SceneryPiece[]
  dock: Dock | null
  districts: SceneDistrict[]
  structures: SceneStructure[]
  decorations: SceneDecoration[]
}
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
export type SceneModel = { islands: SceneIsland[]; bounds: Bounds }

/** Hex rings of open sea between neighbouring islands' shores. */
export const ISLAND_GAP = 8
const EMPTY_BOUNDS: Bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }

/** Positions within an island are island-local; `origin` places the island in the world. */
export function buildSceneModel(world: WorldDto, today: string): SceneModel {
  const prepared = world.projects.map((project) => {
    const milestones = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const buildings = world.buildings.filter((b) => b.projectId === project.id)
    const occupied = islandOccupied(world, project.id)
    const size = islandSize(project.islandSeed, occupied)
    const { radius, land } = islandLand(project.islandSeed, size)
    const onLand = new Set(land.map(hexKey))
    const stage = stageFor(tasks.filter((t) => t.status === 'done').length)
    // A path that crosses a bay keeps only its land hexes (spec 24.3).
    const paths = pathHexes(
      milestones
        .filter((m) => tasks.some((t) => t.milestoneId === m.id && t.status === 'done'))
        .map((m) => ({ q: m.districtQ, r: m.districtR })),
    ).filter((h) => onLand.has(hexKey(h)))
    const tiles = islandTerrain(project.islandSeed, size, stage, paths)
    return { project, milestones, tasks, buildings, occupied, size, radius, stage, paths, tiles }
  })
  // Slots are one hex apart; scaling them by the largest island's diameter plus a gap means no
  // two islands can touch, however big one grows.
  const largest = prepared.reduce((max, p) => Math.max(max, p.radius), 0)
  const spacing = 2 * largest + ISLAND_GAP

  const islands = prepared.map(
    ({ project, milestones, tasks, buildings, occupied, size, radius, stage, paths, tiles }) => {
      const heights = tileHeights(tiles)
      const spot = (h: Hex): Spot => ({ ...hexToWorld(h), y: heightAt(heights, h) })
      const growth = islandGrowth({
        seed: project.islandSeed,
        stage,
        tiles,
        occupied,
        paths,
      })
      const island: SceneIsland = {
        projectId: project.id,
        name: project.name,
        slot: { q: project.archipelagoX, r: project.archipelagoY },
        seed: project.islandSeed,
        origin: hexToWorld(hexScale({ q: project.archipelagoX, r: project.archipelagoY }, spacing)),
        size,
        radius,
        tiles,
        stage,
        paths,
        scenery: growth.scenery,
        dock: growth.dock,
        districts: milestones.map((m) => ({
          milestoneId: m.id,
          name: m.name,
          ...landmarkFor(
            m,
            tasks.filter((t) => t.milestoneId === m.id),
          ),
          position: spot({ q: m.districtQ, r: m.districtR }),
        })),
        structures: tasks.map((t) => ({
          taskId: t.id,
          milestoneId: t.milestoneId,
          ...structureFor(t, today),
          position: spot({ q: t.plotX, r: t.plotY }),
        })),
        decorations: buildings.flatMap((b): SceneDecoration[] =>
          isDecorationType(b.type)
            ? [
                {
                  buildingId: b.id,
                  type: b.type,
                  position: spot({ q: b.plotX, r: b.plotY }),
                  rotation: b.rotation,
                },
              ]
            : [],
        ),
      }
      return island
    },
  )
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
