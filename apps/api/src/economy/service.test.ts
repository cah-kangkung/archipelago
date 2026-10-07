import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { testDb, withRollback } from '../../test/db'
import { insertUser } from '../../test/fixtures'
import { ledger, users } from '../db/schema'
import { AppError } from '../errors'
import { getBalance, insertEntry, liveEntries, reverseEntries } from './ledger'
import { claimDailyBonus, completionDays, getEconomy } from './service'

// 2026-10-07 23:59 and 2026-10-08 00:00 in Asia/Jakarta (UTC+7).
const LATE_EVENING = new Date('2026-10-07T16:59:00Z')
const MIDNIGHT = new Date('2026-10-07T17:00:00Z')

describe('ledger helpers', () => {
  test('balance sums every entry, reversals included', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      expect(await getBalance(tx, user.id)).toBe(0)
      const a = await insertEntry(tx, user.id, { kind: 'task_reward', amount: 25 }, MIDNIGHT)
      await insertEntry(tx, user.id, { kind: 'daily_bonus', amount: 15 }, MIDNIGHT)
      await reverseEntries(tx, user.id, [a], MIDNIGHT)
      expect(await getBalance(tx, user.id)).toBe(15)
    })
  })

  test('liveEntries skips reversals and reversed entries', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const a = await insertEntry(tx, user.id, { kind: 'task_reward', amount: 25 }, MIDNIGHT)
      const b = await insertEntry(tx, user.id, { kind: 'task_reward', amount: 10 }, MIDNIGHT)
      await reverseEntries(tx, user.id, [a], MIDNIGHT)
      expect((await liveEntries(tx, user.id)).map((e) => e.id)).toEqual([b.id])
      const [reversal] = await tx.select().from(ledger).where(eq(ledger.reversesId, a.id))
      expect(reversal).toMatchObject({ kind: 'reversal', amount: -25 })
      expect(reversal?.createdAt.toISOString()).toBe(MIDNIGHT.toISOString())
    })
  })

  test('completionDays are the local dates of live task rewards', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      await insertEntry(tx, user.id, { kind: 'task_reward', amount: 10 }, LATE_EVENING)
      const late = await insertEntry(tx, user.id, { kind: 'task_reward', amount: 10 }, MIDNIGHT)
      await insertEntry(
        tx,
        user.id,
        { kind: 'daily_bonus', amount: 15 },
        new Date('2026-10-01T05:00:00Z'),
      )
      expect([...(await completionDays(tx, user.id, 'Asia/Jakarta'))].sort()).toEqual([
        '2026-10-07',
        '2026-10-08',
      ])
      await reverseEntries(tx, user.id, [late], MIDNIGHT)
      expect([...(await completionDays(tx, user.id, 'Asia/Jakarta'))]).toEqual(['2026-10-07'])
    })
  })
})

describe('getEconomy', () => {
  test('a new user has the empty economy', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      expect(await getEconomy(tx, user, MIDNIGHT)).toEqual({
        balance: 0,
        streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
        daily: { amount: 15, claimedToday: false },
      })
    })
  })
})

describe('claimDailyBonus', () => {
  test('pays 15 once per local day', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { timezone: 'Asia/Jakarta' })
      const first = await claimDailyBonus(tx, user, MIDNIGHT)
      expect(first.reward).toEqual({ kind: 'daily_bonus', amount: 15, streakDays: null })
      expect(first.economy.balance).toBe(15)
      expect(first.economy.daily.claimedToday).toBe(true)

      const again = await claimDailyBonus(tx, user, new Date('2026-10-08T10:00:00Z')).catch(
        (err: unknown) => err,
      )
      expect(again).toBeInstanceOf(AppError)
      expect((again as AppError).code).toBe('conflict')
      expect((again as AppError).message).toBe('Daily bonus already claimed today')
    })
  })

  test('daily claim resets at local midnight', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { timezone: 'Asia/Jakarta' })
      await claimDailyBonus(tx, user, LATE_EVENING)
      const next = await claimDailyBonus(tx, user, MIDNIGHT)
      expect(next.economy.balance).toBe(30)
    })
  })

  test('concurrent claims pay once', async () => {
    // Real transactions on separate connections: withRollback would serialise them.
    const user = await insertUser(testDb, { timezone: 'Asia/Jakarta' })
    try {
      const results = await Promise.allSettled([
        claimDailyBonus(testDb, user, MIDNIGHT),
        claimDailyBonus(testDb, user, MIDNIGHT),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected')
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AppError)
      expect(await getBalance(testDb, user.id)).toBe(15)
    } finally {
      await testDb.delete(users).where(eq(users.id, user.id))
    }
  })
})
