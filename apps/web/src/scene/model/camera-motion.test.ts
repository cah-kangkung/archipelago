import { describe, expect, test } from 'vitest'
import {
  band,
  bandedTarget,
  bandLimit,
  easeInOutCubic,
  FLY_MAX_MS,
  FLY_MIN_MS,
  flyDuration,
  flyFrame,
  hopZoom,
  isOutside,
  springFrame,
  unbandedTarget,
} from './camera-motion'
import {
  type Frame,
  framedCover,
  fromScreen,
  toScreen,
  type View,
  viewCentre,
  visibleSize,
} from './screen'

const frame: Frame = { width: 400, height: 800, covered: 0, framed: 0 }
const bounds = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 }

describe('screen', () => {
  test('toScreen and fromScreen are inverse; +x goes right and down, +z goes left and down', () => {
    const { sx, sy } = toScreen(3, -2, 48)
    const back = fromScreen(sx, sy, 48)
    expect(back.dx).toBeCloseTo(3)
    expect(back.dz).toBeCloseTo(-2)
    expect(toScreen(1, 0, 1).sx).toBeGreaterThan(0)
    expect(toScreen(1, 0, 1).sy).toBeGreaterThan(0)
    expect(toScreen(0, 1, 1).sx).toBeLessThan(0)
    expect(toScreen(0, 1, 1).sy).toBeGreaterThan(0)
  })

  test('framedCover counts the sheet up to half the window, never below zero', () => {
    expect(framedCover(120, 800)).toBe(120)
    expect(framedCover(736, 800)).toBe(400)
    expect(framedCover(-5, 800)).toBe(0)
  })

  test('the view centre sits in the middle of the framed area; visible size drops the cover', () => {
    const covered: Frame = { width: 400, height: 800, covered: 500, framed: 400 }
    expect(viewCentre(covered)).toEqual({ x: 200, y: 200 })
    expect(visibleSize(covered)).toEqual({ width: 400, height: 300 })
    expect(viewCentre(frame)).toEqual({ x: 200, y: 400 })
  })
})

describe('flight', () => {
  const from: View = { x: 0, z: 0, zoom: 10 }
  const near: View = { x: 2, z: 1, zoom: 48 }

  test('endpoints are exact', () => {
    expect(flyFrame(from, near, 0, frame)).toEqual(from)
    expect(flyFrame(from, near, 1, frame)).toEqual(near)
    expect(flyFrame(from, near, 1.5, frame)).toEqual(near)
  })

  test('easing is monotonic and symmetric', () => {
    let last = -1
    for (let i = 0; i <= 20; i++) {
      const e = easeInOutCubic(i / 20)
      expect(e).toBeGreaterThanOrEqual(last)
      last = e
    }
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
  })

  test('a short hop zooms in log space: the midpoint zoom is the geometric mean', () => {
    expect(hopZoom(from, near, frame)).toBeNull()
    const mid = flyFrame(from, near, 0.5, frame)
    expect(mid.zoom).toBeCloseTo(Math.sqrt(10 * 48))
    expect(mid.x).toBeCloseTo(1)
  })

  test('a long hop dips its zoom so both endpoints are on screen mid-flight', () => {
    const a: View = { x: 0, z: 0, zoom: 48 }
    const b: View = { x: 60, z: -20, zoom: 48 }
    const dip = hopZoom(a, b, frame)
    expect(dip).not.toBeNull()
    const mid = flyFrame(a, b, 0.5, frame)
    expect(mid.zoom).toBeCloseTo(dip ?? 0)
    expect(mid.zoom).toBeLessThan(48)
    for (const end of [a, b]) {
      const { sx, sy } = toScreen(end.x - mid.x, end.z - mid.z, mid.zoom)
      expect(Math.abs(sx)).toBeLessThanOrEqual(frame.width / 2)
      expect(Math.abs(sy)).toBeLessThanOrEqual(frame.height / 2)
    }
  })

  test('the hop fits the framed area, not the part under the sheet', () => {
    const a: View = { x: 0, z: 0, zoom: 48 }
    const b: View = { x: 0, z: 9, zoom: 48 }
    const open: Frame = { width: 400, height: 800, covered: 0, framed: 0 }
    const sheet: Frame = { width: 400, height: 800, covered: 600, framed: 600 }
    expect(hopZoom(a, b, open)).toBeNull()
    expect(hopZoom(a, b, sheet)).not.toBeNull()
  })

  test('a tall sheet at the top detent does not zero the zoom', () => {
    const a: View = { x: 0, z: 0, zoom: 48 }
    const b: View = { x: 60, z: -20, zoom: 48 }
    const tallSheet: Frame = { width: 400, height: 800, covered: 800, framed: 400 }
    const zoom = flyFrame(a, b, 0.5, tallSheet).zoom
    expect(Number.isFinite(zoom)).toBe(true)
    expect(zoom).toBeGreaterThan(0)
  })

  test('duration stays within 450–900ms and grows with travel', () => {
    const still = flyDuration(from, from)
    const short = flyDuration(from, near)
    const long = flyDuration(from, { x: 200, z: -200, zoom: 10 })
    expect(still).toBe(FLY_MIN_MS)
    expect(short).toBeGreaterThan(still)
    expect(long).toBeGreaterThanOrEqual(short)
    expect(long).toBe(FLY_MAX_MS)
  })
})

