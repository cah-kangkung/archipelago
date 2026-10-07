import { describe, expect, test } from 'bun:test'
import type { ErrorBody, ProjectDto } from '@archipelago/shared'
import { hexDistance } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertMilestone, insertProject, insertTask, testConfig } from '../../test/fixtures'
import { createApp } from '../app'
import { milestones, tasks } from '../db/schema'

const PROJECTS = '/api/v1/projects'
type One = { project: ProjectDto }
type Many = { projects: ProjectDto[] }

describe('/projects', () => {
  test('requires authentication', async () => {
    await withRollback(async (tx) => {
      const res = await createApp({ db: tx, config: testConfig }).request(PROJECTS)
      expect(res.status).toBe(401)
    })
  })

  test('the first island takes the origin slot, the next one a neighbouring slot', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const first = await me.post(PROJECTS, { name: '  Beta  ' })
      expect(first.status).toBe(201)
      const a = (await readJson<One>(first)).project
      expect(a).toMatchObject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0, archivedAt: null })
      expect(Number.isInteger(a.islandSeed)).toBe(true)
      expect(a.islandSeed).toBeGreaterThanOrEqual(0)

      const b = (await readJson<One>(await me.post(PROJECTS, { name: 'Gamma' }))).project
      expect(hexDistance({ q: b.archipelagoX, r: b.archipelagoY }, { q: 0, r: 0 })).toBe(1)
    })
  })

  test("lists only the caller's projects, oldest first", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const other = await authedApp(tx)
      await me.post(PROJECTS, { name: 'One' })
      await me.post(PROJECTS, { name: 'Two' })
      await other.post(PROJECTS, { name: 'Theirs' })
      const { projects } = await readJson<Many>(await me.get(PROJECTS))
      expect(projects.map((p) => p.name)).toEqual(['One', 'Two'])
    })
  })

  test('rename, archive and unarchive; re-archiving keeps the first timestamp', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const { project } = await readJson<One>(await me.post(PROJECTS, { name: 'Beta' }))
      const url = `${PROJECTS}/${project.id}`

      const renamed = await readJson<One>(await me.patch(url, { name: 'Beta 2' }))
      expect(renamed.project.name).toBe('Beta 2')

      const archived = (await readJson<One>(await me.patch(url, { archived: true }))).project
      expect(archived.archivedAt).not.toBeNull()
      const again = (await readJson<One>(await me.patch(url, { archived: true }))).project
      expect(again.archivedAt).toBe(archived.archivedAt)

      const restored = (await readJson<One>(await me.patch(url, { archived: false }))).project
      expect(restored.archivedAt).toBeNull()
    })
  })

  test('invalid bodies → 422', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      expect((await me.post(PROJECTS, { name: '' })).status).toBe(422)
      const { project } = await readJson<One>(await me.post(PROJECTS, { name: 'Beta' }))
      expect((await me.patch(`${PROJECTS}/${project.id}`, {})).status).toBe(422)
    })
  })

  test("another user's project and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      for (const res of [
        await me.patch(`${PROJECTS}/${theirs.id}`, { name: 'Mine now' }),
        await me.del(`${PROJECTS}/${theirs.id}`),
        await me.del(`${PROJECTS}/abc`),
      ]) {
        expect(res.status).toBe(404)
        expect((await readJson<ErrorBody>(res)).error.code).toBe('not_found')
      }
      expect((await readJson<Many>(await other.get(PROJECTS))).projects[0]?.name).toBe('Beta')
    })
  })

  test('delete removes the project with its milestones and tasks', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const project = await insertProject(tx, me.user.id)
      const milestone = await insertMilestone(tx, project.id)
      await insertTask(tx, project.id, { milestoneId: milestone.id })
      expect((await me.del(`${PROJECTS}/${project.id}`)).status).toBe(204)
      expect(
        await tx.select().from(milestones).where(eq(milestones.projectId, project.id)),
      ).toHaveLength(0)
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, project.id))).toHaveLength(0)
    })
  })
})
