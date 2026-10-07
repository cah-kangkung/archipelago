import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Api } from '../api/api'
import { AppProviders } from '../app/providers'
import { createAppRuntime } from '../app/runtime'
import { setDesktop } from './viewport'

export function renderApp({
  api,
  path = '/',
  desktop = false,
}: {
  api: Api
  path?: string
  desktop?: boolean
}) {
  setDesktop(desktop)
  const history = createMemoryHistory({ initialEntries: [path] })
  const { router, queryClient } = createAppRuntime(api, { history, retry: false })
  const user = userEvent.setup()
  render(
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, queryClient, user }
}
