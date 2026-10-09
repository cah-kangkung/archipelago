import { describe, expect, test } from 'bun:test'
import { hashInts, hashString, mulberry32 } from './random'

describe('random', () => {
  test('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(9)
    const b = mulberry32(9)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('hashInts and hashString are unsigned 32-bit and order-sensitive', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1))
    expect(hashInts(1, 2)).toBe(hashInts(1, 2))
    expect(hashString('ab')).not.toBe(hashString('ba'))
    for (const h of [hashInts(-5, 7), hashString('x')]) {
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })
})
