import { describe, expect, test } from 'bun:test'
import type { EconomyDto, ProjectDto, RewardDto, TaskDto } from '@archipelago/shared'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { testConfig } from '../../test/fixtures'
import { createApp } from '../app'

const ECONOMY = '/api/v1/economy'
const NOON = new Date('2026-10-07T05:00:00.000Z')

describe('/economy', () => {
  test('requires auth', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      expect((await app.request(ECONOMY)).status).toBe(401)
      expect((await app.request(`${ECONOMY}/daily-claim`, { method: 'POST' })).status).toBe(401)
    })
  })

  test('GET returns the empty economy for a new user, then reflects rewards', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx, { now: () => NOON })
      expect(await readJson<{ economy: EconomyDto }>(await me.get(ECONOMY))).toEqual({
        economy: {
          balance: 0,
          streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
          daily: { amount: 15, claimedToday: false },
        },
      })
      const { project } = await readJson<{ project: ProjectDto }>(
        await me.post('/api/v1/projects', { name: 'Beta' }),
      )
      const { task } = await readJson<{ task: TaskDto }>(
        await me.post('/api/v1/tasks', { projectId: project.id, title: 'Ship', size: 'L' }),
      )
      await me.post(`/api/v1/tasks/${task.id}/complete`)
      const { economy } = await readJson<{ economy: EconomyDto }>(await me.get(ECONOMY))
      expect(economy.balance).toBe(60)
      expect(economy.streak).toEqual({
        days: 1,
        activeToday: true,
        next: { days: 3, amount: 20 },
      })
    })
  })

  test('daily-claim pays once per day, then 409 with the error shape', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx, { now: () => NOON })
      const first = await me.post(`${ECONOMY}/daily-claim`)
      expect(first.status).toBe(200)
      const body = await readJson<{ reward: RewardDto; economy: EconomyDto }>(first)
      expect(body.reward).toEqual({ kind: 'daily_bonus', amount: 15, streakDays: null })
      expect(body.economy.balance).toBe(15)
      expect(body.economy.daily.claimedToday).toBe(true)

      const second = await me.post(`${ECONOMY}/daily-claim`)
      expect(second.status).toBe(409)
      expect(await second.json()).toEqual({
        error: { code: 'conflict', message: 'Daily bonus already claimed today' },
      })
    })
  })
})
