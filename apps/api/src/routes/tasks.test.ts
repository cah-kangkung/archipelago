import { describe, expect, test } from 'bun:test'
import type { ErrorBody, MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { DISTRICT_SPACING, hexDistance, hexKey, islandLand, islandSize } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertProject, insertTask } from '../../test/fixtures'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const TASKS = '/api/v1/tasks'
const origin = { q: 0, r: 0 }
type One = { task: TaskDto }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const newProject = async (name: string) =>
    (await readJson<{ project: ProjectDto }>(await me.post('/api/v1/projects', { name }))).project
  const newMilestone = async (projectId: string, name: string) =>
    (
      await readJson<{ milestone: MilestoneDto }>(
        await me.post(`/api/v1/projects/${projectId}/milestones`, { name }),
      )
    ).milestone
  const project = await newProject('Beta')
  const milestone = await newMilestone(project.id, 'MVP')
  const addTask = async (body: Record<string, unknown>) =>
    (await readJson<One>(await me.post(TASKS, { projectId: project.id, ...body }))).task
  return { me, project, milestone, newProject, newMilestone, addTask }
}

describe('POST /tasks', () => {
  test('a loose task gets defaults and a plot next to the commons centre', async () => {
    await withRollback(async (tx) => {
      const { me, project } = await setup(tx)
      const res = await me.post(TASKS, { projectId: project.id, title: '  Write spec ' })
      expect(res.status).toBe(201)
      const { task } = await readJson<One>(res)
      expect(task).toMatchObject({
        projectId: project.id,
        milestoneId: null,
        title: 'Write spec',
        notes: '',
        dueDate: null,
        priority: 'med',
        size: 'M',
        status: 'todo',
        completedAt: null,
        sortOrder: 0,
      })
      expect(hexDistance({ q: task.plotX, r: task.plotY }, origin)).toBe(1)
    })
  })

  test('tasks gather around their district, on interior land, never the centre', async () => {
    await withRollback(async (tx) => {
      const { project, milestone, addTask } = await setup(tx)
      const centre = { q: milestone.districtQ, r: milestone.districtR }
      const created: TaskDto[] = []
      for (let i = 0; i < 7; i++)
        created.push(await addTask({ title: `T${i}`, milestoneId: milestone.id }))
      const plots = created.map((t) => ({ q: t.plotX, r: t.plotY }))
      expect(new Set(plots.map(hexKey)).size).toBe(7)
      expect(plots.map(hexKey)).not.toContain(hexKey(centre))
      const seed = project.islandSeed
      const interior = islandLand(seed, islandSize(seed, [centre, ...plots])).interior
      for (const p of plots) expect(interior.has(hexKey(p))).toBe(true)
      expect(Math.min(...plots.map((p) => hexDistance(p, centre)))).toBe(1)
      for (const p of plots) expect(hexDistance(p, centre)).toBeLessThanOrEqual(DISTRICT_SPACING)
    })
  })

  test('a milestone from another project → 422 on milestoneId, nothing created', async () => {
    await withRollback(async (tx) => {
      const { me, project, newProject, newMilestone } = await setup(tx)
      const elsewhere = await newMilestone((await newProject('Gamma')).id, 'Other')
      const res = await me.post(TASKS, {
        projectId: project.id,
        milestoneId: elsewhere.id,
        title: 'x',
      })
      expect(res.status).toBe(422)
      expect((await readJson<ErrorBody>(res)).error.fields?.milestoneId).toEqual([
        'Milestone does not belong to this project',
      ])
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, project.id))).toHaveLength(0)
    })
  })

  test("another user's project, an unknown project and bad input → 422", async () => {
    await withRollback(async (tx) => {
      const { me } = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      for (const [body, field] of [
        [{ projectId: theirs.id, title: 'x' }, 'projectId'],
        [{ projectId: crypto.randomUUID(), title: 'x' }, 'projectId'],
        [{ projectId: 'abc', title: 'x' }, 'projectId'],
        [{ projectId: theirs.id, title: 'x', dueDate: '2026-02-30' }, 'dueDate'],
      ] as const) {
        const res = await me.post(TASKS, body)
        expect(res.status).toBe(422)
        expect(Object.keys((await readJson<ErrorBody>(res)).error.fields ?? {})).toContain(field)
      }
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, theirs.id))).toHaveLength(0)
    })
  })

  test('adding a todo task to a completed milestone reopens it', async () => {
    await withRollback(async (tx) => {
      const { project, milestone, addTask } = await setup(tx)
      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      await tx
        .update(milestones)
        .set({ completedAt: new Date() })
        .where(eq(milestones.id, milestone.id))
      await addTask({ title: 'More work', milestoneId: milestone.id })
      const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(m?.completedAt).toBeNull()
    })
  })
})

