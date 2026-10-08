import type { TaskDto, WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeTask } from '../../test/fake-api'
import { worldAt } from '../../test/sea-worlds'
import { BOAT_SPEED, FOAM_OPACITY, FOAM_PULSE, WHALE_BREACH_S, WHALE_CLEARANCE } from '../tuning'
import {
  boatCount,
  boatPose,
  buildAmbientLife,
  foamOpacity,
  gullPose,
  MAX_FLOCKS,
  whalePose,
} from './ambient-life'
import { buildSceneModel } from './scene-model'
import { shoreDistance } from './sea-depth'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const HOUR = 3_600_000
const doneAt = (projectId: string, hoursAgo: number): TaskDto =>
  fakeTask({
    projectId,
    status: 'done',
    completedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  })

function life(world: WorldDto, now = NOW) {
  return buildAmbientLife(buildSceneModel(world, '2026-10-08'), world, now)
}
const withTasks = (world: WorldDto, tasks: TaskDto[]): WorldDto => ({ ...world, tasks })

describe('boats', () => {
  test('one boat per three completions this week, at most four', () => {
    expect([0, 1, 3, 4, 6, 7, 12, 13, 40].map(boatCount)).toEqual([0, 1, 1, 2, 2, 3, 4, 4, 4])
  })

  test('count only done tasks of scene islands completed in the last 7 days', () => {
    const world = worldAt([0, 0], [2, 0])
    const recent = [1, 2, 3, 4].map((h) => doneAt('p0', h * 24))
    const stale = doneAt('p0', 24 * 8)
    const reopened = fakeTask({ projectId: 'p0', status: 'todo', completedAt: null })
    const orphan = doneAt('gone', 1)
    expect(life(withTasks(world, [...recent, stale, reopened, orphan])).boats).toHaveLength(2)
  })

  test('a completion stamped slightly in the future still counts', () => {
    const world = withTasks(worldAt([0, 0]), [doneAt('p0', -0.01)])
    expect(life(world).boats).toHaveLength(1)
  })

  test('sail the open lane when there is one, the loop otherwise', () => {
    const lane = life(withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1)]))
    expect(lane.boats[0]?.route.kind).toBe('lane')
    const loop = life(withTasks(worldAt([0, 0], [3, 0]), [doneAt('p0', 1)]))
    expect(loop.boats[0]?.route.kind).toBe('loop')
  })

  test('a later completion adds a boat and leaves the others where they were', () => {
    const world = worldAt([0, 0], [2, 0], [0, 2])
    const three = [1, 2, 3].map((h) => doneAt('p0', h))
    const before = life(withTasks(world, three))
    const after = life(withTasks(world, [...three, doneAt('p1', 0.5)]))
    expect(after.boats).toHaveLength(2)
    expect(after.boats[0]).toEqual(before.boats[0])
  })

  test('the same world later inside the same windows gives the same life', () => {
    const world = withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1), doneAt('p1', 2)])
    expect(life(world, NOW + HOUR)).toEqual(life(world))
  })

  test('a lane boat goes out and comes back; a loop boat keeps its distance', () => {
    const { boats } = life(withTasks(worldAt([0, 0], [2, 0]), [doneAt('p0', 1)]))
    const boat = boats[0]
    if (boat?.route.kind !== 'lane') throw new Error('expected a lane boat')
    const { from, to } = boat.route
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    const start = boatPose(boat, 0).position
    const back = boatPose(boat, (2 * length) / BOAT_SPEED).position
    expect(back.x).toBeCloseTo(start.x)
    expect(back.z).toBeCloseTo(start.z)
    const loop = life(withTasks(worldAt([0, 0]), [doneAt('p0', 1)])).boats[0]
    if (loop?.route.kind !== 'loop') throw new Error('expected a loop boat')
    const { center, radius } = loop.route
    for (const t of [0, 3, 17]) {
      const p = boatPose(loop, t).position
      expect(Math.hypot(p.x - center.x, p.z - center.z)).toBeCloseTo(radius)
    }
  })
})

describe('gulls', () => {
  test('circle only islands with a completion in the last 24h, most recent first, at most 3', () => {
    const world = worldAt([0, 0], [2, 0], [0, 2], [2, 2], [4, 0])
    const tasks = [
      doneAt('p0', 5),
      doneAt('p1', 1),
      doneAt('p2', 30),
      doneAt('p3', 3),
      doneAt('p4', 2),
    ]
    const { flocks } = life(withTasks(world, tasks))
    expect(flocks.map((f) => f.projectId)).toEqual(['p1', 'p4', 'p3'])
    expect(flocks).toHaveLength(MAX_FLOCKS)
  })

  test('three gulls spread round each circle', () => {
    const flock = life(withTasks(worldAt([0, 0]), [doneAt('p0', 1)])).flocks[0]
    if (!flock) throw new Error('expected a flock')
    const points = [0, 1, 2].map((k) => gullPose(flock, k, 0).position)
    for (const p of points) {
      expect(Math.hypot(p.x - flock.center.x, p.z - flock.center.z)).toBeCloseTo(flock.radius)
    }
    expect(new Set(points.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size).toBe(3)
  })
})

describe('whale', () => {
  test('only on a day the streak is active, clear of every island', () => {
    const world = worldAt([0, 0], [1, 0])
    expect(life(world).whale).toBeNull()
    const active: WorldDto = {
      ...world,
      economy: { ...world.economy, streak: { days: 3, activeToday: true, next: null } },
    }
    const model = buildSceneModel(active, '2026-10-08')
    const whale = buildAmbientLife(model, active, NOW).whale
    if (!whale) throw new Error('expected a whale')
    expect(shoreDistance(whale.spot, model.islands)).toBeGreaterThanOrEqual(WHALE_CLEARANCE)
    expect(whale.interval).toBeGreaterThanOrEqual(25)
    expect(whale.interval).toBeLessThanOrEqual(40)
  })

  test('breaches for WHALE_BREACH_S once per interval', () => {
    const whale = { spot: { x: 0, z: 0 }, turn: 0, interval: 30, phase: 0 }
    expect(whalePose(whale, 0.5).visible).toBe(true)
    expect(whalePose(whale, WHALE_BREACH_S + 1).visible).toBe(false)
    expect(whalePose(whale, 30.5).visible).toBe(true)
    expect(whalePose(whale, WHALE_BREACH_S / 2).splash).toBeCloseTo(0.5)
  })
})

test('foam pulses around its base opacity', () => {
  expect(foamOpacity(0)).toBeCloseTo(FOAM_OPACITY)
  for (const t of [0.7, 1.9, 3.3]) {
    expect(Math.abs(foamOpacity(t) - FOAM_OPACITY)).toBeLessThanOrEqual(FOAM_PULSE + 1e-9)
  }
})
