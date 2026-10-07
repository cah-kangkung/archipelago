import { updateMilestoneInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import { deleteMilestone, updateMilestone } from '../milestones/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function milestoneRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .patch('/:id', jsonBody(updateMilestoneInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Milestone')
      const milestone = await updateMilestone(db, c.get('user').id, id, c.req.valid('json'))
      return c.json({ milestone })
    })
    .delete('/:id', async (c) => {
      await deleteMilestone(db, c.get('user').id, idParam(c.req.param('id'), 'Milestone'), now())
      return c.body(null, 204)
    })
}
