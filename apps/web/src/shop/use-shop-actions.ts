import { type PlaceBuildingInput, shopItem } from '@archipelago/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useRewardStore } from '../rewards/reward-context'
import { useToast } from '../ui/toast'
import { worldQuery } from '../world/use-world'

const failed = (error: Error) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.'

export function usePlaceBuilding() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const rewards = useRewardStore()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: (input: PlaceBuildingInput) => api.placeBuilding(input),
    onSuccess: ({ building, balance }) => {
      rewards.push({ target: { kind: 'building', id: building.id }, amounts: [] })
      queryClient.setQueryData(key, (world) =>
        world ? { ...world, economy: { ...world.economy, balance } } : world,
      )
      const item = shopItem(building.type)
      if (item) toast.show(`${item.name} placed · −${item.price}`)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.show(failed(error))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRemoveBuilding() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: (buildingId: string) => api.removeBuilding(buildingId),
    onSuccess: ({ refund, balance }) => {
      queryClient.setQueryData(key, (world) =>
        world ? { ...world, economy: { ...world.economy, balance } } : world,
      )
      if (refund > 0) toast.show(`+${refund} Supplies`)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.show(failed(error))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
