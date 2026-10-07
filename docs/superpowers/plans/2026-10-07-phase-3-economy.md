# Phase 3 — Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completing tasks earns Supplies (task reward, milestone bonus, streak bonuses, daily bonus), reopening or deleting reverses them correctly, and the web app shows the balance, streak, daily claim and reward feedback.

**Architecture:** Pure economy rules live in `packages/shared/src/economy.ts`. The API keeps an append-only `ledger`; balance is a sum, streak days are derived from live `task_reward` entries. Rewards are written in the same transaction as complete/reopen/delete, under a project lock then a user lock. The web reads `world.economy`, patches the cached balance from reward responses and shows toasts.

**Tech Stack:** Bun 1.4 workspaces + Turborepo, TypeScript 7 strict, Hono 4.13, Drizzle 0.45 + postgres.js, Postgres 16, zod 4, React 19 + TanStack Query 5, Vitest 5 + RTL, Biome 2.5.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` — sections 3, 5, 6 and the Phase 3 addendum, section 12 (12 wins on conflict).

## Global Constraints

- Amounts: task base S=10, M=25, L=60; on-time ×1.5 floored (S=15, M=37, L=90); milestone bonus `floor(sum(base) × 0.5)`; daily 15; streak 20 @ 3 days, 50 @ 7, 200 @ 30.
- On time means: task has a `dueDate` and the completion's local date in `users.timezone` is `<= dueDate`.
- Ledger is append-only. Balance is `sum(amount)`, never stored. A *live* entry is a non-`reversal` entry with no `reversal` row whose `reverses_id` points at it.
- Every ledger insert sets `createdAt: now` (the request's injected clock).
- Lock order is always project row → user row. User lock is `FOR NO KEY UPDATE`.
- Milestone bonus: one live bonus per milestone; paid only by `/complete`; tied to the completing task (`source_task_id`).
- Streak days = local dates of live `task_reward` entries. Project and milestone deletes reverse nothing.
- Error shape `{ error: { code, message, fields? } }`; already-claimed daily bonus is `409 conflict` with message `Daily bonus already claimed today`.
- Code style: Biome — single quotes, no semicolons, width 100. TS strict with `noUncheckedIndexedAccess`.
- Commits: conventional messages, **no AI attribution or `Co-Authored-By` trailers**. Run `bun run format` at the root before each commit.
- Any `turbo.json` test task touching the DB keeps `cache: false`.
- Commands: `bun test` (in `packages/shared` or `apps/api`), `bunx vitest run` (in `apps/web`), `bun run typecheck`, `bun run lint`, `bun run test` at repo root. API tests need Postgres: `docker compose up -d postgres`.

## Review Focus

1. **Timezone day boundary** — a completion at 03:00 local on the day after the due date (still the due date in UTC) is late; a daily claim at 23:59 local and another at 00:00 local both succeed. Tests: Task 3 (`late by local date`), Task 2 (`daily claim resets at local midnight`).
2. **Concurrent completions crossing a streak threshold** in two different projects must pay exactly one streak bonus. Test: Task 3 (`concurrent completions pay one streak bonus`).
3. **Complete/reopen farming** — any number of complete→reopen→complete cycles nets exactly one set of rewards. Test: Task 3 (`toggling cannot farm`).
4. **Tasks completed before Phase 3** (done, no ledger rows) can be reopened and deleted without error and without changing the balance. Test: Task 3 (`legacy done task`).
5. **Double-tapped daily claim** — two concurrent claims produce one entry and one 409. Test: Task 2 (`concurrent claims pay once`); the web button is disabled while pending (Task 5).

---

## File Structure

```
packages/shared/src/
  economy.ts            NEW  amounts, taskReward, milestoneBonus, localDate, addDays, streak math, economySnapshot, emptyEconomy
  economy.test.ts       NEW
  dto.ts                MOD  RewardDto, EconomyDto, CompleteTaskResultDto, ReopenTaskResultDto; WorldDto.economy (Task 4)
  index.ts              MOD  export economy
