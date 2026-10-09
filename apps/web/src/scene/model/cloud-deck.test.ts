import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_TILE } from '../tuning'
import type { Area } from './area'
import { layerArea } from './camera'
import {
  DECK_OFF,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  growArea,
  sameDeck,
} from './cloud-deck'
import { SHALLOWS_MARGIN } from './hex-space'
import { buildSceneModel } from './scene-model'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('growArea', () => {
  test('keeps the box and grows the rounding', () => {
    expect(growArea(b, 2)).toEqual({ ...b, round: 3 })
    expect(growArea({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, 2).round).toBe(2)
  })
})

describe('deckHole', () => {
  test('no deck on the archipelago or for an unknown island', () => {
    expect(deckHole(model, { kind: 'archipelago' })).toBeNull()
    expect(deckHole(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('an island keeps its shallows clear', () => {
    const land = layerArea(model, onBeta)
    if (!land) throw new Error('no island area')
    expect(deckHole(model, onBeta)).toEqual(growArea(land, SHALLOWS_MARGIN))
  })

  test('a district is its own rounded box', () => {
    expect(layerArea(model, onMvp)).not.toEqual(layerArea(model, onBeta))
    expect(deckHole(model, onMvp)).toEqual(layerArea(model, onMvp))
  })

  test('an unknown milestone falls back to the island hole, shallows included', () => {
    const lost: Focus = { kind: 'district', projectId: beta.id, milestoneId: 'nope' }
    expect(deckHole(model, lost)).toEqual(deckHole(model, onBeta))
  })
})

describe('deck tween', () => {
  test('a hole shows at full strength; none is off', () => {
    expect(deckFor(a)).toEqual({ hole: a, strength: 1 })
    expect(deckFor(null)).toEqual(DECK_OFF)
  })

  test('from off, the new hole fades in where it is', () => {
    expect(deckLeg(DECK_OFF, deckFor(a))).toEqual({
      from: { hole: a, strength: 0 },
      to: { hole: a, strength: 1 },
    })
  })

  test('hole to hole slides at full strength', () => {
    const { from, to } = deckLeg(deckFor(a), deckFor(b))
    expect(from).toEqual({ hole: a, strength: 1 })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('to the archipelago it fades out in place', () => {
    expect(deckLeg(deckFor(a), DECK_OFF)).toEqual({
      from: { hole: a, strength: 1 },
      to: { hole: a, strength: 0 },
    })
  })

  test('leaving mid-slide fades out from where the hole is', () => {
    const mid = deckAt(deckFor(a), deckFor(b), 0.5)
    const { from, to } = deckLeg(mid, DECK_OFF)
    expect(from).toEqual(mid)
    expect(to).toEqual({ hole: mid.hole, strength: 0 })
  })

  test('endpoints are exact', () => {
    const from = deckFor(a)
    const to = deckFor(b)
    expect(deckAt(from, to, 0)).toEqual(from)
    expect(deckAt(from, to, 1)).toEqual(to)
  })

  test('two decks match when both are off, or the same hole at the same strength', () => {
    expect(sameDeck(DECK_OFF, { hole: a, strength: 0 })).toBe(true)
    expect(sameDeck(deckFor(a), deckFor({ ...a }))).toBe(true)
    expect(sameDeck(deckFor(a), deckFor(b))).toBe(false)
    expect(sameDeck(deckFor(a), { hole: a, strength: 0.5 })).toBe(false)
  })
})

describe('driftStep', () => {
  test('moves at CLOUD_DECK_DRIFT per second', () => {
    expect(driftStep(0, 2)).toBeCloseTo(2 * CLOUD_DECK_DRIFT)
  })

  test('wraps at one tile, so it never grows without bound', () => {
    expect(driftStep(CLOUD_DECK_TILE - 0.1, 1)).toBeCloseTo(CLOUD_DECK_DRIFT - 0.1)
    let along = 0
    for (let i = 0; i < 10_000; i++) along = driftStep(along, 1)
    expect(along).toBeGreaterThanOrEqual(0)
    expect(along).toBeLessThan(CLOUD_DECK_TILE)
  })
})
