import {
  type Hex,
  hexDistance,
  hexKey,
  islandLand,
  islandRadius,
  islandSize,
} from '@archipelago/shared'
import { colors } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'
import { HILL_MAX, HILL_STEP } from '../tuning'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mix, scenePalette } from './palette'
import { mulberry32 } from './random'
import { GRASS_TONES, heightAt, islandTerrain, type Stage, stageFor, tileHeights } from './terrain'

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
    expect(scenePalette.shallows).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.6))
    expect(scenePalette.seaShallow).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.45))
    expect(scenePalette.sea).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.3))
    expect(scenePalette.seaDeep).toBe(mix(colors.brandSecondary, colors.surfacePrimary, 0.15))
    expect(scenePalette.grass).toBe(colors.success)
    expect(scenePalette.cloud).toBe(colors.surfacePrimary)
    for (const value of Object.values(scenePalette)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('the sea lightens from open water to the coast (spec 19.2)', () => {
    const light = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + Number.parseInt(hex.slice(i, i + 2), 16), 0)
    const { seaDeep, sea, seaShallow, shallows } = scenePalette
    expect(light(sea)).toBeGreaterThan(light(seaDeep))
    expect(light(seaShallow)).toBeGreaterThan(light(sea))
    expect(light(shallows)).toBeGreaterThan(light(seaShallow))
    expect([shallows, seaShallow, sea, seaDeep]).toEqual([
      '#99c3ed',
      '#73ade6',
      '#4d96e0',
      '#2680d9',
    ])
  })
})

describe('islandRadius', () => {
  test('is the enclosing ring of the island land at its current size', () => {
    const seed = 1
    for (const occupied of [[], [{ q: 1, r: 0 }], [{ q: 5, r: 0 }], [{ q: -10, r: 5 }]]) {
      const { radius, interior } = islandLand(seed, islandSize(seed, occupied))
      expect(islandRadius(seed, occupied)).toBe(radius)
      for (const h of occupied) expect(interior.has(hexKey(h))).toBe(true)
    }
  })
})

describe('islandTerrain', () => {
  test('is deterministic per seed', () => {
    expect(islandTerrain(42, 6)).toEqual(islandTerrain(42, 6))
    expect(islandTerrain(42, 6)).not.toEqual(islandTerrain(43, 6))
  })

  test('the interior is complete land at or above LAND_HEIGHT, with a flat plaza at the origin', () => {
    const tiles = islandTerrain(7, 6, 4)
    const at = (q: number, r: number) => tiles.find((t) => t.q === q && t.r === r)
    expect(at(0, 0)).toEqual({ q: 0, r: 0, height: LAND_HEIGHT, tone: 'plaza' })
    const interior = tiles.filter((t) => hexDistance(origin, t) <= 4)
    expect(interior).toHaveLength(1 + 3 * 4 * 5) // hexes within 4 rings
    for (const t of interior) expect(t.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
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

  const STAGES: Stage[] = [0, 1, 2, 3, 4]

  test('hills rise in steps, never past their stage cap, and grow with the stage', () => {
    const tallest = STAGES.map(() => 0)
    for (let seed = 1; seed <= 10; seed++) {
      for (const stage of STAGES) {
        for (const t of islandTerrain(seed, 6, stage)) {
          if (hexDistance(origin, t) > 4) continue
          const rise = t.height - LAND_HEIGHT
          expect(rise).toBeGreaterThanOrEqual(0)
          expect(rise).toBeLessThanOrEqual(HILL_MAX[stage] + 1e-9)
          expect(Math.abs(rise / HILL_STEP - Math.round(rise / HILL_STEP))).toBeLessThan(1e-9)
          tallest[stage] = Math.max(tallest[stage] ?? 0, rise)
        }
      }
    }
    expect(tallest[4]).toBeGreaterThan(tallest[0] ?? 0)
  })

  test('the stage leaves the shore exactly as it was', () => {
    const shore = (stage: Stage) =>
      islandTerrain(3, 6, stage).filter((t) => hexDistance(origin, t) > 4)
    expect(shore(4)).toEqual(shore(0))
  })

  test('grass is dry on a bare island and full grass when overgrown, with more meadow', () => {
    let meadow0 = 0
    let meadow4 = 0
    for (let seed = 1; seed <= 10; seed++) {
      const bare = islandTerrain(seed, 6, 0).filter(
        (t) => t.tone !== 'plaza' && hexDistance(origin, t) <= 4,
      )
      const lush = islandTerrain(seed, 6, 4).filter(
        (t) => t.tone !== 'plaza' && hexDistance(origin, t) <= 4,
      )
      for (const t of bare) expect(['grassDry', 'meadow']).toContain(t.tone)
      for (const t of lush) expect(['grass', 'meadow']).toContain(t.tone)
      meadow0 += bare.filter((t) => t.tone === 'meadow').length
      meadow4 += lush.filter((t) => t.tone === 'meadow').length
    }
    expect(meadow4).toBeGreaterThan(meadow0)
    expect(GRASS_TONES).toEqual(['grassDry', 'grassSprout', 'grassGreen', 'grassLush', 'grass'])
  })

  test('path hexes get the path tone and no other hex does', () => {
    const paths: Hex[] = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]
    const keys = new Set(paths.map(hexKey))
    for (const t of islandTerrain(5, 6, 2, paths)) {
      expect(t.tone === 'path').toBe(keys.has(hexKey(t)))
    }
  })

  test('tileHeights and heightAt read a tile height, LAND_HEIGHT off the island', () => {
    const tiles = islandTerrain(9, 5, 3)
    const heights = tileHeights(tiles)
    for (const t of tiles) expect(heightAt(heights, t)).toBe(t.height)
    expect(heightAt(heights, { q: 40, r: 0 })).toBe(LAND_HEIGHT)
  })
})

describe('stageFor', () => {
  test.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [7, 1],
    [8, 2],
    [14, 2],
    [15, 3],
    [29, 3],
    [30, 4],
    [500, 4],
  ])('%i finished tasks is stage %i', (finished, stage) => {
    expect(stageFor(finished)).toBe(stage)
  })
})
