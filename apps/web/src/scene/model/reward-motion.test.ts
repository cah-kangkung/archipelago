import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import type { RewardEvent } from '../../rewards/reward-store'
import { fakeBuilding, fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { FLOAT_ABOVE_ISLAND, FLOAT_ABOVE_STRUCTURE, FLOAT_RISE } from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'
import { floatAnchor, floatFrame, popScale, resolvePop } from './reward-motion'
import { buildSceneModel } from './scene-model'

const event = (target: RewardEvent['target'], at = 1, id = 1): RewardEvent => ({
  id,
  target,
  amounts: [25],
  at,
})

describe('popScale', () => {
  test('grows from 0, overshoots to 1.15 and settles at 1', () => {
    expect(popScale(0)).toBe(0)
    expect(popScale(1)).toBe(1)
    expect(popScale(2)).toBe(1)
    let peak = 0
    for (let i = 0; i <= 1000; i++) peak = Math.max(peak, popScale(i / 1000))
    expect(peak).toBeCloseTo(1.15, 2)
  })
})

describe('resolvePop', () => {
  test('finds the latest event aimed at one of the ids, by kind', () => {
    const events = [
      event({ kind: 'task', id: 'b' }, 10, 1),
      event({ kind: 'building', id: 'a' }, 20, 2),
      event({ kind: 'task', id: 'a' }, 30, 3),
    ]
    expect(resolvePop(['a', 'b'], 'task', events)).toEqual({ index: 0, startedAt: 30 })
    expect(resolvePop(['x', 'b'], 'task', events)).toEqual({ index: 1, startedAt: 10 })
    expect(resolvePop(['b'], 'building', events)).toBeUndefined()
    expect(resolvePop(['a'], 'task', [event(null)])).toBeUndefined()
  })
})

describe('floatFrame', () => {
  test('rises 1.2 and fades over 1.4s; later lines wait 150ms each', () => {
    expect(floatFrame(0, 0)).toEqual({ rise: 0, opacity: 1, visible: true })
    const mid = floatFrame(700, 0)
    expect(mid.rise).toBeGreaterThan(0)
    expect(mid.rise).toBeLessThan(FLOAT_RISE)
    expect(mid.opacity).toBeCloseTo(0.5)
    expect(floatFrame(1400, 0).visible).toBe(false)
    expect(floatFrame(100, 1).visible).toBe(false)
    expect(floatFrame(150, 1)).toEqual({ rise: 0, opacity: 1, visible: true })
    expect(floatFrame(1549, 1).visible).toBe(true)
    expect(floatFrame(1550, 1).visible).toBe(false)
  })
})

describe('floatAnchor', () => {
  const economy: WorldDto['economy'] = {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  }
  const beta = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id })
  const task = fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 2, plotY: -1 })
  const pine = fakeBuilding({ projectId: beta.id, plotX: 0, plotY: 1 })
  const model = buildSceneModel(
    { projects: [beta, gamma], milestones: [mvp], tasks: [task], buildings: [pine], economy },
    '2026-10-07',
  )
  const betaIsland = model.islands[0]
  if (!betaIsland) throw new Error('no island')

  test('above the target when its island is focused, island or district view', () => {
    const at = hexToWorld({ q: 2, r: -1 })
    const above = {
      x: betaIsland.origin.x + at.x,
      y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE,
      z: betaIsland.origin.z + at.z,
    }
    const target = { kind: 'task', id: task.id } as const
    expect(floatAnchor(model, { kind: 'island', projectId: beta.id }, target)).toEqual(above)
    expect(
      floatAnchor(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id }, target),
    ).toEqual(above)
    const p = hexToWorld({ q: 0, r: 1 })
    expect(
      floatAnchor(model, { kind: 'island', projectId: beta.id }, { kind: 'building', id: pine.id }),
    ).toEqual({
      x: betaIsland.origin.x + p.x,
      y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE,
      z: betaIsland.origin.z + p.z,
    })
  })

  test('above the island centre in the archipelago or from another island', () => {
    const centre = {
      x: betaIsland.origin.x,
      y: LAND_HEIGHT + FLOAT_ABOVE_ISLAND,
      z: betaIsland.origin.z,
    }
    const target = { kind: 'task', id: task.id } as const
    expect(floatAnchor(model, { kind: 'archipelago' }, target)).toEqual(centre)
    expect(floatAnchor(model, { kind: 'island', projectId: gamma.id }, target)).toEqual(centre)
  })

  test('nothing for a missing target or none at all', () => {
    expect(floatAnchor(model, { kind: 'archipelago' }, { kind: 'task', id: 'gone' })).toBeNull()
    expect(floatAnchor(model, { kind: 'archipelago' }, null)).toBeNull()
  })
})
