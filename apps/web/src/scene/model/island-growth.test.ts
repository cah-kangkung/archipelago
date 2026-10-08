import { type Hex, hexDistance, hexKey, SHORE_RINGS } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { CLUSTER_OFFSET, GROWTH_FILL, SCENERY_SCALE, SCENERY_WEIGHTS, SHORE_FILL } from '../tuning'
import { hexToWorld } from './hex-space'
import { DOCK_STAGE, growEase, islandGrowth, pathHexes, type SceneryPiece } from './island-growth'
import { islandTerrain, type Stage } from './terrain'

const ORIGIN = { q: 0, r: 0 }
const STAGES: Stage[] = [0, 1, 2, 3, 4]

function grow(seed: number, stage: Stage, occupied: Hex[] = [], paths: Hex[] = [], radius = 7) {
  const tiles = islandTerrain(seed, radius, stage, paths)
  return { tiles, ...islandGrowth({ seed, radius, stage, tiles, occupied, paths }) }
}
const hexOf = (p: SceneryPiece) => p.id.split(':')[0] ?? ''
const flat = ({ position, ...rest }: SceneryPiece) => ({ ...rest, x: position.x, z: position.z })

describe('islandGrowth', () => {
  test('a higher stage only adds: every piece stays, same type, offset, turn, scale and tier', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const stage of [0, 1, 2, 3] as Stage[]) {
        const now = grow(seed, stage).scenery
        const next = new Map(grow(seed, (stage + 1) as Stage).scenery.map((p) => [p.id, flat(p)]))
        for (const p of now) expect(next.get(p.id)).toEqual(flat(p))
      }
    }
  })

  test('is deterministic', () => {
    expect(grow(3, 2)).toEqual(grow(3, 2))
  })

  test('never on an occupied hex, a path hex, the dock hex or the centre', () => {
    const occupied: Hex[] = [
      { q: 1, r: 0 },
      { q: -2, r: 1 },
      { q: 0, r: 3 },
    ]
    const paths: Hex[] = [
      { q: 0, r: -1 },
      { q: 0, r: -2 },
    ]
    for (let seed = 1; seed <= 10; seed++) {
      const { scenery, dock } = grow(seed, 4, occupied, paths)
      const banned = new Set([...occupied, ...paths, ORIGIN].map(hexKey))
      if (dock) {
        const at = scenery.find((p) => {
          const c = hexToWorld(parse(hexOf(p)))
          return Math.hypot(c.x - dock.position.x, c.z - dock.position.z) < 1e-9
        })
        expect(at).toBeUndefined()
      }
      for (const p of scenery) expect(banned.has(hexOf(p))).toBe(false)
    }
  })

  test('occupying one hex removes only that hex’s pieces', () => {
    const base = grow(4, 4).scenery
    const first = base[0]
    if (!first) throw new Error('seed 4 grew nothing')
    const target = hexOf(first)
    const after = grow(4, 4, [parse(target)]).scenery
    expect(after).toEqual(base.filter((p) => hexOf(p) !== target))
  })

  test('each stage fills about its share of free interior and shore hexes', () => {
    for (const stage of STAGES) {
      let inland = 0
      let inlandHit = 0
      let shore = 0
      let shoreHit = 0
      for (let seed = 1; seed <= 30; seed++) {
        const radius = 8
        const { tiles, scenery } = grow(seed, stage, [], [], radius)
        const hit = new Set(scenery.map(hexOf))
        for (const t of tiles) {
          const ring = hexDistance(ORIGIN, t)
          if (ring === 0) continue
          if (ring > radius - SHORE_RINGS) {
            shore++
            if (hit.has(hexKey(t))) shoreHit++
          } else {
            inland++
            if (hit.has(hexKey(t))) inlandHit++
          }
        }
      }
      expect(inlandHit / inland).toBeCloseTo(GROWTH_FILL[stage], 1)
      expect(shoreHit / shore).toBeCloseTo(GROWTH_FILL[stage] * SHORE_FILL, 1)
    }
  })

  test('types follow the place: shore, the ring next to it, and inland', () => {
    const radius = 7
    const edge = radius - SHORE_RINGS
    for (let seed = 1; seed <= 10; seed++) {
      for (const p of grow(seed, 4, [], [], radius).scenery) {
        const ring = hexDistance(ORIGIN, parse(hexOf(p)))
        const zone = ring > edge ? 'shore' : ring === edge ? 'edge' : 'inland'
        expect(Object.keys(SCENERY_WEIGHTS[zone])).toContain(p.type)
      }
    }
  })

  test('pieces stand on a present tile, near its centre, inside the island', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { tiles, scenery } = grow(seed, 4)
      const byKey = new Map(tiles.map((t) => [hexKey(t), t]))
      for (const p of scenery) {
        const tile = byKey.get(hexOf(p))
        expect(tile).toBeDefined()
        if (!tile) continue
        const c = hexToWorld(tile)
        expect(p.position.y).toBe(tile.height)
        expect(Math.hypot(p.position.x - c.x, p.position.z - c.z)).toBeLessThanOrEqual(
          CLUSTER_OFFSET + 1e-9,
        )
        expect(hexDistance(ORIGIN, tile)).toBeLessThanOrEqual(7)
        expect(p.scale).toBeGreaterThanOrEqual(SCENERY_SCALE[0])
        expect(p.scale).toBeLessThanOrEqual(SCENERY_SCALE[1])
      }
    }
  })

  test('a cluster holds 1–3 pieces, all on one tier', () => {
    const byHex = new Map<string, SceneryPiece[]>()
    for (const p of grow(6, 4).scenery) byHex.set(hexOf(p), [...(byHex.get(hexOf(p)) ?? []), p])
    for (const cluster of byHex.values()) {
      expect(cluster.length).toBeGreaterThanOrEqual(1)
      expect(cluster.length).toBeLessThanOrEqual(3)
      expect(new Set(cluster.map((p) => p.low)).size).toBe(1)
    }
  })

  test('the low tier keeps about half the hexes', () => {
    let all = 0
    let low = 0
    for (let seed = 1; seed <= 30; seed++) {
      const hexes = new Map(grow(seed, 4).scenery.map((p) => [hexOf(p), p.low]))
      all += hexes.size
      low += [...hexes.values()].filter(Boolean).length
    }
    expect(low / all).toBeGreaterThan(0.4)
    expect(low / all).toBeLessThan(0.6)
  })

  test('no dock before the green stage; from then on one, on a present outer hex, turned out to sea', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const stage of STAGES) {
        const { tiles, dock } = grow(seed, stage)
        if (stage < DOCK_STAGE) {
          expect(dock).toBeNull()
          continue
        }
        if (!dock) throw new Error('no dock')
        const tile = tiles.find((t) => {
          const c = hexToWorld(t)
          return Math.hypot(c.x - dock.position.x, c.z - dock.position.z) < 1e-9
        })
        expect(tile && hexDistance(ORIGIN, tile)).toBe(7)
        expect(dock.position.y).toBe(tile?.height)
        const d = Math.hypot(dock.position.x, dock.position.z)
        expect(Math.cos(dock.turn)).toBeCloseTo(dock.position.x / d)
        expect(-Math.sin(dock.turn)).toBeCloseTo(dock.position.z / d)
        expect(dock).toEqual(grow(seed, DOCK_STAGE).dock)
      }
    }
  })

  test('the scenery weights of each zone sum to 1', () => {
    for (const weights of Object.values(SCENERY_WEIGHTS)) {
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    }
  })
})

describe('pathHexes', () => {
  test('the line from the centre to each district, without its ends, each hex once', () => {
    expect(pathHexes([{ q: 5, r: 0 }])).toEqual([1, 2, 3, 4].map((q) => ({ q, r: 0 })))
    expect(pathHexes([])).toEqual([])
    const both = pathHexes([
      { q: 5, r: 0 },
      { q: 5, r: 0 },
      { q: 0, r: -5 },
    ])
    expect(both).toHaveLength(8)
    expect(both.some((h) => hexDistance(ORIGIN, h) === 0 || hexDistance(ORIGIN, h) === 5)).toBe(
      false,
    )
  })
})

describe('growEase', () => {
  test('runs 0 → 1, eased out, and clamps', () => {
    expect(growEase(0)).toBe(0)
    expect(growEase(1)).toBe(1)
    expect(growEase(0.5)).toBeGreaterThan(0.5)
    expect(growEase(-1)).toBe(0)
    expect(growEase(2)).toBe(1)
  })
})

function parse(key: string): Hex {
  const [q = 0, r = 0] = key.split(',').map(Number)
  return { q, r }
}
