import { createApiTokenInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { createApiToken, deleteApiToken, listApiTokens } from '../auth/api-tokens'
import { requireSession } from '../auth/middleware'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

const uuid = z.uuid()

export function tokenRoutes(deps: Deps) {
  const { db } = deps

  return new Hono<AppEnv>()
    .use(requireSession(deps))
    .get('/', async (c) => c.json({ apiTokens: await listApiTokens(db, c.get('user').id) }))
    .post('/', jsonBody(createApiTokenInputSchema), async (c) => {
      const { name } = c.req.valid('json')
      return c.json(await createApiToken(db, c.get('user').id, name), 201)
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id')
      // Non-UUID ids would make Postgres throw (22P02), so they are a plain 404.
      const deleted = uuid.safeParse(id).success && (await deleteApiToken(db, c.get('user').id, id))
      if (!deleted) throw new AppError('not_found', 'API token not found')
      return c.body(null, 204)
    })
}
