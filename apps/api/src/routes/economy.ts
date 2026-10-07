import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { claimDailyBonus, getEconomy } from '../economy/service'
import type { AppEnv, Deps } from '../types'

export function economyRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => {
      const economy = await db.transaction((tx) => getEconomy(tx, c.get('user'), now()), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
      return c.json({ economy })
    })
    .post('/daily-claim', async (c) => c.json(await claimDailyBonus(db, c.get('user'), now())))
}
