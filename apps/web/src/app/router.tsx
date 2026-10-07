import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router'
import { type Api, ApiError } from '../api/api'
import { LoginPage } from '../auth/login-page'
import { AppShell } from '../layout/app-shell'
import { WorldScreen } from '../layout/world-screen'
import { meQuery } from '../world/use-world'

export type RouterContext = { queryClient: QueryClient; api: Api }

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery(context.api))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw redirect({ to: '/login' })
      throw error
    }
  },
  component: AppShell,
})

const archipelagoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: WorldScreen,
})

const islandRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'p/$projectId',
  component: WorldScreen,
})

const districtRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'p/$projectId/m/$milestoneId',
  component: WorldScreen,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([archipelagoRoute, islandRoute, districtRoute]),
])

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({ routeTree, context, history, defaultPreload: false })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
