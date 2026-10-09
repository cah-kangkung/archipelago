import {
  HEX_DIRECTIONS,
  type Hex,
  hexKey,
  islandLand,
  islandRadius,
  islandShape,
  islandSize,
  type Relief,
} from '@archipelago/shared'
import { colors } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'
import { HILL_MAX, HILL_STEP, RELIEF_FACTOR } from '../tuning'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { mix, scenePalette } from './palette'
import { mulberry32 } from './random'
import {
  GRASS_TONES,
  heightAt,
  islandTerrain,
  type Stage,
  shallowsHexes,
  shallowsRim,
  stageFor,
  tileHeights,
} from './terrain'

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
  const SIZE = 7
  const seedWith = (relief: Relief) =>
    Array.from({ length: 300 }, (_, i) => i).find((s) => islandShape(s).relief === relief) as number

  test('is deterministic per seed', () => {
    expect(islandTerrain(42, SIZE)).toEqual(islandTerrain(42, SIZE))
    expect(islandTerrain(42, SIZE)).not.toEqual(islandTerrain(43, SIZE))
  })

  test('one tile per land hex, less the ragged depth-1 dropout; depth comes from the land', () => {
    let dropped = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { land, depth } = islandLand(seed, SIZE)
      const tiles = islandTerrain(seed, SIZE)
      const byKey = new Map(tiles.map((t) => [hexKey(t), t]))
      for (const h of land) {
        const t = byKey.get(hexKey(h))
        const d = depth.get(hexKey(h)) ?? 0
        if (!t) {
          expect(d).toBe(1)
          dropped++
          continue
        }
        expect(t.depth).toBe(d)
      }
      expect(tiles.length).toBeLessThanOrEqual(land.length)
    }
    expect(dropped).toBeGreaterThan(0)
  })

  test('the shore (depth 1–2) is lower sand or rock and the stage never changes it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const shore = (stage: Stage) => islandTerrain(seed, SIZE, stage).filter((t) => t.depth <= 2)
      for (const t of shore(0)) {
        expect(t.height).toBeGreaterThan(0.5)
        expect(t.height).toBeLessThan(LAND_HEIGHT)
        expect(['shore', 'rock']).toContain(t.tone)
      }
      expect(shore(4)).toEqual(shore(0))
    }
  })

  test('the plaza is the centre, flat at its relief height; interior is at or above LAND_HEIGHT', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const tiles = islandTerrain(seed, SIZE, 4)
      const plaza = tiles.filter((t) => t.tone === 'plaza')
      expect(plaza).toHaveLength(1)
      expect(plaza[0]).toMatchObject({ q: 0, r: 0 })
      for (const t of tiles.filter((x) => x.depth > 2)) {
        expect(t.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
      }
    }
  })

  const STAGES: Stage[] = [0, 1, 2, 3, 4]

  test('hills rise in whole steps under the stage cap times the relief factor', () => {
    const tallest = STAGES.map(() => 0)
    for (let seed = 1; seed <= 20; seed++) {
      const factor = RELIEF_FACTOR[islandShape(seed).relief]
      for (const stage of STAGES) {
        for (const t of islandTerrain(seed, SIZE, stage)) {
          if (t.depth <= 2) continue
          const rise = t.height - LAND_HEIGHT
          expect(rise).toBeGreaterThanOrEqual(0)
          expect(rise).toBeLessThanOrEqual(HILL_MAX[stage] * factor + 1e-9)
          expect(Math.abs(rise / HILL_STEP - Math.round(rise / HILL_STEP))).toBeLessThan(1e-9)
          tallest[stage] = Math.max(tallest[stage] ?? 0, rise)
        }
      }
    }
    expect(tallest[4]).toBeGreaterThan(tallest[0] ?? 0)
  })

  test('conical rises with depth: the deepest tiles are the tallest', () => {
    const seed = seedWith('conical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    const deepest = Math.max(...tiles.map((t) => t.depth))
    const top = Math.max(...tiles.map((t) => t.height))
    expect(tiles.filter((t) => t.depth === deepest).every((t) => t.height === top)).toBe(true)
    expect(Math.min(...tiles.filter((t) => t.depth === 3).map((t) => t.height))).toBeLessThan(top)
  })

  test('cylindrical is a mesa: the edge zone stays at LAND_HEIGHT, inland stands above it', () => {
    const seed = seedWith('cylindrical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    for (const t of tiles.filter((x) => x.depth === 3)) expect(t.height).toBe(LAND_HEIGHT)
    for (const t of tiles.filter((x) => x.depth > 3)) {
      expect(t.height).toBeGreaterThan(LAND_HEIGHT)
    }
  })

  test('spherical is a dome: deeper tiles are never lower on average, within one hill step of noise', () => {
    const seed = seedWith('spherical')
    const tiles = islandTerrain(seed, 9, 4).filter((t) => t.depth > 2)
    const mean = (d: number) => {
      const at = tiles.filter((t) => t.depth === d)
      return at.reduce((s, t) => s + t.height, 0) / at.length
    }
    const depths = [...new Set(tiles.map((t) => t.depth))].sort((a, b) => a - b)
    for (let i = 1; i < depths.length; i++) {
      expect(mean(depths[i] as number)).toBeGreaterThanOrEqual(
        mean(depths[i - 1] as number) - HILL_STEP,
      )
    }
  })

  test('flattened stays within half the cap', () => {
    const seed = seedWith('flattened')
    for (const t of islandTerrain(seed, 9, 4)) {
      expect(t.height - LAND_HEIGHT).toBeLessThanOrEqual(HILL_MAX[4] * 0.5 + 1e-9)
    }
  })

  test('grass is dry on a bare island and full grass when overgrown, with more meadow', () => {
    let meadow0 = 0
    let meadow4 = 0
    for (let seed = 1; seed <= 10; seed++) {
      const inland = (stage: Stage) =>
        islandTerrain(seed, SIZE, stage).filter((t) => t.tone !== 'plaza' && t.depth > 2)
      for (const t of inland(0)) expect(['grassDry', 'meadow']).toContain(t.tone)
      for (const t of inland(4)) expect(['grass', 'meadow']).toContain(t.tone)
      meadow0 += inland(0).filter((t) => t.tone === 'meadow').length
      meadow4 += inland(4).filter((t) => t.tone === 'meadow').length
    }
    expect(meadow4).toBeGreaterThan(meadow0)
    expect(GRASS_TONES).toEqual(['grassDry', 'grassSprout', 'grassGreen', 'grassLush', 'grass'])
  })

  test('path hexes on interior get the path tone and no other hex does', () => {
    const paths: Hex[] = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]
    const keys = new Set(paths.map(hexKey))
    for (const t of islandTerrain(5, SIZE, 2, paths)) {
      expect(t.tone === 'path').toBe(keys.has(hexKey(t)))
    }
  })

  test('tileHeights and heightAt read a tile height, LAND_HEIGHT off the island', () => {
    const tiles = islandTerrain(9, 5, 3)
    const heights = tileHeights(tiles)
    for (const t of tiles) expect(heightAt(heights, t)).toBe(t.height)
    expect(heightAt(heights, { q: 400, r: 0 })).toBe(LAND_HEIGHT)
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

describe('shallows', () => {
  test('one ring of non-land hexes round the tiles, and a rim facing open water', () => {
    const tiles = islandTerrain(3, 7)
    const keys = new Set(tiles.map(hexKey))
    const shallows = shallowsHexes(tiles)
    const wet = new Set(shallows.map(hexKey))
    for (const h of shallows) {
      expect(keys.has(hexKey(h))).toBe(false)
      expect(HEX_DIRECTIONS.some((d) => keys.has(hexKey({ q: h.q + d.q, r: h.r + d.r })))).toBe(
        true,
      )
    }
    for (const t of tiles) {
      for (const d of HEX_DIRECTIONS) {
        const n = { q: t.q + d.q, r: t.r + d.r }
        expect(keys.has(hexKey(n)) || wet.has(hexKey(n))).toBe(true)
      }
    }
    const rim = shallowsRim(tiles, shallows)
    expect(rim.length).toBeGreaterThan(0)
    for (const s of rim) {
      expect(Math.hypot(s.out.x, s.out.z)).toBeCloseTo(1)
      // One step outward from the side's middle is open water: neither tile nor shallows.
      const p = { x: (s.a.x + s.b.x) / 2 + s.out.x * 0.9, z: (s.a.z + s.b.z) / 2 + s.out.z * 0.9 }
      const r = Math.round(p.z / 1.5)
      const q = Math.round(p.x / SQRT3 - r / 2)
      expect(keys.has(hexKey({ q, r })) || wet.has(hexKey({ q, r }))).toBe(false)
    }
  })
})
