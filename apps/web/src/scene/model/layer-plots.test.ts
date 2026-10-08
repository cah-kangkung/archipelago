import type { Hex, WorldDto } from '@archipelago/shared'
import { islandRadius, placeablePlots } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import { islandOccupied } from '../../world/selectors'
import { insideArea } from './area'
import { layerArea } from './camera'
import { hexToWorld } from './hex-space'
import { plotsInLayer } from './layer-plots'
import { buildSceneModel } from './scene-model'

const beta = fakeProject({ name: 'Beta', archipelagoX: 2, archipelagoY: 1 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: -1, districtR: 0 })
const other = fakeMilestone({ projectId: beta.id, districtQ: -2, districtR: 1 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp, other],
  tasks: [
    fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 3, plotY: 0 }),
    fakeTask({ projectId: beta.id, milestoneId: other.id, plotX: -3, plotY: 1 }),
  ],
  buildings: [],
  economy: quietEconomy,
}
const plots: Hex[] = placeablePlots(islandOccupied(world, beta.id))
const model = buildSceneModel(world, '2026-10-08')
const island = model.islands[0]
if (!island) throw new Error('no island')

describe('plotsInLayer', () => {
  test('the archipelago and island layers keep every plot', () => {
    expect(plotsInLayer(world, { kind: 'archipelago' }, plots)).toEqual(plots)
    expect(plotsInLayer(world, { kind: 'island', projectId: beta.id }, plots)).toEqual(plots)
  })

  test('a district keeps exactly the plots inside its layer area', () => {
    expect(islandRadius(islandOccupied(world, beta.id))).toBeGreaterThan(0)
    const focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id } as const
    const area = layerArea(model, focus)
    if (!area) throw new Error('no area')
    const kept = plotsInLayer(world, focus, plots)
    const expected = plots.filter((h) => {
      const p = hexToWorld(h)
      return insideArea(area, { x: island.origin.x + p.x, z: island.origin.z + p.z })
    })
    expect(kept).toEqual(expected)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(plots.length)
  })

  test('an unknown milestone falls back to the island', () => {
    const focus = { kind: 'district', projectId: beta.id, milestoneId: 'nope' } as const
    expect(plotsInLayer(world, focus, plots)).toEqual(plots)
  })
})
