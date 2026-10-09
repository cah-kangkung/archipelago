import { COMMONS_CENTER, HEX_DIRECTIONS, type Hex, hexDistance, hexKey, hexRing } from './hex'
import { hashInts, mulberry32 } from './random'

export const FOOTPRINTS = [
  'round',
  'oval',
  'elongated',
  'crescent',
  'lobed',
  'spiral',
  'irregular',
] as const
export type Footprint = (typeof FOOTPRINTS)[number]
export const COASTS = ['straight', 'wavy', 'curved', 'angular', 'pointed', 'blunt'] as const
export type Coast = (typeof COASTS)[number]
export const RELIEFS = ['flattened', 'spherical', 'conical', 'cylindrical'] as const
export type Relief = (typeof RELIEFS)[number]

/** Relative odds of each footprint (spec 24.6). */
export const FOOTPRINT_WEIGHTS: Readonly<Record<Footprint, number>> = {
  round: 1,
  oval: 1.2,
  elongated: 1.2,
  crescent: 1,
  lobed: 1.2,
  spiral: 0.8,
  irregular: 1.2,
}
export const MIN_ISLAND_SIZE = 4
export const MAX_ISLAND_SIZE = 60
/** Interior hexes a new island has at least, whatever its footprint. */
export const MIN_INTERIOR = 19
/** Rings of lower shore around the flat interior. */
export const SHORE_RINGS = 2
/** Rings always land from size 4 up, so the commons centre and ring 1 are always interior. */
const CORE_RINGS = SHORE_RINGS + 1

type P = { x: number; y: number }
type Disc = { x: number; y: number; r: number }

export type IslandShape = {
  footprint: Footprint
  coast: Coast
  relief: Relief
  symmetric: boolean
  /** Radians; turns the whole shape. */
  angle: number
  /** The footprint's signed distance at unit size, coast included; negative inside. */
  distance: (p: P) => number
  /** Unit-size points are multiplied by this so every footprint covers a unit disc's area. */
  norm: number
  /** Furthest land from the centre at unit size, after `norm`. */
  extent: number
}

const SALT = {
  footprint: 11,
  coast: 12,
  relief: 13,
  angle: 14,
  shape: 15,
  edge: 16,
}
const TAU = 2 * Math.PI

const len = (x: number, y: number) => Math.hypot(x, y)

/** Polynomial smooth minimum: blends two distances over `k`. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - (h * h * k) / 4
}

function weighted<K extends string>(weights: Readonly<Record<K, number>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let acc = 0
  for (const [k, w] of entries) {
    acc += w / total
    if (u < acc) return k
  }
  return (entries.at(-1) as [K, number])[0]
}

const pickOf = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length)] as T

/** Smooth value noise in [0, 1) on a unit lattice, seeded. */
function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const c = (dx: number, dy: number) => hashInts(seed, ix + dx, iy + dy) / 4294967296
  const top = c(0, 0) + (c(1, 0) - c(0, 0)) * sx
  const bottom = c(0, 1) + (c(1, 1) - c(0, 1)) * sx
  return top + (bottom - top) * sy
}

function footprintDistance(footprint: Footprint, random: () => number, seed: number) {
  switch (footprint) {
    case 'round':
      return (p: P) => len(p.x, p.y) - 1
    case 'oval': {
      const k = 1.3 + random() * 0.3
      const a = Math.sqrt(k)
      const b = 1 / a
      return (p: P) => (len(p.x / a, p.y / b) - 1) * b
    }
    case 'elongated': {
      const aspect = 2.5 + random()
      const w = Math.sqrt(Math.PI / (4 * (aspect - 1) + Math.PI))
      const half = (aspect - 1) * w
      return (p: P) => len(Math.max(Math.abs(p.x) - half, 0), p.y) - w
    }
    case 'crescent': {
      const outer = 1.3
      const bite = 0.8 + random() * 0.2
      const cut = outer * bite
      const offset = outer * 0.55
      // The arc is thickest opposite the cut; the origin sits mid-way through it.
      const shift = (-outer + (offset - cut)) / 2
      return (p: P) => {
        const y = p.y + shift
        return Math.max(len(p.x, y) - outer, cut - len(p.x, y - offset))
      }
    }
    case 'lobed': {
      const count = 2 + Math.floor(random() * 3)
      const start = random() * TAU
      const lobes: Disc[] = Array.from({ length: count }, (_, i) => {
        const a = start + (i * TAU) / count + (random() - 0.5) * 0.6
        const reach = 0.7 + random() * 0.25
        return {
          x: Math.cos(a) * reach,
          y: Math.sin(a) * reach,
          r: 0.5 + random() * 0.15,
        }
      })
      return (p: P) =>
        lobes.reduce((d, l) => smin(d, len(p.x - l.x, p.y - l.y) - l.r, 0.35), len(p.x, p.y) - 0.6)
    }
    case 'spiral': {
      const turns = 0.75 + random() * 0.5
      const sense = random() < 0.5 ? 1 : -1
      const steps = 40
      const arm: Disc[] = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps
        const a = sense * t * turns * TAU
        const reach = 0.35 + t * 1.15
        return {
          x: Math.cos(a) * reach,
          y: Math.sin(a) * reach,
          r: 0.42 - t * 0.27,
        }
      })
      return (p: P) =>
        arm.reduce((d, s) => smin(d, len(p.x - s.x, p.y - s.y) - s.r, 0.2), len(p.x, p.y) - 0.6)
    }
    case 'irregular': {
      const n = hashInts(seed, SALT.shape, 99)
      return (p: P) => {
        const wx = (valueNoise(n, p.x * 1.4 + 7.1, p.y * 1.4) - 0.5) * 0.9
        const wy = (valueNoise(n + 1, p.x * 1.4, p.y * 1.4 - 3.3) - 0.5) * 0.9
        return len(p.x + wx, p.y + wy) - 1
      }
    }
  }
}