describe('rubber band', () => {
  test('band starts at zero, rises monotonically, and never reaches the limit', () => {
    expect(band(0, 5)).toBe(0)
    expect(band(-3, 5)).toBe(0)
    let last = 0
    for (const over of [0.1, 1, 5, 50, 5000]) {
      const shown = band(over, 5)
      expect(shown).toBeGreaterThan(last)
      expect(shown).toBeLessThan(5)
      expect(shown).toBeLessThanOrEqual(over)
      last = shown
    }
    // Continuous across the edge: a tiny overshoot shows almost all of itself.
    expect(band(0.001, 5)).toBeCloseTo(0.001, 5)
  })

  test('bandLimit is a quarter of the visible short side in world units', () => {
    expect(bandLimit(frame, 10)).toBe(10)
    expect(bandLimit({ width: 400, height: 800, covered: 640, framed: 400 }, 10)).toBe(4)
  })

  test('bandedTarget leaves points inside alone and pulls overshoot in toward the edge', () => {
    expect(bandedTarget(bounds, { x: 3, z: -2 }, 4)).toEqual({ x: 3, z: -2 })
    const p = bandedTarget(bounds, { x: 30, z: -25 }, 4)
    expect(p.x).toBeGreaterThan(10)
    expect(p.x).toBeLessThan(14)
    expect(p.z).toBeLessThan(-5)
    expect(p.z).toBeGreaterThan(-9)
  })

  test('unbandedTarget inverts bandedTarget, inside and outside, on both axes', () => {
    for (const p of [
      { x: 3, z: -2 },
      { x: 30, z: -25 },
      { x: -17, z: 9 },
      { x: 12, z: 0 },
    ]) {
      const back = unbandedTarget(bounds, bandedTarget(bounds, p, 4), 4)
      expect(back.x).toBeCloseTo(p.x)
      expect(back.z).toBeCloseTo(p.z)
    }
  })

  test('on a circle the band stretches outward from the nearest edge point, and inverts', () => {
    const circle = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 5 }
    const p = bandedTarget(circle, { x: 20, z: 0 }, 4)
    expect(p.x).toBeCloseTo(5 + band(15, 4))
    expect(p.z).toBeCloseTo(0)
    const d = bandedTarget(circle, { x: 30, z: 40 }, 4)
    const along = band(45, 4) + 5
    expect(d.x).toBeCloseTo(0.6 * along)
    expect(d.z).toBeCloseTo(0.8 * along)
    for (const q of [
      { x: 1, z: 1 },
      { x: 20, z: 0 },
      { x: -9, z: 12 },
    ]) {
      const back = unbandedTarget(circle, bandedTarget(circle, q, 4), 4)
      expect(back.x).toBeCloseTo(q.x)
      expect(back.z).toBeCloseTo(q.z)
    }
    expect(isOutside(circle, { x: 3, z: 4 })).toBe(false)
    expect(isOutside(circle, { x: 3.01, z: 4 })).toBe(true)
  })

  test('isOutside and the spring that brings the target home', () => {
    expect(isOutside(bounds, { x: 10, z: 5 })).toBe(false)
    expect(isOutside(bounds, { x: 10.01, z: 0 })).toBe(true)
    // Float drift from the controls' spherical round trip is not an overshoot.
    expect(isOutside(bounds, { x: 10 + 1e-12, z: 5 })).toBe(false)
    expect(isOutside(bounds, { x: 10 + 1e-3, z: 5 })).toBe(true)
    const from = { x: 13, z: 0 }
    const to = { x: 10, z: 0 }
    expect(springFrame(from, to, 0)).toEqual(from)
    expect(springFrame(from, to, 1)).toEqual(to)
    const mid = springFrame(from, to, 0.5)
    expect(mid.x).toBeLessThan(11.5) // ease-out: more than half way at half time
    expect(mid.x).toBeGreaterThan(10)
  })
})
