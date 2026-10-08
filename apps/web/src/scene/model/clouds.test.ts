import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import { CLOUD_BAND, CLOUD_DENSITY, CLOUD_MAX } from '../tuning'
import { type Area, areaDistance } from './area'
import { AREA_MARGIN, layerArea } from './camera'
import { cloudArea, cloudRing, ringLength } from './clouds'
import { SHALLOWS_MARGIN } from './hex-space'
import { hashInts } from './random'
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
const island = model.islands[0]
if (!island) throw new Error('no island')
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }

describe('cloudArea', () => {
  test('no clouds on the archipelago, or for an unknown island', () => {
    expect(cloudArea(model, { kind: 'archipelago' })).toBeNull()
    expect(cloudArea(model, { kind: 'island', projectId: 'nope' })).toBeNull()
  })

  test('an island rings its shallows, seeded by the island', () => {
    expect(cloudArea(model, onBeta)).toEqual({
      area: layerArea(model, onBeta),
      inset: SHALLOWS_MARGIN,
      seed: island.seed,
    })
  })

  test('a district rings its own area by default, seeded by its order on the island', () => {
    const index = island.districts.findIndex((d) => d.milestoneId === mvp.id)
    expect(cloudArea(model, onMvp)).toEqual({
      area: layerArea(model, onMvp),
      inset: AREA_MARGIN,
      seed: hashInts(island.seed, index + 1),
    })
  })

  test('an unknown milestone falls back to the island ring', () => {
    expect(cloudArea(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' })).toEqual(
      cloudArea(model, onBeta),
    )
  })
})

describe('cloudRing', () => {
  const c = cloudArea(model, onBeta)
  if (!c) throw new Error('no island ring')

  test('every puff sits in the band outside the area, inside its own middle 80%', () => {
    const ring = cloudRing(c)
    expect(ring.length).toBeGreaterThan(0)
    for (const p of ring) {
      const d = areaDistance(c.area, p)
      expect(d).toBeGreaterThanOrEqual(c.inset + 0.1 * CLOUD_BAND - 1e-9)
      expect(d).toBeLessThanOrEqual(c.inset + 0.9 * CLOUD_BAND + 1e-9)
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1)
      expect(p.scale).toBeGreaterThanOrEqual(0.8)
      expect(p.scale).toBeLessThanOrEqual(1.4)
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThan(1)
    }
  })

  test('the same area and seed give the same ring; another seed does not', () => {
    expect(cloudRing({ ...c })).toEqual(cloudRing(c))
    expect(cloudRing({ ...c, seed: c.seed + 1 })).not.toEqual(cloudRing(c))
  })

  test('the count is the band middle’s length times CLOUD_DENSITY', () => {
    const a = c.area
    const r = (a.round ?? 0) + c.inset + CLOUD_BAND / 2
    const length = 2 * (a.maxX - a.minX + (a.maxZ - a.minZ)) + 2 * Math.PI * r
    expect(ringLength(c)).toBeCloseTo(length)
    expect(cloudRing(c)).toHaveLength(Math.min(CLOUD_MAX, Math.round(length * CLOUD_DENSITY)))
  })

  test('a huge area caps at CLOUD_MAX, spread evenly round the whole ring', () => {
    const huge: Area = { minX: -200, maxX: 200, minZ: -200, maxZ: 200, round: 5 }
    const ring = cloudRing({ area: huge, inset: 1, seed: 7 })
    expect(ring).toHaveLength(CLOUD_MAX)
    // Each side of the square gets about a quarter of the puffs.
    const east = ring.filter((p) => p.x > 200).length
    expect(east).toBeGreaterThan(CLOUD_MAX * 0.2)
    expect(east).toBeLessThan(CLOUD_MAX * 0.3)
  })

  test('a point area with no round still makes a ring', () => {
    const ring = cloudRing({ area: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, inset: 1, seed: 3 })
    expect(ring.length).toBeGreaterThan(0)
  })
})
