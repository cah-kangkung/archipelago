import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import type { AppEnv, AuthUser, Deps } from '../types'
import { findApiTokenUser } from './api-tokens'
import { findSessionUser } from './sessions'

export const SESSION_COOKIE = 'session'

const BEARER = /^Bearer\s+(\S+)$/i

export const requireAuth = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const now = deps.now?.() ?? new Date()
    const authorization = c.req.header('authorization')
    let user: AuthUser | null = null

    if (authorization !== undefined) {
      // An explicit Authorization header is authoritative: it is never combined with the cookie.
      const token = authorization.match(BEARER)?.[1]
      user = token ? await findApiTokenUser(deps.db, token, now) : null
    } else {
      const token = getCookie(c, SESSION_COOKIE)
      user = token ? await findSessionUser(deps.db, token, now) : null
    }

    if (!user) throw new AppError('unauthorized', 'Authentication required')
    c.set('user', user)
    await next()
  })
