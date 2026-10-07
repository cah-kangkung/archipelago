import type { TaskSize } from './domain'
import type { EconomyDto } from './dto'

export const TASK_BASE_REWARD: Readonly<Record<TaskSize, number>> = { S: 10, M: 25, L: 60 }
export const ON_TIME_MULTIPLIER = 1.5
export const MILESTONE_BONUS_RATE = 0.5
export const DAILY_BONUS = 15
export const STREAK_BONUSES = [
  { days: 3, amount: 20 },
  { days: 7, amount: 50 },
  { days: 30, amount: 200 },
] as const

/** `completedOn` is the completion's local date (YYYY-MM-DD) in the user's timezone. */
export function taskReward(size: TaskSize, dueDate: string | null, completedOn: string): number {
  const base = TASK_BASE_REWARD[size]
  return dueDate !== null && completedOn <= dueDate ? Math.floor(base * ON_TIME_MULTIPLIER) : base
}

export function milestoneBonus(sizes: readonly TaskSize[]): number {
  const sum = sizes.reduce((total, size) => total + TASK_BASE_REWARD[size], 0)
  return Math.floor(sum * MILESTONE_BONUS_RATE)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export function localDate(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    // en-CA formats as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter.format(instant)
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The run of consecutive days ending on `day`, or null when `day` itself has no completion. */
export function runEndingOn(
  days: ReadonlySet<string>,
  day: string,
): { start: string; length: number } | null {
  if (!days.has(day)) return null
  let start = day
  let length = 1
  while (days.has(addDays(start, -1))) {
    start = addDays(start, -1)
    length += 1
  }
  return { start, length }
}

/** A streak survives until the end of the day after its last completion. */
export function currentStreak(
  days: ReadonlySet<string>,
  today: string,
): { days: number; activeToday: boolean } {
  const run = runEndingOn(days, today) ?? runEndingOn(days, addDays(today, -1))
  return { days: run?.length ?? 0, activeToday: days.has(today) }
}

export function nextStreakBonus(streakDays: number): { days: number; amount: number } | null {
  const next = STREAK_BONUSES.find((bonus) => bonus.days > streakDays)
  return next ? { days: next.days, amount: next.amount } : null
}

export function streakWindowIntact(
  days: ReadonlySet<string>,
  start: string,
  length: number,
): boolean {
  for (let i = 0; i < length; i += 1) {
    if (!days.has(addDays(start, i))) return false
  }
  return true
}

export function economySnapshot(input: {
  balance: number
  days: ReadonlySet<string>
  today: string
  claimedToday: boolean
}): EconomyDto {
  const streak = currentStreak(input.days, input.today)
  return {
    balance: input.balance,
    streak: { ...streak, next: nextStreakBonus(streak.days) },
    daily: { amount: DAILY_BONUS, claimedToday: input.claimedToday },
  }
}

export function emptyEconomy(): EconomyDto {
  return economySnapshot({ balance: 0, days: new Set(), today: '1970-01-01', claimedToday: false })
}
