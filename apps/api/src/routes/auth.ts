import { loginInputSchema } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { clientIp } from '../auth/client-ip'
import { requireAuth, SESSION_COOKIE } from '../auth/middleware'
import { hashPassword, verifyPassword } from '../auth/passwords'
import { createFixedWindowLimiter, LOGIN_RATE_LIMIT } from '../auth/rate-limit'
import { createSession, deleteSession } from '../auth/sessions'
import { users } from '../db/schema'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

// Verifying against a dummy hash for unknown emails keeps response time
// the same, so timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password')
  return dummyHash
}

export function authRoutes(deps: Deps) {
  const { db, config } = deps
  const now = () => deps.now?.() ?? new Date()
  const limiter = deps.loginLimiter ?? createFixedWindowLimiter(LOGIN_RATE_LIMIT)
  const loginRateLimit = createMiddleware<AppEnv>(async (c, next) => {
    if (!limiter.hit(clientIp(c, config.trustProxy), now().getTime())) {
      throw new AppError('rate_limited', 'Too many login attempts. Try again later.')
    }
    await next()
  })

  return new Hono<AppEnv>()
    .post('/login', loginRateLimit, jsonBody(loginInputSchema), async (c) => {
      const { email, password } = c.req.valid('json')
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
      if (!user || !valid) throw new AppError('unauthorized', 'Invalid email or password')

      const { token, expiresAt } = await createSession(db, user.id, config.sessionTtlDays, now())
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        expires: expiresAt,
      })
      return c.json({ user: { id: user.id, email: user.email, timezone: user.timezone } })
    })
    .post('/logout', async (c) => {
      const token = getCookie(c, SESSION_COOKIE)
      if (token) await deleteSession(db, token)
      deleteCookie(c, SESSION_COOKIE, { path: '/', secure: config.cookieSecure })
      return c.body(null, 204)
    })
    .get('/me', requireAuth(deps), (c) => c.json({ user: c.get('user') }))
}
