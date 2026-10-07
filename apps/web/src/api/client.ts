import type { AppType } from '@archipelago/api/app'
import { hc } from 'hono/client'

export const createClient = (baseUrl: string, fetchImpl?: typeof fetch) =>
  hc<AppType>(baseUrl, fetchImpl ? { fetch: fetchImpl } : undefined)

export type Client = ReturnType<typeof createClient>
