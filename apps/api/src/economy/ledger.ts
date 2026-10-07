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
