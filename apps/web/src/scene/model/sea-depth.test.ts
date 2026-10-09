import { hexKey, islandShape } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { shoreOf } from '../../test/shore'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, SHALLOWS_REACH, SQRT3, worldToHex } from './hex-space'
import { depthShade, shoreDistance, UNCHARTED_SHORE } from './sea-depth'
import { islandTerrain, shallowsHexes } from './terrain'

describe('sea depth', () => {
  test('0 on and near the land; measured from the nearest coast hex less SHALLOWS_REACH', () => {
    const s = shoreOf(4, 6)
    expect(shoreDistance({ x: 0, z: 0 }, [s])).toBe(0)
    const c = s.coast[0] as { x: number; z: number }
    const len = Math.hypot(c.x, c.z)
    const far = {
      x: (c.x / len) * (len + SHALLOWS_REACH + 30),
      z: (c.z / len) * (len + SHALLOWS_REACH + 30),
    }
    const nearest = Math.min(...s.coast.map((p) => Math.hypot(far.x - p.x, far.z - p.z)))
    expect(shoreDistance(far, [s])).toBeCloseTo(nearest - SHALLOWS_REACH)
  })

  test('0 over every tile and shallows centre of a large island', () => {
    const s = shoreOf(4, 10)
    const tiles = islandTerrain(4, 10)
    for (const h of [...tiles, ...shallowsHexes(tiles)]) {
      expect(shoreDistance(hexToWorld(h), [s])).toBe(0)
    }
  })

  test('open water in a crescent bay is not land: it measures from the coast', () => {
    const findBay = () => {
      for (let seed = 0; seed < 300; seed++) {
        if (islandShape(seed).footprint !== 'crescent') continue
        const size = 10
        const s = shoreOf(seed, size)
        const land = new Set(islandTerrain(seed, size).map(hexKey))
        const reach = s.radius * SQRT3 + 1
        const walled = (p: { x: number; z: number }, a: number) => {
          const hits = (sign: number) => {
            for (let d = 0.5; d < reach; d += 0.5) {
              const q = { x: p.x + sign * d * Math.cos(a), z: p.z + sign * d * Math.sin(a) }
              if (land.has(hexKey(worldToHex(q)))) return true
            }
            return false
          }
          return hits(1) && hits(-1)
        }
        for (let x = -reach; x <= reach; x += 0.5) {
          for (let z = -reach; z <= reach; z += 0.5) {
            const p = { x, z }
            if (s.cover.has(hexKey(worldToHex(p)))) continue
            const nearest = Math.min(...s.coast.map((c) => Math.hypot(x - c.x, z - c.z)))
            if (nearest <= SHALLOWS_REACH + 1) continue
            if ([0, 1, 2, 3, 4, 5].some((k) => walled(p, (k * Math.PI) / 6))) {
              return { s, p, nearest }
            }
          }
        }
      }
      return undefined
    }
    const bay = findBay()
    if (!bay) throw new Error('no crescent seed in 0..299 has a walled-in bay point')
    expect(shoreDistance(bay.p, [bay.s])).toBeGreaterThan(0)
    expect(shoreDistance(bay.p, [bay.s])).toBeCloseTo(bay.nearest - SHALLOWS_REACH)
  })

  test('the nearest island wins', () => {
    const a = shoreOf(4, 6)
    const b = shoreOf(4, 6, { x: 80, z: 0 })
    const p = { x: 70, z: 0 }
    expect(shoreDistance(p, [a, b])).toBeCloseTo(shoreDistance(p, [b]))
  })

  test('beside a long island’s tip is shallow; as far out across its narrow width is deep', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i).find(
      (s) => islandShape(s).footprint === 'elongated' && islandShape(s).coast === 'blunt',
    ) as number
    const s = shoreOf(seed, 9)
    const tip = s.coast.reduce((m, p) => (Math.hypot(p.x, p.z) > Math.hypot(m.x, m.z) ? p : m))
    const reach = Math.hypot(tip.x, tip.z) + 2
    const along = {
      x: (tip.x / Math.hypot(tip.x, tip.z)) * reach,
      z: (tip.z / Math.hypot(tip.x, tip.z)) * reach,
    }
    const across = { x: -along.z, z: along.x }
    expect(shoreDistance(along, [s])).toBeLessThan(1)
    expect(shoreDistance(across, [s])).toBeGreaterThan(5)
  })

  test('an empty world measures from the uncharted island at the origin', () => {
    expect(shoreDistance({ x: 0, z: 0 }, [])).toBe(0)
    expect(shoreDistance({ x: 60, z: 0 }, [])).toBeCloseTo(
      shoreDistance({ x: 60, z: 0 }, [UNCHARTED_SHORE]),
    )
  })

  test('shade runs from 0 at the shallows to 1 at the deep distance, then stays', () => {
    expect(depthShade(0)).toBe(0)
    expect(depthShade(SEA_DEEP_DISTANCE / 2)).toBeCloseTo(0.5)
    expect(depthShade(SEA_DEEP_DISTANCE * 3)).toBe(1)
  })
})
