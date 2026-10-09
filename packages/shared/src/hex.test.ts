import { describe, expect, test } from 'bun:test'
import {
  COMMONS_CENTER,
  hexDistance,
  hexKey,
  hexLine,
  hexRing,
  hexSpiral,
  LANDMARK_TYPES,
  landmarkForIndex,
  nextArchipelagoSlot,
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

describe('nextArchipelagoSlot', () => {
  test('the first island sits at the origin, the next ones around it', () => {
    expect(nextArchipelagoSlot(new Set())).toEqual(origin)
    const second = nextArchipelagoSlot(new Set([hexKey(origin)]))
    expect(hexDistance(second, origin)).toBe(1)
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

describe('hexLine', () => {
  test('runs from a to b inclusive, one hex per step', () => {
    const a = { q: 0, r: 0 }
    const b = { q: 5, r: -3 }
    const line = hexLine(a, b)
    expect(line[0]).toEqual(a)
    expect(line.at(-1)).toEqual(b)
    expect(line).toHaveLength(hexDistance(a, b) + 1)
    line.slice(1).forEach((h, i) => {
      expect(hexDistance(line[i] ?? h, h)).toBe(1)
    })
  })

  test('an axis is exact, and a line to itself is one hex', () => {
    expect(hexLine({ q: 0, r: 0 }, { q: 0, r: 4 })).toEqual(
      [0, 1, 2, 3, 4].map((r) => ({ q: 0, r })),
    )
    expect(hexLine({ q: 0, r: 0 }, { q: -5, r: 0 })).toEqual(
      [0, -1, -2, -3, -4, -5].map((q) => ({ q: q + 0, r: 0 })),
    )
    expect(hexLine({ q: 2, r: 1 }, { q: 2, r: 1 })).toEqual([{ q: 2, r: 1 }])
  })
})
