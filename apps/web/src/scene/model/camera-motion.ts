import {
  BAND_SHARE,
  FLY_MAX_MS,
  FLY_MIN_MS,
  FRAMING_MS,
  HOP_FILL,
  MS_PER_PX,
  PX_PER_DOUBLING,
  SPRING_MS,
} from '../tuning'
import { type Area, areaDistance, clampToArea } from './area'
import type { Point } from './hex-space'
import { type Frame, toScreen, type View, visibleSize } from './screen'

export { FLY_MAX_MS, FLY_MIN_MS, FRAMING_MS, SPRING_MS }

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

/**
 * The zoom a flight dips to so both endpoints stay on screen mid-flight, or null when they already
 * fit at the smaller of the two zooms. Fits against the framed area so a tall sheet cannot zero it.
 */
export function hopZoom(from: View, to: View, frame: Frame): number | null {
  const { sx, sy } = toScreen(to.x - from.x, to.z - from.z, 1)
  const width = frame.width
  const height = Math.max(1, frame.height - frame.framed)
  const fit = Math.min(
    sx === 0 ? Infinity : (width * HOP_FILL) / Math.abs(sx),
    sy === 0 ? Infinity : (height * HOP_FILL) / Math.abs(sy),
  )
  return fit < Math.min(from.zoom, to.zoom) ? fit : null
}

/** The view `t` (0–1) of the way through a flight. */
export function flyFrame(from: View, to: View, t: number, frame: Frame): View {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const logFrom = Math.log(from.zoom)
  const logTo = Math.log(to.zoom)
  let logZoom = logFrom + (logTo - logFrom) * e
  const hop = hopZoom(from, to, frame)
  if (hop !== null) {
    // A bump in log space that reaches the hop zoom exactly at the middle of the flight.
    const dip = (logFrom + logTo) / 2 - Math.log(hop)
    logZoom -= dip * 4 * e * (1 - e)
  }
  return {
    x: from.x + (to.x - from.x) * e,
    z: from.z + (to.z - from.z) * e,
    zoom: Math.exp(logZoom),
  }
}

/** Longer flights for more on-screen travel: pan pixels at the wider zoom plus zoom doublings. */
export function flyDuration(from: View, to: View): number {
  const { sx, sy } = toScreen(to.x - from.x, to.z - from.z, Math.min(from.zoom, to.zoom))
  const travel = Math.hypot(sx, sy) + PX_PER_DOUBLING * Math.abs(Math.log2(to.zoom / from.zoom))
  return Math.min(FLY_MAX_MS, FLY_MIN_MS + travel * MS_PER_PX)
}

/** Rubber-band displacement shown for an overshoot: 1:1 at first, never reaching `limit`. */
export function band(over: number, limit: number): number {
  if (over <= 0 || limit <= 0) return 0
  return limit * (1 - 1 / (over / limit + 1))
}

/** The furthest the band stretches: a quarter of the visible short side, in world units. */
export function bandLimit(frame: Frame, zoom: number): number {
  const { width, height } = visibleSize(frame)
  return (Math.min(width, height) * BAND_SHARE) / zoom
}

/** `p`'s nearest edge point and the offset from it; zero offset inside. */
function overshoot(area: Area, p: Point) {
  const edge = clampToArea(area, p)
  const dx = p.x - edge.x
  const dz = p.z - edge.z
  return { edge, dx, dz, over: Math.hypot(dx, dz) }
}

/** Where a drag that would reach `p` is shown: past the edge it stretches outward with resistance. */
export function bandedTarget(area: Area, p: Point, limit: number): Point {
  const { edge, dx, dz, over } = overshoot(area, p)
  if (over === 0) return { x: p.x, z: p.z }
  const s = band(over, limit) / over
  return { x: edge.x + dx * s, z: edge.z + dz * s }
}

/** The raw overshoot that `band` shows as `shown`: the inverse of `band`. */
export function unband(shown: number, limit: number): number {
  if (shown <= 0 || limit <= 0) return 0
  const b = Math.min(shown, limit * (1 - 1e-9))
  return (limit * b) / (limit - b)
}

/** The inverse of `bandedTarget`: where a drag must have been to be shown at `p`. */
export function unbandedTarget(area: Area, p: Point, limit: number): Point {
  const { edge, dx, dz, over } = overshoot(area, p)
  if (over === 0) return { x: p.x, z: p.z }
  const s = unband(over, limit) / over
  return { x: edge.x + dx * s, z: edge.z + dz * s }
}

/** World units past an edge that still count as on it: the controls' float drift is ~1e-13. */
export const EDGE_TOLERANCE = 1e-6

export function isOutside(area: Area, p: Point): boolean {
  return areaDistance(area, p) > EDGE_TOLERANCE
}

/** The target `t` (0–1) of the way through a spring back to the bounds. */
export function springFrame(from: Point, to: Point, t: number): Point {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeOutCubic(clamp01(t))
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e }
}
