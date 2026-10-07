type Requestable = { request: (input: string, init?: RequestInit) => Response | Promise<Response> }

export function postJson(
  app: Requestable,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

/** Extracts `session=<token>` from a Set-Cookie header, ready to send back as a Cookie header. */
export function sessionCookieFrom(res: Response): string {
  const match = (res.headers.get('set-cookie') ?? '').match(/(?:^|,\s*)session=([^;]*)/)
  if (!match?.[1]) throw new Error('No session cookie in response')
  return `session=${match[1]}`
}
