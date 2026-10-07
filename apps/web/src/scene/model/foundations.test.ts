import { hexDistance } from '@archipelago/shared'
import { colors } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mix, scenePalette } from './palette'
import { mulberry32 } from './random'
import { islandRadius, islandTerrain } from './terrain'

const origin = { q: 0, r: 0 }

describe('hexToWorld', () => {
  test('neighbours are √3 apart and the origin maps to 0', () => {
    expect(hexToWorld(origin)).toEqual({ x: 0, z: 0 })
    expect(hexToWorld({ q: 1, r: 0 })).toEqual({ x: SQRT3, z: 0 })
    const p = hexToWorld({ q: 0, r: 1 })
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(SQRT3)
  })

  test('islandExtent covers the furthest hex centre plus its corner', () => {
    for (const h of [
      { q: 4, r: 0 },
      { q: 4, r: -4 },
      { q: 2, r: 2 },
    ]) {
      const p = hexToWorld(h)
      expect(Math.hypot(p.x, p.z) + 1).toBeLessThanOrEqual(islandExtent(4) + 1e-9)
    }
  })
})

describe('mulberry32', () => {
  test('is deterministic per seed, differs across seeds, and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = Array.from({ length: 50 }, a)
    expect(Array.from({ length: 50 }, b)).toEqual(seqA)
    expect(Array.from({ length: 50 }, c)).not.toEqual(seqA)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('palette', () => {
  test('mix blends channels linearly', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#004990', '#ffffff', 0)).toBe('#004990')
    expect(mix('#004990', '#ffffff', 1)).toBe('#ffffff')
  })

  test('scene colours are tokens or blends of tokens', () => {
    expect(scenePalette.sea).toBe(colors.brand)
    expect(scenePalette.shallows).toBe(colors.brandSecondary)
    expect(scenePalette.grass).toBe(colors.success)
    for (const value of Object.values(scenePalette)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('islandRadius', () => {
  test('is at least 4 and keeps two shore rings beyond the furthest occupied hex', () => {
    expect(islandRadius([])).toBe(4)
    expect(islandRadius([{ q: 1, r: 0 }])).toBe(4)
    expect(islandRadius([{ q: 5, r: 0 }])).toBe(7)
    expect(islandRadius([{ q: -10, r: 5 }])).toBe(12)
  })
})

describe('islandTerrain', () => {
  test('is deterministic per seed', () => {
    expect(islandTerrain(42, 6)).toEqual(islandTerrain(42, 6))
    expect(islandTerrain(42, 6)).not.toEqual(islandTerrain(43, 6))
  })

  test('the interior is complete flat land with a plaza at the origin', () => {
    const tiles = islandTerrain(7, 6)
    const at = (q: number, r: number) => tiles.find((t) => t.q === q && t.r === r)
    expect(at(0, 0)).toEqual({ q: 0, r: 0, height: LAND_HEIGHT, tone: 'plaza' })
    const interior = tiles.filter((t) => hexDistance(origin, t) <= 4)
    expect(interior).toHaveLength(1 + 3 * 4 * 5) // hexes within 4 rings
    for (const t of interior) expect(t.height).toBe(LAND_HEIGHT)
  })

  test('the shore is lower, never beyond the radius, and the outer ring is ragged', () => {
    let dropped = 0
    for (let seed = 1; seed <= 10; seed++) {
      const tiles = islandTerrain(seed, 6)
      const shore = tiles.filter((t) => hexDistance(origin, t) > 4)
      for (const t of shore) {
        expect(hexDistance(origin, t)).toBeLessThanOrEqual(6)
        expect(t.height).toBeGreaterThan(0.5)
        expect(t.height).toBeLessThan(LAND_HEIGHT)
        expect(['shore', 'rock']).toContain(t.tone)
      }
      expect(shore.filter((t) => hexDistance(origin, t) === 5)).toHaveLength(30)
      const outer = shore.filter((t) => hexDistance(origin, t) === 6).length
      expect(outer).toBeGreaterThan(18)
      dropped += 36 - outer
    }
    expect(dropped).toBeGreaterThan(0)
  })
})
