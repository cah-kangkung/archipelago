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
      await insertTask(tx, archived.id, { title: 'Archived task' })

      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id, { name: 'Theirs' })
      await insertTask(tx, theirs.id, { title: 'Their task' })

      const world = await readJson<WorldDto>(await me.get(WORLD))
      expect(world.projects.map((p) => p.name)).toEqual(['Active'])
      expect(world.milestones.map((m) => m.id)).toEqual([milestone.id])
      expect(world.tasks.map((t) => t.title)).toEqual(['On island'])
      expect(world.buildings).toHaveLength(1)
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
})
