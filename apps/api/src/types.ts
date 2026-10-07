import type { Config } from './config'
import type { Db } from './db/client'

export type AuthUser = { id: string; email: string; timezone: string }

export type Deps = {
  db: Db
  config: Config
  now?: () => Date
}

export type AppEnv = { Variables: { user: AuthUser } }
