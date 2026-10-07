import {
  DAILY_BONUS,
  type EconomyDto,
  economySnapshot,
  localDate,
  type RewardDto,
} from '@archipelago/shared'
import { and, eq, gte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { ledger } from '../db/schema'
import { AppError } from '../errors'
import type { AuthUser } from '../types'
import { getBalance, insertEntry, liveEntries, lockUser, toRewardDto } from './ledger'

type EconomyUser = Pick<AuthUser, 'id' | 'timezone'>

// Wider than any UTC offset (±14h) on both sides of a local day.
const DAILY_LOOKBACK_MS = 48 * 60 * 60 * 1000

export async function completionDays(
  tx: Db,
  userId: string,
  timeZone: string,
): Promise<Set<string>> {
  const rewards = await liveEntries(tx, userId, eq(ledger.kind, 'task_reward'))
  return new Set(rewards.map((r) => localDate(r.createdAt, timeZone)))
}

async function dailyClaimedToday(tx: Db, user: EconomyUser, now: Date): Promise<boolean> {
  const today = localDate(now, user.timezone)
  const recent = await tx
    .select({ createdAt: ledger.createdAt })
    .from(ledger)
    .where(
      and(
        eq(ledger.userId, user.id),
        eq(ledger.kind, 'daily_bonus'),
        gte(ledger.createdAt, new Date(now.getTime() - DAILY_LOOKBACK_MS)),
      ),
    )
  return recent.some((r) => localDate(r.createdAt, user.timezone) === today)
}

export async function getEconomy(tx: Db, user: EconomyUser, now: Date): Promise<EconomyDto> {
  const balance = await getBalance(tx, user.id)
  const days = await completionDays(tx, user.id, user.timezone)
  const claimedToday = await dailyClaimedToday(tx, user, now)
  return economySnapshot({ balance, days, today: localDate(now, user.timezone), claimedToday })
}

export async function claimDailyBonus(
  db: Db,
  user: EconomyUser,
  now: Date,
): Promise<{ reward: RewardDto; economy: EconomyDto }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    if (await dailyClaimedToday(tx, user, now)) {
      throw new AppError('conflict', 'Daily bonus already claimed today')
    }
    const row = await insertEntry(tx, user.id, { kind: 'daily_bonus', amount: DAILY_BONUS }, now)
    return { reward: toRewardDto(row), economy: await getEconomy(tx, user, now) }
  })
}