apps/api/
  drizzle/0002_*.sql    NEW  generated migration
  src/db/schema.ts      MOD  ledger: source_task_id, streak_start, streak_days, check, indexes
  src/economy/ledger.ts NEW  lockUser, getBalance, liveEntries, insertEntry, reverseEntries, toRewardDto
  src/economy/service.ts NEW completionDays, getEconomy, claimDailyBonus
  src/economy/rewards.ts NEW awardCompletion, reverseCompletion
  src/economy/*.test.ts NEW
  src/tasks/service.ts  MOD  complete/reopen/delete write rewards
  src/routes/economy.ts NEW  GET /economy, POST /economy/daily-claim
  src/routes/*.test.ts  MOD/NEW
  src/world/service.ts  MOD  economy in the snapshot
  src/app.ts            MOD  mount /economy
  test/auth.ts          MOD  authedApp options { now, timezone }
apps/web/src/
  api/api.ts            MOD  economy(), claimDaily(), result types
  test/fake-api.ts      MOD  economy simulation
  economy/format.ts     NEW  formatRewards, formatReversals
  economy/format.test.ts NEW
  economy/economy-bar.tsx NEW header balance / streak / claim
  economy/use-claim-daily.ts NEW
  economy/economy-bar.test.tsx NEW
  layout/app-shell.tsx  MOD  mount EconomyBar
  tasks/use-task-actions.ts MOD reward toasts, balance patch
  tasks/task-row.tsx    MOD  delete confirm copy
  world/selectors.ts    MOD  todayIn/addDays delegate to shared
```

---

### Task 1: Shared economy rules and DTOs

**Files:**
- Create: `packages/shared/src/economy.ts`
- Create: `packages/shared/src/economy.test.ts`
- Modify: `packages/shared/src/dto.ts` (append types; do **not** touch `WorldDto` yet)
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `TaskSize`, `LedgerKind` from `./domain`.
- Produces (exact names used by later tasks):
  - `TASK_BASE_REWARD`, `ON_TIME_MULTIPLIER`, `MILESTONE_BONUS_RATE`, `DAILY_BONUS`, `STREAK_BONUSES`
  - `taskReward(size: TaskSize, dueDate: string | null, completedOn: string): number`
  - `milestoneBonus(sizes: readonly TaskSize[]): number`
  - `localDate(instant: Date, timeZone: string): string` (YYYY-MM-DD)
  - `addDays(isoDate: string, days: number): string`
  - `runEndingOn(days: ReadonlySet<string>, day: string): { start: string; length: number } | null`
  - `currentStreak(days: ReadonlySet<string>, today: string): { days: number; activeToday: boolean }`
  - `nextStreakBonus(streakDays: number): { days: number; amount: number } | null`
  - `streakWindowIntact(days: ReadonlySet<string>, start: string, length: number): boolean`
  - `economySnapshot(input: { balance: number; days: ReadonlySet<string>; today: string; claimedToday: boolean }): EconomyDto`
  - `emptyEconomy(): EconomyDto`
  - types `RewardKind`, `RewardDto`, `EconomyDto`, `CompleteTaskResultDto`, `ReopenTaskResultDto`

- [ ] **Step 1: Write the failing tests** — `packages/shared/src/economy.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import {
  addDays,
  currentStreak,
  DAILY_BONUS,
  economySnapshot,
  emptyEconomy,
  localDate,
  milestoneBonus,
  nextStreakBonus,
  runEndingOn,
  streakWindowIntact,
  taskReward,
} from './economy'

const days = (...list: string[]) => new Set(list)

describe('taskReward', () => {
  test('base rewards by size without a due date', () => {
    expect(taskReward('S', null, '2026-10-07')).toBe(10)
    expect(taskReward('M', null, '2026-10-07')).toBe(25)
    expect(taskReward('L', null, '2026-10-07')).toBe(60)
  })

  test('on or before the due date pays ×1.5, floored', () => {
    expect(taskReward('S', '2026-10-07', '2026-10-07')).toBe(15)
    expect(taskReward('M', '2026-10-07', '2026-10-01')).toBe(37)
    expect(taskReward('L', '2026-10-07', '2026-10-07')).toBe(90)
  })

  test('after the due date pays base', () => {
    expect(taskReward('M', '2026-10-07', '2026-10-08')).toBe(25)
  })
})

describe('milestoneBonus', () => {
  test('half the summed base rewards, floored', () => {
    expect(milestoneBonus(['M', 'S'])).toBe(17)
    expect(milestoneBonus(['M', 'M', 'S'])).toBe(30)
    expect(milestoneBonus(['L'])).toBe(30)
    expect(milestoneBonus([])).toBe(0)
  })
})

describe('localDate / addDays', () => {
  test('uses the given timezone, not UTC', () => {
    const instant = new Date('2026-10-06T18:00:00Z')
    expect(localDate(instant, 'Asia/Jakarta')).toBe('2026-10-07')
    expect(localDate(instant, 'UTC')).toBe('2026-10-06')
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-10-06')
  })

  test('addDays crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-10-07', 0)).toBe('2026-10-07')
  })
})

describe('streak math', () => {
  test('runEndingOn walks back over consecutive days', () => {
    const set = days('2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07')
    expect(runEndingOn(set, '2026-10-07')).toEqual({ start: '2026-10-05', length: 3 })
    expect(runEndingOn(set, '2026-10-03')).toEqual({ start: '2026-10-03', length: 1 })
    expect(runEndingOn(set, '2026-10-04')).toBeNull()
  })

  test('currentStreak counts today, else the run ending yesterday, else 0', () => {
    expect(currentStreak(days('2026-10-06', '2026-10-07'), '2026-10-07')).toEqual({
      days: 2,
      activeToday: true,
    })
    expect(currentStreak(days('2026-10-05', '2026-10-06'), '2026-10-07')).toEqual({
      days: 2,
      activeToday: false,
    })
    expect(currentStreak(days('2026-10-05'), '2026-10-07')).toEqual({
      days: 0,
      activeToday: false,
    })
  })

  test('nextStreakBonus is the first threshold above the streak', () => {
    expect(nextStreakBonus(0)).toEqual({ days: 3, amount: 20 })
    expect(nextStreakBonus(3)).toEqual({ days: 7, amount: 50 })
    expect(nextStreakBonus(29)).toEqual({ days: 30, amount: 200 })
    expect(nextStreakBonus(30)).toBeNull()
  })

  test('streakWindowIntact needs every day in the window', () => {
    const set = days('2026-10-01', '2026-10-02', '2026-10-03')
    expect(streakWindowIntact(set, '2026-10-01', 3)).toBe(true)
    expect(streakWindowIntact(set, '2026-10-01', 4)).toBe(false)
    expect(streakWindowIntact(days('2026-10-01', '2026-10-03'), '2026-10-01', 3)).toBe(false)
  })
})

describe('economySnapshot', () => {
  test('assembles balance, streak, next bonus and daily state', () => {
    const snapshot = economySnapshot({
      balance: 42,
      days: days('2026-10-06', '2026-10-07'),
      today: '2026-10-07',
      claimedToday: true,
    })
    expect(snapshot).toEqual({
      balance: 42,
      streak: { days: 2, activeToday: true, next: { days: 3, amount: 20 } },
      daily: { amount: DAILY_BONUS, claimedToday: true },
    })
  })

  test('emptyEconomy is a new user', () => {
    expect(emptyEconomy()).toEqual({
      balance: 0,
      streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
      daily: { amount: 15, claimedToday: false },
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/shared && bun test src/economy.test.ts`
Expected: FAIL — `Cannot find module './economy'`.

- [ ] **Step 3: Add the DTO types** — append to `packages/shared/src/dto.ts`

Add `LedgerKind` to the existing `./domain` type import (`import type { LedgerKind, TaskPriority, TaskSize, TaskStatus } from './domain'`), then append:

```ts
export type RewardKind = Extract<
  LedgerKind,
  'task_reward' | 'milestone_bonus' | 'streak_bonus' | 'daily_bonus'
>

export type RewardDto = {
  kind: RewardKind
  amount: number
  /** The threshold paid, on streak bonuses; null otherwise. */
  streakDays: number | null
}

export type EconomyDto = {
  balance: number
  streak: { days: number; activeToday: boolean; next: { days: number; amount: number } | null }
  daily: { amount: number; claimedToday: boolean }
}

export type CompleteTaskResultDto = {
  task: TaskDto
  milestoneCompleted: boolean
  rewards: RewardDto[]
  balance: number
}

export type ReopenTaskResultDto = {
  task: TaskDto
  milestoneReopened: boolean
  /** What was taken back; amounts are positive. */
  reversals: RewardDto[]
  balance: number
}
```

- [ ] **Step 4: Implement** — `packages/shared/src/economy.ts`

```ts
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

