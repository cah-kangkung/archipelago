import { describe, expect, test } from 'bun:test'
import {
  COMMONS_CENTER,
  DISTRICT_SPACING,
  hexDistance,
  hexKey,
  hexRing,
  hexSpiral,
  LANDMARK_TYPES,
  landmarkForIndex,
  nearestFreePlot,
  nextArchipelagoSlot,
  nextDistrictCenter,
  seedDirection,
} from './hex'

const origin = { q: 0, r: 0 }
const keys = (hexes: { q: number; r: number }[]) => hexes.map(hexKey)

describe('hexRing', () => {
  test('radius 0 is the centre itself', () => {
    expect(hexRing(origin, 0)).toEqual([origin])
  })

  test('radius r has 6r unique hexes, all exactly r away', () => {
    for (const radius of [1, 2, 3]) {
      const ring = hexRing({ q: 2, r: -1 }, radius)
      expect(ring).toHaveLength(6 * radius)
      expect(new Set(keys(ring)).size).toBe(6 * radius)
      for (const h of ring) expect(hexDistance(h, { q: 2, r: -1 })).toBe(radius)
    }
  })

  test('start direction rotates the walk but not the set', () => {
    const a = hexRing(origin, 2, 0)
    const b = hexRing(origin, 2, 3)
    expect(a[0]).not.toEqual(b[0])
    expect(new Set(keys(a))).toEqual(new Set(keys(b)))
  })
})

describe('hexSpiral', () => {
  test('yields the centre, then ring 1, then ring 2', () => {
    const first = Array.from({ length: 19 }, (_, i) => i)
    const spiral = hexSpiral(origin)
    const got = first.map(() => spiral.next().value as { q: number; r: number })
    expect(got[0]).toEqual(origin)
    for (const h of got.slice(1, 7)) expect(hexDistance(h, origin)).toBe(1)
    for (const h of got.slice(7, 19)) expect(hexDistance(h, origin)).toBe(2)
  })
})

describe('nextDistrictCenter', () => {
  test('never returns the commons centre and spaces centres 5 apart', () => {
    const taken = new Set<string>()
    const centres = []
    for (let i = 0; i < 7; i++) {
      const c = nextDistrictCenter(taken)
      taken.add(hexKey(c))
      centres.push(c)
    }
    expect(DISTRICT_SPACING).toBe(5)
    for (const c of centres) expect(c).not.toEqual(COMMONS_CENTER)
    for (const c of centres.slice(0, 6)) expect(hexDistance(c, origin)).toBe(5)
    expect(hexDistance(centres[6] ?? origin, origin)).toBe(10)
    expect(new Set(keys(centres)).size).toBe(7)
  })

  test('reuses a freed slot first', () => {
    const first = nextDistrictCenter(new Set())
    const second = nextDistrictCenter(new Set([hexKey(first)]))
    expect(nextDistrictCenter(new Set([hexKey(second)]))).toEqual(first)
  })
})

describe('nextArchipelagoSlot', () => {
  test('the first island sits at the origin, the next ones around it', () => {
    expect(nextArchipelagoSlot(new Set())).toEqual(origin)
    const second = nextArchipelagoSlot(new Set([hexKey(origin)]))
    expect(hexDistance(second, origin)).toBe(1)
  })
})

describe('nearestFreePlot', () => {
  test('never returns the centre and fills ring 1 before ring 2', () => {
    const centre = { q: 5, r: -5 }
    const taken = new Set<string>()
    const plots = []
    for (let i = 0; i < 8; i++) {
      const p = nearestFreePlot(centre, 0, (h) => taken.has(hexKey(h)))
      taken.add(hexKey(p))
      plots.push(p)
    }
    for (const p of plots) expect(p).not.toEqual(centre)
    for (const p of plots.slice(0, 6)) expect(hexDistance(p, centre)).toBe(1)
    for (const p of plots.slice(6)) expect(hexDistance(p, centre)).toBe(2)
  })

  test('skips plots reported as taken', () => {
    const blocked = hexRing(origin, 1)
    const p = nearestFreePlot(origin, 0, (h) => blocked.some((b) => hexKey(b) === hexKey(h)))
    expect(hexDistance(p, origin)).toBe(2)
  })

  test('different seeds start the walk in different directions', () => {
    const none = () => false
    expect(nearestFreePlot(origin, seedDirection(0), none)).not.toEqual(
      nearestFreePlot(origin, seedDirection(1), none),
    )
  })
})

describe('seedDirection and landmarks', () => {
  test('seedDirection is always 0..5, including negative seeds', () => {
    for (const seed of [0, 1, 5, 6, 7, 123456789, -1, -7]) {
      const d = seedDirection(seed)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThan(6)
    }
  })

  test('landmarks cycle in a fixed order', () => {
    expect(LANDMARK_TYPES).toEqual(['lighthouse', 'town_hall', 'windmill', 'observatory', 'market'])
    expect(landmarkForIndex(0)).toBe('lighthouse')
    expect(landmarkForIndex(4)).toBe('market')
    expect(landmarkForIndex(5)).toBe('lighthouse')
  })
})

test('COMMONS_CENTER is frozen', () => {
  expect(Object.isFrozen(COMMONS_CENTER)).toBe(true)
})
