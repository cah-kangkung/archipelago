import {
  createMilestoneInputSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
} from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import { createMilestone } from '../milestones/service'
import { createProject, deleteProject, listProjects, updateProject } from '../projects/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function projectRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json({ projects: await listProjects(db, c.get('user').id) }))
    .post('/', jsonBody(createProjectInputSchema), async (c) => {
      const project = await createProject(db, c.get('user').id, c.req.valid('json'))
      return c.json({ project }, 201)
    })
    .patch('/:id', jsonBody(updateProjectInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Project')
      const project = await updateProject(db, c.get('user').id, id, c.req.valid('json'), now())
      return c.json({ project })
    })
    .delete('/:id', async (c) => {
      await deleteProject(db, c.get('user').id, idParam(c.req.param('id'), 'Project'))
      return c.body(null, 204)
    })
    .post('/:id/milestones', jsonBody(createMilestoneInputSchema), async (c) => {
      const projectId = idParam(c.req.param('id'), 'Project')
      const milestone = await createMilestone(db, c.get('user').id, projectId, c.req.valid('json'))
      return c.json({ milestone }, 201)
    })
}
