import { describe, expect, test } from 'bun:test'
import type {
  CompleteTaskResultDto,
  MilestoneDto,
  ProjectDto,
  ReopenTaskResultDto,
  RewardDto,
  TaskDto,
  TaskSize,
} from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { testDb, withRollback } from '../../test/db'
import { insertProject, insertTask } from '../../test/fixtures'
import type { Db } from '../db/client'
import { ledger, milestones, users } from '../db/schema'
import { getBalance, insertEntry } from '../economy/ledger'

const TASKS = '/api/v1/tasks'
// Noon in Asia/Jakarta (UTC+7) on 2026-10-0N.
const noon = (day: number) => `2026-10-${String(day).padStart(2, '0')}T05:00:00.000Z`

const byKind = (rewards: RewardDto[]) =>
  [...rewards].sort((a, b) => a.kind.localeCompare(b.kind) || a.amount - b.amount)

async function setup(db: Db, startIso = noon(1)) {
  let current = new Date(startIso)
  const me = await authedApp(db, { now: () => current, timezone: 'Asia/Jakarta' })
  const setClock = (iso: string) => {
    current = new Date(iso)
  }
  const newProject = async (name = 'Beta') =>
    (await readJson<{ project: ProjectDto }>(await me.post('/api/v1/projects', { name }))).project
  const project = await newProject()
  const { milestone } = await readJson<{ milestone: MilestoneDto }>(
    await me.post(`/api/v1/projects/${project.id}/milestones`, { name: 'MVP' }),
  )
  const addTask = async (
    title: string,
    opts: {
      milestoneId?: string | null
      size?: TaskSize
      dueDate?: string | null
      projectId?: string
    } = {},
  ) =>
    (
      await readJson<{ task: TaskDto }>(
        await me.post(TASKS, {
          projectId: opts.projectId ?? project.id,
          title,
          milestoneId: opts.milestoneId ?? null,
          size: opts.size ?? 'M',
          dueDate: opts.dueDate ?? null,
        }),
      )
    ).task
  const complete = async (id: string) => {
    const res = await me.post(`${TASKS}/${id}/complete`)
    expect(res.status).toBe(200)
    return readJson<CompleteTaskResultDto>(res)
  }
  const reopen = async (id: string) => {
    const res = await me.post(`${TASKS}/${id}/reopen`)
    expect(res.status).toBe(200)
    return readJson<ReopenTaskResultDto>(res)
  }
  const remove = async (id: string) => expect((await me.del(`${TASKS}/${id}`)).status).toBe(204)
  const balance = () => getBalance(db, me.user.id)
  return {
    me,
    project,
    milestone,
    setClock,
    newProject,
    addTask,
    complete,
    reopen,
    remove,
    balance,
  }
}

