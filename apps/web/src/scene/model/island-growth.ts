import {
  COMMONS_CENTER,
  type Hex,
  hexDistance,
  hexKey,
  hexLine,
  SHORE_RINGS,
} from '@archipelago/shared'
import { CLUSTER_OFFSET, GROWTH_FILL, SCENERY_SCALE, SCENERY_WEIGHTS, SHORE_FILL } from '../tuning'
import { hexToWorld, type Spot } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { Stage, TerrainTile } from './terrain'

export const SCENERY_TYPES = [
  'tree',
  'bush',
  'rock',
  'flowers',
  'grass',
  'reeds',
  'driftwood',
] as const
export type SceneryType = (typeof SCENERY_TYPES)[number]

export type SceneryPiece = {
  /** `q,r:k`: the hex and the piece's place in its cluster; the same at every stage. */
  id: string
  type: SceneryType
  /** Island-local, standing on its tile. */
  position: Spot
  turn: number
  scale: number
  /** Kept on the `low` tier: a fixed half of the hexes, whole clusters at a time. */
  low: boolean
}
/** A jetty; its model faces +x, and `turn` points it away from the island centre. */
export type Dock = { position: Spot; turn: number }

/** From this stage an island has a dock (spec 18.4). */
export const DOCK_STAGE = 2

const UNIT = 4294967296
const CLUSTER_SALT = 1
const LOW_SALT = 2
const DOCK_SALT = 3

/** Path hexes: the hex line from the commons centre to each district, ends excluded. */
export function pathHexes(districts: readonly Hex[]): Hex[] {
  const seen = new Map<string, Hex>()
  for (const d of districts) {
    for (const h of hexLine(COMMONS_CENTER, d).slice(1, -1)) seen.set(hexKey(h), h)
  }
  return [...seen.values()]
}

function pick<K extends string>(weights: Readonly<Partial<Record<K, number>>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][]
  let sum = 0
  for (const [key, weight] of entries) {
    sum += weight
    if (u < sum) return key
  }
  // Rounding can leave u just past the last cumulative weight.
  return (entries.at(-1) as [K, number])[0]
}

function dockTile(seed: number, radius: number, tiles: readonly TerrainTile[]): TerrainTile | null {
  let best: TerrainTile | null = null
  let bestHash = Number.POSITIVE_INFINITY
  for (const t of tiles) {
    if (hexDistance(COMMONS_CENTER, t) !== radius) continue
    const h = hashInts(seed, t.q, t.r, DOCK_SALT)
    if (h < bestHash) {
      best = t
      bestHash = h
    }
  }
  return best
}

/**
 * Seeded scenery and the dock for one island (spec 18.2, 18.4). Each hex decides on its own
 * whether it is revealed at a stage, so growth only adds and occupying a hex hides only that
 * hex's pieces.
 */
export function islandGrowth({
  seed,
  radius,
  stage,
  tiles,
  occupied,
  paths,
}: {
  seed: number
  radius: number
  stage: Stage
  tiles: readonly TerrainTile[]
  occupied: readonly Hex[]
  paths: readonly Hex[]
}): { scenery: SceneryPiece[]; dock: Dock | null } {
  const dockAt = dockTile(seed, radius, tiles)
  const blocked = new Set([...occupied, ...paths, COMMONS_CENTER].map(hexKey))
  // Blocked at every stage so the dock never takes a hex scenery already grew on.
  if (dockAt) blocked.add(hexKey(dockAt))
  const edge = radius - SHORE_RINGS
  const scenery: SceneryPiece[] = []
  for (const tile of tiles) {
    if (blocked.has(hexKey(tile))) continue
    const ring = hexDistance(COMMONS_CENTER, tile)
    const zone = ring > edge ? 'shore' : ring === edge ? 'edge' : 'inland'
    const fill = GROWTH_FILL[stage] * (zone === 'shore' ? SHORE_FILL : 1)
    if (hashInts(seed, tile.q, tile.r) / UNIT >= fill) continue
    const random = mulberry32(hashInts(seed, tile.q, tile.r, CLUSTER_SALT))
    const type = pick<SceneryType>(SCENERY_WEIGHTS[zone], random())
    const count = 1 + Math.floor(random() * 3)
    const low = (hashInts(seed, tile.q, tile.r, LOW_SALT) & 1) === 0
    const centre = hexToWorld(tile)
    for (let k = 0; k < count; k++) {
      const angle = random() * 2 * Math.PI
      const reach = Math.sqrt(random()) * CLUSTER_OFFSET
      scenery.push({
        id: `${tile.q},${tile.r}:${k}`,
        type,
        position: {
          x: centre.x + Math.cos(angle) * reach,
          y: tile.height,
          z: centre.z + Math.sin(angle) * reach,
        },
        turn: random() * 2 * Math.PI,
        scale: SCENERY_SCALE[0] + random() * (SCENERY_SCALE[1] - SCENERY_SCALE[0]),
        low,
      })
    }
  }
  if (!dockAt || stage < DOCK_STAGE) return { scenery, dock: null }
  const { x, z } = hexToWorld(dockAt)
  return { scenery, dock: { position: { x, y: dockAt.height, z }, turn: Math.atan2(-z, x) } }
}

/** Ease-out cubic over [0, 1], clamped: the grow-in's scale curve (spec 18.5). */
export function growEase(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) ** 3
}
