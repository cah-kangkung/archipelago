import { SHOP_ITEMS } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import type { AppEnv, Deps } from '../types'

export function shopRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', (c) => c.json({ items: [...SHOP_ITEMS] }))
}
