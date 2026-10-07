import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import { ToastProvider } from './toast'

export function AppProviders({
  api,
  queryClient,
  children,
}: {
  api: Api
  queryClient: QueryClient
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
