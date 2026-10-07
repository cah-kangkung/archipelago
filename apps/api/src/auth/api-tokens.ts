import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { apiTokens, users } from '../db/schema'
import type { AuthUser } from '../types'
import { generateToken, sha256Hex } from './crypto'

export const API_TOKEN_PREFIX = 'arch_'

export type ApiTokenView = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

const toView = (row: typeof apiTokens.$inferSelect): ApiTokenView => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
})

export async function createApiToken(
  db: Db,
  userId: string,
  name: string,
): Promise<{ token: string; apiToken: ApiTokenView }> {
  const token = generateToken(API_TOKEN_PREFIX)
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: sha256Hex(token) })
    .returning()
  if (!row) throw new Error('createApiToken: no row returned')
  return { token, apiToken: toView(row) }
}

export async function listApiTokens(db: Db, userId: string): Promise<ApiTokenView[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(toView)
}

export async function deleteApiToken(db: Db, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id })
  return deleted.length > 0
}

export async function findApiTokenUser(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null
  const [match] = await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(eq(apiTokens.tokenHash, sha256Hex(token)))
    .returning({ userId: apiTokens.userId })
  if (!match) return null
  const [user] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, match.userId))
    .limit(1)
  return user ?? null
}
