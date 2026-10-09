import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../ui/toast'
import { worldQuery } from '../world/use-world'

type Options = {
  /** Field keys the form renders; a 422 only counts as a field error if it names one of them. */
  fields?: string[]
  /** Run onSuccess (which navigates away) before refreshing the world, so removed things never flash "not found". */
  invalidateAfter?: boolean
}

export function useEditorMutation<T>(
  fn: () => Promise<T>,
  onSuccess: (result: T) => void | Promise<void>,
  { fields = [], invalidateAfter = false }: Options = {},
) {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: fn,
    onMutate: () => {
      setFieldErrors({})
      setFormError(null)
    },
    onSuccess: async (result) => {
      const invalidate = () => queryClient.invalidateQueries({ queryKey: worldQuery(api).queryKey })
      if (invalidateAfter) {
        await onSuccess(result)
        void invalidate()
      } else {
        await invalidate()
        await onSuccess(result)
      }
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        Object.keys(error.fields).some((key) => fields.includes(key))
      ) {
        setFieldErrors(error.fields)
        return
      }
      const message = error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
      setFormError(message)
      toast.show(message)
    },
  })

  return { mutation, fieldErrors, formError, setFieldErrors }
}
