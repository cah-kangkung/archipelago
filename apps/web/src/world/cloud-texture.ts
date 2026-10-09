import { scenePalette } from '../scene/model/palette'
import { hashInts, mulberry32 } from '../scene/model/random'
import { CLOUD_TEXTURE_SEED, CLOUD_TEXTURE_SIZE } from '../scene/tuning'

const OCTAVES = 4
/** Lattice cells across the tile at the first octave; each octave doubles them. */
const BASE_CELLS = 4

const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Tileable fractal value noise (spec 22.3): `size × size` alpha values, 0–255. The lattice wraps
 * at every octave, so the tile repeats without a seam.
 */
export function cloudNoise(size: number, seed: number): Uint8ClampedArray {
  const sums = new Float64Array(size * size)
  let amplitude = 0.5
  let total = 0
  for (let octave = 0; octave < OCTAVES; octave++) {
    const cells = BASE_CELLS << octave
    const lattice = new Float64Array(cells * cells)
    for (let i = 0; i < lattice.length; i++) {
      lattice[i] = mulberry32(hashInts(seed, octave, i))()
    }
    const value = (cx: number, cy: number) => lattice[(cy % cells) * cells + (cx % cells)] ?? 0
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells
      const cy = Math.floor(fy)
      const ty = smooth(fy - cy)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells
        const cx = Math.floor(fx)
        const tx = smooth(fx - cx)
        const top = lerp(value(cx, cy), value(cx + 1, cy), tx)
        const bottom = lerp(value(cx, cy + 1), value(cx + 1, cy + 1), tx)
        sums[y * size + x] = (sums[y * size + x] ?? 0) + lerp(top, bottom, ty) * amplitude
      }
    }
    total += amplitude
    amplitude /= 2
  }
  const out = new Uint8ClampedArray(size * size)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(((sums[i] ?? 0) / total) * 255)
  return out
}

/** The noise as the alpha of the cloud colour, as a PNG data URL; null without a 2D canvas. */
export function paintCloudTexture(size: number, seed: number): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(size, size)
    const hex = scenePalette.cloud
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const alpha = cloudNoise(size, seed)
    for (let p = 0; p < alpha.length; p++) {
      image.data[p * 4] = r ?? 0
      image.data[p * 4 + 1] = g ?? 0
      image.data[p * 4 + 2] = b ?? 0
      image.data[p * 4 + 3] = alpha[p] ?? 0
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

let texture: string | null | undefined

/** The frame's texture, painted once per page. */
export function cloudTextureUrl(): string | null {
  if (texture === undefined) texture = paintCloudTexture(CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SEED)
  return texture
}
