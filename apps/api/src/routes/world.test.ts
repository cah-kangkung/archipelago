import { describe, expect, test } from 'bun:test'
import type { WorldDto } from '@archipelago/shared'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import {
  insertBuilding,
  insertMilestone,
  insertProject,
  insertTask,
  testConfig,
} from '../../test/fixtures'
import { createApp } from '../app'
import { createApiToken } from '../auth/api-tokens'

const WORLD = '/api/v1/world'

describe('GET /world', () => {
  test('an empty world for a new user', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      expect(await readJson<WorldDto>(await me.get(WORLD))).toEqual({
        projects: [],
        milestones: [],
        tasks: [],
        buildings: [],
        economy: {
          balance: 0,
          streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
          daily: { amount: 15, claimedToday: false },
        },
      })
    })
  })

  test("returns the caller's active islands with everything on them; hides archived and others'", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const active = await insertProject(tx, me.user.id, { name: 'Active' })
      const milestone = await insertMilestone(tx, active.id)
      await insertTask(tx, active.id, { title: 'On island', milestoneId: milestone.id })
      await insertBuilding(tx, active.id)

      const archived = await insertProject(tx, me.user.id, { name: 'Old', archivedAt: new Date() })
      await insertMilestone(tx, archived.id)
      await insertBuilding(tx, archived.id)
      await insertTask(tx, archived.id, { title: 'Archived task' })

      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id, { name: 'Theirs' })
      await insertMilestone(tx, theirs.id)
      await insertBuilding(tx, theirs.id)
      await insertTask(tx, theirs.id, { title: 'Their task' })

      const world = await readJson<WorldDto>(await me.get(WORLD))
      expect(world.projects.map((p) => p.name)).toEqual(['Active'])
      expect(world.milestones.map((m) => m.id)).toEqual([milestone.id])
      expect(world.tasks.map((t) => t.title)).toEqual(['On island'])
      expect(world.buildings.map((b) => b.projectId)).toEqual([active.id])
    })
  })

  test('works with a bearer API token', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      await insertProject(tx, me.user.id)
      const { token } = await createApiToken(tx, me.user.id, 'integration')
      const app = createApp({ db: tx, config: testConfig })
      const res = await app.request(WORLD, { headers: { authorization: `Bearer ${token}` } })
      expect(res.status).toBe(200)
      expect((await readJson<WorldDto>(res)).projects).toHaveLength(1)
    })
  })

  test('includes the economy, even for a user with no islands', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const empty = await readJson<WorldDto>(await me.get(WORLD))
      expect(empty.economy.balance).toBe(0)
      expect(empty.economy.daily.claimedToday).toBe(false)
      await me.post('/api/v1/economy/daily-claim')
      const after = await readJson<WorldDto>(await me.get(WORLD))
      expect(after.economy.balance).toBe(15)
      expect(after.economy.daily.claimedToday).toBe(true)
    })
  })
})
