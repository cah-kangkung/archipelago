import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import {
  CLOUD_ARCHIPELAGO_THRESHOLD,
  CLOUD_ARCHIPELAGO_VEIL,
  CLOUD_DECK_DRIFT,
  CLOUD_DECK_DRIFT_WRAP,
  CLOUD_DECK_FEATHER,
  CLOUD_THRESHOLD,
  CLOUD_VEIL,
} from '../tuning'
import { type Area, areaDistance } from './area'
import { layerArea } from './camera'
import {
  ARCHIPELAGO_VEIL,
  closeHole,
  DECK_OFF,
  type Deck,
  deckAt,
  deckHole,
  deckKey,
  deckLeg,
  deckTarget,
  driftStep,
  driftWrap,
  ISLAND_VEIL,
  isOpen,
  sameDeck,
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

const island: Deck = ISLAND_VEIL
const arch: Deck = ARCHIPELAGO_VEIL
const open = (hole: Area): Deck => ({ hole, strength: 1, threshold: CLOUD_THRESHOLD })

describe('deckTarget', () => {
  test('the archipelago is a lighter, sparser veil than an island', () => {
    expect(ARCHIPELAGO_VEIL).toEqual({
      hole: null,
      strength: CLOUD_ARCHIPELAGO_VEIL,
      threshold: CLOUD_ARCHIPELAGO_THRESHOLD,
    })
    expect(ISLAND_VEIL).toEqual({ hole: null, strength: CLOUD_VEIL, threshold: CLOUD_THRESHOLD })
    expect(deckTarget(model, { kind: 'archipelago' })).toEqual(ARCHIPELAGO_VEIL)
    expect(deckTarget(model, onBeta)).toEqual(ISLAND_VEIL)
  })

  test('a district is full strength with its hole', () => {
    expect(deckTarget(model, onMvp)).toEqual(open(layerArea(model, onMvp) as Area))
  })

  test('a district with an unknown project falls back to the archipelago', () => {
    expect(deckTarget(model, { kind: 'district', projectId: 'nope', milestoneId: mvp.id })).toEqual(
      ARCHIPELAGO_VEIL,
    )
  })

  test('unknown ids fall back a level', () => {
    expect(deckTarget(model, { kind: 'island', projectId: 'nope' })).toEqual(ARCHIPELAGO_VEIL)
    expect(
      deckTarget(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toEqual(ISLAND_VEIL)
  })
})

describe('closeHole', () => {
  test('collapses to the centre and shows nothing anywhere', () => {
    const closed = closeHole(b)
    expect(closed).toEqual({ minX: 11, maxX: 11, minZ: 2, maxZ: 2, round: -CLOUD_DECK_FEATHER })
    expect(areaDistance(closed, { x: 11, z: 2 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(areaDistance(closed, { x: 40, z: -9 })).toBeGreaterThanOrEqual(CLOUD_DECK_FEATHER)
    expect(isOpen({ ...island, hole: closed })).toBe(false)
    expect(isOpen(open(b))).toBe(true)
    expect(isOpen(island)).toBe(false)
  })
})

describe('deck legs', () => {
  test('archipelago to island tweens strength and threshold', () => {
    const { from, to } = deckLeg(arch, island)
    expect(from).toEqual(arch)
    expect(to).toEqual(island)
    const mid = deckAt(from, to, 0.5)
    expect(mid.strength).toBeCloseTo((CLOUD_ARCHIPELAGO_VEIL + CLOUD_VEIL) / 2)
    expect(mid.threshold).toBeCloseTo((CLOUD_ARCHIPELAGO_THRESHOLD + CLOUD_THRESHOLD) / 2)
    expect(mid.hole).toBeNull()
  })

  test('turning back mid-leg tweens from where it is', () => {
    const mid = deckAt(arch, island, 0.5)
    const { from, to } = deckLeg(mid, arch)
    expect(from).toEqual(mid)
    expect(to).toEqual(arch)
  })

  test('island to district opens the hole from its centre, keeping the island threshold', () => {
    const { from, to } = deckLeg(island, open(b))
    expect(from).toEqual({ hole: closeHole(b), strength: CLOUD_VEIL, threshold: CLOUD_THRESHOLD })
    expect(to).toEqual(open(b))
    expect(deckAt(from, to, 0.5).hole?.minX).toBeCloseTo(10.5)
  })

  test('district to archipelago closes the hole to the archipelago strength and threshold', () => {
    expect(deckLeg(open(b), arch)).toEqual({
      from: open(b),
      to: {
        hole: closeHole(b),
        strength: CLOUD_ARCHIPELAGO_VEIL,
        threshold: CLOUD_ARCHIPELAGO_THRESHOLD,
      },
    })
  })

  test('leaving mid-opening closes from where the hole is', () => {
    const opening = deckLeg(island, open(b))
    const mid = deckAt(opening.from, opening.to, 0.5)
    const { from, to } = deckLeg(mid, island)
    expect(from).toEqual(mid)
    expect(to.strength).toBe(CLOUD_VEIL)
    expect(to.hole?.round).toBe(-CLOUD_DECK_FEATHER)
    expect(to.hole?.minX).toBeCloseTo(11)
  })

  test('after closing, the next district opens from its own centre', () => {
    const closed: Deck = { ...island, hole: closeHole(b) }
    expect(deckLeg(closed, open(a)).from).toEqual({ ...island, hole: closeHole(a) })
  })

  test('district to district slides at full strength', () => {
    const mid = deckAt(open(a), open(b), 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.threshold).toBe(CLOUD_THRESHOLD)
    expect(mid.hole?.minX).toBeCloseTo(5)
    expect(mid.hole?.round).toBeCloseTo(2.5)
  })

  test('endpoints are exact', () => {
    expect(deckAt(arch, island, 0)).toEqual(arch)
    expect(deckAt(arch, island, 1)).toEqual(island)
  })

  test('sameDeck compares strength, threshold and the open hole', () => {
    expect(sameDeck(island, { ...island, hole: closeHole(a) })).toBe(true)
    expect(sameDeck(island, arch)).toBe(false)
    expect(sameDeck(island, { ...island, threshold: 0.7 })).toBe(false)
    expect(sameDeck(open(a), open({ ...a }))).toBe(true)
    expect(sameDeck(open(a), open(b))).toBe(false)
    expect(sameDeck(island, DECK_OFF)).toBe(false)
  })

  test('deckKey changes with the open hole, strength or threshold, not with object identity', () => {
    expect(deckKey(open({ ...a }))).toBe(deckKey(open(a)))
    expect(deckKey(island)).toBe(deckKey({ ...island, hole: closeHole(b) }))
    const keys = new Set([deckKey(island), deckKey(arch), deckKey(open(a)), deckKey(open(b))])
    expect(keys.size).toBe(4)
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
