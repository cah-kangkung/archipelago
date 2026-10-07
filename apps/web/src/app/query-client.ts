import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'

export function createQueryClient(onUnauthorized: () => void, retry = true): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          retry && !(error instanceof ApiError && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  })
}
