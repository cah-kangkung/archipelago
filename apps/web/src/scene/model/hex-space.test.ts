import { HEX_DIRECTIONS } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { hexSide, hexToWorld, SQRT3, worldToHex } from './hex-space'

describe('hexSide', () => {
  test('each side is one unit long, half a hex-width out towards its neighbour', () => {
    const h = { q: 2, r: -1 }
    const c = hexToWorld(h)
    HEX_DIRECTIONS.forEach((d, i) => {
      const [a, b] = hexSide(h, i)
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(1)
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      const n = hexToWorld({ q: h.q + d.q, r: h.r + d.r })
      expect(mid.x).toBeCloseTo((c.x + n.x) / 2)
      expect(mid.z).toBeCloseTo((c.z + n.z) / 2)
      expect(Math.hypot(mid.x - c.x, mid.z - c.z)).toBeCloseTo(SQRT3 / 2)
    })
  })

  test('consecutive sides share a corner, going round the hex', () => {
    const h = { q: 0, r: 0 }
    for (let i = 0; i < 6; i++) {
      const [, to] = hexSide(h, i)
      const [from] = hexSide(h, (i + 5) % 6)
      expect(to.x).toBeCloseTo(from.x)
      expect(to.z).toBeCloseTo(from.z)
    }
  })
})

describe('worldToHex', () => {
  const hexes = [
    { q: 0, r: 0 },
    { q: 3, r: -2 },
    { q: -4, r: 5 },
    { q: 6, r: 0 },
    { q: 0, r: -7 },
  ]

  test('inverts hexToWorld', () => {
    for (const h of hexes) expect(worldToHex(hexToWorld(h))).toEqual(h)
  })

  test('a point 0.8 from a centre towards a corner still maps to that hex', () => {
    for (const h of hexes) {
      const c = hexToWorld(h)
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 180) * (60 * k + 30)
        const p = { x: c.x + 0.8 * Math.cos(a), z: c.z + 0.8 * Math.sin(a) }
        expect(worldToHex(p)).toEqual(h)
      }
    }
  })

  test('never returns -0', () => {
    expect(Object.is(worldToHex({ x: 0, z: 0 }).q, 0)).toBe(true)
    expect(Object.is(worldToHex({ x: 0, z: 0 }).r, 0)).toBe(true)
  })
})