function coastModifier(coast: Coast, symmetric: boolean, random: () => number) {
  const fold = (a: number) => (symmetric ? Math.abs(a) : a)
  switch (coast) {
    case 'blunt':
      return (d: number) => d
    case 'wavy': {
      const k = 5 + Math.floor(random() * 5)
      const phase = symmetric ? 0 : random() * TAU
      return (d: number, p: P) => d + 0.06 * Math.sin(k * fold(Math.atan2(p.y, p.x)) + phase)
    }
    case 'curved': {
      const k = 2 + Math.floor(random() * 2)
      const phase = symmetric ? 0 : random() * TAU
      return (d: number, p: P) => d + 0.13 * Math.sin(k * fold(Math.atan2(p.y, p.x)) + phase)
    }
    case 'angular': {
      const k = 5 + Math.floor(random() * 3)
      const phase = symmetric ? 0 : random()
      return (d: number, p: P) => {
        const u = (k * fold(Math.atan2(p.y, p.x))) / TAU + phase
        return d + 0.1 * (Math.abs((u - Math.floor(u)) * 2 - 1) * 2 - 1)
      }
    }
    case 'pointed': {
      const count = 2 + Math.floor(random() * 3)
      const capes = Array.from({ length: count }, () => (random() - 0.5) * TAU)
      return (d: number, p: P) => {
        const a = fold(Math.atan2(p.y, p.x))
        let lift = 0
        for (const c of capes) {
          const gap = Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))
          lift = Math.max(lift, 1 - gap / 0.2)
        }
        return d - 0.4 * lift
      }
    }
    case 'straight': {
      const count = 1 + Math.floor(random() * 3)
      const cuts = Array.from({ length: count }, () => {
        const a = random() * TAU
        return { a, c: 0.6 + random() * 0.25 }
      })
      const all = symmetric ? cuts.flatMap((k) => [k, { a: -k.a, c: k.c }]) : cuts
      return (d: number, p: P) =>
        all.reduce((m, k) => Math.max(m, p.x * Math.cos(k.a) + p.y * Math.sin(k.a) - k.c), d)
    }
  }
}

function buildShape(seed: number): IslandShape {
  const draw = (salt: number) => mulberry32(hashInts(seed, salt))
  const footprint = weighted(FOOTPRINT_WEIGHTS, draw(SALT.footprint)())
  const edge = draw(SALT.coast)
  const coast = pickOf(COASTS, edge())
  const symmetric = edge() < 0.5
  const relief = pickOf(RELIEFS, draw(SALT.relief)())
  const angle = draw(SALT.angle)() * TAU
  const body = footprintDistance(footprint, draw(SALT.shape), seed)
  const modify = coastModifier(coast, symmetric, draw(SALT.edge))
  const raw = (p: P) => modify(body(p), p)
  // Sample the raw shape once for its area and reach.
  const span = 3.5
  const n = 48
  const cell = (2 * span) / n
  let inside = 0
  let reach = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: -span + (i + 0.5) * cell, y: -span + (j + 0.5) * cell }
      if (raw(p) <= 0) {
        inside++
        reach = Math.max(reach, len(p.x, p.y))
      }
    }
  }
  const norm = Math.sqrt((inside * cell * cell) / Math.PI)
  return {
    footprint,
    coast,
    relief,
    symmetric,
    angle,
    distance: raw,
    norm,
    extent: (reach + cell) / norm,
  }
}