describe('task rewards', () => {
  test('pays the task reward and returns the balance', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const task = await s.addTask('Loose', { size: 'S' })
      const body = await s.complete(task.id)
      expect(body.rewards).toEqual([{ kind: 'task_reward', amount: 10, streakDays: null }])
      expect(body.balance).toBe(10)
      expect(body.task.status).toBe('done')
    })
  })

  test('on time pays ×1.5', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx, noon(7))
      const task = await s.addTask('Due', { size: 'M', dueDate: '2026-10-07' })
      expect((await s.complete(task.id)).rewards).toEqual([
        { kind: 'task_reward', amount: 37, streakDays: null },
      ])
    })
  })

  test('late by local date even when it is still the due date in UTC', async () => {
    await withRollback(async (tx) => {
      // 20:00Z on the 7th is 03:00 on the 8th in Jakarta.
      const s = await setup(tx, '2026-10-07T20:00:00.000Z')
      const task = await s.addTask('Due', { size: 'M', dueDate: '2026-10-07' })
      expect((await s.complete(task.id)).rewards[0]?.amount).toBe(25)
    })
  })

  test('the completing task earns the milestone bonus', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const a = await s.addTask('A', { milestoneId: s.milestone.id, size: 'M' })
      const b = await s.addTask('B', { milestoneId: s.milestone.id, size: 'S' })
      expect((await s.complete(a.id)).rewards.map((r) => r.kind)).toEqual(['task_reward'])
      const last = await s.complete(b.id)
      expect(last.milestoneCompleted).toBe(true)
      expect(byKind(last.rewards)).toEqual([
        { kind: 'milestone_bonus', amount: 17, streakDays: null },
        { kind: 'task_reward', amount: 10, streakDays: null },
      ])
      expect(last.balance).toBe(52)
    })
  })

  test('reopen reverses the task reward and the milestone bonus it earned', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const a = await s.addTask('A', { milestoneId: s.milestone.id, size: 'M' })
      const b = await s.addTask('B', { milestoneId: s.milestone.id, size: 'S' })
      await s.complete(a.id)
      await s.complete(b.id)
      const body = await s.reopen(b.id)
      expect(body.milestoneReopened).toBe(true)
      expect(byKind(body.reversals)).toEqual([
        { kind: 'milestone_bonus', amount: 17, streakDays: null },
        { kind: 'task_reward', amount: 10, streakDays: null },
      ])
      expect(body.balance).toBe(25)
      expect(await s.balance()).toBe(25)
    })
  })

  test('one live bonus: adding a task keeps it and finishing again pays nothing more', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const a = await s.addTask('A', { milestoneId: s.milestone.id, size: 'M' })
      const b = await s.addTask('B', { milestoneId: s.milestone.id, size: 'S' })
      await s.complete(a.id)
      await s.complete(b.id)
      const c = await s.addTask('C', { milestoneId: s.milestone.id, size: 'M' })
      const [reopened] = await tx.select().from(milestones).where(eq(milestones.id, s.milestone.id))
      expect(reopened?.completedAt).toBeNull()

      const again = await s.complete(c.id)
      expect(again.milestoneCompleted).toBe(true)
      expect(again.rewards.map((r) => r.kind)).toEqual(['task_reward'])

      // A did not earn the bonus, so reopening it leaves the bonus alone.
      expect((await s.reopen(a.id)).reversals.map((r) => r.kind)).toEqual(['task_reward'])
      expect((await s.complete(a.id)).rewards.map((r) => r.kind)).toEqual(['task_reward'])
      expect(await s.balance()).toBe(25 + 10 + 17 + 25)
    })
  })

  test('deleting the task that earned the bonus reverses both', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const a = await s.addTask('A', { milestoneId: s.milestone.id, size: 'M' })
      const b = await s.addTask('B', { milestoneId: s.milestone.id, size: 'S' })
      await s.complete(a.id)
      await s.complete(b.id)
      await s.remove(b.id)
      expect(await s.balance()).toBe(25)
    })
  })

  test('completing a milestone by deleting its last open task pays no bonus', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const a = await s.addTask('A', { milestoneId: s.milestone.id, size: 'M' })
      const b = await s.addTask('B', { milestoneId: s.milestone.id, size: 'S' })
      await s.complete(a.id)
      await s.remove(b.id)
      const [done] = await tx.select().from(milestones).where(eq(milestones.id, s.milestone.id))
      expect(done?.completedAt).not.toBeNull()
      const bonuses = await tx
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, s.me.user.id), eq(ledger.kind, 'milestone_bonus')))
      expect(bonuses).toHaveLength(0)
      expect(await s.balance()).toBe(25)
    })
  })

  test('toggling cannot farm', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const task = await s.addTask('Toggle', { size: 'M' })
      for (let i = 0; i < 3; i += 1) {
        await s.complete(task.id)
        await s.reopen(task.id)
      }
      expect(await s.balance()).toBe(0)
      expect((await s.complete(task.id)).balance).toBe(25)
    })
  })

  test('streak bonuses at 3 and 7 days, once each', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const streakRewards: RewardDto[] = []
      for (let day = 1; day <= 7; day += 1) {
        s.setClock(noon(day))
        const task = await s.addTask(`Day ${day}`, { size: 'S' })
        const body = await s.complete(task.id)
        streakRewards.push(...body.rewards.filter((r) => r.kind === 'streak_bonus'))
        if (day === 3)
          expect(body.rewards).toContainEqual({ kind: 'streak_bonus', amount: 20, streakDays: 3 })
      }
      expect(streakRewards).toEqual([
        { kind: 'streak_bonus', amount: 20, streakDays: 3 },
        { kind: 'streak_bonus', amount: 50, streakDays: 7 },
      ])
      const extra = await s.addTask('Day 7 again', { size: 'S' })
      expect((await s.complete(extra.id)).rewards.map((r) => r.kind)).toEqual(['task_reward'])
    })
  })

  test('reopening a task inside the streak window reverses the streak bonus', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const ids: string[] = []
      for (let day = 1; day <= 3; day += 1) {
        s.setClock(noon(day))
        const task = await s.addTask(`Day ${day}`, { size: 'S' })
        await s.complete(task.id)
        ids.push(task.id)
      }
      expect(await s.balance()).toBe(30 + 20)
      const body = await s.reopen(ids[1] as string)
      expect(byKind(body.reversals)).toEqual([
        { kind: 'streak_bonus', amount: 20, streakDays: 3 },
        { kind: 'task_reward', amount: 10, streakDays: null },
      ])
      expect(body.balance).toBe(20)
    })
  })

  test('reopening one of two completions on a day keeps the streak bonus', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const first = await s.addTask('Day 1a', { size: 'S' })
      await s.complete(first.id)
      await s.complete((await s.addTask('Day 1b', { size: 'S' })).id)
      for (const day of [2, 3]) {
        s.setClock(noon(day))
        await s.complete((await s.addTask(`Day ${day}`, { size: 'S' })).id)
      }
      expect((await s.reopen(first.id)).reversals.map((r) => r.kind)).toEqual(['task_reward'])
      expect(await s.balance()).toBe(30 + 20)
    })
  })

  test('re-completing today pays a reversed streak bonus again, once', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      let last = ''
      for (let day = 1; day <= 3; day += 1) {
        s.setClock(noon(day))
        last = (await s.addTask(`Day ${day}`, { size: 'S' })).id
        await s.complete(last)
      }
      await s.reopen(last)
      expect(await s.balance()).toBe(20)
      expect((await s.complete(last)).rewards).toContainEqual({
        kind: 'streak_bonus',
        amount: 20,
        streakDays: 3,
      })
      expect(await s.balance()).toBe(50)
    })
  })

  test('deleting a project keeps its rewards', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const other = await s.newProject('Gamma')
      await s.complete((await s.addTask('Gone', { projectId: other.id, size: 'L' })).id)
      expect((await s.me.del(`/api/v1/projects/${other.id}`)).status).toBe(204)
      expect(await s.balance()).toBe(60)
    })
  })

  test('legacy done task (no ledger rows) reopens and deletes without changing the balance', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const legacy = await insertTask(tx, s.project.id, {
        status: 'done',
        completedAt: new Date(noon(1)),
      })
      const body = await s.reopen(legacy.id)
      expect(body.reversals).toEqual([])
      expect(body.balance).toBe(0)
      const other = await insertTask(tx, s.project.id, {
        status: 'done',
        completedAt: new Date(noon(1)),
      })
      await s.remove(other.id)
      expect(await s.balance()).toBe(0)
    })
  })
})

describe('task rewards under concurrency', () => {
  test('concurrent completions in two projects pay one streak bonus', async () => {
    // Real transactions on separate connections; cleaned up by deleting the user.
    const current = new Date(noon(3))
    const me = await authedApp(testDb, { now: () => current, timezone: 'Asia/Jakarta' })
    try {
      for (const day of [1, 2]) {
        await insertEntry(
          testDb,
          me.user.id,
          { kind: 'task_reward', amount: 10 },
          new Date(noon(day)),
        )
      }
      const tasks = []
      for (const name of ['P1', 'P2']) {
        const project = await insertProject(testDb, me.user.id, { name })
        tasks.push(await insertTask(testDb, project.id, { size: 'S' }))
      }
      const results = await Promise.all(tasks.map((t) => me.post(`${TASKS}/${t.id}/complete`)))
      expect(results.map((r) => r.status)).toEqual([200, 200])
      const bonuses = await testDb
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, me.user.id), eq(ledger.kind, 'streak_bonus')))
      expect(bonuses).toHaveLength(1)
    } finally {
      await testDb.delete(users).where(eq(users.id, me.user.id))
    }
  })
})
