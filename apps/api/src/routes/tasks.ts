import {
  createTaskInputSchema,
  taskListQuerySchema,
  updateTaskInputSchema,
} from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  reopenTask,
  updateTask,
} from '../tasks/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody, queryParams } from '../validate'

export function taskRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', queryParams(taskListQuerySchema), async (c) =>
      c.json({ tasks: await listTasks(db, c.get('user').id, c.req.valid('query')) }),
    )
    .post('/', jsonBody(createTaskInputSchema), async (c) => {
      const task = await createTask(db, c.get('user').id, c.req.valid('json'), now())
      return c.json({ task }, 201)
    })
    .patch('/:id', jsonBody(updateTaskInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      const task = await updateTask(db, c.get('user').id, id, c.req.valid('json'), now())
      return c.json({ task })
    })
    .delete('/:id', async (c) => {
      await deleteTask(db, c.get('user').id, idParam(c.req.param('id'), 'Task'), now())
      return c.body(null, 204)
    })
    .post('/:id/complete', async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      return c.json(await completeTask(db, c.get('user').id, id, now()))
    })
    .post('/:id/reopen', async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      return c.json(await reopenTask(db, c.get('user').id, id, now()))
    })
}
