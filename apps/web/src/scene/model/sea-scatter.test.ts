import { describe, expect, test } from 'vitest'
import { modelAt } from '../../test/sea-worlds'
import { LANE_HALF_WIDTH, SCATTER_CLEARANCE, SCATTER_EXTENT, SCATTER_MAX_PER_TYPE } from '../tuning'
import { shoreDistance } from './sea-depth'
import { routeDistance, seaRoutes } from './sea-routes'
import { SCATTER_TYPES, type ScatterProp, seaScatter } from './sea-scatter'

const key = (p: ScatterProp) => `${p.type}@${p.position.x},${p.position.z}`

describe('seaScatter', () => {
  test('is deterministic for a layout', () => {
    expect(seaScatter(modelAt([0, 0], [1, 0]))).toEqual(seaScatter(modelAt([0, 0], [1, 0])))
  })

  test('keeps clear of every shallows and every sea route', () => {
    for (const model of [modelAt([0, 0], [1, 0]), modelAt([0, 0], [2, 0]), modelAt([0, 0])]) {
      const routes = seaRoutes(model)
      for (const p of seaScatter(model)) {
        expect(shoreDistance(p.position, model.islands)).toBeGreaterThanOrEqual(SCATTER_CLEARANCE)
        for (const r of routes)
          expect(routeDistance(p.position, r)).toBeGreaterThanOrEqual(LANE_HALF_WIDTH)
      }
    }
  })

  test('an empty world keeps clear of the uncharted island', () => {
    const model = modelAt()
    const props = seaScatter(model)
    expect(props.length).toBeGreaterThan(0)
    for (const p of props)
      expect(shoreDistance(p.position, [])).toBeGreaterThanOrEqual(SCATTER_CLEARANCE)
  })

  test('adding an island never moves a prop it does not cover', () => {
    const before = modelAt([0, 0], [1, 0])
    const after = modelAt([0, 0], [1, 0], [-1, 0])
    const kept = seaScatter(after)
    for (const type of SCATTER_TYPES) {
      // The cap must not be what drops a prop, or this test proves nothing.
      expect(kept.filter((p) => p.type === type).length).toBeLessThan(SCATTER_MAX_PER_TYPE)
    }
    const keys = new Set(kept.map(key))
    const routes = seaRoutes(after)
    for (const p of seaScatter(before)) {
      const covered =
        shoreDistance(p.position, after.islands) < SCATTER_CLEARANCE ||
        routes.some((r) => routeDistance(p.position, r) < LANE_HALF_WIDTH)
      if (!covered) expect(keys.has(key(p))).toBe(true)
    }
  })

  test('stays near the islands and caps each type', () => {
    const model = modelAt([0, 0], [4, 0], [0, 4], [-4, 0], [0, -4], [4, -4])
    const props = seaScatter(model)
    const { minX, maxX, minZ, maxZ } = model.bounds
    for (const p of props) {
      expect(p.position.x).toBeGreaterThanOrEqual(minX - SCATTER_EXTENT - 6)
      expect(p.position.x).toBeLessThanOrEqual(maxX + SCATTER_EXTENT + 6)
      expect(p.position.z).toBeGreaterThanOrEqual(minZ - SCATTER_EXTENT - 6)
      expect(p.position.z).toBeLessThanOrEqual(maxZ + SCATTER_EXTENT + 6)
    }
    for (const type of SCATTER_TYPES) {
      expect(props.filter((p) => p.type === type).length).toBeLessThanOrEqual(SCATTER_MAX_PER_TYPE)
    }
  })
})
