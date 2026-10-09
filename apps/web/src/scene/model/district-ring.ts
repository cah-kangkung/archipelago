import { HEX_DIRECTIONS, type Hex, hexKey } from '@archipelago/shared'
import type { Focus } from '../../world/selectors'
import { hexSide, hexToWorld, type Point, type Spot, worldToHex } from './hex-space'
import type { SceneDistrict, SceneModel, SceneStructure } from './scene-model'
import { heightAt, tileHeights } from './terrain'

/**
 * The district's own hexes (spec 24.5): its landmark, its tasks' plots, and every hex they
 * enclose. Enclosed means the flood from just outside their bounding box cannot reach it.
 */
export function districtTiles(
  district: SceneDistrict,
  structures: readonly SceneStructure[],
): Hex[] {
  const own = [
    worldToHex(district.position),
    ...structures
      .filter((s) => s.milestoneId === district.milestoneId)
      .map((s) => worldToHex(s.position)),
  ]
  const set = new Map(own.map((h) => [hexKey(h), h]))
  const qs = own.map((h) => h.q)
  const rs = own.map((h) => h.r)
  const minQ = Math.min(...qs) - 1
  const maxQ = Math.max(...qs) + 1
  const minR = Math.min(...rs) - 1
  const maxR = Math.max(...rs) + 1
  const inBox = (h: Hex) => h.q >= minQ && h.q <= maxQ && h.r >= minR && h.r <= maxR
  const start = { q: minQ, r: minR }
  const outside = new Set([hexKey(start)])
  const queue: Hex[] = [start]
  while (queue.length > 0) {
    const h = queue.pop() as Hex
    for (const d of HEX_DIRECTIONS) {
      const n = { q: h.q + d.q, r: h.r + d.r }
      const k = hexKey(n)
      if (!inBox(n) || outside.has(k) || set.has(k)) continue
      outside.add(k)
      queue.push(n)
    }
  }
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = minR; r <= maxR; r++) {
      const k = hexKey({ q, r })
      if (!set.has(k) && !outside.has(k)) set.set(k, { q, r })
    }
  }
  return [...set.values()]
}

/** A point of the ring's outline: island-local, at its tile's height, with its mitred inward offset. */
export type RingPoint = Spot & { mx: number; mz: number }

type Side = { from: Point; to: Point; y: number; inward: Point }

const cornerKey = (p: Point) => `${Math.round(p.x * 1e4)},${Math.round(p.z * 1e4)}`

/**
 * The outline of `tiles` (spec 24.5): every side whose neighbour is not a tile, chained into
 * closed loops, one per piece. A loop holds a point per corner at its tile's height, two where
 * neighbouring tiles differ in height, so it drops straight down the step. Each point's (mx, mz)
 * is the mitred inward offset of its two sides: inset by `d`, a point moves `d · (mx, mz)`.
 */
export function ringLoops(
  tiles: readonly Hex[],
  heights: ReadonlyMap<string, number>,
): RingPoint[][] {
  const own = new Set(tiles.map(hexKey))
  const starts = new Map<string, Side[]>()
  for (const t of tiles) {
    const c = hexToWorld(t)
    const y = heightAt(heights, t)
    HEX_DIRECTIONS.forEach((d, i) => {
      if (own.has(hexKey({ q: t.q + d.q, r: t.r + d.r }))) return
      const [from, to] = hexSide(t, i)
      const mx = c.x - (from.x + to.x) / 2
      const mz = c.z - (from.z + to.z) / 2
      const len = Math.hypot(mx, mz)
      const side = { from, to, y, inward: { x: mx / len, z: mz / len } }
      const k = cornerKey(from)
      starts.set(k, [...(starts.get(k) ?? []), side])
    })
  }
  const used = new Set<Side>()
  const loops: RingPoint[][] = []
  for (const list of starts.values()) {
    for (const first of list) {
      if (used.has(first)) continue
      const chain: Side[] = []
      let side: Side | undefined = first
      while (side && !used.has(side)) {
        used.add(side)
        chain.push(side)
        side = starts.get(cornerKey(side.to))?.find((s) => !used.has(s))
      }
      loops.push(pointsOf(chain))
    }
  }
  return loops
}

function pointsOf(chain: readonly Side[]): RingPoint[] {
  const points: RingPoint[] = []
  chain.forEach((side, k) => {
    const prev = chain[(k + chain.length - 1) % chain.length] as Side
    const sx = prev.inward.x + side.inward.x
    const sz = prev.inward.z + side.inward.z
    const len = Math.hypot(sx, sz)
    // Two sides at a hex corner meet at 60° or 120°: never head-on, so len > 0.
    const m = { x: sx / len, z: sz / len }
    const scale = 1 / (m.x * side.inward.x + m.z * side.inward.z)
    const at = { x: side.from.x, z: side.from.z, mx: m.x * scale, mz: m.z * scale }
    if (prev.y !== side.y) points.push({ ...at, y: prev.y })
    points.push({ ...at, y: side.y })
  })
  return points
}

/** What the ring draws for a focus: the district, its tiles' key, the island origin, its loops. */
export type RingTarget = {
  /** `projectId/milestoneId`: which district, whatever its tiles. */
  district: string
  /** Changes when the tiles or their heights do. */
  key: string
  origin: Point
  loops: RingPoint[][]
}

/** The ring for a district focus (spec 24.5); none elsewhere or for an unknown id. */
export function ringTarget(model: SceneModel, focus: Focus): RingTarget | null {
  if (focus.kind !== 'district') return null
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  const district = island?.districts.find((d) => d.milestoneId === focus.milestoneId)
  if (!island || !district) return null
  const tiles = districtTiles(district, island.structures)
  const heights = tileHeights(island.tiles)
  return {
    district: `${focus.projectId}/${focus.milestoneId}`,
    key: `${island.origin.x},${island.origin.z}|${tiles
      .map((h) => `${hexKey(h)}@${heightAt(heights, h)}`)
      .sort()
      .join(';')}`,
    origin: island.origin,
    loops: ringLoops(tiles, heights),
  }
}

export type RingLeg = 'none' | 'draw' | 'fade' | 'swap'

/** How the ring moves between two districts (or none): draw on, fade out, or swap at once. */
export function ringLeg(from: string | null, to: string | null): RingLeg {
  if (from === to) return 'none'
  if (from === null) return 'draw'
  if (to === null) return 'fade'
  return 'swap'
}
