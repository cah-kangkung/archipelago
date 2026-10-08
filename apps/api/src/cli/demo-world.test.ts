import { describe, expect, test } from 'bun:test'
import { addDays, DECORATION_TYPES, localDate } from '@archipelago/shared'
import { eq, inArray } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks, users } from '../db/schema'
import { getEconomy } from '../economy/service'
import { DEMO_ACCOUNTS, DEMO_TIMEZONE, seedDemoWorld } from './demo-world'

// Midday in Jakarta, so "today" and "minutes ago" never straddle midnight.
const now = new Date('2026-10-08T12:00:00+07:00')
const today = localDate(now, DEMO_TIMEZONE)

async function account(tx: Db, email: string) {
  const [user] = await tx.select().from(users).where(eq(users.email, email))
  if (!user) throw new Error(`no ${email}`)
  const owned = await tx.select().from(projects).where(eq(projects.userId, user.id))
  const ids = owned.map((p) => p.id)
  const ts = ids.length ? await tx.select().from(tasks).where(inArray(tasks.projectId, ids)) : []
  const ms = ids.length
    ? await tx.select().from(milestones).where(inArray(milestones.projectId, ids))
    : []
  const bs = ids.length
    ? await tx.select().from(buildings).where(inArray(buildings.projectId, ids))
    : []
  const economy = await getEconomy(tx, user, now)
  return { user, projects: owned, tasks: ts, milestones: ms, buildings: bs, economy }
}

const doneCount = (a: Awaited<ReturnType<typeof account>>, projectId: string) =>
  a.tasks.filter((t) => t.projectId === projectId && t.status === 'done').length

describe('seedDemoWorld', () => {
  test('demo: one active island per growth stage, plus an archived one', async () => {
    await withRollback(async (tx) => {
      await seedDemoWorld(tx, now)
      const demo = await account(tx, DEMO_ACCOUNTS.demo)
      const active = demo.projects.filter((p) => p.archivedAt === null)
      const counts = active.map((p) => doneCount(demo, p.id)).sort((a, b) => b - a)
      // Stages start at 3, 8, 15 and 30 finished tasks (spec 18.1).
      expect(counts).toHaveLength(5)
      expect(counts[0]).toBeGreaterThanOrEqual(30)
      expect(counts[1]).toBeGreaterThanOrEqual(15)
      expect(counts[1]).toBeLessThan(30)
      expect(counts[2]).toBeGreaterThanOrEqual(8)
      expect(counts[2]).toBeLessThan(15)
      expect(counts[3]).toBeGreaterThanOrEqual(3)
      expect(counts[3]).toBeLessThan(8)
      expect(counts[4]).toBe(0)
      expect(demo.projects.filter((p) => p.archivedAt !== null)).toHaveLength(1)
    })
  })

  test('demo: every task look, milestone state and decoration is present', async () => {
    await withRollback(async (tx) => {
      await seedDemoWorld(tx, now)
      const demo = await account(tx, DEMO_ACCOUNTS.demo)
      const open = demo.tasks.filter((t) => t.status !== 'done')
      expect(demo.tasks.some((t) => t.status === 'doing')).toBe(true)
      expect(demo.tasks.some((t) => t.status === 'todo' && t.dueDate === null)).toBe(true)
      for (const size of ['S', 'M', 'L'] as const) {
        expect(demo.tasks.some((t) => t.status === 'done' && t.size === size)).toBe(true)
      }
      // Storm: overdue. Lantern: due within 48h.
      expect(open.some((t) => t.dueDate !== null && t.dueDate < today)).toBe(true)
      expect(
        open.some(
          (t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= addDays(today, 2),
        ),
      ).toBe(true)

      const tasksOf = (id: string) => demo.tasks.filter((t) => t.milestoneId === id)
      expect(demo.milestones.some((m) => m.completedAt !== null)).toBe(true)
      expect(demo.milestones.some((m) => tasksOf(m.id).length === 0)).toBe(true)
      expect(
        demo.milestones.some((m) => {
          const ts = tasksOf(m.id)
          return ts.some((t) => t.status === 'done') && ts.some((t) => t.status !== 'done')
        }),
      ).toBe(true)

      const placed = new Set(demo.buildings.map((b) => b.type))
      for (const type of DECORATION_TYPES) expect(placed.has(type)).toBe(true)
    })
  })

  test('demo: an 8-day streak active today, daily bonus open, Supplies to spend, life on the sea', async () => {
    await withRollback(async (tx) => {
      await seedDemoWorld(tx, now)
      const demo = await account(tx, DEMO_ACCOUNTS.demo)
      expect(demo.economy.streak).toMatchObject({ days: 8, activeToday: true })
      expect(demo.economy.streak.next?.days).toBe(30)
      expect(demo.economy.daily.claimedToday).toBe(false)
      expect(demo.economy.balance).toBeGreaterThanOrEqual(350)

      const day = 24 * 60 * 60 * 1000
      const recent = demo.tasks.filter(
        (t) => t.completedAt && now.getTime() - t.completedAt.getTime() < 7 * day,
      )
      expect(recent.length).toBeGreaterThanOrEqual(10)
      const gullIslands = new Set(
        demo.tasks
          .filter((t) => t.completedAt && now.getTime() - t.completedAt.getTime() < day)
          .map((t) => t.projectId),
      )
      expect(gullIslands.size).toBeGreaterThanOrEqual(3)
      for (const t of demo.tasks) {
        if (t.completedAt) expect(t.completedAt.getTime()).toBeLessThanOrEqual(now.getTime())
      }
    })
  })

  test('lapsed: streak alive from yesterday but not today, daily claimed, too poor to shop', async () => {
    await withRollback(async (tx) => {
      await seedDemoWorld(tx, now)
      const lapsed = await account(tx, DEMO_ACCOUNTS.lapsed)
      expect(lapsed.economy.streak).toMatchObject({ days: 2, activeToday: false })
      expect(lapsed.economy.daily.claimedToday).toBe(true)
      expect(lapsed.economy.balance).toBeLessThan(30) // the cheapest item, a pine, costs 30
      expect(lapsed.projects.filter((p) => p.archivedAt === null)).toHaveLength(2)
    })
  })

  test('empty: an account with no islands', async () => {
    await withRollback(async (tx) => {
      await seedDemoWorld(tx, now)
      const empty = await account(tx, DEMO_ACCOUNTS.empty)
      expect(empty.projects).toEqual([])
      expect(empty.economy.balance).toBe(0)
    })
  })
})