export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
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
```

Add `export * from './economy'` to `packages/shared/src/index.ts` (keep the list alphabetical: after `./dto`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/shared && bun test && bun run typecheck`
Expected: all shared tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add economy rules and reward DTOs"
```

---

### Task 2: Ledger schema, ledger helpers and the daily bonus service

**Files:**
- Modify: `apps/api/src/db/schema.ts` (ledger table)
- Create: `apps/api/drizzle/0002_<generated>.sql` (+ `drizzle/meta` updates) via drizzle-kit
- Create: `apps/api/src/economy/ledger.ts`
- Create: `apps/api/src/economy/service.ts`
- Create: `apps/api/src/economy/service.test.ts`
- Modify: `apps/api/src/db/schema.test.ts` (one constraint test)

**Interfaces:**
- Consumes: Task 1 exports `localDate`, `DAILY_BONUS`, `economySnapshot`, `RewardDto`, `RewardKind`, `EconomyDto`; existing `AppError` (`apps/api/src/errors.ts`), `Db` type, `AuthUser` (`apps/api/src/types.ts`: `{ id, email, timezone }`).
- Produces:
  - `ledger.ts`: `type LedgerRow`; `type NewEntry`; `lockUser(tx: Db, userId: string): Promise<void>`; `getBalance(tx: Db, userId: string): Promise<number>`; `liveEntries(tx: Db, userId: string, ...filters: SQL[]): Promise<LedgerRow[]>`; `insertEntry(tx: Db, userId: string, entry: NewEntry, now: Date): Promise<LedgerRow>`; `reverseEntries(tx: Db, userId: string, entries: LedgerRow[], now: Date): Promise<void>`; `toRewardDto(row: LedgerRow): RewardDto`
  - `service.ts`: `completionDays(tx: Db, userId: string, timeZone: string): Promise<Set<string>>`; `getEconomy(tx: Db, user: Pick<AuthUser, 'id' | 'timezone'>, now: Date): Promise<EconomyDto>`; `claimDailyBonus(db: Db, user: Pick<AuthUser, 'id' | 'timezone'>, now: Date): Promise<{ reward: RewardDto; economy: EconomyDto }>`

- [ ] **Step 1: Extend the ledger table** — in `apps/api/src/db/schema.ts`

Add `check` to the `drizzle-orm/pg-core` import list, then replace the `ledger` definition with:

```ts
export const ledger = pgTable(
  'ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: ledgerKind().notNull(),
    amount: integer().notNull(),
    refType: text(),
    refId: uuid(),
    reversesId: uuid().references((): AnyPgColumn => ledger.id),
    // The task whose completion produced this entry. No FK: entries outlive deleted tasks.
    sourceTaskId: uuid(),
    // Streak bonuses only: the run's first local day and the threshold paid.
    streakStart: date({ mode: 'string' }),
    streakDays: smallint(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_user_id_idx').on(t.userId),
    index('ledger_source_task_id_idx').on(t.sourceTaskId),
    uniqueIndex('ledger_reverses_id_unique').on(t.reversesId),
    check(
      'ledger_streak_fields',
      sql`(${t.kind} = 'streak_bonus') = (${t.streakStart} is not null and ${t.streakDays} is not null)`,
    ),
  ],
)
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && bun run db:generate`
Expected: a new `drizzle/0002_*.sql` adding three columns, one index and one check constraint. Open it and confirm it contains only those changes (no drops). Migrations run automatically in tests via `test/setup.ts`.

- [ ] **Step 3: Write the failing constraint test** — append inside the `describe('schema', …)` block of `apps/api/src/db/schema.test.ts`

```ts
  test('streak fields are required on streak bonuses and forbidden elsewhere', async () => {
    const attempt = async (entry: Partial<typeof ledger.$inferInsert>) => {
      let caught: unknown = null
      await withRollback(async (tx) => {
        const user = await insertUser(tx)
        await tx.insert(ledger).values({ userId: user.id, kind: 'task_reward', amount: 10, ...entry })
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
```

Run: `cd apps/api && bun test src/db/schema.test.ts`
Expected: PASS once Steps 1–2 are in (the migration applies on test start). If it fails with "column does not exist", the migration was not generated.

- [ ] **Step 4: Write the failing service tests** — `apps/api/src/economy/service.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { testDb, withRollback } from '../../test/db'
import { insertUser } from '../../test/fixtures'
import { AppError } from '../errors'
import { ledger, users } from '../db/schema'
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
      await insertEntry(tx, user.id, { kind: 'daily_bonus', amount: 15 }, new Date('2026-10-01T05:00:00Z'))
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
```

Run: `cd apps/api && bun test src/economy/service.test.ts`
Expected: FAIL — `Cannot find module './ledger'`.

- [ ] **Step 5: Implement the ledger helpers** — `apps/api/src/economy/ledger.ts`

```ts
import type { RewardDto, RewardKind } from '@archipelago/shared'
import { and, asc, eq, getTableColumns, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client'
import { ledger, users } from '../db/schema'

export type LedgerRow = typeof ledger.$inferSelect
export type NewEntry = Omit<
  typeof ledger.$inferInsert,
  'id' | 'userId' | 'reversesId' | 'createdAt'
>

/** Serialises balance and streak decisions per user. Always taken after any project lock. */
export async function lockUser(tx: Db, userId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
}

export async function getBalance(tx: Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${ledger.amount}), 0)::int` })
    .from(ledger)
    .where(eq(ledger.userId, userId))
  return row?.total ?? 0
}

const reversal = alias(ledger, 'reversal')

/** Entries that still count: not reversals themselves and not reversed. Oldest first. */
export async function liveEntries(tx: Db, userId: string, ...filters: SQL[]): Promise<LedgerRow[]> {
  return tx
    .select(getTableColumns(ledger))
    .from(ledger)
    .leftJoin(reversal, eq(reversal.reversesId, ledger.id))
    .where(
      and(eq(ledger.userId, userId), ne(ledger.kind, 'reversal'), isNull(reversal.id), ...filters),
    )
    .orderBy(asc(ledger.createdAt), asc(ledger.id))
}

export async function insertEntry(
  tx: Db,
  userId: string,
  entry: NewEntry,
  now: Date,
): Promise<LedgerRow> {
  const [row] = await tx
    .insert(ledger)
    .values({ ...entry, userId, createdAt: now })
    .returning()
  if (!row) throw new Error('insertEntry: no row returned')
  return row
}

export async function reverseEntries(
  tx: Db,
  userId: string,
  entries: LedgerRow[],
  now: Date,
): Promise<void> {
  if (entries.length === 0) return
  await tx.insert(ledger).values(
    entries.map((e) => ({
      userId,
      kind: 'reversal' as const,
      amount: -e.amount,
      refType: e.refType,
      refId: e.refId,
      reversesId: e.id,
      sourceTaskId: e.sourceTaskId,
      createdAt: now,
    })),
  )
}

export function toRewardDto(row: LedgerRow): RewardDto {
  // Only reward kinds are ever passed here; reversals and purchases are not rewards.
  return { kind: row.kind as RewardKind, amount: row.amount, streakDays: row.streakDays }
}
```

- [ ] **Step 6: Implement the economy service** — `apps/api/src/economy/service.ts`

```ts
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
```

Check `AppError`'s constructor in `apps/api/src/errors.ts` before use: it is `new AppError(code, message, fields?)` as used in `tasks/service.ts`.

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && bun test src/economy src/db && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db apps/api/drizzle apps/api/src/economy
git commit -m "feat(api): add ledger linkage columns, ledger helpers and daily bonus"
```

---
### Task 3: Rewards on complete, reopen and delete

**Files:**
- Create: `apps/api/src/economy/rewards.ts`
- Modify: `apps/api/src/tasks/service.ts` (`completeTask`, `reopenTask`, `deleteTask`)
- Modify: `apps/api/src/routes/tasks.ts` (pass the whole user)
- Modify: `apps/api/test/auth.ts` (`authedApp` options)
- Create: `apps/api/src/routes/task-rewards.test.ts`

**Interfaces:**
- Consumes: Task 1 (`taskReward`, `milestoneBonus`, `localDate`, `addDays`, `runEndingOn`, `streakWindowIntact`, `STREAK_BONUSES`, `CompleteTaskResultDto`, `ReopenTaskResultDto`, `RewardDto`); Task 2 (`lockUser`, `getBalance`, `liveEntries`, `insertEntry`, `reverseEntries`, `toRewardDto`, `completionDays`); existing `syncMilestoneCompletion`, `lockOwnedTaskProject`, `findOwnedTask`, `TaskRow`.
- Produces:
  - `awardCompletion(tx: Db, user: Pick<AuthUser, 'id' | 'timezone'>, task: TaskRow, milestoneCompleted: boolean, now: Date): Promise<RewardDto[]>`
  - `reverseCompletion(tx: Db, user: Pick<AuthUser, 'id' | 'timezone'>, task: Pick<TaskRow, 'id' | 'completedAt'>, now: Date): Promise<RewardDto[]>`
  - `completeTask(db, user: AuthUser, taskId, now): Promise<CompleteTaskResultDto>`; `reopenTask(db, user: AuthUser, taskId, now): Promise<ReopenTaskResultDto>`; `deleteTask(db, user: AuthUser, taskId, now): Promise<void>` — **the second parameter changes from `userId: string` to `user: AuthUser`.**
  - `authedApp(db, options?: { now?: () => Date; timezone?: string })`

- [ ] **Step 1: Let tests control the clock and timezone** — in `apps/api/test/auth.ts` change the signature and the first two lines:

```ts
/** A real app plus request helpers authenticated as a fresh user via a session cookie. */
export async function authedApp(
  db: Db,
  options: { now?: () => Date; timezone?: string } = {},
) {
  const user = await insertUser(db, { timezone: options.timezone })
  const { token } = await createSession(db, user.id, 30)
  const app = createApp({ db, config: testConfig, now: options.now })
```

`insertUser` already defaults `timezone` to `Asia/Jakarta` when given `undefined`. `requireAuth` checks session expiry against `deps.now`; the session is created with the real clock and expires 30 days later, so any test clock earlier than that (all dates here are in October 2026) authenticates.

- [ ] **Step 2: Write the failing tests** — `apps/api/src/routes/task-rewards.test.ts`

```ts
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
    opts: { milestoneId?: string | null; size?: TaskSize; dueDate?: string | null; projectId?: string } = {},
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
  return { me, project, milestone, setClock, newProject, addTask, complete, reopen, remove, balance }
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
        if (day === 3) expect(body.rewards).toContainEqual({ kind: 'streak_bonus', amount: 20, streakDays: 3 })
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
        await insertEntry(testDb, me.user.id, { kind: 'task_reward', amount: 10 }, new Date(noon(day)))
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
```

Notes for the implementer:
- `insertTask`'s random `plotX` is fine here; the legacy tasks never touch plot assignment.
- Deleting the user cascades to sessions, projects (and their tasks) and ledger rows.

Run: `cd apps/api && bun test src/routes/task-rewards.test.ts`
Expected: FAIL — rewards are `undefined` on completion responses.

- [ ] **Step 3: Implement reward rules** — `apps/api/src/economy/rewards.ts`

```ts
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
```

- [ ] **Step 4: Wire into the task service** — `apps/api/src/tasks/service.ts`

Add imports:

```ts
import type { CompleteTaskResultDto, ReopenTaskResultDto } from '@archipelago/shared'
import { getBalance } from '../economy/ledger'
import { awardCompletion, reverseCompletion } from '../economy/rewards'
import type { AuthUser } from '../types'
```

(merge the shared type import into the existing `@archipelago/shared` import line.)

Replace `deleteTask`, `completeTask` and `reopenTask` with:

```ts
export async function deleteTask(db: Db, user: AuthUser, taskId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the milestone sync sees current state.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    await tx.delete(tasks).where(eq(tasks.id, taskId))
    await syncMilestoneCompletion(tx, task.milestoneId, now)
    if (task.status === 'done') await reverseCompletion(tx, user, task, now)
  })
}

export async function completeTask(
  db: Db,
  user: AuthUser,
  taskId: string,
  now: Date,
): Promise<CompleteTaskResultDto> {
  return db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the checks below cannot be stale.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    if (task.status === 'done') throw new AppError('conflict', 'Task is already done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'done', completedAt: now, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestoneCompleted =
      (await syncMilestoneCompletion(tx, row.milestoneId, now)) === 'completed'
    const rewards = await awardCompletion(tx, user, row, milestoneCompleted, now)
    return {
      task: toTaskDto(row),
      milestoneCompleted,
      rewards,
      balance: await getBalance(tx, user.id),
    }
  })
}

export async function reopenTask(
  db: Db,
  user: AuthUser,
  taskId: string,
  now: Date,
): Promise<ReopenTaskResultDto> {
  return db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the checks below cannot be stale.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    if (task.status !== 'done') throw new AppError('conflict', 'Task is not done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'todo', completedAt: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestoneReopened =
      (await syncMilestoneCompletion(tx, row.milestoneId, now)) === 'reopened'
    const reversals = await reverseCompletion(tx, user, task, now)
    return {
      task: toTaskDto(row),
      milestoneReopened,
      reversals,
      balance: await getBalance(tx, user.id),
    }
  })
}
```

`reverseCompletion` receives the pre-update `task` row so `completedAt` is the original completion time.

- [ ] **Step 5: Pass the user from the routes** — in `apps/api/src/routes/tasks.ts` change the three calls:

```ts
      await deleteTask(db, c.get('user'), idParam(c.req.param('id'), 'Task'), now())
```
```ts
      return c.json(await completeTask(db, c.get('user'), id, now()))
```
```ts
      return c.json(await reopenTask(db, c.get('user'), id, now()))
```

Then run `grep -rn "completeTask(\|reopenTask(\|deleteTask(" apps/api/src apps/api/test` and update any other caller to pass a user object.

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && bun test && bun run typecheck`
Expected: all API tests PASS, including the existing `task-completion.test.ts`; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): pay and reverse rewards on complete, reopen and delete"
```

---
### Task 4: `/economy` routes and economy in `/world`

**Files:**
- Create: `apps/api/src/routes/economy.ts`
- Create: `apps/api/src/routes/economy.test.ts`
- Modify: `apps/api/src/app.ts` (mount `/economy`)
- Modify: `apps/api/src/world/service.ts`, `apps/api/src/routes/world.ts`, `apps/api/src/routes/world.test.ts`
- Modify: `packages/shared/src/dto.ts` (`WorldDto.economy`)
- Modify (compile fixes only): `apps/web/src/test/fake-api.ts`, `apps/web/src/world/selectors.test.ts`

**Interfaces:**
- Consumes: Task 2 `getEconomy`, `claimDailyBonus`; Task 1 `emptyEconomy`, `EconomyDto`.
- Produces:
  - `GET /api/v1/economy → { economy: EconomyDto }`; `POST /api/v1/economy/daily-claim → { reward: RewardDto; economy: EconomyDto }` (409 when already claimed).
  - `WorldDto.economy: EconomyDto`; `getWorld(db: Db, user: Pick<AuthUser, 'id' | 'timezone'>, now: Date): Promise<WorldDto>`.
  - `apps/web/src/test/fake-api.ts` exports `type WorldSeed = Omit<WorldDto, 'economy'>`; `FakeState.world` is a `WorldSeed`; `api.world()` returns `{ ...seed, economy }`.

- [ ] **Step 1: Write the failing API tests** — `apps/api/src/routes/economy.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import type { EconomyDto, ProjectDto, RewardDto, TaskDto } from '@archipelago/shared'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { testConfig } from '../../test/fixtures'
import { createApp } from '../app'

const ECONOMY = '/api/v1/economy'
const NOON = new Date('2026-10-07T05:00:00.000Z')

describe('/economy', () => {
  test('requires auth', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      expect((await app.request(ECONOMY)).status).toBe(401)
      expect((await app.request(`${ECONOMY}/daily-claim`, { method: 'POST' })).status).toBe(401)
    })
  })

  test('GET returns the empty economy for a new user, then reflects rewards', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx, { now: () => NOON })
      expect(await readJson<{ economy: EconomyDto }>(await me.get(ECONOMY))).toEqual({
        economy: {
          balance: 0,
          streak: { days: 0, activeToday: false, next: { days: 3, amount: 20 } },
          daily: { amount: 15, claimedToday: false },
        },
      })
      const { project } = await readJson<{ project: ProjectDto }>(
        await me.post('/api/v1/projects', { name: 'Beta' }),
      )
      const { task } = await readJson<{ task: TaskDto }>(
        await me.post('/api/v1/tasks', { projectId: project.id, title: 'Ship', size: 'L' }),
      )
      await me.post(`/api/v1/tasks/${task.id}/complete`)
      const { economy } = await readJson<{ economy: EconomyDto }>(await me.get(ECONOMY))
      expect(economy.balance).toBe(60)
      expect(economy.streak).toEqual({
        days: 1,
        activeToday: true,
        next: { days: 3, amount: 20 },
      })
    })
  })

  test('daily-claim pays once per day, then 409 with the error shape', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx, { now: () => NOON })
      const first = await me.post(`${ECONOMY}/daily-claim`)
      expect(first.status).toBe(200)
      const body = await readJson<{ reward: RewardDto; economy: EconomyDto }>(first)
      expect(body.reward).toEqual({ kind: 'daily_bonus', amount: 15, streakDays: null })
      expect(body.economy.balance).toBe(15)
      expect(body.economy.daily.claimedToday).toBe(true)

      const second = await me.post(`${ECONOMY}/daily-claim`)
      expect(second.status).toBe(409)
      expect(await second.json()).toEqual({
        error: { code: 'conflict', message: 'Daily bonus already claimed today' },
      })
    })
  })
})
```

Check the exact 409 body against `errorBody` in `apps/api/src/errors.ts`; if it omits `fields` when empty (it should), the assertion above holds as written.

- [ ] **Step 2: Extend the world test** — append to the `describe('GET /world', …)` block in `apps/api/src/routes/world.test.ts`

```ts
  test('includes the economy, even for a user with no islands', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const empty = await readJson<WorldDto>(await me.get(WORLD))
      expect(empty.economy.balance).toBe(0)
      expect(empty.economy.daily.claimedToday).toBe(false)
      await me.post('/api/v1/economy/daily-claim')
      const after = await readJson<WorldDto>(await me.get(WORLD))
      expect(after.economy.balance).toBe(15)
      expect(after.economy.daily.claimedToday).toBe(true)
    })
  })
