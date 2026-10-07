import type { PgDatabase } from 'drizzle-orm/pg-core'
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>
/** Either the top-level database or a transaction. Every service accepts this. */
export type Db = PgDatabase<PostgresJsQueryResultHKT, Schema>

export function createDb(url: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle({ client, schema, casing: 'snake_case' })
  return { db, close: () => client.end() }
}
