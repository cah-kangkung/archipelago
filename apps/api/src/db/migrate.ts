import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { Database } from './client'

const MIGRATIONS_FOLDER = new URL('../../drizzle', import.meta.url).pathname

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
