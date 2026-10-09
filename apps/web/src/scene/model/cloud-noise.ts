import { hashInts, mulberry32 } from './random'

const OCTAVES = 4
/** Lattice cells across the tile at the first octave; each octave doubles them. */
const BASE_CELLS = 4

const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Tileable fractal value noise (spec 23.2): `size × size` alpha values, 0–255. The lattice wraps
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

/** Noise reshaped into wisps: clear below `lo`, solid above `hi` (both 0–1), smooth between. */
export function wispAlpha(noise: Uint8ClampedArray, lo: number, hi: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(noise.length)
  for (let i = 0; i < noise.length; i++) {
    const t = Math.min(1, Math.max(0, ((noise[i] ?? 0) / 255 - lo) / (hi - lo)))
    out[i] = Math.round(smooth(t) * 255)
  }
  return out
}
