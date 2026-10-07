import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'

export function useEditorMutation<T>(fn: () => Promise<T>, onSuccess: (result: T) => void) {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const mutation = useMutation({
    mutationFn: fn,
    onMutate: () => setFieldErrors({}),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: worldQuery(api).queryKey })
      onSuccess(result)
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        Object.keys(error.fields).length > 0
      ) {
        setFieldErrors(error.fields)
      } else {
        toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    },
  })

  return { mutation, fieldErrors, setFieldErrors }
}
