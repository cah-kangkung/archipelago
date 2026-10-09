import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../ui/toast'
import { worldQuery } from '../world/use-world'
import { formatRewards } from './format'

export function useClaimDaily() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: () => api.claimDaily(),
    onMutate: () => queryClient.cancelQueries({ queryKey: key }),
    onSuccess: ({ reward, economy }) => {
      queryClient.setQueryData(key, (world) => (world ? { ...world, economy } : world))
      const message = formatRewards([reward])
      if (message) toast.show(message)
    },
    onError: (error) => {
      toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      // A conflict means our cached economy is stale; any other failure might be too.
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
