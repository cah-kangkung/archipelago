import { describe, expect, test } from 'vitest'
import { modelAt } from '../../test/sea-worlds'
import { BOAT_OFFSHORE, MIN_LANE } from '../tuning'
import { shallowsRadius } from './hex-space'
import { routeDistance, seaRoutes, segmentDistance } from './sea-routes'

describe('seaRoutes', () => {
  test('no islands, no routes', () => {
    expect(seaRoutes(modelAt())).toEqual([])
  })

  test('a lone island gets a loop just outside its shallows', () => {
    const model = modelAt([0, 0])
    const radius = model.islands[0]?.radius ?? 0
    expect(seaRoutes(model)).toEqual([
      {
        kind: 'loop',
        key: 'loop|p0',
        center: { x: 0, z: 0 },
        radius: shallowsRadius(radius) + BOAT_OFFSHORE,
      },
    ])
  })

  test('adjacent islands now get a lane across the wider sea (spec 19.2)', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0]))
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'lane', key: 'p0|p1' })
  })

  test('an empty slot between two islands gives one lane through open water', () => {
    const model = modelAt([0, 0], [2, 0])
    const routes = seaRoutes(model)
    expect(routes).toHaveLength(1)
    const [lane] = routes
    if (lane?.kind !== 'lane') throw new Error('expected a lane')
    expect(lane.key).toBe('p0|p1')
    expect(Math.hypot(lane.to.x - lane.from.x, lane.to.z - lane.from.z)).toBeGreaterThanOrEqual(
      MIN_LANE,
    )
    for (const island of model.islands) {
      for (const end of [lane.from, lane.to]) {
        const d = Math.hypot(end.x - island.origin.x, end.z - island.origin.z)
        expect(d).toBeGreaterThanOrEqual(shallowsRadius(island.radius) + BOAT_OFFSHORE - 1e-9)
      }
    }
  })

  test('an island in the gap blocks the long lane but gets its own short ones', () => {
    const routes = seaRoutes(modelAt([0, 0], [1, 0], [2, 0]))
    expect(routes.map((r) => r.key).sort()).toEqual(['p0|p1', 'p1|p2'])
  })

  test('islands three slots apart are never joined', () => {
    const routes = seaRoutes(modelAt([0, 0], [3, 0]))
    expect(routes.map((r) => r.kind)).toEqual(['loop'])
  })

  test('distances to a segment and to a loop', () => {
    const a = { x: 0, z: 0 }
    const b = { x: 10, z: 0 }
    expect(segmentDistance({ x: 5, z: 3 }, a, b)).toBeCloseTo(3)
    expect(segmentDistance({ x: -4, z: 3 }, a, b)).toBeCloseTo(5)
    const loop = { kind: 'loop' as const, key: 'l', center: a, radius: 5 }
    expect(routeDistance({ x: 7, z: 0 }, loop)).toBeCloseTo(2)
    expect(routeDistance({ x: 0, z: 1 }, loop)).toBeCloseTo(4)
  })
})
