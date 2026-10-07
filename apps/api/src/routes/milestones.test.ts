import { describe, expect, test } from 'bun:test'
import type { MilestoneDto, ProjectDto } from '@archipelago/shared'
import { hexDistance, hexKey } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertProject, insertTask } from '../../test/fixtures'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const origin = { q: 0, r: 0 }
type One = { milestone: MilestoneDto }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const res = await me.post('/api/v1/projects', { name: 'Beta' })
  const { project } = await readJson<{ project: ProjectDto }>(res)
  const addMilestone = async (name: string) =>
    (await readJson<One>(await me.post(`/api/v1/projects/${project.id}/milestones`, { name })))
      .milestone
  return { me, project, addMilestone }
}

describe('POST /projects/:id/milestones', () => {
  test('places districts 5 hexes from the commons, cycling landmarks and sort order', async () => {
    await withRollback(async (tx) => {
      const { addMilestone } = await setup(tx)
      const created: MilestoneDto[] = []
      for (const name of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])
        created.push(await addMilestone(name))

      expect(created.map((m) => m.landmarkType)).toEqual([
        'lighthouse',
        'town_hall',
        'windmill',
        'observatory',
        'market',
        'lighthouse',
      ])
      expect(created.map((m) => m.sortOrder)).toEqual([0, 1, 2, 3, 4, 5])
      const centres = created.map((m) => ({ q: m.districtQ, r: m.districtR }))
      for (const c of centres) expect(hexDistance(c, origin)).toBe(5)
      expect(new Set(centres.map(hexKey)).size).toBe(6)
      expect(created[0]?.completedAt).toBeNull()
    })
  })

  test("another user's project and malformed ids → 404; blank name → 422", async () => {
    await withRollback(async (tx) => {
      const { me, project } = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      expect(
        (await me.post(`/api/v1/projects/${theirs.id}/milestones`, { name: 'x' })).status,
      ).toBe(404)
      expect((await me.post('/api/v1/projects/abc/milestones', { name: 'x' })).status).toBe(404)
      expect(
        (await me.post(`/api/v1/projects/${project.id}/milestones`, { name: ' ' })).status,
      ).toBe(422)
    })
  })
})

describe('PATCH /milestones/:id', () => {
  test('renames and reorders; other users and malformed ids get 404', async () => {
    await withRollback(async (tx) => {
      const { me, addMilestone } = await setup(tx)
      const other = await authedApp(tx)
      const m = await addMilestone('Launch')
      const updated = await readJson<One>(
        await me.patch(`/api/v1/milestones/${m.id}`, { name: 'Launch v2', sortOrder: 4 }),
      )
      expect(updated.milestone).toMatchObject({ name: 'Launch v2', sortOrder: 4 })
      expect((await other.patch(`/api/v1/milestones/${m.id}`, { name: 'Stolen' })).status).toBe(404)
      expect((await other.patch('/api/v1/milestones/abc', { name: 'x' })).status).toBe(404)
    })
  })
})

describe('DELETE /milestones/:id', () => {
  test("moves the milestone's tasks to free plots in the commons, then deletes it", async () => {
    await withRollback(async (tx) => {
      const { me, project, addMilestone } = await setup(tx)
      const m = await addMilestone('MVP')
      for (let i = 1; i <= 3; i++) {
        await insertTask(tx, project.id, {
          milestoneId: m.id,
          plotX: m.districtQ + i,
          plotY: m.districtR - i,
        })
      }
      await insertTask(tx, project.id, { plotX: 1, plotY: 0 }) // an existing loose task

      expect((await me.del(`/api/v1/milestones/${m.id}`)).status).toBe(204)
      expect(await tx.select().from(milestones).where(eq(milestones.id, m.id))).toHaveLength(0)

      const all = await tx.select().from(tasks).where(eq(tasks.projectId, project.id))
      expect(all).toHaveLength(4)
      const plots = all.map((t) => ({ q: t.plotX, r: t.plotY }))
      expect(new Set(plots.map(hexKey)).size).toBe(4)
      for (const t of all) {
        expect(t.milestoneId).toBeNull()
        expect(hexDistance({ q: t.plotX, r: t.plotY }, origin)).toBe(1)
      }
    })
  })

  test("another user's milestone → 404 and nothing changes", async () => {
    await withRollback(async (tx) => {
      const { addMilestone } = await setup(tx)
      const other = await authedApp(tx)
      const m = await addMilestone('MVP')
      expect((await other.del(`/api/v1/milestones/${m.id}`)).status).toBe(404)
      expect(await tx.select().from(milestones).where(eq(milestones.id, m.id))).toHaveLength(1)
    })
  })
})
