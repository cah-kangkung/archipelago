import { placeBuildingInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { placeBuilding, removeBuilding } from '../buildings/service'
import { idParam, validId } from '../http/params'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function buildingRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .post('/', jsonBody(placeBuildingInputSchema), async (c) =>
      c.json(await placeBuilding(db, c.get('user').id, c.req.valid('json'), now()), 201),
    )
    .delete('/:id', validId('Building'), async (c) => {
      const id = idParam(c.req.param('id'), 'Building')
      return c.json(await removeBuilding(db, c.get('user').id, id, now()))
    })
}
