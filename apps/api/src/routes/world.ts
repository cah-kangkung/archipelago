import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import type { AppEnv, Deps } from '../types'
import { getWorld } from '../world/service'

export function worldRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json(await getWorld(deps.db, c.get('user').id)))
}
