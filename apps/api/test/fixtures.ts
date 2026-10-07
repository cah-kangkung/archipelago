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
