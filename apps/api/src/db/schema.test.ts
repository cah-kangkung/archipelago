import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertUser } from '../../test/fixtures'
import { isUniqueViolation } from './pg-errors'
import { ledger, projects, tasks, users } from './schema'

const newProject = (userId: string) => ({
  userId,
  name: 'Beta',
  islandSeed: 42,
  archipelagoX: 0,
  archipelagoY: 0,
})

const newTask = (projectId: string, extra: Partial<typeof tasks.$inferInsert> = {}) => ({
  projectId,
  title: 'Write spec',
  plotX: 0,
  plotY: 0,
  ...extra,
})

describe('schema', () => {
  test('inserts a user with defaults', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { email: 'boss@example.com' })
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(user.createdAt).toBeInstanceOf(Date)
    })
  })

  test('user email is unique', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      await insertUser(tx, { email: 'dup@example.com' })
      await insertUser(tx, { email: 'dup@example.com' })
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('task defaults are todo / med / M with empty notes', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      const [task] = await tx.insert(tasks).values(newTask(project.id)).returning()
      expect(task).toMatchObject({ status: 'todo', priority: 'med', size: 'M', notes: '' })
    })
  })

  test('native tasks never collide on the external ref index', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      await tx
        .insert(tasks)
        .values([newTask(project.id), newTask(project.id, { plotX: 1, plotY: 0 })])
    })
  })

  test('the same external ref cannot be imported twice', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      const ref = { externalSource: 'gitlab', externalId: '123' }
      await tx.insert(tasks).values(newTask(project.id, ref))
      await tx.insert(tasks).values(newTask(project.id, { ...ref, plotX: 1, plotY: 0 }))
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('two tasks cannot share a plot on the same island', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      await tx.insert(tasks).values(newTask(project.id))
      await tx.insert(tasks).values(newTask(project.id))
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('a ledger entry can be reversed at most once', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [entry] = await tx
        .insert(ledger)
        .values({ userId: user.id, kind: 'task_reward', amount: 25 })
        .returning()
      if (!entry) throw new Error('no entry')
      const reversal = {
        userId: user.id,
        kind: 'reversal' as const,
        amount: -25,
        reversesId: entry.id,
      }
      await tx.insert(ledger).values(reversal)
      await tx.insert(ledger).values(reversal)
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('deleting a user cascades to their projects', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      await tx.insert(projects).values(newProject(user.id))
      await tx.delete(users).where(eq(users.id, user.id))
      const remaining = await tx.select().from(projects).where(eq(projects.userId, user.id))
      expect(remaining).toHaveLength(0)
    })
  })

  test('streak fields are required on streak bonuses and forbidden elsewhere', async () => {
    const attempt = async (entry: Partial<typeof ledger.$inferInsert>) => {
      let caught: unknown = null
      await withRollback(async (tx) => {
        const user = await insertUser(tx)
        await tx
          .insert(ledger)
          .values({ userId: user.id, kind: 'task_reward', amount: 10, ...entry })
      }).catch((err) => {
        caught = err
      })
      return caught
    }
    expect(await attempt({})).toBeNull()
    expect(await attempt({ kind: 'streak_bonus', amount: 20 })).not.toBeNull()
    expect(await attempt({ streakStart: '2026-10-01', streakDays: 3 })).not.toBeNull()
    expect(
      await attempt({ kind: 'streak_bonus', amount: 20, streakStart: '2026-10-01', streakDays: 3 }),
    ).toBeNull()
  })
})
