import { HEX_DIRECTIONS } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { hexSide, hexToWorld, SQRT3 } from './hex-space'

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
