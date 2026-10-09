import { describe, expect, test } from 'bun:test'
import { COMMONS_CENTER, HEX_DIRECTIONS, type Hex, hexKey, hexRing } from './hex'
import {
  COASTS,
  FOOTPRINTS,
  type IslandShape,
  islandLand,
  islandShape,
  islandSize,
  MIN_INTERIOR,
  MIN_ISLAND_SIZE,
  RELIEFS,
  SHORE_RINGS,
} from './island-shape'

const SEEDS = Array.from({ length: 300 }, (_, i) => i)
const seedWhere = (ok: (s: IslandShape) => boolean): number => {
  const seed = SEEDS.find((s) => ok(islandShape(s)))
  if (seed === undefined) throw new Error('no seed matches')
  return seed
}
const neighbours = (h: Hex): Hex[] => HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }))
const cartesian = (h: Hex) => ({ x: h.q + h.r / 2, y: (h.r * Math.sqrt(3)) / 2 })

describe('islandShape', () => {
  test('is deterministic per seed and varies between seeds', () => {
    const a = islandShape(42)
    const { distance: _, ...genome } = a
    expect(genome).toEqual(
      (({ distance: _d, ...g }) => g)(islandShape(42)) as Omit<IslandShape, 'distance'>,
    )
    const genomes = new Set(SEEDS.slice(0, 50).map((s) => JSON.stringify(islandShape(s))))
    expect(genomes.size).toBeGreaterThan(40)
  })

  test('every footprint, coast and relief turns up across seeds 0–299', () => {
    const seen = new Set(
      SEEDS.flatMap((s) => {
        const { footprint, coast, relief } = islandShape(s)
        return [footprint, coast, relief]
      }),
    )
    for (const k of [...FOOTPRINTS, ...COASTS, ...RELIEFS]) expect(seen.has(k)).toBe(true)
  })

  test('symmetric and asymmetric coasts both occur', () => {
    const sym = SEEDS.slice(0, 100).map((s) => islandShape(s).symmetric)
    expect(sym).toContain(true)
    expect(sym).toContain(false)
  })
})

describe('islandLand', () => {
  test('is deterministic and holds the centre and ring 1 as interior at every starting size', () => {
    expect(islandLand(7, 6)).toEqual(islandLand(7, 6))
    for (const seed of SEEDS.slice(0, 200)) {
      const { interior } = islandLand(seed, islandSize(seed, []))
      for (const h of [COMMONS_CENTER, ...hexRing(COMMONS_CENTER, 1)]) {
        expect(interior.has(hexKey(h))).toBe(true)
      }
    }
  })

  test('land is one piece joined to the centre', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const { land } = islandLand(seed, 8)
      const keys = new Set(land.map(hexKey))
      const seen = new Set([hexKey(COMMONS_CENTER)])
      const queue = [COMMONS_CENTER as Hex]
      while (queue.length > 0) {
        for (const n of neighbours(queue.pop() as Hex)) {
          const k = hexKey(n)
          if (keys.has(k) && !seen.has(k)) {
            seen.add(k)
            queue.push(n)
          }
        }
      }
      expect(seen.size).toBe(keys.size)
    }
  })

  test('depth counts steps to the sea; interior is exactly depth above SHORE_RINGS', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { land, depth, interior } = islandLand(seed, 7)
      const keys = new Set(land.map(hexKey))
      for (const h of land) {
        const d = depth.get(hexKey(h)) ?? 0
        const coast = neighbours(h).some((n) => !keys.has(hexKey(n)))
        expect(d === 1).toBe(coast)
        if (d > 1)
          expect(Math.min(...neighbours(h).map((n) => depth.get(hexKey(n)) ?? 0))).toBe(d - 1)
        expect(interior.has(hexKey(h))).toBe(d > SHORE_RINGS)
      }
    }
  })

  test('growing only ever adds land', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (let size = MIN_ISLAND_SIZE; size < 12; size++) {
        const next = new Set(islandLand(seed, size + 1).land.map(hexKey))
        for (const h of islandLand(seed, size).land) expect(next.has(hexKey(h))).toBe(true)
      }
    }
  })

  test('radius is the furthest land ring', () => {
    const { land, radius } = islandLand(3, 9)
    expect(
      Math.max(...land.map((h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2)),
    ).toBe(radius)
  })

  test('an elongated island is at least twice as long as it is wide', () => {
    const seed = seedWhere((s) => s.footprint === 'elongated' && s.coast === 'blunt')
    const { angle } = islandShape(seed)
    const along = islandLand(seed, 10).land.map((h) => {
      const c = cartesian(h)
      return {
        u: c.x * Math.cos(angle) + c.y * Math.sin(angle),
        v: -c.x * Math.sin(angle) + c.y * Math.cos(angle),
      }
    })
    const length = Math.max(...along.map((p) => p.u)) - Math.min(...along.map((p) => p.u))
    const width = Math.max(...along.map((p) => p.v)) - Math.min(...along.map((p) => p.v))
    expect(length).toBeGreaterThan(2 * width)
  })

  test('a crescent leaves its bite as sea', () => {
    const seed = seedWhere((s) => s.footprint === 'crescent' && s.coast === 'blunt')
    const { land, radius } = islandLand(seed, 10)
    // A convex shape of this reach would fill far more of its enclosing ring.
    expect(land.length).toBeLessThan(0.6 * (1 + 3 * radius * (radius + 1)))
  })
})

describe('islandSize', () => {
  test('at least MIN_ISLAND_SIZE with MIN_INTERIOR interior hexes, for every seed', () => {
    for (const seed of SEEDS) {
      const size = islandSize(seed, [])
      expect(size).toBeGreaterThanOrEqual(MIN_ISLAND_SIZE)
      expect(islandLand(seed, size).interior.size).toBeGreaterThanOrEqual(MIN_INTERIOR)
    }
  })

  test('the smallest size whose interior holds every occupied hex', () => {
    const far: Hex = { q: 9, r: -3 }
    const size = islandSize(5, [far])
    expect(islandLand(5, size).interior.has(hexKey(far))).toBe(true)
    if (size > islandSize(5, [])) {
      expect(islandLand(5, size - 1).interior.has(hexKey(far))).toBe(false)
    }
  })

  test('never shrinks as hexes are added', () => {
    const occupied: Hex[] = []
    let last = islandSize(11, occupied)
    for (const h of [
      { q: 4, r: 0 },
      { q: -6, r: 2 },
      { q: 1, r: 1 },
      { q: 0, r: 8 },
    ]) {
      occupied.push(h)
      const now = islandSize(11, occupied)
      expect(now).toBeGreaterThanOrEqual(last)
      last = now
    }
  })
})
