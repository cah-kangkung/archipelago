import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Api } from '../api/api'
import { useApi } from '../api/context'

export const meQuery = (api: Api) =>
  queryOptions({ queryKey: ['me'], queryFn: () => api.me(), staleTime: Number.POSITIVE_INFINITY })

export const worldQuery = (api: Api) =>
  queryOptions({ queryKey: ['world'], queryFn: () => api.world() })

export const useMe = () => useQuery(meQuery(useApi()))
export const useWorld = () => useQuery(worldQuery(useApi()))
