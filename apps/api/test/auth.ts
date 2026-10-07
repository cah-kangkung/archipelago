import { createApp } from '../src/app'
import { createSession } from '../src/auth/sessions'
import type { Db } from '../src/db/client'
import { insertUser, testConfig } from './fixtures'

export const readJson = async <T>(res: Response): Promise<T> => (await res.json()) as T

/** A real app plus request helpers authenticated as a fresh user via a session cookie. */
export async function authedApp(db: Db, options: { now?: () => Date; timezone?: string } = {}) {
  const user = await insertUser(db, { timezone: options.timezone })
  const { token } = await createSession(db, user.id, 30)
  const app = createApp({ db, config: testConfig, now: options.now })
  const cookie = `session=${token}`

  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: body === undefined ? { cookie } : { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  return {
    app,
    user,
    get: (path: string) => send('GET', path),
    post: (path: string, body?: unknown) => send('POST', path, body),
    patch: (path: string, body: unknown) => send('PATCH', path, body),
    del: (path: string) => send('DELETE', path),
  }
}
