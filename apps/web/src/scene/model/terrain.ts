import { type Hex, hexRing, SHORE_RINGS } from '@archipelago/shared'
import { LAND_HEIGHT } from './hex-space'
import { mulberry32 } from './random'

export type TerrainTone = 'grass' | 'meadow' | 'shore' | 'rock' | 'plaza'
export type TerrainTile = { q: number; r: number; height: number; tone: TerrainTone }

const ORIGIN: Hex = { q: 0, r: 0 }

/**
 * Hex tiles for an island of `radius` rings. Everything within `radius − 2` is flat land at
 * LAND_HEIGHT; the outer two rings are a lower shore shaped by `seed`, and some hexes of the
 * outermost ring are left out for a ragged coast. Same seed and radius, same island.
 */
export function islandTerrain(seed: number, radius: number): TerrainTile[] {
  const random = mulberry32(seed)
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
        tiles.push({ q, r, height: LAND_HEIGHT, tone: a < 0.2 ? 'meadow' : 'grass' })
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
