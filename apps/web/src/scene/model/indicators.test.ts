import { describe, expect, test } from 'vitest'
import { edgeIndicators, INDICATOR_INSET, INDICATOR_SPACING, type UrgentIsland } from './indicators'
import { type Frame, fromScreen, type View } from './screen'

const view: View = { x: 0, z: 0, zoom: 10 }
const frame: Frame = { width: 400, height: 800, covered: 0, framed: 0 }

/** An urgent island whose centre lands `sx`, `sy` px from the view centre. */
function islandAt(sx: number, sy: number, id = 'a', extent = 2): UrgentIsland {
  const { dx, dz } = fromScreen(sx, sy, view.zoom)
  return { projectId: id, name: id, urgency: 'overdue', count: 2, x: dx, z: dz, extent }
}

describe('edgeIndicators', () => {
  test('islands on screen, or only partly off it, get no marker', () => {
    expect(edgeIndicators([islandAt(0, 0)], view, frame)).toEqual([])
    // Centre 10px past the right edge, but its 20px-wide shore still shows.
    expect(edgeIndicators([islandAt(210, 0)], view, frame)).toEqual([])
  })

  test('a marker sits on the inset edge facing its island, on each side', () => {
    const right = edgeIndicators([islandAt(1000, 0)], view, frame)[0]
    expect(right).toMatchObject({ left: 400 - INDICATOR_INSET, top: 400, angle: 0 })
    const left = edgeIndicators([islandAt(-1000, 0)], view, frame)[0]
    expect(left).toMatchObject({ left: INDICATOR_INSET, top: 400 })
    expect(Math.abs(left?.angle ?? 0)).toBeCloseTo(Math.PI, 2)
    const up = edgeIndicators([islandAt(0, -1000)], view, frame)[0]
    expect(up).toMatchObject({ left: 200, top: INDICATOR_INSET })
    expect(up?.angle).toBeCloseTo(-Math.PI / 2, 2)
    const down = edgeIndicators([islandAt(0, 1000)], view, frame)[0]
    expect(down).toMatchObject({ left: 200, top: 800 - INDICATOR_INSET })
  })

  test('a corner-ward island lands on whichever edge its ray meets first, pointing at it', () => {
    const [marker] = edgeIndicators([islandAt(1000, 2000)], view, frame)
    expect(marker?.left).toBe(400 - INDICATOR_INSET)
    expect(marker?.top).toBeGreaterThan(400)
    expect(marker?.top).toBeLessThanOrEqual(800 - INDICATOR_INSET)
    const expected = Math.atan2(400 + 2000 - (marker?.top ?? 0), 200 + 1000 - (marker?.left ?? 0))
    expect(marker?.angle).toBeCloseTo(expected, 2)
  })

  test("markers carry the island's name, urgency and count", () => {
    const island = { ...islandAt(1000, 0), name: 'Alpha', urgency: 'due-soon' as const, count: 3 }
    expect(edgeIndicators([island], view, frame)[0]).toMatchObject({
      projectId: 'a',
      name: 'Alpha',
      urgency: 'due-soon',
      count: 3,
    })
  })

  test('markers that would overlap are pushed apart along the edge', () => {
    const markers = edgeIndicators(
      [islandAt(1000, 0, 'a'), islandAt(1000, 10, 'b'), islandAt(1000, 12, 'c')],
      view,
      frame,
    )
    expect(markers).toHaveLength(3)
    const tops = markers.map((m) => m.top).sort((p, q) => p - q)
    for (let i = 1; i < tops.length; i++) {
      expect((tops[i] ?? 0) - (tops[i - 1] ?? 0)).toBeGreaterThanOrEqual(INDICATOR_SPACING)
    }
    for (const m of markers) expect(m.left).toBe(400 - INDICATOR_INSET)
  })

  test('a covered bottom lifts the bottom edge and the ray origin', () => {
    // 300px of sheet: the view centre sits at y = 250 and the visible area ends at y = 500.
    const sheet: Frame = { width: 400, height: 800, covered: 300, framed: 300 }
    const [marker] = edgeIndicators([islandAt(0, 1000)], view, sheet)
    expect(marker).toMatchObject({ left: 200, top: 500 - INDICATOR_INSET })
    // An island in the covered strip counts as off screen.
    expect(edgeIndicators([islandAt(0, 400)], view, sheet)).toHaveLength(1)
  })
})
