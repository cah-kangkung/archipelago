import { describe, expect, test } from 'vitest'
import { CLOUD_WISP_HI, CLOUD_WISP_LO } from '../tuning'
import { cloudNoise, wispAlpha } from './cloud-noise'

const SIZE = 64
const at = (n: Uint8ClampedArray, x: number, y: number) => n[y * SIZE + x] ?? Number.NaN

describe('cloudNoise', () => {
  const noise = cloudNoise(SIZE, 7)

  test('is deterministic for a size and seed', () => {
    expect(cloudNoise(SIZE, 7)).toEqual(noise)
    expect(noise).toHaveLength(SIZE * SIZE)
  })

  test('a different seed gives a different tile', () => {
    expect(cloudNoise(SIZE, 8)).not.toEqual(noise)
  })

  test('is not flat', () => {
    const mean = noise.reduce((s, v) => s + v, 0) / noise.length
    const variance = noise.reduce((s, v) => s + (v - mean) ** 2, 0) / noise.length
    expect(Math.sqrt(variance)).toBeGreaterThan(10)
  })

  test('wraps: the seam steps no further than neighbouring pixels do', () => {
    let inner = 0
    let seam = 0
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j + 1 < SIZE; j++) {
        inner = Math.max(inner, Math.abs(at(noise, j + 1, i) - at(noise, j, i)))
        inner = Math.max(inner, Math.abs(at(noise, i, j + 1) - at(noise, i, j)))
      }
      seam = Math.max(seam, Math.abs(at(noise, 0, i) - at(noise, SIZE - 1, i)))
      seam = Math.max(seam, Math.abs(at(noise, i, 0) - at(noise, i, SIZE - 1)))
    }
    expect(seam).toBeLessThanOrEqual(inner)
    // A tile that did not wrap would jump across the seam.
    expect(seam).toBeLessThan(64)
  })
})

describe('wispAlpha', () => {
  const ramp = Uint8ClampedArray.from({ length: 256 }, (_, i) => i)
  const shaped = wispAlpha(ramp, 0.45, 0.75)

  test('clears below the low edge and is solid above the high edge', () => {
    expect(shaped[Math.floor(0.45 * 255)]).toBe(0)
    expect(shaped[0]).toBe(0)
    expect(shaped[Math.ceil(0.75 * 255)]).toBe(255)
    expect(shaped[255]).toBe(255)
  })

  test('rises smoothly in between, never falling', () => {
    for (let i = 1; i < 256; i++) expect(shaped[i] ?? 0).toBeGreaterThanOrEqual(shaped[i - 1] ?? 0)
    expect(shaped[Math.round(0.6 * 255)]).toBeGreaterThan(100)
    expect(shaped[Math.round(0.6 * 255)]).toBeLessThan(155)
  })

  test('turns the even haze into puffs with clear gaps', () => {
    const wisps = wispAlpha(cloudNoise(64, 7), CLOUD_WISP_LO, CLOUD_WISP_HI)
    const clear = wisps.filter((v) => v === 0).length / wisps.length
    const solid = wisps.filter((v) => v > 200).length / wisps.length
    expect(clear).toBeGreaterThan(0.2)
    expect(solid).toBeGreaterThan(0.05)
  })
})