```

Run: `cd apps/api && bun test src/routes/economy.test.ts src/routes/world.test.ts`
Expected: FAIL — `/economy` is 404 and `economy` is undefined.

- [ ] **Step 3: Add `economy` to `WorldDto`** — in `packages/shared/src/dto.ts`:

```ts
export type WorldDto = {
  projects: ProjectDto[]
  milestones: MilestoneDto[]
  tasks: TaskDto[]
  buildings: BuildingDto[]
  economy: EconomyDto
}
```

(`EconomyDto` is declared later in the same file; type hoisting makes the order irrelevant.)

- [ ] **Step 4: Compute economy inside the world snapshot** — `apps/api/src/world/service.ts`

Change the signature and both return sites:

```ts
import type { WorldDto } from '@archipelago/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks } from '../db/schema'
import { getEconomy } from '../economy/service'
import { toBuildingDto, toMilestoneDto, toProjectDto, toTaskDto } from '../http/serialize'
import type { AuthUser } from '../types'

export async function getWorld(
  db: Db,
  user: Pick<AuthUser, 'id' | 'timezone'>,
  now: Date,
): Promise<WorldDto> {
  // One repeatable-read snapshot, so the reads can't straddle a concurrent write.
  return db.transaction(
    async (tx) => {
      const economy = await getEconomy(tx, user, now)
      const projectRows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt)))
        .orderBy(asc(projects.createdAt), asc(projects.id))
      const ids = projectRows.map((p) => p.id)
      if (ids.length === 0) {
        return { projects: [], milestones: [], tasks: [], buildings: [], economy }
      }
