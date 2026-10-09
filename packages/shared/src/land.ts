import { COMMONS_CENTER, DISTRICT_SPACING, type Hex, hexKey, hexRing, hexScale } from './hex'
import { islandLand, islandSize, MAX_ISLAND_SIZE } from './island-shape'

/** The ring enclosing all land (spec 24.2): island spacing, gulls, boat loops and the cloud plane. */
export function islandRadius(seed: number, occupied: readonly Hex[]): number {
  return islandLand(seed, islandSize(seed, occupied)).radius
}

/**
 * Free interior hexes at the island's current size, ring by ring outward. The size comes from
 * what is already on the island, so a new decoration can never grow it.
 */
export function placeablePlots(seed: number, occupied: readonly Hex[]): Hex[] {
  const { interior, radius } = islandLand(seed, islandSize(seed, occupied))
  const taken = new Set(occupied.map(hexKey))
  const plots: Hex[] = []
  for (let ring = 1; ring <= radius; ring++) {
    for (const h of hexRing(COMMONS_CENTER, ring)) {
      const k = hexKey(h)
      if (interior.has(k) && !taken.has(k)) plots.push(h)
    }
  }
  return plots
}

export function isPlaceable(seed: number, occupied: readonly Hex[], plot: Hex): boolean {
  if (plot.q === COMMONS_CENTER.q && plot.r === COMMONS_CENTER.r) return false
  if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) return false
  return islandLand(seed, islandSize(seed, occupied)).interior.has(hexKey(plot))
}

/**
 * The next district centre (spec 24.2): the free `DISTRICT_SPACING` lattice spot that is interior
 * at the smallest size, from the current one up; ties go by spiral order. Districts so follow the
 * island's shape: along a long island, round a crescent's arc, one per lobe.
 */
export function nextDistrictCenter(seed: number, occupied: readonly Hex[]): Hex {
  const taken = new Set([...occupied, COMMONS_CENTER].map(hexKey))
  for (let size = islandSize(seed, occupied); size <= MAX_ISLAND_SIZE; size++) {
    const { interior, radius } = islandLand(seed, size)
    const reach = Math.ceil(radius / DISTRICT_SPACING)
    for (let ring = 1; ring <= reach; ring++) {
      for (const unit of hexRing(COMMONS_CENTER, ring)) {
        const centre = hexScale(unit, DISTRICT_SPACING)
        const k = hexKey(centre)
        if (interior.has(k) && !taken.has(k)) return centre
      }
    }
  }
  throw new Error('No free district centre')
}

/**
 * A task's plot (spec 24.2): spiralling out from `centre` (starting towards `startDirection`), the
 * first free hex that is interior at the current size within DISTRICT_SPACING rings; failing that,
 * the same at the next size up, so the island grows only when the district is boxed in.
 */
export function nearestFreePlot(
  seed: number,
  centre: Hex,
  startDirection: number,
  occupied: readonly Hex[],
): Hex {
  const taken = new Set([...occupied, COMMONS_CENTER].map(hexKey))
  for (let size = islandSize(seed, occupied); size <= MAX_ISLAND_SIZE; size++) {
    const { interior } = islandLand(seed, size)
    for (let ring = 1; ring <= DISTRICT_SPACING; ring++) {
      for (const h of hexRing(centre, ring, startDirection)) {
        const k = hexKey(h)
        if (interior.has(k) && !taken.has(k)) return h
      }
    }
  }
  throw new Error('No free plot near district centre')
}

/**
 * A fixed 60° step per plot, so decorations face different ways without the user turning them.
 * An integer hash of both coordinates: any linear form in q and r repeats along a line of hexes.
 */
export function decorationRotation(plot: Hex): number {
  let h = Math.imul(plot.q, 0x27d4eb2d) ^ Math.imul(plot.r, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) % 6
}
