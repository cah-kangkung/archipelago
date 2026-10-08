import type { TaskDto } from '@archipelago/shared'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { AppProviders } from '../app/providers'
import { createQueryClient } from '../app/query-client'
import { useClaimDaily } from '../economy/use-claim-daily'
import { usePlaceBuilding, useRemoveBuilding } from '../shop/use-shop-actions'
import { useAdvanceTask } from '../tasks/use-task-actions'
import {
  createFakeApi,
  fakeBuilding,
  fakeEntry,
  fakeMilestone,
  fakeProject,
  fakeTask,
} from '../test/fake-api'
import { useWorld } from '../world/use-world'
import { createRewardStore } from './reward-store'

function setup(status: TaskDto['status'] = 'doing') {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id })
  const task = fakeTask({ projectId: beta.id, milestoneId: mvp.id, size: 'M', status, plotX: 1 })
  const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: -1, plotY: 0 })
  const fake = createFakeApi({
    today: '2026-10-07',
    world: { projects: [beta], milestones: [mvp], tasks: [task], buildings: [pine] },
    ledger:
      status === 'done'
        ? [fakeEntry({ taskId: task.id, amount: 25 })]
        : [fakeEntry({ kind: 'daily_bonus', day: '2026-10-06', amount: 100 })],
  })
  const queryClient = createQueryClient(() => {}, false)
  const rewards = createRewardStore()
  const push = vi.spyOn(rewards, 'push')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders api={fake.api} queryClient={queryClient} rewards={rewards}>
      {children}
    </AppProviders>
  )
  return { ...fake, beta, task, pine, queryClient, push, wrapper }
}

describe('reward producers', () => {
  test('completing a task pushes one event with the server amounts, after any refetch', async () => {
    const s = setup()
    const { result } = renderHook(() => ({ advance: useAdvanceTask(), world: useWorld() }), {
      wrapper: s.wrapper,
    })
    await waitFor(() => expect(result.current.world.data).toBeDefined())
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const complete = s.api.completeTask
    s.api.completeTask = async (id) => {
      await gate
      return complete(id)
    }
    act(() => result.current.advance.mutate(s.task))
    // A refetch that lands before the response must not replay or invent an effect.
    await act(() => s.queryClient.invalidateQueries({ queryKey: ['world'] }))
    expect(s.push).not.toHaveBeenCalled()
    await act(async () => release())
    await waitFor(() => expect(result.current.advance.isSuccess).toBe(true))
    expect(s.push).toHaveBeenCalledTimes(1)
    expect(s.push).toHaveBeenCalledWith({
      target: { kind: 'task', id: s.task.id },
      amounts: [25, 12],
    })
  })

  test('a reopen and a failed completion push nothing', async () => {
    const done = setup('done')
    const reopen = renderHook(() => useAdvanceTask(), { wrapper: done.wrapper })
    await act(async () => {
      await reopen.result.current.mutateAsync(done.task)
    })
    expect(done.push).not.toHaveBeenCalled()

    const failing = setup()
    failing.api.completeTask = async () => {
      throw new ApiError(409, 'conflict', 'Task is already done')
    }
    const fail = renderHook(() => useAdvanceTask(), { wrapper: failing.wrapper })
    await act(async () => {
      await fail.result.current.mutateAsync(failing.task).catch(() => {})
    })
    expect(failing.push).not.toHaveBeenCalled()
  })

  test('a placement pushes a pop with no amounts; removal and the daily claim push nothing', async () => {
    const s = setup()
    const { result } = renderHook(
      () => ({ place: usePlaceBuilding(), remove: useRemoveBuilding(), claim: useClaimDaily() }),
      { wrapper: s.wrapper },
    )
    let placedId = ''
    await act(async () => {
      const placed = await result.current.place.mutateAsync({
        projectId: s.beta.id,
        type: 'pine',
        plotX: 0,
        plotY: 1,
      })
      placedId = placed.building.id
    })
    expect(s.push).toHaveBeenCalledTimes(1)
    expect(s.push).toHaveBeenCalledWith({ target: { kind: 'building', id: placedId }, amounts: [] })
    await act(async () => {
      await result.current.remove.mutateAsync(s.pine.id)
      await result.current.claim.mutateAsync()
    })
    expect(s.push).toHaveBeenCalledTimes(1)
  })
})
