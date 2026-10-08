import { describe, expect, test } from 'vitest'
import { hashInts, hashString } from './random'

describe('hashes', () => {
  test('are deterministic unsigned 32-bit integers', () => {
    expect(hashInts(3, -4)).toBe(hashInts(3, -4))
    expect(hashString('beta')).toBe(hashString('beta'))
    for (const h of [hashInts(3, -4), hashInts(-1), hashString('')]) {
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  test('neighbouring cells and swapped coordinates differ', () => {
    const seen = new Set<number>()
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) seen.add(hashInts(x, z))
    expect(seen.size).toBe(49)
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1))
    expect(hashString('ab')).not.toBe(hashString('ba'))
  })
})
