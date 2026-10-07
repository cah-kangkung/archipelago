import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { findSessionUser } from './sessions'

export const SESSION_COOKIE = 'session'

export const requireAuth = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const now = deps.now?.() ?? new Date()
    const token = getCookie(c, SESSION_COOKIE)
    const user = token ? await findSessionUser(deps.db, token, now) : null
    if (!user) throw new AppError('unauthorized', 'Authentication required')
    c.set('user', user)
    await next()
  })
