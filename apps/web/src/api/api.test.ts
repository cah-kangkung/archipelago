import { describe, expect, test } from 'vitest'
import { ApiError, createApi } from './api'
import { createClient } from './client'

type Responder = (req: Request) => Response | Promise<Response>

function harness(respond: Responder) {
  const requests: Request[] = []
  const fetchImpl: typeof fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init)
      requests.push(req)
      return respond(req.clone())
    },
    { preconnect: () => {} },
  )
  const api = createApi(createClient('http://test', fetchImpl))
  return { api, requests }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createApi', () => {
  test('world() GETs /api/v1/world and returns the body', async () => {
    const world = { projects: [], milestones: [], tasks: [], buildings: [] }
    const { api, requests } = harness(() => json(world))
    expect(await api.world()).toEqual(world)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe('http://test/api/v1/world')
  })

  test('createTask() POSTs JSON to /api/v1/tasks', async () => {
    const { api, requests } = harness(() => json({ task: { id: 't1' } }, 201))
    await api.createTask({
      projectId: '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60',
      milestoneId: null,
      title: 'Ship',
      notes: '',
      dueDate: null,
      priority: 'med',
      size: 'M',
    })
    const req = requests[0]
    expect(req?.method).toBe('POST')
    expect(req?.url).toBe('http://test/api/v1/tasks')
    expect(req?.headers.get('content-type')).toContain('application/json')
    expect(await req?.json()).toMatchObject({ title: 'Ship' })
  })

  test('completeTask() POSTs to /api/v1/tasks/:id/complete', async () => {
    const { api, requests } = harness(() => json({ task: { id: 't1' }, milestoneCompleted: false }))
    await api.completeTask('t1')
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/tasks/t1/complete')
  })

  test('204 responses resolve to undefined', async () => {
    const { api } = harness(() => new Response(null, { status: 204 }))
    expect(await api.deleteTask('t1')).toBeUndefined()
  })

  test('error bodies become ApiError with status, code, message and fields', async () => {
    const { api } = harness(() =>
      json(
        {
          error: {
            code: 'validation_failed',
            message: 'Request body is invalid',
            fields: { milestoneId: ['Milestone does not belong to this project'] },
          },
        },
        422,
      ),
    )
    const err = await api.updateTask('t1', { title: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 422,
      code: 'validation_failed',
      message: 'Request body is invalid',
      fields: { milestoneId: ['Milestone does not belong to this project'] },
    })
  })

  test('non-JSON failures still become ApiError(internal)', async () => {
    const { api } = harness(() => new Response('gateway down', { status: 502 }))
    const err = await api.world().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 502, code: 'internal' })
  })

  test('an error body without an error object still becomes ApiError(internal)', async () => {
    const { api } = harness(() => json({}, 500))
    const err = await api.world().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 500, code: 'internal', message: 'Request failed (500)' })
  })

  test('claimDaily() POSTs /api/v1/economy/daily-claim', async () => {
    const body = {
      reward: { kind: 'daily_bonus', amount: 15, streakDays: null },
      economy: { balance: 15 },
    }
    const { api, requests } = harness(() => json(body))
    expect(await api.claimDaily()).toEqual(body)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/economy/daily-claim')
  })

  test('placeBuilding() POSTs JSON to /api/v1/buildings', async () => {
    const { api, requests } = harness(() => json({ building: { id: 'b1' }, balance: 10 }, 201))
    const input = {
      projectId: '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60',
      type: 'pine' as const,
      plotX: 1,
      plotY: 0,
    }
    expect(await api.placeBuilding(input)).toEqual({ building: { id: 'b1' }, balance: 10 })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/buildings')
    expect(await requests[0]?.json()).toEqual(input)
  })

  test('removeBuilding() DELETEs /api/v1/buildings/:id', async () => {
    const { api, requests } = harness(() => json({ refund: 15, balance: 25 }))
    expect(await api.removeBuilding('b1')).toEqual({ refund: 15, balance: 25 })
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.url).toBe('http://test/api/v1/buildings/b1')
  })

  test('an insufficient_supplies error keeps its code', async () => {
    const { api } = harness(() =>
      json({ error: { code: 'insufficient_supplies', message: 'Not enough Supplies' } }, 409),
    )
    await expect(api.removeBuilding('b1')).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_supplies',
      message: 'Not enough Supplies',
    })
  })
})
