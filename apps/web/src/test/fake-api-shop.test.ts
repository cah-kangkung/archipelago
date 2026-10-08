import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeBuilding, fakeEntry, fakeProject, fakeTask } from './fake-api'

function seeded(funds: number) {
  const beta = fakeProject()
  const fake = createFakeApi({
    world: {
      projects: [beta],
      milestones: [],
      tasks: [fakeTask({ projectId: beta.id, plotX: 1, plotY: 0 })],
      buildings: [],
    },
    ledger: funds === 0 ? [] : [fakeEntry({ kind: 'daily_bonus', amount: funds })],
  })
  return { beta, ...fake }
}

describe('fake api shop', () => {
  test('places, charges and refunds half', async () => {
    const { api, beta, state } = seeded(100)
    const placed = await api.placeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1 })
    expect(placed.balance).toBe(70)
    expect(state.world.buildings).toHaveLength(1)
    expect(await api.removeBuilding(placed.building.id)).toEqual({ refund: 15, balance: 85 })
    expect(state.world.buildings).toHaveLength(0)
  })

  test('applies the server errors', async () => {
    const { api, beta } = seeded(35)
    const place = (plotX: number, plotY: number, type: 'pine' | 'palm' = 'pine') =>
      api.placeBuilding({ projectId: beta.id, type, plotX, plotY })
    await expect(place(1, 0)).rejects.toMatchObject({ status: 409, code: 'conflict' })
    await expect(place(0, 0)).rejects.toMatchObject({ status: 422 })
    await expect(place(3, 0)).rejects.toMatchObject({ status: 422 })
    await expect(place(0, 1, 'palm')).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_supplies',
      message: 'Not enough Supplies',
    })
    await expect(api.removeBuilding('nope')).rejects.toMatchObject({ status: 404 })
  })

  test('deleting a project drops its buildings', async () => {
    const beta = fakeProject()
    const { api, state } = createFakeApi({
      world: {
        projects: [beta],
        milestones: [],
        tasks: [],
        buildings: [fakeBuilding({ projectId: beta.id })],
      },
    })
    await api.deleteProject(beta.id)
    expect(state.world.buildings).toEqual([])
  })
})
