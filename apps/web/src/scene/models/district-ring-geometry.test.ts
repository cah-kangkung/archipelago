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
  test('two vertices per point plus a closing pair, two triangles per segment', () => {
    const g = ringGeometry([square, square])
    expect(g.getAttribute('position').count).toBe(2 * (2 * (square.length + 1)))
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

  test('aAlong runs 0 → 1 along each loop', () => {
    const g = ringGeometry([square])
    const a = g.getAttribute('aAlong')
    expect(a.getX(0)).toBe(0)
    expect(a.getX(a.count - 1)).toBeCloseTo(1)
    for (let i = 2; i < a.count; i++) expect(a.getX(i)).toBeGreaterThanOrEqual(a.getX(i - 2))
    g.dispose()
  })
})
