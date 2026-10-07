import type { TaskDto, WorldDto } from '@archipelago/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Api, ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'

type Snapshot = { previous: WorldDto | undefined }

function useWorldCache() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return {
    async apply(update: (world: WorldDto) => WorldDto): Promise<Snapshot> {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      if (previous) queryClient.setQueryData(key, update(previous))
      return { previous }
    },
    rollback(error: unknown, snapshot: Snapshot | undefined) {
      if (snapshot?.previous) queryClient.setQueryData(key, snapshot.previous)
      toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
    },
    settle: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

const patchTask = (world: WorldDto, id: string, patch: Partial<TaskDto>): WorldDto => ({
  ...world,
  tasks: world.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
})

function nextState(task: TaskDto, now: Date): Partial<TaskDto> {
  if (task.status === 'todo') return { status: 'doing' }
  if (task.status === 'doing') return { status: 'done', completedAt: now.toISOString() }
  return { status: 'todo', completedAt: null }
}

function advanceRequest(api: Api, task: TaskDto) {
  if (task.status === 'todo') return api.updateTask(task.id, { status: 'doing' })
  if (task.status === 'doing') return api.completeTask(task.id)
  return api.reopenTask(task.id)
}

export function useAdvanceTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationFn: (task: TaskDto) => advanceRequest(api, task),
    onMutate: (task) => cache.apply((w) => patchTask(w, task.id, nextState(task, new Date()))),
    onError: (error, _task, snapshot) => cache.rollback(error, snapshot),
    onSettled: () => cache.settle(),
  })
}

export function useDeleteTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationFn: (task: TaskDto) => api.deleteTask(task.id),
    onMutate: (task) =>
      cache.apply((w) => ({ ...w, tasks: w.tasks.filter((t) => t.id !== task.id) })),
    onError: (error, _task, snapshot) => cache.rollback(error, snapshot),
    onSettled: () => cache.settle(),
  })
}
