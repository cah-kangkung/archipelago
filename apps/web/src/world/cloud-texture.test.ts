import { afterEach, describe, expect, test, vi } from 'vitest'
import { scenePalette } from '../scene/model/palette'
import { CLOUD_WISP_HI, CLOUD_WISP_LO } from '../scene/tuning'
import { cloudNoise, paintCloudTexture, wispAlpha } from './cloud-texture'

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

describe('paintCloudTexture', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('without a 2D context there is no texture', () => {
    expect(paintCloudTexture(4, 7)).toBeNull()
  })

  test('paints the noise, shaped into wisps, as the alpha of the cloud colour', () => {
    const image = { data: new Uint8ClampedArray(4 * 4 * 4) }
    const put = vi.fn()
    const ctx = { createImageData: () => image, putImageData: put }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x')
    expect(paintCloudTexture(4, 7)).toBe('data:image/png;base64,x')
    expect(put).toHaveBeenCalledWith(image, 0, 0)
    const hex = scenePalette.cloud
    const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const alpha = wispAlpha(cloudNoise(4, 7), CLOUD_WISP_LO, CLOUD_WISP_HI)
    for (let p = 0; p < 16; p++) {
      expect([...image.data.slice(p * 4, p * 4 + 3)]).toEqual(rgb)
      expect(image.data[p * 4 + 3]).toBe(alpha[p])
    }
  })

  test('a canvas that throws gives no texture instead of an error', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(paintCloudTexture(4, 7)).toBeNull()
  })
})

describe('cloudTextureUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  test('paints once per page', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    const { cloudTextureUrl } = await import('./cloud-texture')
    expect(cloudTextureUrl()).toBeNull()
    expect(cloudTextureUrl()).toBeNull()
    expect(getContext).toHaveBeenCalledTimes(1)
  })
})