```

…keep the three remaining selects unchanged, and add `economy,` to the final returned object. Update `apps/api/src/routes/world.ts`:

```ts
export function worldRoutes(deps: Deps) {
  const now = () => deps.now?.() ?? new Date()
  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json(await getWorld(deps.db, c.get('user'), now())))
}
```

Run `grep -rn "getWorld(" apps/api` and update any other caller.

- [ ] **Step 5: Add the economy routes** — `apps/api/src/routes/economy.ts`

```ts
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { claimDailyBonus, getEconomy } from '../economy/service'
import type { AppEnv, Deps } from '../types'

export function economyRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => {
      const economy = await db.transaction((tx) => getEconomy(tx, c.get('user'), now()), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
      return c.json({ economy })
    })
    .post('/daily-claim', async (c) => c.json(await claimDailyBonus(db, c.get('user'), now())))
}
```

Mount it in `apps/api/src/app.ts` after `/tasks`:

```ts
    .route('/economy', economyRoutes(deps))
```

(with `import { economyRoutes } from './routes/economy'`).

- [ ] **Step 6: Keep the web compiling** — `apps/web/src/test/fake-api.ts`

Change the shared import to include `WorldDto` and `emptyEconomy`, then:

```ts
export type WorldSeed = Omit<WorldDto, 'economy'>
export type FakeState = { user: AuthUserDto | null; password: string; world: WorldSeed }
```

In `createFakeApi`, the `seed` parameter type stays `Partial<FakeState>`. In `api.world`, return `structuredClone({ projects, milestones, tasks, buildings, economy: emptyEconomy() })` (Task 5 replaces `emptyEconomy()` with the simulated economy).

In `apps/web/src/world/selectors.test.ts`, add `economy: emptyEconomy(),` to the object returned by `sampleWorld()` and import `emptyEconomy` from `@archipelago/shared`.

- [ ] **Step 7: Run everything**

Run (repo root): `bun run typecheck && bun run test && bun run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/shared apps/api apps/web
git commit -m "feat(api): add economy routes and include economy in world"
```

---

### Task 5: Web — economy header, daily claim, fake economy

**Files:**
- Modify: `apps/web/src/api/api.ts`
- Modify: `apps/web/src/test/fake-api.ts`
- Create: `apps/web/src/economy/format.ts`, `apps/web/src/economy/format.test.ts`
- Create: `apps/web/src/economy/use-claim-daily.ts`
- Create: `apps/web/src/economy/economy-bar.tsx`, `apps/web/src/economy/economy-bar.test.tsx`
- Modify: `apps/web/src/layout/app-shell.tsx`
- Modify: `apps/web/src/world/selectors.ts` (`todayIn`, `addDays` delegate to shared)

**Interfaces:**
- Consumes: Task 1 (`taskReward`, `milestoneBonus`, `economySnapshot`, `localDate`, `addDays`, DTO types); Task 4 (`WorldDto.economy`, `WorldSeed`).
- Produces:
  - `api.economy(): Promise<{ economy: EconomyDto }>`; `api.claimDaily(): Promise<{ reward: RewardDto; economy: EconomyDto }>`; `api.completeTask(id): Promise<CompleteTaskResultDto>`; `api.reopenTask(id): Promise<ReopenTaskResultDto>`.
  - `formatRewards(rewards: RewardDto[]): string | null`; `formatReversals(reversals: RewardDto[]): string | null`.
  - `useClaimDaily()` (TanStack mutation); `<EconomyBar />`.
  - Fake API: `FakeEntry` type, `fakeEntry(overrides)` helper, `createFakeApi({ ledger?, today? })`, reward rules matching the server for task reward, milestone bonus (one live bonus), daily claim (409 when claimed). Streak bonuses are **not** simulated (server-tested); seeded `task_reward` entries still drive the displayed streak.

- [ ] **Step 1: Write the failing format tests** — `apps/web/src/economy/format.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import { formatReversals, formatRewards } from './format'

