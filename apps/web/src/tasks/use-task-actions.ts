import type {
  CompleteTaskResultDto,
  ReopenTaskResultDto,
  TaskDto,
  WorldDto,
} from '@archipelago/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Api, ApiError } from '../api/api'
import { useApi } from '../api/context'
import { formatReversals, formatRewards } from '../economy/format'
import { useRewardStore } from '../rewards/reward-context'
import { useToast } from '../ui/toast'
import { worldQuery } from '../world/use-world'

type Snapshot = { previousTask: TaskDto | undefined; index: number }

const MUTATION_KEY = ['task-action']

function useWorldCache() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const rewards = useRewardStore()
  const key = worldQuery(api).queryKey

  const edit = (update: (world: WorldDto) => WorldDto) => {
    const world = queryClient.getQueryData(key)
    if (world) queryClient.setQueryData(key, update(world))
  }

  return {
    async apply(task: TaskDto, update: (world: WorldDto) => WorldDto): Promise<Snapshot> {
      await queryClient.cancelQueries({ queryKey: key })
      const tasks = queryClient.getQueryData(key)?.tasks ?? []
      const index = tasks.findIndex((t) => t.id === task.id)
      const previousTask = tasks[index]
      edit(update)
      return { previousTask, index }
    },
    rollback(error: unknown, taskId: string, snapshot: Snapshot | undefined, removed: boolean) {
      const previousTask = snapshot?.previousTask
      if (previousTask && snapshot) {
        edit((w) => {
          if (!removed) {
            return { ...w, tasks: w.tasks.map((t) => (t.id === taskId ? previousTask : t)) }
          }
          if (w.tasks.some((t) => t.id === taskId)) return w
          const tasks = [...w.tasks]
          tasks.splice(Math.min(snapshot.index, tasks.length), 0, previousTask)
          return { ...w, tasks }
        })
      }
      toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
    },
    reward(result: AdvanceResult) {
      if (!('balance' in result)) return
      edit((w) => ({ ...w, economy: { ...w.economy, balance: result.balance } }))
      // Only the server's answer starts an effect; a refetch never does (spec 16.1).
      if ('rewards' in result) {
        rewards.push({
          target: { kind: 'task', id: result.task.id },
          amounts: result.rewards.map((r) => r.amount),
        })
      }
      const message =
        'rewards' in result ? formatRewards(result.rewards) : formatReversals(result.reversals)
      if (message) toast.show(message)
    },
    settle() {
      // The settling mutation still counts itself; only refetch when it is the last one running.
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) {
        return queryClient.invalidateQueries({ queryKey: key })
      }
    },
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

type AdvanceResult = { task: TaskDto } | CompleteTaskResultDto | ReopenTaskResultDto

function advanceRequest(api: Api, task: TaskDto): Promise<AdvanceResult> {
  if (task.status === 'todo') return api.updateTask(task.id, { status: 'doing' })
  if (task.status === 'doing') return api.completeTask(task.id)
  return api.reopenTask(task.id)
}

export function useAdvanceTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (task: TaskDto) => advanceRequest(api, task),
    onMutate: (task) =>
      cache.apply(task, (w) => patchTask(w, task.id, nextState(task, new Date()))),
    onError: (error, task, snapshot) => cache.rollback(error, task.id, snapshot, false),
    onSuccess: (result) => cache.reward(result),
    onSettled: () => cache.settle(),
  })
}

export function useDeleteTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (task: TaskDto) => api.deleteTask(task.id),
    onMutate: (task) =>
      cache.apply(task, (w) => ({ ...w, tasks: w.tasks.filter((t) => t.id !== task.id) })),
    onError: (error, task, snapshot) => cache.rollback(error, task.id, snapshot, true),
    onSettled: () => cache.settle(),
  })
}
