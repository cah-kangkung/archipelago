import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_DRIFT_WRAP, CLOUD_DECK_FEATHER, CLOUD_VEIL } from '../tuning'
import { type Area, areaDistance } from './area'
import { layerArea } from './camera'
import {
  closeHole,
  DECK_OFF,
  deckAt,
  deckFor,
  deckHole,
  deckLeg,
  driftStep,
  driftWrap,
  isOpen,
  sameDeck,
  VEIL,
} from './cloud-deck'
import { buildSceneModel } from './scene-model'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const later = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp, later],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('deckHole', () => {
  test('no hole on the archipelago, on an island, or for an unknown island', () => {
    expect(deckHole(model, { kind: 'archipelago' })).toBeNull()
    expect(deckHole(model, onBeta)).toBeNull()
    expect(deckHole(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('a district is its own rounded box', () => {
    expect(layerArea(model, onMvp)).not.toEqual(layerArea(model, onBeta))
    expect(deckHole(model, onMvp)).toEqual(layerArea(model, onMvp))
  })

  test('a district whose milestone is gone shows the veil', () => {
    expect(
      deckHole(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toBeNull()
  })
})

describe('closeHole', () => {
  test('collapses to the centre and shows nothing anywhere', () => {
    const closed = closeHole(b)
    expect(closed).toEqual({ minX: 11, maxX: 11, minZ: 2, maxZ: 2, round: -CLOUD_DECK_FEATHER })
    expect(areaDistance(closed, { x: 11, z: 2 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(areaDistance(closed, { x: 40, z: -9 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(isOpen({ hole: closed, strength: CLOUD_VEIL })).toBe(false)
    expect(isOpen(deckFor(b))).toBe(true)
    expect(isOpen(VEIL)).toBe(false)
  })
})

describe('deck legs', () => {
  test('no hole is the veil; a hole is full strength', () => {
    expect(deckFor(null)).toEqual(VEIL)
    expect(VEIL).toEqual({ hole: null, strength: CLOUD_VEIL })
    expect(deckFor(a)).toEqual({ hole: a, strength: 1 })
  })

  test('island to district opens the hole from its centre as the cloud thickens', () => {
    const { from, to } = deckLeg(VEIL, deckFor(b))
    expect(from).toEqual({ hole: closeHole(b), strength: CLOUD_VEIL })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBeGreaterThan(CLOUD_VEIL)
    expect(mid.strength).toBeLessThan(1)
    expect(mid.hole?.minX).toBeCloseTo(10.5)
  })

  test('district to island closes the hole in place as the cloud thins', () => {
    expect(deckLeg(deckFor(b), VEIL)).toEqual({
      from: { hole: b, strength: 1 },
      to: { hole: closeHole(b), strength: CLOUD_VEIL },
    })
  })

  test('leaving mid-opening closes from where the hole is', () => {
    const opening = deckLeg(VEIL, deckFor(b))
    const mid = deckAt(opening.from, opening.to, 0.5)
    const { from, to } = deckLeg(mid, VEIL)
    expect(from).toEqual(mid)
    expect(to.strength).toBe(CLOUD_VEIL)
    expect(to.hole?.round).toBe(-CLOUD_DECK_FEATHER)
    expect(to.hole?.minX).toBeCloseTo(11)
  })

  test('after closing, the next district opens from its own centre', () => {
    const closed = { hole: closeHole(b), strength: CLOUD_VEIL }
    expect(deckLeg(closed, deckFor(a)).from).toEqual({ hole: closeHole(a), strength: CLOUD_VEIL })
  })

  test('district to district slides at full strength', () => {
    const { from, to } = deckLeg(deckFor(a), deckFor(b))
    expect(from).toEqual({ hole: a, strength: 1 })
    expect(to).toEqual({ hole: b, strength: 1 })
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('veil to veil is the same deck', () => {
    const { from, to } = deckLeg(VEIL, VEIL)
    expect(sameDeck(from, to)).toBe(true)
  })

  test('endpoints are exact', () => {
    const from = deckFor(a)
    const to = deckFor(b)
    expect(deckAt(from, to, 0)).toEqual(from)
    expect(deckAt(from, to, 1)).toEqual(to)
  })

  test('sameDeck: equal strength, and both closed or the same open hole', () => {
    expect(sameDeck(VEIL, { hole: closeHole(a), strength: CLOUD_VEIL })).toBe(true)
    expect(sameDeck(deckFor(a), deckFor({ ...a }))).toBe(true)
    expect(sameDeck(deckFor(a), deckFor(b))).toBe(false)
    expect(sameDeck(VEIL, DECK_OFF)).toBe(false)
    expect(sameDeck(deckFor(a), { hole: a, strength: 0.5 })).toBe(false)
  })
})

describe('drift', () => {
  test('driftStep moves at CLOUD_DECK_DRIFT per second and never wraps', () => {
    expect(driftStep(0, 2)).toBeCloseTo(2 * CLOUD_DECK_DRIFT)
    expect(driftStep(1000, 1)).toBeCloseTo(1000 + CLOUD_DECK_DRIFT)
  })

  test('driftWrap keeps the shader offset in [0, CLOUD_DECK_DRIFT_WRAP)', () => {
    expect(driftWrap(12.5)).toBe(12.5)
    expect(driftWrap(CLOUD_DECK_DRIFT_WRAP)).toBe(0)
    expect(driftWrap(CLOUD_DECK_DRIFT_WRAP + 12.5)).toBe(12.5)
    for (const along of [0, 0.3, 4499.9, 1e7 + 0.7]) {
      expect(driftWrap(along)).toBeGreaterThanOrEqual(0)
      expect(driftWrap(along)).toBeLessThan(CLOUD_DECK_DRIFT_WRAP)
    }
  })
})
