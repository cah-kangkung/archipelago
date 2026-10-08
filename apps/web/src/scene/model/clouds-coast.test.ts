import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import { cloudArea } from './clouds'
import { buildSceneModel } from './scene-model'

vi.mock('../tuning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tuning')>()),
  CLOUD_DISTRICT_RING: 'coast',
}))

describe("CLOUD_DISTRICT_RING = 'coast'", () => {
  test('a district keeps its island’s ring', () => {
    const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
    const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
    const world: WorldDto = {
      projects: [beta],
      milestones: [mvp],
      tasks: [],
      buildings: [],
      economy: quietEconomy,
    }
    const model = buildSceneModel(world, '2026-10-09')
    expect(cloudArea(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id })).toEqual(
      cloudArea(model, { kind: 'island', projectId: beta.id }),
    )
  })
})
