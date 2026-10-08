import { describe, expect, test } from 'bun:test'
import { hexDistance, hexKey } from './hex'
import { decorationRotation, islandRadius, isPlaceable, placeablePlots } from './land'

const O = { q: 0, r: 0 }

describe('land rule', () => {
  test('islandRadius is furthest occupied + 2, at least 4', () => {
    expect(islandRadius([])).toBe(4)
    expect(islandRadius([{ q: 1, r: 0 }])).toBe(4)
    expect(islandRadius([{ q: 5, r: 0 }])).toBe(7)
    expect(
      islandRadius([
        { q: 5, r: -1 },
        { q: 1, r: 0 },
      ]),
    ).toBe(7)
  })

  test('placeable plots are the free flat interior, without the commons centre', () => {
    const occupied = [{ q: 1, r: 0 }]
    const plots = placeablePlots(occupied)
    // radius 4 → interior radius 2 → 19 hexes, minus the centre and one occupied hex.
    expect(plots).toHaveLength(17)
    const keys = new Set(plots.map(hexKey))
    expect(keys.has('0,0')).toBe(false)
    expect(keys.has('1,0')).toBe(false)
    expect(plots.every((p) => hexDistance(O, p) <= 2)).toBe(true)
    expect(keys.size).toBe(plots.length)
  })

  test('isPlaceable rejects occupied, commons, shore and off-island plots', () => {
    const occupied = [{ q: 1, r: 0 }]
    expect(isPlaceable(occupied, { q: 0, r: 1 })).toBe(true)
    expect(isPlaceable(occupied, { q: 1, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 0, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 3, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 9, r: 0 })).toBe(false)
  })

  test('a decoration at the interior edge keeps the island from shrinking', () => {
    const task = { q: 5, r: 0 }
    const edge = { q: 5, r: -1 }
    expect(isPlaceable([task], edge)).toBe(true)
    // With the task gone, the decoration alone still holds radius 7.
    expect(islandRadius([edge])).toBe(7)
    expect(isPlaceable([edge], { q: 5, r: -2 })).toBe(true)
  })

  test('decorationRotation is deterministic and in 0..5', () => {
    const plots = placeablePlots([])
    const turns = plots.map(decorationRotation)
    expect(turns.every((t) => Number.isInteger(t) && t >= 0 && t <= 5)).toBe(true)
    expect(new Set(turns).size).toBeGreaterThan(1)
    expect(decorationRotation({ q: -3, r: 2 })).toBe(decorationRotation({ q: -3, r: 2 }))
  })
})
