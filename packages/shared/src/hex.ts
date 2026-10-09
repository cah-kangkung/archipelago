export type Hex = { q: number; r: number }

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const DISTRICT_SPACING = 5
export const COMMONS_CENTER: Readonly<Hex> = Object.freeze({ q: 0, r: 0 })
// Far beyond any realistic island; prevents an endless search if a caller marks everything taken.
const MAX_SPIRAL_RADIUS = 64

const mod = (n: number, m: number): number => ((n % m) + m) % m

const direction = (i: number): Hex => HEX_DIRECTIONS[mod(i, 6)] ?? { q: 1, r: 0 }

export const hexKey = (h: Hex): string => `${h.q},${h.r}`
export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r })
export const hexScale = (h: Hex, k: number): Hex => ({ q: h.q * k, r: h.r * k })

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2
}

/** All hexes exactly `radius` from `center`, walked starting from a rotation of `startDirection`. */
export function hexRing(center: Hex, radius: number, startDirection = 0): Hex[] {
  if (radius === 0) return [center]
  const ring: Hex[] = []
  let hex = hexAdd(center, hexScale(direction(startDirection + 4), radius))
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      ring.push(hex)
      hex = hexAdd(hex, direction(startDirection + side))
    }
  }
  return ring
}

/** The centre, then each ring outward. */
export function* hexSpiral(center: Hex, startDirection = 0): Generator<Hex> {
  for (let radius = 0; radius <= MAX_SPIRAL_RADIUS; radius++) {
    yield* hexRing(center, radius, startDirection)
  }
}

export function nextArchipelagoSlot(taken: ReadonlySet<string>): Hex {
  for (const slot of hexSpiral({ q: 0, r: 0 })) {
    if (!taken.has(hexKey(slot))) return slot
  }
  throw new Error('No free archipelago slot')
}

export const seedDirection = (seed: number): number => mod(seed, 6)

export const LANDMARK_TYPES = [
  'lighthouse',
  'town_hall',
  'windmill',
  'observatory',
  'market',
] as const
export type LandmarkType = (typeof LANDMARK_TYPES)[number]

export const landmarkForIndex = (i: number): LandmarkType =>
  LANDMARK_TYPES[mod(i, LANDMARK_TYPES.length)] ?? 'lighthouse'

/** Hexes on the straight line from `a` to `b`, both ends included. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b)
  const line: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    // The nudge keeps a point on a hex edge from rounding both ways along one line.
    line.push(hexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6))
  }
  return line
}

function hexRound(q: number, r: number): Hex {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  // `+ 0` turns -0 into 0, so lines compare equal to plain literals.
  return { q: rq + 0, r: rr + 0 }
}
