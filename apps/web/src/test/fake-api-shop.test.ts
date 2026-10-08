import { decorationRotation } from '@archipelago/shared'
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

  test('a balance equal to the price buys; the stored rotation is the shared hash', async () => {
    const { api, beta } = seeded(30)
    const placed = await api.placeBuilding({
      projectId: beta.id,
      type: 'pine',
      plotX: -1,
      plotY: 1,
    })
    expect(placed.balance).toBe(0)
    expect(placed.building.rotation).toBe(decorationRotation({ q: -1, r: 1 }))
  })

  test('a negative balance, an unknown type and an archived island are refused', async () => {
    const { api, beta, state } = seeded(0)
    state.ledger.push(fakeEntry({ kind: 'purchase', amount: -5 }))
    await expect(
      api.placeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1 }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_supplies',
      message: 'Balance is negative',
    })
    await expect(
      api.placeBuilding({
        projectId: beta.id,
        type: 'tree' as unknown as 'pine',
        plotX: 0,
        plotY: 1,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'validation_failed' })
    const archived = fakeProject({ archivedAt: '2026-10-07T00:00:00.000Z' })
    state.world.projects.push(archived)
    await expect(
      api.placeBuilding({ projectId: archived.id, type: 'pine', plotX: 0, plotY: 1 }),
    ).rejects.toMatchObject({ status: 404 })
  })

  test('removing a legacy decoration refunds nothing and writes no ledger row', async () => {
    const beta = fakeProject()
    const legacy = fakeBuilding({ projectId: beta.id, type: 'obelisk' })
    const { api, state } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks: [], buildings: [legacy] },
    })
    expect(await api.removeBuilding(legacy.id)).toEqual({ refund: 0, balance: 0 })
    expect(state.ledger).toEqual([])
  })
})
