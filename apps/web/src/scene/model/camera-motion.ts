import { clampToBounds } from './camera'
import type { Point } from './hex-space'
import type { Bounds } from './scene-model'
import { type Frame, toScreen, type View, visibleSize } from './screen'

export const FLY_MIN_MS = 450
export const FLY_MAX_MS = 900
export const SPRING_MS = 300
export const FRAMING_MS = 250

/** At the widest point of a hop, both endpoints sit inside this share of the visible area. */
const HOP_FILL = 0.8
/** Flight time per pixel of on-screen travel, and the travel one zoom doubling counts as. */
const MS_PER_PX = 0.5
const PX_PER_DOUBLING = 200

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
  return Math.min(width, height) / 4 / zoom
}

function bandAxis(value: number, min: number, max: number, limit: number): number {
  if (value < min) return min - band(min - value, limit)
  if (value > max) return max + band(value - max, limit)
  return value
}

/** Where a drag that would reach `p` is shown: past the bounds it stretches with resistance. */
export function bandedTarget(bounds: Bounds, p: Point, limit: number): Point {
  return {
    x: bandAxis(p.x, bounds.minX, bounds.maxX, limit),
    z: bandAxis(p.z, bounds.minZ, bounds.maxZ, limit),
  }
}

/** The raw overshoot that `band` shows as `shown`: the inverse of `band`. */
export function unband(shown: number, limit: number): number {
  if (shown <= 0 || limit <= 0) return 0
  const b = Math.min(shown, limit * (1 - 1e-9))
  return (limit * b) / (limit - b)
}

function unbandAxis(value: number, min: number, max: number, limit: number): number {
  if (value < min) return min - unband(min - value, limit)
  if (value > max) return max + unband(value - max, limit)
  return value
}

/** The inverse of `bandedTarget`: where a drag must have been to be shown at `p`. */
export function unbandedTarget(bounds: Bounds, p: Point, limit: number): Point {
  return {
    x: unbandAxis(p.x, bounds.minX, bounds.maxX, limit),
    z: unbandAxis(p.z, bounds.minZ, bounds.maxZ, limit),
  }
}

/** World units past an edge that still count as on it: the controls' float drift is ~1e-13. */
export const EDGE_TOLERANCE = 1e-6

export function isOutside(bounds: Bounds, p: Point): boolean {
  const inside = clampToBounds(bounds, p.x, p.z)
  return Math.abs(inside.x - p.x) > EDGE_TOLERANCE || Math.abs(inside.z - p.z) > EDGE_TOLERANCE
}

/** The target `t` (0–1) of the way through a spring back to the bounds. */
export function springFrame(from: Point, to: Point, t: number): Point {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeOutCubic(clamp01(t))
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e }
}