export type IslandLand = {
  size: number
  land: Hex[]
  interior: ReadonlySet<string>
  /** Hex steps to the nearest non-land hex, per land hex key; 1–2 is shore. */
  depth: ReadonlyMap<string, number>
  /** The furthest land hex's distance from the centre, in rings. */
  radius: number
}

/** A hex centre in hex units (centre to centre 1), x along q. */
const cartesian = (h: Hex): P => ({
  x: h.q + h.r / 2,
  y: (h.r * Math.sqrt(3)) / 2,
})

const neighbours = (h: Hex): Hex[] => HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }))

/** Memo caps: the API sees many seeds over its lifetime; the oldest entries go first. */
const MEMO_LIMIT = 256

function remember<V>(memo: Map<string | number, V>, key: string | number, make: () => V): V {
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const value = make()
  memo.set(key, value)
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value as string | number)
  return value
}

const shapes = new Map<string | number, IslandShape>()

/** The island's seeded shape genome (spec 24.1). Memoised: pure in its seed. */
export function islandShape(seed: number): IslandShape {
  return remember(shapes, seed, () => buildShape(seed))
}
const raws = new Map<string | number, ReadonlySet<string>>()
const lands = new Map<string | number, IslandLand>()

/**
 * Hexes inside the shape at any whole size from MIN_ISLAND_SIZE up to `size`, so land only ever
 * grows even where a shape is not convex.
 */
function rawLand(seed: number, size: number): ReadonlySet<string> {
  return remember(raws, `${seed}:${size}`, () => {
    const shape = islandShape(seed)
    const core = Math.min(CORE_RINGS, size - 1)
    const inShape = new Set(size > MIN_ISLAND_SIZE ? rawLand(seed, size - 1) : [])
    const cos = Math.cos(-shape.angle)
    const sin = Math.sin(-shape.angle)
    const rings = Math.ceil(size * shape.extent) + 1
    for (let ring = 0; ring <= rings; ring++) {
      for (const h of hexRing(COMMONS_CENTER, ring)) {
        const k = hexKey(h)
        if (inShape.has(k)) continue
        const c = cartesian(h)
        const p = {
          x: ((c.x * cos - c.y * sin) / size) * shape.norm,
          y: ((c.x * sin + c.y * cos) / size) * shape.norm,
        }
        if (ring <= core || shape.distance(p) <= 0) inShape.add(k)
      }
    }
    return inShape
  })
}

/** The island's land at `size` (spec 24.1). Memoised: pure in its inputs. */
export function islandLand(seed: number, size: number): IslandLand {
  return remember(lands, `${seed}:${size}`, () => {
    const inShape = rawLand(seed, size)
    // Keep only what joins the centre.
    const land: Hex[] = []
    const seen = new Set<string>([hexKey(COMMONS_CENTER)])
    const queue: Hex[] = [COMMONS_CENTER]
    while (queue.length > 0) {
      const h = queue.shift() as Hex
      land.push(h)
      for (const n of neighbours(h)) {
        const k = hexKey(n)
        if (inShape.has(k) && !seen.has(k)) {
          seen.add(k)
          queue.push(n)
        }
      }
    }
    // Depth: breadth-first inward from the coast.
    const depth = new Map<string, number>()
    let front: Hex[] = []
    for (const h of land) {
      if (neighbours(h).some((n) => !seen.has(hexKey(n)))) {
        depth.set(hexKey(h), 1)
        front.push(h)
      }
    }
    for (let d = 2; front.length > 0; d++) {
      const next: Hex[] = []
      for (const h of front) {
        for (const n of neighbours(h)) {
          const k = hexKey(n)
          if (seen.has(k) && !depth.has(k)) {
            depth.set(k, d)
            next.push(n)
          }
        }
      }
      front = next
    }
    const interior = new Set<string>()
    for (const [k, d] of depth) if (d > SHORE_RINGS) interior.add(k)
    const radius = land.reduce((m, h) => Math.max(m, hexDistance(COMMONS_CENTER, h)), 0)
    return { size, land, interior, depth, radius }
  })
}

/** The smallest size whose interior holds every occupied hex and at least MIN_INTERIOR hexes. */
export function islandSize(seed: number, occupied: readonly Hex[]): number {
  for (let size = MIN_ISLAND_SIZE; size <= MAX_ISLAND_SIZE; size++) {
    const { interior } = islandLand(seed, size)
    if (interior.size >= MIN_INTERIOR && occupied.every((h) => interior.has(hexKey(h)))) return size
  }
  throw new Error('Island outgrew MAX_ISLAND_SIZE')
}
