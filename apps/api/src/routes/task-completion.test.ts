import { describe, expect, test } from 'bun:test'
import type { MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const TASKS = '/api/v1/tasks'
type Completed = { task: TaskDto; milestoneCompleted: boolean }
type Reopened = { task: TaskDto; milestoneReopened: boolean }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const { project } = await readJson<{ project: ProjectDto }>(
    await me.post('/api/v1/projects', { name: 'Beta' }),
  )
  const { milestone } = await readJson<{ milestone: MilestoneDto }>(
    await me.post(`/api/v1/projects/${project.id}/milestones`, { name: 'MVP' }),
  )
  const addTask = async (title: string, milestoneId: string | null = null) =>
    (
      await readJson<{ task: TaskDto }>(
        await me.post(TASKS, { projectId: project.id, title, milestoneId }),
      )
    ).task
  return { me, milestone, addTask }
}

describe('POST /tasks/:id/complete and /reopen', () => {
  test('complete sets done + completedAt; completing again → 409 and nothing changes', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask('Loose')
      const res = await me.post(`${TASKS}/${task.id}/complete`)
      expect(res.status).toBe(200)
      const body = await readJson<Completed>(res)
      expect(body.task.status).toBe('done')
      expect(body.task.completedAt).not.toBeNull()
      expect(body.milestoneCompleted).toBe(false)

      const again = await me.post(`${TASKS}/${task.id}/complete`)
      expect(again.status).toBe(409)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.completedAt?.toISOString()).toBe(body.task.completedAt ?? '')
    })
  })

  test("completing the milestone's last open task completes it; reopening reopens it", async () => {
    await withRollback(async (tx) => {
      const { me, milestone, addTask } = await setup(tx)
      const a = await addTask('A', milestone.id)
      const b = await addTask('B', milestone.id)

      expect(
        (await readJson<Completed>(await me.post(`${TASKS}/${a.id}/complete`))).milestoneCompleted,
      ).toBe(false)
      expect(
        (await readJson<Completed>(await me.post(`${TASKS}/${b.id}/complete`))).milestoneCompleted,
      ).toBe(true)
      const [done] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(done?.completedAt).not.toBeNull()

      const reopened = await readJson<Reopened>(await me.post(`${TASKS}/${b.id}/reopen`))
      expect(reopened.task).toMatchObject({ status: 'todo', completedAt: null })
      expect(reopened.milestoneReopened).toBe(true)
      const [open] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(open?.completedAt).toBeNull()
    })
  })

  test('reopening a task that is not done → 409', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask('Open')
      expect((await me.post(`${TASKS}/${task.id}/reopen`)).status).toBe(409)
    })
  })

  test("another user's task and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const { addTask } = await setup(tx)
      const task = await addTask('Mine')
      const other = await authedApp(tx)
      expect((await other.post(`${TASKS}/${task.id}/complete`)).status).toBe(404)
      expect((await other.post(`${TASKS}/abc/reopen`)).status).toBe(404)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.status).toBe('todo')
    })
  })
})
