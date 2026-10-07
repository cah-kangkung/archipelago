import { hashPassword } from '../src/auth/passwords'
import type { Config } from '../src/config'
import type { Db } from '../src/db/client'
import { users } from '../src/db/schema'

export async function insertUser(
  db: Db,
  overrides: { email?: string; timezone?: string; passwordHash?: string } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${crypto.randomUUID()}@example.com`,
      timezone: overrides.timezone ?? 'Asia/Jakarta',
      passwordHash: overrides.passwordHash ?? 'not-a-real-hash',
    })
    .returning()
  if (!user) throw new Error('insertUser: no row returned')
  return user
}

export const testConfig: Config = {
  databaseUrl: process.env.DATABASE_URL_TEST ?? '',
  port: 0,
  cookieSecure: true,
  trustProxy: true,
  sessionTtlDays: 30,
}

export async function insertUserWithPassword(
  db: Db,
  overrides: { email?: string; timezone?: string } = {},
) {
  const password = 'correct horse battery staple'
  const user = await insertUser(db, { ...overrides, passwordHash: await hashPassword(password) })
  return { user, password }
}
