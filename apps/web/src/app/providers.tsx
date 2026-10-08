import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import { RewardProvider } from '../rewards/reward-context'
import type { RewardStore } from '../rewards/reward-store'
import { ToastProvider } from './toast'

export function AppProviders({
  api,
  queryClient,
  rewards,
  children,
}: {
  api: Api
  queryClient: QueryClient
  /** Test seam: the store to share; a fresh one otherwise. */
  rewards?: RewardStore
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <RewardProvider store={rewards}>
          <ToastProvider>{children}</ToastProvider>
        </RewardProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
