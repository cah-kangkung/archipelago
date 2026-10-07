import { and, eq, gt, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema'
import type { AuthUser } from '../types'
import { generateToken, sha256Hex } from './crypto'

const DAY_MS = 86_400_000

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken()
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS)
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)))
  await db.insert(sessions).values({ id: sha256Hex(token), userId, expiresAt })
  return { token, expiresAt }
}

export async function findSessionUser(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  if (token === '') return null
  const [row] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, now)))
    .limit(1)
  return row ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)))
}