describe('formatRewards', () => {
  test('lists each reward in order', () => {
    expect(
      formatRewards([
        { kind: 'task_reward', amount: 37, streakDays: null },
        { kind: 'milestone_bonus', amount: 40, streakDays: null },
        { kind: 'streak_bonus', amount: 20, streakDays: 3 },
      ]),
    ).toBe('+37 Supplies · Milestone bonus +40 · 3-day streak +20')
    expect(formatRewards([{ kind: 'daily_bonus', amount: 15, streakDays: null }])).toBe(
      'Daily bonus +15',
    )
  })

  test('nothing to say for no rewards', () => {
    expect(formatRewards([])).toBeNull()
  })
})

describe('formatReversals', () => {
  test('totals what was taken back', () => {
    expect(
      formatReversals([
        { kind: 'task_reward', amount: 10, streakDays: null },
        { kind: 'milestone_bonus', amount: 17, streakDays: null },
      ]),
    ).toBe('27 Supplies taken back')
    expect(formatReversals([])).toBeNull()
  })
})
```

Run: `cd apps/web && bunx vitest run src/economy/format.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement** — `apps/web/src/economy/format.ts`

```ts
import type { RewardDto } from '@archipelago/shared'

function describe(reward: RewardDto): string {
  switch (reward.kind) {
    case 'task_reward':
      return `+${reward.amount} Supplies`
    case 'milestone_bonus':
      return `Milestone bonus +${reward.amount}`
    case 'streak_bonus':
      return `${reward.streakDays}-day streak +${reward.amount}`
    case 'daily_bonus':
      return `Daily bonus +${reward.amount}`
  }
}

export function formatRewards(rewards: RewardDto[]): string | null {
  return rewards.length === 0 ? null : rewards.map(describe).join(' · ')
}

export function formatReversals(reversals: RewardDto[]): string | null {
  const total = reversals.reduce((sum, r) => sum + r.amount, 0)
  return total === 0 ? null : `${total} Supplies taken back`
}
```

Run the format tests again — Expected: PASS.

- [ ] **Step 3: Type the API client** — `apps/web/src/api/api.ts`

Add `CompleteTaskResultDto`, `EconomyDto`, `ReopenTaskResultDto`, `RewardDto` to the shared type import. Replace the `completeTask` / `reopenTask` entries and add two economy entries after `world`:

```ts
    economy: async () => unwrap<{ economy: EconomyDto }>(await v1.economy.$get()),
    claimDaily: async () =>
      unwrap<{ reward: RewardDto; economy: EconomyDto }>(
        await v1.economy['daily-claim'].$post(),
      ),
```
```ts
    completeTask: async (id: string) =>
      unwrap<CompleteTaskResultDto>(await v1.tasks[':id'].complete.$post({ param: { id } })),
    reopenTask: async (id: string) =>
      unwrap<ReopenTaskResultDto>(await v1.tasks[':id'].reopen.$post({ param: { id } })),
```

Add to `apps/web/src/api/api.test.ts`:

```ts
  test('claimDaily() POSTs /api/v1/economy/daily-claim', async () => {
    const body = {
      reward: { kind: 'daily_bonus', amount: 15, streakDays: null },
      economy: { balance: 15 },
    }
    const { api, requests } = harness(() => json(body))
    expect(await api.claimDaily()).toEqual(body)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/economy/daily-claim')
  })
```

- [ ] **Step 4: Simulate the economy in the fake API** — `apps/web/src/test/fake-api.ts`

Add to the shared imports: `economySnapshot`, `type LedgerKind`, `localDate`, `milestoneBonus`, `type RewardDto`, `taskReward`, `type CompleteTaskResultDto`, `type ReopenTaskResultDto`. Then add:

```ts
export type FakeEntry = {
  kind: Exclude<LedgerKind, 'reversal'>
  amount: number
  /** Local date (YYYY-MM-DD) the entry was written. */
  day: string
  taskId: string | null
  milestoneId: string | null
  live: boolean
}

export const fakeEntry = (overrides: Partial<FakeEntry> = {}): FakeEntry => ({
  kind: 'task_reward',
  amount: 25,
  day: '2026-10-07',
  taskId: null,
  milestoneId: null,
  live: true,
  ...overrides,
})
```

Extend `FakeState` with `ledger: FakeEntry[]` and `today: string`. In `createFakeApi`:

```ts
  const state: FakeState = {
    user: seed.user === undefined ? fakeUser() : seed.user,
    password: seed.password ?? 'correct horse battery staple',
    world: seed.world ?? { projects: [], milestones: [], tasks: [], buildings: [] },
    ledger: seed.ledger ?? [],
    today: seed.today ?? localDate(new Date(), 'Asia/Jakarta'),
  }
```

Add these helpers next to `findTask`:

```ts
  const toReward = (e: FakeEntry): RewardDto => ({
    kind: e.kind as RewardDto['kind'],
    amount: e.amount,
    streakDays: null,
  })
  const pay = (entry: Omit<FakeEntry, 'day' | 'live'>): RewardDto => {
    state.ledger.push({ ...entry, day: state.today, live: true })
    return toReward(entry as FakeEntry)
  }
  const balance = () => state.ledger.reduce((sum, e) => sum + (e.live ? e.amount : 0), 0)
  const economy = () =>
    economySnapshot({
      balance: balance(),
      days: new Set(state.ledger.filter((e) => e.live && e.kind === 'task_reward').map((e) => e.day)),
      today: state.today,
      claimedToday: state.ledger.some((e) => e.kind === 'daily_bonus' && e.day === state.today),
    })
  /** Mirrors the server's milestone sync: complete iff it has tasks and all are done. */
  const syncMilestone = (milestoneId: string | null): 'completed' | 'reopened' | 'unchanged' => {
    const milestone = state.world.milestones.find((m) => m.id === milestoneId)
    if (!milestone) return 'unchanged'
    const its = state.world.tasks.filter((t) => t.milestoneId === milestone.id)
    const complete = its.length > 0 && its.every((t) => t.status === 'done')
    if (complete && milestone.completedAt === null) {
      milestone.completedAt = stamp
      return 'completed'
    }
    if (!complete && milestone.completedAt !== null) {
      milestone.completedAt = null
      return 'reopened'
    }
    return 'unchanged'
  }
  const reverseTask = (taskId: string): RewardDto[] => {
    const own = state.ledger.filter((e) => e.live && e.taskId === taskId)
    for (const e of own) e.live = false
    return own.map(toReward)
  }
```

