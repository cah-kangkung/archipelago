import { type Hex, hexKey, hexRing, SHORE_RINGS } from '@archipelago/shared'
import { GROWTH_THRESHOLDS, HILL_MAX, HILL_SCALE, HILL_STEP, MEADOW_SHARE } from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'
import { hashInts, mulberry32 } from './random'

export type Stage = 0 | 1 | 2 | 3 | 4
export type GrassTone = 'grassDry' | 'grassSprout' | 'grassGreen' | 'grassLush' | 'grass'
export type TerrainTone = GrassTone | 'meadow' | 'shore' | 'rock' | 'plaza' | 'path'
export type TerrainTile = { q: number; r: number; height: number; tone: TerrainTone }

/** Interior grass by stage: dry on a bare island, full `grass` once overgrown (spec 18.3). */
export const GRASS_TONES: readonly GrassTone[] = [
  'grassDry',
  'grassSprout',
  'grassGreen',
  'grassLush',
  'grass',
]

const ORIGIN: Hex = { q: 0, r: 0 }
const UNIT = 4294967296

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

/** LAND_HEIGHT plus whole HILL_STEPs, never above the stage's HILL_MAX. */
function hillHeight(seed: number, h: Hex, stage: Stage): number {
  const cap = HILL_MAX[stage]
  const { x, z } = hexToWorld(h)
  const steps = Math.min(
    Math.round((hillNoise(seed, x, z) * cap) / HILL_STEP),
    Math.floor(cap / HILL_STEP + 1e-9),
  )
  return LAND_HEIGHT + steps * HILL_STEP
}

/**
 * Hex tiles for an island of `radius` rings. Everything within `radius − 2` is land: rolling
 * hills that grow with `stage`, grass that greens with it, and `paths` in their own tone. The
 * plaza at the centre is always flat. The outer two rings are a lower shore shaped by `seed`, and
 * some hexes of the outermost ring are left out for a ragged coast; the stage never changes them.
 */
export function islandTerrain(
  seed: number,
  radius: number,
  stage: Stage = 0,
  paths: readonly Hex[] = [],
): TerrainTile[] {
  const random = mulberry32(seed)
  const onPath = new Set(paths.map(hexKey))
  const tiles: TerrainTile[] = []
  for (let ring = 0; ring <= radius; ring++) {
    for (const { q, r } of hexRing(ORIGIN, ring)) {
      if (ring === 0) {
        tiles.push({ q, r, height: LAND_HEIGHT, tone: 'plaza' })
        continue
      }
      // Two draws per hex keep the sequence aligned whichever branch runs.
      const a = random()
      const b = random()
      if (ring <= radius - SHORE_RINGS) {
        const tone: TerrainTone = onPath.has(hexKey({ q, r }))
          ? 'path'
          : a < MEADOW_SHARE[stage]
            ? 'meadow'
            : (GRASS_TONES[stage] ?? 'grass')
        tiles.push({ q, r, height: hillHeight(seed, { q, r }, stage), tone })
        continue
      }
      const outer = ring === radius
      if (outer && a < 0.3) continue
      const height = (outer ? 0.55 : 0.75) + b * 0.2
      tiles.push({ q, r, height, tone: a > 0.85 ? 'rock' : 'shore' })
    }
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
