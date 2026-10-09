/** mulberry32: a tiny deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An unsigned 32-bit hash of integers, for seeding `mulberry32` from grid cells or indices. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x27d4eb2d)
    h ^= h >>> 15
  }
  return h >>> 0
}

/** FNV-1a of a string, for seeding from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