Replace `world`'s economy with `economy: economy()`. Replace `deleteTask`, `completeTask`, `reopenTask` and add `economy` / `claimDaily`:

```ts
    deleteTask: async (id) => {
      authed('deleteTask')
      const task = findTask(id)
      state.world.tasks = state.world.tasks.filter((t) => t.id !== id)
      syncMilestone(task.milestoneId)
      if (task.status === 'done') reverseTask(id)
    },
    completeTask: async (id): Promise<CompleteTaskResultDto> => {
      authed('completeTask')
      const task = findTask(id)
      if (task.status === 'done') throw new ApiError(409, 'conflict', 'Task is already done')
      const done = replaceTask({ ...task, status: 'done', completedAt: stamp })
      const milestoneCompleted = syncMilestone(done.milestoneId) === 'completed'
      const rewards = [
        pay({
          kind: 'task_reward',
          amount: taskReward(done.size, done.dueDate, state.today),
          taskId: id,
          milestoneId: null,
        }),
      ]
      const milestoneId = done.milestoneId
      const liveBonus = state.ledger.some(
        (e) => e.live && e.kind === 'milestone_bonus' && e.milestoneId === milestoneId,
      )
      if (milestoneCompleted && milestoneId && !liveBonus) {
        const sizes = state.world.tasks.filter((t) => t.milestoneId === milestoneId).map((t) => t.size)
        rewards.push(
          pay({ kind: 'milestone_bonus', amount: milestoneBonus(sizes), taskId: id, milestoneId }),
        )
      }
      return { task: done, milestoneCompleted, rewards, balance: balance() }
    },
    reopenTask: async (id): Promise<ReopenTaskResultDto> => {
      authed('reopenTask')
      const task = findTask(id)
      if (task.status !== 'done') throw new ApiError(409, 'conflict', 'Task is not done')
      const open = replaceTask({ ...task, status: 'todo', completedAt: null })
      const milestoneReopened = syncMilestone(open.milestoneId) === 'reopened'
      return { task: open, milestoneReopened, reversals: reverseTask(id), balance: balance() }
    },
    economy: async () => {
      authed('economy')
      return { economy: economy() }
    },
    claimDaily: async () => {
      authed('claimDaily')
      if (economy().daily.claimedToday) {
        throw new ApiError(409, 'conflict', 'Daily bonus already claimed today')
      }
      const reward = pay({ kind: 'daily_bonus', amount: 15, taskId: null, milestoneId: null })
      return { reward, economy: economy() }
    },
```

Also make `createTask` and `updateTask` call `syncMilestone` for the affected milestone(s) after writing, like the server (create: the new task's milestone; update with a milestone change: old and new). This keeps the fake honest for the "one live bonus" UI path.

- [ ] **Step 5: Delegate date helpers to shared** — in `apps/web/src/world/selectors.ts`, replace the bodies of `todayIn` and `addDays`:

```ts
import { addDays as sharedAddDays, localDate } from '@archipelago/shared'

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDate(now, timeZone)
}

export const addDays = sharedAddDays
```

(merge with the existing type import line from `@archipelago/shared`; existing selector tests must stay green unchanged.)

- [ ] **Step 6: Write the failing header tests** — `apps/web/src/economy/economy-bar.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeEntry } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays } from '../world/selectors'

const TODAY = '2026-10-07'

describe('EconomyBar', () => {
  test('shows balance and streak; no claim button once claimed', async () => {
    const { api } = createFakeApi({
      today: TODAY,
      ledger: [
        fakeEntry({ day: addDays(TODAY, -1), amount: 25 }),
        fakeEntry({ day: TODAY, amount: 25 }),
        fakeEntry({ kind: 'daily_bonus', day: TODAY, amount: 15 }),
      ],
    })
    renderApp({ api, path: '/' })
    expect(await screen.findByLabelText('65 Supplies')).toBeInTheDocument()
    expect(screen.getByLabelText('2-day streak')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull()
  })

  test('claiming the daily bonus updates the balance and hides the button', async () => {
    const { api, calls } = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Claim +15' }))
    expect(await screen.findByLabelText('15 Supplies')).toBeInTheDocument()
    expect(screen.getByText('Daily bonus +15')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim +15' })).toBeNull()
    expect(calls.filter((c) => c === 'claimDaily')).toHaveLength(1)
  })

  test('an already-claimed conflict shows the server message and refreshes', async () => {
    const fake = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api: fake.api, path: '/' })
    const claim = await screen.findByRole('button', { name: 'Claim +15' })
    // Claimed elsewhere (another tab) after this page loaded.
    fake.state.ledger.push(fakeEntry({ kind: 'daily_bonus', day: TODAY, amount: 15 }))
    await user.click(claim)
    expect(await screen.findByText('Daily bonus already claimed today')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim +15' })).toBeNull())
    expect(screen.getByLabelText('15 Supplies')).toBeInTheDocument()
  })

  test('a negative balance is shown in the error colour', async () => {
    const { api } = createFakeApi({
      today: TODAY,
      ledger: [fakeEntry({ kind: 'purchase', amount: -40, day: TODAY })],
    })
    renderApp({ api, path: '/' })
    expect(await screen.findByLabelText('-40 Supplies')).toHaveClass('text-error')
  })
})
```

Run: `cd apps/web && bunx vitest run src/economy` — Expected: FAIL (no `EconomyBar`).

- [ ] **Step 7: Implement the claim hook** — `apps/web/src/economy/use-claim-daily.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'
import { formatRewards } from './format'

export function useClaimDaily() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: () => api.claimDaily(),
    onSuccess: ({ reward, economy }) => {
      queryClient.setQueryData(key, (world) => (world ? { ...world, economy } : world))
      const message = formatRewards([reward])
      if (message) toast.show(message)
    },
    onError: (error) => {
      toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      // A conflict means our cached economy is stale; any other failure might be too.
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
```

- [ ] **Step 8: Implement the bar** — `apps/web/src/economy/economy-bar.tsx`

```tsx
import { useWorld } from '../world/use-world'
import { useClaimDaily } from './use-claim-daily'

const pill = 'rounded-full bg-surface-primary px-3 py-1 text-sm font-semibold tabular-nums'

export function EconomyBar() {
  const { data: world } = useWorld()
  const claim = useClaimDaily()
  if (!world) return null
  const { balance, streak, daily } = world.economy
  const next = streak.next ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}` : ''

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-label={`${balance} Supplies`}
        className={`${pill} ${balance < 0 ? 'text-error' : 'text-text-primary'}`}
      >
        ◆ {balance}
      </span>
      <span
        aria-label={`${streak.days}-day streak`}
        title={next}
        className={`${pill} ${streak.activeToday ? 'text-warning' : 'text-text-secondary'}`}
      >
        {streak.days}d
      </span>
      {!daily.claimedToday && (
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
          className="min-h-11 rounded-md bg-brand-secondary px-3 text-sm font-semibold text-text-on-brand disabled:opacity-60"
        >
          Claim +{daily.amount}
        </button>
      )}
    </div>
  )
}
```

The streak pill is `text-warning` (amber) while today already counts and `text-text-secondary` while the streak is only being carried from yesterday.

- [ ] **Step 9: Mount it in the header** — `apps/web/src/layout/app-shell.tsx`

Import `EconomyBar` from `../economy/economy-bar`. Replace the header contents so the brand collapses below 640px and the economy sits between brand and logout:

```tsx
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 bg-brand pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-text-on-brand">
        <Link to="/" aria-label="Archipelago" className="flex min-h-11 items-center font-semibold">
          <span aria-hidden className="sm:hidden">
            ⛵
          </span>
          <span aria-hidden className="hidden sm:inline">
            Archipelago
          </span>
        </Link>
        <EconomyBar />
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="min-h-11 shrink-0 rounded-md px-3 text-sm hover:bg-brand-secondary"
        >
          Log out
        </button>
      </header>
