import { COMMONS_CENTER, type Hex, hexDistance, hexKey, hexRing } from './hex'

export const MIN_ISLAND_RADIUS = 4
/** Rings of lower shore around the flat interior. */
export const SHORE_RINGS = 2

/** Rings needed so every occupied hex is flat land with a two-ring shore beyond it. */
export function islandRadius(occupied: readonly Hex[]): number {
  const furthest = occupied.reduce((max, h) => Math.max(max, hexDistance(COMMONS_CENTER, h)), 0)
  return Math.max(MIN_ISLAND_RADIUS, furthest + SHORE_RINGS)
}

/**
 * Free plots on the flat interior, ring by ring outward. The radius comes from what is already on
 * the island, so a new decoration can never grow it.
 */
export function placeablePlots(occupied: readonly Hex[]): Hex[] {
  const taken = new Set(occupied.map(hexKey))
  const interior = islandRadius(occupied) - SHORE_RINGS
  const plots: Hex[] = []
  for (let ring = 1; ring <= interior; ring++) {
    for (const hex of hexRing(COMMONS_CENTER, ring)) {
      if (!taken.has(hexKey(hex))) plots.push(hex)
    }
  }
  return plots
}

export function isPlaceable(occupied: readonly Hex[], plot: Hex): boolean {
  if (plot.q === COMMONS_CENTER.q && plot.r === COMMONS_CENTER.r) return false
  if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) return false
  return hexDistance(COMMONS_CENTER, plot) <= islandRadius(occupied) - SHORE_RINGS
}

/** A fixed 60° step per plot, so decorations face different ways without the user turning them. */
export function decorationRotation(plot: Hex): number {
  return (((plot.q * 7 + plot.r * 13) % 6) + 6) % 6
}
