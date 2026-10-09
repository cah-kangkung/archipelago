import { describe, expect, test } from 'vitest'
import type { RingPoint } from '../model/district-ring'
import { DISTRICT_RING_INSET, DISTRICT_RING_LIFT, DISTRICT_RING_WIDTH } from '../tuning'
import { ringGeometry } from './district-ring-geometry'

const square: RingPoint[] = [
  { x: 0, y: 1, z: 0, mx: 1, mz: 1 },
  { x: 2, y: 1, z: 0, mx: -1, mz: 1 },
  { x: 2, y: 1, z: 2, mx: -1, mz: -1 },
  { x: 0, y: 1, z: 2, mx: 1, mz: -1 },
]

describe('ringGeometry', () => {
  test('two vertices per point, two triangles per segment', () => {
    const g = ringGeometry([square, square])
    expect(g.getAttribute('position').count).toBe(2 * (2 * square.length))
    expect(g.getIndex()?.count).toBe(2 * 6 * square.length)
    g.dispose()
  })

  test('the ribbon spans inset to inset + width along the mitre, lifted', () => {
    const g = ringGeometry([square])
    const p = g.getAttribute('position')
    // Float32 storage: compare to the 1e-6 the buffer can hold, not exact equality.
    expect(p.getX(0)).toBeCloseTo(DISTRICT_RING_INSET)
    expect(p.getY(0)).toBeCloseTo(1 + DISTRICT_RING_LIFT)
    expect(p.getZ(0)).toBeCloseTo(DISTRICT_RING_INSET)
    expect(p.getX(1)).toBeCloseTo(DISTRICT_RING_INSET + DISTRICT_RING_WIDTH)
    g.dispose()
  })

  test('the last segment closes back onto the first point; no draw-on attribute', () => {
    const g = ringGeometry([square])
    expect(g.getAttribute('aAlong')).toBeUndefined()
    const index = Array.from(g.getIndex()?.array ?? [])
    expect(Math.max(...index)).toBe(2 * square.length - 1)
    expect(index.slice(-6)).toEqual([6, 7, 0, 7, 1, 0])
    g.dispose()
  })
})