describe('GET /tasks', () => {
  test("filters by project, milestone and status, and never shows another user's tasks", async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, newProject, addTask } = await setup(tx)
      const gamma = await newProject('Gamma')
      await addTask({ title: 'Loose' })
      await addTask({ title: 'In MVP', milestoneId: milestone.id })
      await me.post(TASKS, { projectId: gamma.id, title: 'Gamma task' })
      const other = await authedApp(tx)
      await insertTask(tx, (await insertProject(tx, other.user.id)).id, { title: 'Not mine' })

      const titles = async (qs: string) =>
        (await readJson<{ tasks: TaskDto[] }>(await me.get(`${TASKS}${qs}`))).tasks.map(
          (t) => t.title,
        )
      // Ordered by per-project sortOrder, then creation time.
      expect(await titles('')).toEqual(['Loose', 'Gamma task', 'In MVP'])
      expect(await titles(`?project=${project.id}`)).toEqual(['Loose', 'In MVP'])
      expect(await titles(`?milestone=${milestone.id}`)).toEqual(['In MVP'])
      expect(await titles('?status=done')).toEqual([])
      expect((await me.get(`${TASKS}?project=abc`)).status).toBe(422)
    })
  })
})

describe('PATCH /tasks/:id', () => {
  test('an oversized sortOrder → 422, not 500', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask({ title: 'Draft' })
      expect((await me.patch(`${TASKS}/${task.id}`, { sortOrder: 3_000_000_000 })).status).toBe(422)
    })
  })

  test('a malformed path id → 404 even when the body is invalid', async () => {
    await withRollback(async (tx) => {
      const { me } = await setup(tx)
      const res = await me.patch(`${TASKS}/abc`, {})
      expect(res.status).toBe(404)
      expect((await readJson<ErrorBody>(res)).error.code).toBe('not_found')
    })
  })

  test('updates fields, including clearing the due date', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask({ title: 'Draft', dueDate: '2026-10-10' })
      const res = await me.patch(`${TASKS}/${task.id}`, {
        title: 'Final',
        notes: 'Ship it',
        dueDate: null,
        priority: 'high',
        size: 'L',
        status: 'doing',
      })
      expect(res.status).toBe(200)
      expect((await readJson<One>(res)).task).toMatchObject({
        title: 'Final',
        notes: 'Ship it',
        dueDate: null,
        priority: 'high',
        size: 'L',
        status: 'doing',
      })
    })
  })

  test('status done is rejected (422); status changes on a done task conflict (409)', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask({ title: 'x' })
      expect((await me.patch(`${TASKS}/${task.id}`, { status: 'done' })).status).toBe(422)

      await tx
        .update(tasks)
        .set({ status: 'done', completedAt: new Date() })
        .where(eq(tasks.id, task.id))
      const res = await me.patch(`${TASKS}/${task.id}`, { status: 'todo' })
      expect(res.status).toBe(409)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.status).toBe('done')
    })
  })

  test('moving between districts re-plots; moving to another project’s milestone → 422', async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, newMilestone, newProject, addTask } = await setup(tx)
      const second = await newMilestone(project.id, 'Launch')
      const task = await addTask({ title: 'Mover', milestoneId: milestone.id })

      const moved = (
        await readJson<One>(await me.patch(`${TASKS}/${task.id}`, { milestoneId: second.id }))
      ).task
      expect(moved.milestoneId).toBe(second.id)
      expect(
        hexDistance(
          { q: moved.plotX, r: moved.plotY },
          { q: second.districtQ, r: second.districtR },
        ),
      ).toBe(1)

      const loose = (
        await readJson<One>(await me.patch(`${TASKS}/${task.id}`, { milestoneId: null }))
      ).task
      expect(loose.milestoneId).toBeNull()
      expect(hexDistance({ q: loose.plotX, r: loose.plotY }, origin)).toBe(1)

      const foreign = await newMilestone((await newProject('Gamma')).id, 'Other')
      const res = await me.patch(`${TASKS}/${task.id}`, { milestoneId: foreign.id })
      expect(res.status).toBe(422)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.milestoneId).toBeNull()
    })
  })

  test('moving the last open task out completes the old milestone', async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, newMilestone, addTask } = await setup(tx)
      const other = await newMilestone(project.id, 'Launch')
      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      const open = await addTask({ title: 'Leaver', milestoneId: milestone.id })
      const res = await me.patch(`${TASKS}/${open.id}`, { milestoneId: other.id })
      expect(res.status).toBe(200)
      const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(m?.completedAt).not.toBeNull()
    })
  })

  test("another user's task and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const { addTask } = await setup(tx)
      const task = await addTask({ title: 'Mine' })
      const other = await authedApp(tx)
      expect((await other.patch(`${TASKS}/${task.id}`, { title: 'Stolen' })).status).toBe(404)
      expect((await other.del(`${TASKS}/${task.id}`)).status).toBe(404)
      expect((await other.patch(`${TASKS}/abc`, { title: 'x' })).status).toBe(404)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.title).toBe('Mine')
    })
  })
})

describe('DELETE /tasks/:id', () => {
  test('deletes the task and re-evaluates its milestone', async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, addTask } = await setup(tx)
      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      const open = await addTask({ title: 'Last open one', milestoneId: milestone.id })
      expect((await me.del(`${TASKS}/${open.id}`)).status).toBe(204)
      expect(await tx.select().from(tasks).where(eq(tasks.id, open.id))).toHaveLength(0)
      const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(m?.completedAt).not.toBeNull()
    })
  })
})
