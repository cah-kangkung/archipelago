import { Hono } from 'hono'
import { errorBody, handleError } from './errors'
import { authRoutes } from './routes/auth'
import { tokenRoutes } from './routes/tokens'
import type { AppEnv, Deps } from './types'

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>().basePath('/api/v1')
  app.onError(handleError)
  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404))

  return app
    .get('/health', (c) => c.json({ ok: true }))
    .route('/auth', authRoutes(deps))
    .route('/tokens', tokenRoutes(deps))
}

export type AppType = ReturnType<typeof createApp>
