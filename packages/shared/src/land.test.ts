import { describe, expect, test } from 'bun:test'
import { COMMONS_CENTER, DISTRICT_SPACING, type Hex, hexKey, seedDirection } from './hex'
import { islandLand, islandShape, islandSize } from './island-shape'
import {
  decorationRotation,
  islandRadius,
  isPlaceable,
  nearestFreePlot,
  nextDistrictCenter,
  placeablePlots,
} from './land'

const SEED = 4
const interiorAt = (seed: number, occupied: readonly Hex[]) =>
  islandLand(seed, islandSize(seed, occupied)).interior

/** Builds an island the way the API does: loose tasks, then districts with tasks of their own. */
function build(seed: number, districts: number, tasksEach: number): Hex[] {
  const occupied: Hex[] = []
  const dir = seedDirection(seed)
  for (let i = 0; i < 4; i++) occupied.push(nearestFreePlot(seed, COMMONS_CENTER, dir, occupied))
  for (let m = 0; m < districts; m++) {
    const centre = nextDistrictCenter(seed, occupied)
    occupied.push(centre)
    for (let i = 0; i < tasksEach; i++) occupied.push(nearestFreePlot(seed, centre, dir, occupied))
  }
  return occupied
}

describe('land rule', () => {
  test('decorationRotation varies along every anti-diagonal', () => {
    // The old (q*7 + r*13) % 6 reduces to (q + r) % 6: one turn per anti-diagonal.
    for (const sum of [-2, 0, 1, 3]) {
      const turns = new Set<number>()
      for (let k = -4; k <= 4; k++) turns.add(decorationRotation({ q: k, r: sum - k }))
      expect(turns.size).toBeGreaterThan(1)
    }
  })

  test('decorationRotation is deterministic and in 0..5', () => {
    const turns = placeablePlots(SEED, []).map(decorationRotation)
    expect(turns.every((t) => Number.isInteger(t) && t >= 0 && t <= 5)).toBe(true)
    expect(new Set(turns).size).toBeGreaterThan(1)
    expect(decorationRotation({ q: -3, r: 2 })).toBe(decorationRotation({ q: -3, r: 2 }))
  })

  test('islandRadius is the enclosing ring of the land at the current size', () => {
    const occupied = [{ q: 1, r: 0 }]
    expect(islandRadius(SEED, occupied)).toBe(islandLand(SEED, islandSize(SEED, occupied)).radius)
  })

  test('placeable plots are the free interior, ring by ring, without the centre', () => {
    const occupied = [{ q: 1, r: 0 }]
    const plots = placeablePlots(SEED, occupied)
    const interior = interiorAt(SEED, occupied)
    const keys = plots.map(hexKey)
    expect(new Set(keys).size).toBe(plots.length)
    expect(keys).not.toContain('0,0')
    expect(keys).not.toContain('1,0')
    expect(plots).toHaveLength(interior.size - 2)
    for (const k of keys) expect(interior.has(k)).toBe(true)
    const rings = plots.map((h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2)
    expect(rings).toEqual([...rings].sort((a, b) => a - b))
  })

  test('isPlaceable agrees with placeablePlots, and refuses shore, sea, taken and the centre', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const occupied = build(seed, 2, 3)
      const plots = new Set(placeablePlots(seed, occupied).map(hexKey))
      const { land, interior } = islandLand(seed, islandSize(seed, occupied))
      for (const h of land) expect(isPlaceable(seed, occupied, h)).toBe(plots.has(hexKey(h)))
      const shore = land.find((h) => !interior.has(hexKey(h)))
      if (shore) expect(isPlaceable(seed, occupied, shore)).toBe(false)
      expect(isPlaceable(seed, occupied, { q: 90, r: 0 })).toBe(false)
      expect(isPlaceable(seed, occupied, COMMONS_CENTER)).toBe(false)
      expect(isPlaceable(seed, occupied, occupied[0] as Hex)).toBe(false)
    }
  })
})

describe('placement follows the shape', () => {
  test('every plot and district centre lands on interior, never twice', () => {
    for (let seed = 0; seed < 60; seed++) {
      const occupied = build(seed, 4, 6)
      const interior = interiorAt(seed, occupied)
      expect(new Set(occupied.map(hexKey)).size).toBe(occupied.length)
      for (const h of occupied) expect(interior.has(hexKey(h))).toBe(true)
    }
  })

  test('district centres sit on the DISTRICT_SPACING lattice', () => {
    for (const c of build(9, 4, 0).slice(4)) {
      expect(Math.abs(c.q % DISTRICT_SPACING)).toBe(0)
      expect(Math.abs(c.r % DISTRICT_SPACING)).toBe(0)
    }
  })

  test('the next centre is one already interior when there is one', () => {
    const seed = 2
    const occupied = build(seed, 0, 0)
    const centre = nextDistrictCenter(seed, occupied)
    const before = islandSize(seed, occupied)
    const lattice = [...interiorAt(seed, occupied)].filter((k) => {
      const [q = 0, r = 0] = k.split(',').map(Number)
      return (q !== 0 || r !== 0) && q % DISTRICT_SPACING === 0 && r % DISTRICT_SPACING === 0
    })
    if (lattice.length > 0) expect(islandSize(seed, [...occupied, centre])).toBe(before)
  })

  test('on an elongated island the first three districts line up along its axis', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i).find(
      (s) => islandShape(s).footprint === 'elongated',
    ) as number
    const { angle } = islandShape(seed)
    const occupied: Hex[] = []
    for (let m = 0; m < 3; m++) {
      const c = nextDistrictCenter(seed, occupied)
      occupied.push(c)
      const x = c.q + c.r / 2
      const y = (c.r * Math.sqrt(3)) / 2
      const off = Math.abs(
        Math.atan2(Math.sin(Math.atan2(y, x) - angle), Math.cos(Math.atan2(y, x) - angle)),
      )
      // Within 35° of the long axis, either way along it.
      expect(Math.min(off, Math.PI - off)).toBeLessThan((35 * Math.PI) / 180)
    }
  })

  test('a task goes next to its district when there is room', () => {
    const seed = 6
    const occupied = build(seed, 1, 0)
    const centre = occupied.at(-1) as Hex
    const plot = nearestFreePlot(seed, centre, 0, occupied)
    const d =
      (Math.abs(plot.q - centre.q) +
        Math.abs(plot.q - centre.q + plot.r - centre.r) +
        Math.abs(plot.r - centre.r)) /
      2
    expect(d).toBe(1)
  })

  test('different start directions start the walk in different places', () => {
    expect(nearestFreePlot(SEED, COMMONS_CENTER, 0, [])).not.toEqual(
      nearestFreePlot(SEED, COMMONS_CENTER, 1, []),
    )
  })

  test('a freed district slot is reused first', () => {
    const seed = 3
    const first = nextDistrictCenter(seed, [])
    const second = nextDistrictCenter(seed, [first])
    expect(nextDistrictCenter(seed, [second])).toEqual(first)
  })
})
