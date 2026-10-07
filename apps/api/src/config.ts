import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  PORT: z.coerce.number().int().positive().default(3000),
  COOKIE_SECURE: z.stringbool().default(true),
  TRUST_PROXY: z.stringbool().default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
})

export type Config = {
  databaseUrl: string
  port: number
  cookieSecure: boolean
  trustProxy: boolean
  sessionTtlDays: number
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment: ${details.join('; ')}`)
  }
  const e = parsed.data
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
    sessionTtlDays: e.SESSION_TTL_DAYS,
  }
}
