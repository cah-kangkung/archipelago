import {
  addDays,
  localDate,
  milestoneBonus,
  type RewardDto,
  runEndingOn,
  STREAK_BONUSES,
  streakWindowIntact,
  taskReward,
} from '@archipelago/shared'
import { eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { ledger, tasks } from '../db/schema'
import type { AuthUser } from '../types'
import type { TaskRow } from '../world/plots'
import {
  insertEntry,
  type LedgerRow,
  liveEntries,
  lockUser,
  reverseEntries,
  toRewardDto,
} from './ledger'
import { completionDays } from './service'

type EconomyUser = Pick<AuthUser, 'id' | 'timezone'>

/**
 * Pays for a completion that has just been written. Call after the milestone sync, inside the
 * transaction that holds the project lock (lock order: project → user).
 */
export async function awardCompletion(
  tx: Db,
  user: EconomyUser,
  task: TaskRow,
  milestoneCompleted: boolean,
  now: Date,
): Promise<RewardDto[]> {
  await lockUser(tx, user.id)
  const today = localDate(now, user.timezone)
  const paid: LedgerRow[] = []

  paid.push(
    await insertEntry(
      tx,
      user.id,
      {
        kind: 'task_reward',
        amount: taskReward(task.size, task.dueDate, today),
        refType: 'task',
        refId: task.id,
        sourceTaskId: task.id,
      },
      now,
    ),
  )

  if (milestoneCompleted && task.milestoneId) {
    const live = await liveEntries(
      tx,
      user.id,
      eq(ledger.kind, 'milestone_bonus'),
      eq(ledger.refId, task.milestoneId),
    )
    if (live.length === 0) {
      const sizes = await tx
        .select({ size: tasks.size })
        .from(tasks)
        .where(eq(tasks.milestoneId, task.milestoneId))
      paid.push(
        await insertEntry(
          tx,
          user.id,
          {
            kind: 'milestone_bonus',
            amount: milestoneBonus(sizes.map((s) => s.size)),
            refType: 'milestone',
            refId: task.milestoneId,
            sourceTaskId: task.id,
          },
          now,
        ),
      )
    }
  }

  const run = runEndingOn(await completionDays(tx, user.id, user.timezone), today)
  if (run) {
    const already = await liveEntries(
      tx,
      user.id,
      eq(ledger.kind, 'streak_bonus'),
      eq(ledger.streakStart, run.start),
    )
    for (const bonus of STREAK_BONUSES) {
      if (bonus.days > run.length || already.some((e) => e.streakDays === bonus.days)) continue
      paid.push(
        await insertEntry(
          tx,
          user.id,
          {
            kind: 'streak_bonus',
            amount: bonus.amount,
            sourceTaskId: task.id,
            streakStart: run.start,
            streakDays: bonus.days,
          },
          now,
        ),
      )
    }
  }

  return paid.map(toRewardDto)
}

/**
 * Takes back what a completion earned: its own task reward and milestone bonus, then any streak
 * bonus whose window contained the completion day and is no longer intact. Call after the task's
 * status change (or deletion), under the project lock.
 */
export async function reverseCompletion(
  tx: Db,
  user: EconomyUser,
  task: Pick<TaskRow, 'id' | 'completedAt'>,
  now: Date,
): Promise<RewardDto[]> {
  await lockUser(tx, user.id)
  const own = await liveEntries(
    tx,
    user.id,
    eq(ledger.sourceTaskId, task.id),
    ne(ledger.kind, 'streak_bonus'),
  )
  await reverseEntries(tx, user.id, own, now)

  let broken: LedgerRow[] = []
  if (task.completedAt) {
    const day = localDate(task.completedAt, user.timezone)
    const days = await completionDays(tx, user.id, user.timezone)
    const streaks = await liveEntries(tx, user.id, eq(ledger.kind, 'streak_bonus'))
    broken = streaks.filter((s) => {
      if (s.streakStart === null || s.streakDays === null) return false
      const end = addDays(s.streakStart, s.streakDays - 1)
      return (
        s.streakStart <= day && day <= end && !streakWindowIntact(days, s.streakStart, s.streakDays)
      )
    })
    await reverseEntries(tx, user.id, broken, now)
  }

  return [...own, ...broken].map(toRewardDto)
}
