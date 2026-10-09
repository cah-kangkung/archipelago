import { islandShape } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { hexToWorld, SHALLOWS_REACH } from './hex-space'
import { depthShade, type Shore, shoreDistance, UNCHARTED_SHORE } from './sea-depth'
import { islandTerrain } from './terrain'

const shoreOf = (seed: number, size: number, origin = { x: 0, z: 0 }): Shore => {
  const tiles = islandTerrain(seed, size)
  return {
    origin,
    radius: Math.max(
      ...tiles.map((t) => (Math.abs(t.q) + Math.abs(t.q + t.r) + Math.abs(t.r)) / 2),
    ),
    size,
    coast: tiles.filter((t) => t.depth === 1).map(hexToWorld),
    rim: [],
  }
}

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
