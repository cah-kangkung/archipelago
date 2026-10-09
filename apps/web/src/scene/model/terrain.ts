import {
  type Hex,
  hashInts,
  hexKey,
  islandLand,
  islandShape,
  mulberry32,
  type Relief,
  SHORE_RINGS,
} from '@archipelago/shared'
import {
  GROWTH_THRESHOLDS,
  HILL_MAX,
  HILL_SCALE,
  HILL_STEP,
  MEADOW_SHARE,
  RELIEF_FACTOR,
} from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'

export type Stage = 0 | 1 | 2 | 3 | 4
export type GrassTone = 'grassDry' | 'grassSprout' | 'grassGreen' | 'grassLush' | 'grass'
export type TerrainTone = GrassTone | 'meadow' | 'shore' | 'rock' | 'plaza' | 'path'
export type TerrainTile = {
  q: number
  r: number
  height: number
  tone: TerrainTone
  /** Hex steps to the sea (spec 24.3): 1–2 is shore, 3 the edge, deeper is inland. */
  depth: number
}

/** Interior grass by stage: dry on a bare island, full `grass` once overgrown (spec 18.3). */
export const GRASS_TONES: readonly GrassTone[] = [
  'grassDry',
  'grassSprout',
  'grassGreen',
  'grassLush',
  'grass',
]

const UNIT = 4294967296
const TILE_SALT = 5
/** Share of depth-1 hexes left out for a ragged coast. */
const DROPOUT = 0.3

/** An island's stage from its count of finished tasks (spec 18.1). */
export function stageFor(finished: number): Stage {
  return GROWTH_THRESHOLDS.filter((t) => finished >= t).length as Stage
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Smooth seeded value noise in [0, 1) over world x/z: hashed lattice corners, blended. */
export function hillNoise(seed: number, x: number, z: number): number {
  const gx = x / HILL_SCALE
  const gz = z / HILL_SCALE
  const ix = Math.floor(gx)
  const iz = Math.floor(gz)
  const fx = smooth(gx - ix)
  const fz = smooth(gz - iz)
  const corner = (dx: number, dz: number) => hashInts(seed, ix + dx, iz + dz) / UNIT
  const top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * fx
  const bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * fx
  return top + (bottom - top) * fz
}

/** Height above LAND_HEIGHT for an interior hex, by the island's relief (spec 24.3). */
function reliefRise(
  seed: number,
  relief: Relief,
  h: Hex,
  depth: number,
  deepest: number,
  stage: Stage,
): number {
  const cap = HILL_MAX[stage] * RELIEF_FACTOR[relief]
  const { x, z } = hexToWorld(h)
  const noise = hillNoise(seed, x, z)
  const t = Math.min(1, (depth - SHORE_RINGS) / Math.max(1, deepest - SHORE_RINGS))
  const raw =
    relief === 'flattened'
      ? noise * cap
      : relief === 'spherical'
        ? cap * (0.7 * Math.sqrt(1 - (1 - t) ** 2) + 0.3 * noise)
        : relief === 'conical'
          ? cap * t
          : depth > SHORE_RINGS + 1
            ? cap * (0.8 + 0.2 * noise)
            : 0
  const steps = Math.min(Math.round(raw / HILL_STEP), Math.floor(cap / HILL_STEP + 1e-9))
  return steps * HILL_STEP
}

/**
 * Tiles for the island's land at `size` (spec 24.3). Shore is depth 1–2: lower sand and rock,
 * with some depth-1 hexes left out for a ragged coast, never changed by the stage. Deeper is
 * grass that greens with `stage`, `paths` in their own tone, and the flat plaza at the centre,
 * raised by the island's relief profile.
 */
export function islandTerrain(
  seed: number,
  size: number,
  stage: Stage = 0,
  paths: readonly Hex[] = [],
): TerrainTile[] {
  const { land, depth } = islandLand(seed, size)
  const { relief } = islandShape(seed)
  const deepest = Math.max(...depth.values())
  const onPath = new Set(paths.map(hexKey))
  const tiles: TerrainTile[] = []
  for (const h of land) {
    const d = depth.get(hexKey(h)) ?? 1
    // Per-hex draws, so a hex keeps its look as the island grows around it.
    const random = mulberry32(hashInts(seed, h.q, h.r, TILE_SALT))
    const a = random()
    const b = random()
    if (d <= SHORE_RINGS) {
      const outer = d === 1
      if (outer && a < DROPOUT) continue
      const height = (outer ? 0.55 : 0.75) + b * 0.2
      tiles.push({ q: h.q, r: h.r, height, tone: a > 0.85 ? 'rock' : 'shore', depth: d })
      continue
    }
    const plaza = h.q === 0 && h.r === 0
    const tone: TerrainTone = plaza
      ? 'plaza'
      : onPath.has(hexKey(h))
        ? 'path'
        : a < MEADOW_SHARE[stage]
          ? 'meadow'
          : (GRASS_TONES[stage] ?? 'grass')
    const height = LAND_HEIGHT + reliefRise(seed, relief, h, d, deepest, stage)
    tiles.push({ q: h.q, r: h.r, height, tone, depth: d })
  }
  return tiles
}

/** Tile heights by hex key, for standing things on the land. */
export function tileHeights(tiles: readonly TerrainTile[]): ReadonlyMap<string, number> {
  return new Map(tiles.map((t) => [hexKey(t), t.height]))
}

/** The land height at a hex; LAND_HEIGHT off the island (a valid plot is always on it). */
export function heightAt(heights: ReadonlyMap<string, number>, h: Hex): number {
  return heights.get(hexKey(h)) ?? LAND_HEIGHT
}
