import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import { type Area, insideArea } from './area'
import { easeInOutCubic } from './camera-motion'
import type { Point } from './hex-space'

/** What the spotlight shows: the lit area and how strongly the rest is dimmed (spec 20.3). */
export type Spotlight = { area: Area | null; strength: number }

export const SPOTLIGHT_OFF: Spotlight = { area: null, strength: 0 }

export function spotlightFor(area: Area | null): Spotlight {
  return area ? { area, strength: 1 } : SPOTLIGHT_OFF
}

/**
 * The tween between what is shown and the new layer's spotlight: from off it fades in on the new
 * area, lit to lit it slides at full strength, and to the archipelago it fades out in place.
 */
export function spotlightLeg(
  current: Spotlight,
  target: Spotlight,
): { from: Spotlight; to: Spotlight } {
  if (!target.area) return { from: current, to: { area: current.area, strength: 0 } }
  if (!current.area || current.strength === 0) {
    return { from: { area: target.area, strength: current.strength }, to: target }
  }
  return { from: current, to: target }
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e

/** The spotlight `t` (0–1) of the way through a leg, eased. */
export function spotlightAt(from: Spotlight, to: Spotlight, t: number): Spotlight {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const a = from.area
  const b = to.area
  const area =
    a && b
      ? {
          minX: lerp(a.minX, b.minX, e),
          maxX: lerp(a.maxX, b.maxX, e),
          minZ: lerp(a.minZ, b.minZ, e),
          maxZ: lerp(a.maxZ, b.maxZ, e),
          round: lerp(a.round ?? 0, b.round ?? 0, e),
        }
      : (b ?? a)
  return { area, strength: lerp(from.strength, to.strength, e) }
}

/** A value key for an area: a refetch that rebuilds the same area keeps the same key. */
export function areaKey(area: Area | null): string {
  if (!area) return 'none'
  return [area.minX, area.maxX, area.minZ, area.maxZ, area.round ?? 0].join('|')
}

/** Two spotlights that look the same: both off, or the same area at the same strength. */
export function sameSpotlight(a: Spotlight, b: Spotlight): boolean {
  const lit = (s: Spotlight) => (s.area ? s.strength : 0)
  if (lit(a) === 0 && lit(b) === 0) return true
  return lit(a) === lit(b) && areaKey(a.area) === areaKey(b.area)
}

/** `hex` as the spotlight shows it outside the layer at `strength` (the shader's maths, in sRGB). */
export function dimHex(hex: string, strength: number): string {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [r = 0, g = 0, b = 0] = c
  const grey = 0.299 * r + 0.587 * g + 0.114 * b
  const out = c.map((v) => {
    const tone = (v + (grey - v) * SPOTLIGHT_DESATURATE) * SPOTLIGHT_DIM
    const n = Math.round(v + (tone - v) * strength)
    return Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0')
  })
  return `#${out.join('')}`
}

/** A label anchored at `p` fades when it is outside the lit area. */
export function labelOpacity(area: Area | null, p: Point): number {
  return area && !insideArea(area, p) ? SPOTLIGHT_LABEL_OPACITY : 1
}
