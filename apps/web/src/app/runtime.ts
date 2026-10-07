import type { RouterHistory } from '@tanstack/react-router'
import type { Api } from '../api/api'
import { createQueryClient } from './query-client'
import { type AppRouter, createAppRouter } from './router'

export function createAppRuntime(
  api: Api,
  options: { history?: RouterHistory; retry?: boolean } = {},
) {
  let router: AppRouter | undefined
  const queryClient = createQueryClient(() => {
    // Session expired or revoked: forget everything cached and go back to the login form.
    queryClient.clear()
    void router?.navigate({ to: '/login' })
  }, options.retry ?? true)
  router = createAppRouter({ api, queryClient }, options.history)
  return { router, queryClient }
}