```

Run `grep -rn "'Archipelago'\|name: /Archipelago/\|getByText('Archipelago')" apps/web/src` and fix any test that found the brand by visible text: the link's accessible name stays `Archipelago`, so `getByRole('link', { name: 'Archipelago' })` keeps working.

- [ ] **Step 10: Run the web suite**

Run: `cd apps/web && bunx vitest run && bun run typecheck` then `bun run lint` at the root.
Expected: all green, including the pre-existing world-screen, task-panel and forms tests.

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): show Supplies, streak and daily bonus claim in the header"
```

---

### Task 6: Web — reward feedback on task actions

**Files:**
- Modify: `apps/web/src/tasks/use-task-actions.ts`
- Modify: `apps/web/src/tasks/task-row.tsx`
- Modify: `apps/web/src/tasks/task-panel.test.tsx`

**Interfaces:**
- Consumes: Task 5 `formatRewards`, `formatReversals`, typed `api.completeTask` / `api.reopenTask`, fake economy (`createFakeApi({ today, ledger })`, `fakeMilestone`).
- Produces: completing shows one reward toast and patches `world.economy.balance` from the response; reopening that took Supplies back shows a toast; deleting a done task warns in the confirm prompt.

- [ ] **Step 1: Write the failing tests** — add to `apps/web/src/tasks/task-panel.test.tsx` (inside `describe('TaskPanel', …)`), adding `fakeMilestone` to the fake-api import:

```tsx
  test('completing shows the rewards and updates the balance; reopening takes them back', async () => {
    const project = fakeProject({ name: 'Beta' })
    const mvp = fakeMilestone({ projectId: project.id, name: 'MVP' })
    const { api } = createFakeApi({
      today: '2026-10-07',
      world: {
        projects: [project],
        milestones: [mvp],
        tasks: [
          fakeTask({ projectId: project.id, milestoneId: mvp.id, title: 'Only', size: 'M', status: 'doing' }),
        ],
        buildings: [],
      },
    })
    const { user } = renderApp({ api, path: `/p/${project.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Mark "Only" as done' }))
    expect(await screen.findByText('+25 Supplies · Milestone bonus +12')).toBeInTheDocument()
    expect(await screen.findByLabelText('37 Supplies')).toBeInTheDocument()

    const undo = await screen.findByRole('button', { name: 'Mark "Only" as not done' })
    await waitFor(() => expect(undo).toBeEnabled())
    await user.click(undo)
    expect(await screen.findByText('37 Supplies taken back')).toBeInTheDocument()
    expect(await screen.findByLabelText('0 Supplies')).toBeInTheDocument()
  })

  test('deleting a done task warns that its Supplies will be taken back', async () => {
    const { api, path } = islandWith([{ title: 'Finished', status: 'done', completedAt: '2026-10-07T00:00:00.000Z' }])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = renderApp({ api, path, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Delete "Finished"' }))
    expect(confirm).toHaveBeenCalledWith('Delete "Finished"? Its Supplies will be taken back.')
    confirm.mockRestore()
  })
```

Also make the existing timezone test discriminating (parked from the Phase 2b review): in `'due state follows the user timezone, not the machine clock'`, change the task's due date to `'2026-10-06'` and the assertions to:

```tsx
      const { api, path } = islandWith([{ title: 'Jakarta day', dueDate: '2026-10-06' }])
      renderApp({ api, path, desktop: true })
      // In UTC it is still Oct 6 (due today); in Jakarta it is Oct 7, so the task is overdue.
      expect(
        await within(await findPanel()).findByText('Overdue · 2026-10-06'),
      ).toBeInTheDocument()
      expect(within(panel()).queryByText(/Due soon/)).toBeNull()
```

and update the comment above `vi.useFakeTimers` to match.

Run: `cd apps/web && bunx vitest run src/tasks` — Expected: the two new tests FAIL (no toast, old confirm text); the timezone test PASSES (it should already discriminate correctly — if it fails, stop and report: the app is using the machine clock).

- [ ] **Step 2: Reward feedback in the task actions** — `apps/web/src/tasks/use-task-actions.ts`

Add imports:

```ts
import type { CompleteTaskResultDto, ReopenTaskResultDto } from '@archipelago/shared'
import { formatReversals, formatRewards } from '../economy/format'
```

(merge into the existing `@archipelago/shared` type import.)

Inside `useWorldCache`'s returned object add:

```ts
    reward(result: AdvanceResult) {
      if (!('balance' in result)) return
      edit((w) => ({ ...w, economy: { ...w.economy, balance: result.balance } }))
      const message =
        'rewards' in result ? formatRewards(result.rewards) : formatReversals(result.reversals)
      if (message) toast.show(message)
    },
```

Above `advanceRequest` add the result type and annotate the function:

```ts
type AdvanceResult = { task: TaskDto } | CompleteTaskResultDto | ReopenTaskResultDto

function advanceRequest(api: Api, task: TaskDto): Promise<AdvanceResult> {
```

In `useAdvanceTask` add `onSuccess: (result) => cache.reward(result),` between `onError` and `onSettled`.

The balance patch is immediate; the existing `settle()` refetch still replaces the whole economy (streak, daily) once the last task action finishes.

- [ ] **Step 3: Warn when deleting a done task** — `apps/web/src/tasks/task-row.tsx`

```tsx
  const onDelete = () => {
    const prompt =
      task.status === 'done'
        ? `Delete "${task.title}"? Its Supplies will be taken back.`
        : `Delete "${task.title}"?`
    if (window.confirm(prompt)) remove.mutate(task)
  }
```

- [ ] **Step 4: Run everything**

Run (repo root): `bun run typecheck && bun run test && bun run lint && bun run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): show reward feedback when completing and reopening tasks"
```

