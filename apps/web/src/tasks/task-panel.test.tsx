import type { TaskDto } from '@archipelago/shared'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays, todayIn } from '../world/selectors'

function islandWith(tasks: Partial<TaskDto>[]) {
  const project = fakeProject({ name: 'Beta' })
  const fake = createFakeApi({
    world: {
      projects: [project],
      milestones: [],
      tasks: tasks.map((t) => fakeTask({ projectId: project.id, ...t })),
      buildings: [],
    },
  })
  return { ...fake, project, path: `/p/${project.id}` }
}

const panel = () => screen.getByTestId('task-side-panel')
const findPanel = () => screen.findByTestId('task-side-panel')

describe('TaskPanel', () => {
  test('shows due badges in the user’s timezone', async () => {
    const today = todayIn('Asia/Jakarta')
    const { api, path } = islandWith([
      { title: 'Late', dueDate: addDays(today, -1) },
      { title: 'Soon', dueDate: today },
      { title: 'Later', dueDate: addDays(today, 10) },
    ])
    renderApp({ api, path, desktop: true })
    expect(
      await within(await findPanel()).findByText(`Overdue · ${addDays(today, -1)}`),
    ).toBeInTheDocument()
    expect(within(panel()).getByText(`Due soon · ${today}`)).toBeInTheDocument()
    expect(within(panel()).queryByText(new RegExp(addDays(today, 10)))).toBeNull()
  })

  test('the status button cycles todo → doing → done → todo through the right endpoints', async () => {
    const { api, calls, path } = islandWith([{ title: 'Ship' }])
    const { user } = renderApp({ api, path, desktop: true })
    // Each click must wait for the previous mutation to settle: the button is disabled while pending.
    const clickWhenReady = async (name: string) => {
      const button = await screen.findByRole('button', { name })
      await waitFor(() => expect(button).toBeEnabled())
      await user.click(button)
    }
    await clickWhenReady('Mark "Ship" as doing')
    await clickWhenReady('Mark "Ship" as done')
    await clickWhenReady('Mark "Ship" as not done')
    const back = await screen.findByRole('button', { name: 'Mark "Ship" as doing' })
    await waitFor(() => expect(back).toBeEnabled())
    expect(calls.filter((c) => ['updateTask', 'completeTask', 'reopenTask'].includes(c))).toEqual([
      'updateTask',
      'completeTask',
      'reopenTask',
    ])
  })

  test('a rapid second tap while completing is ignored (button disabled while pending)', async () => {
    const { api, calls, path } = islandWith([{ title: 'Ship', status: 'doing' }])
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const realComplete = api.completeTask
    api.completeTask = async (id) => {
      await gate
      return realComplete(id)
    }
    const { user } = renderApp({ api, path, desktop: true })
    const button = await screen.findByRole('button', { name: 'Mark "Ship" as done' })
    await user.click(button)
    // Optimistically "done" already; the control stays disabled until the server answers.
    const pending = await screen.findByRole('button', { name: 'Mark "Ship" as not done' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    release()
    await waitFor(() => expect(pending).toBeEnabled())
    expect(calls.filter((c) => c === 'completeTask' || c === 'reopenTask')).toEqual([
      'completeTask',
    ])
  })

  test('a failed update rolls back and toasts the server message', async () => {
    const { api, path } = islandWith([{ title: 'Ship' }])
    api.updateTask = async () => {
      throw new ApiError(500, 'internal', 'Server exploded')
    }
    const { user } = renderApp({ api, path, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Mark "Ship" as doing' }))
    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Mark "Ship" as doing' })).toBeInTheDocument()
  })

  test('a failed update on one row does not clobber a concurrent change on another', async () => {
    const { api, path } = islandWith([{ title: 'A' }, { title: 'B' }])
    let releaseA: () => void = () => {}
    let releaseB: () => void = () => {}
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const gateB = new Promise<void>((resolve) => {
      releaseB = resolve
    })
    const realUpdate = api.updateTask
    api.updateTask = async (id, patch) => {
      if (id === (await api.world()).tasks.find((t) => t.title === 'A')?.id) {
        await gateA
        throw new ApiError(500, 'internal', 'A failed')
      }
      await gateB
      return realUpdate(id, patch)
    }
    const { user } = renderApp({ api, path, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Mark "A" as doing' }))
    await user.click(await screen.findByRole('button', { name: 'Mark "B" as doing' }))
    expect(await screen.findByRole('button', { name: 'Mark "B" as done' })).toBeDisabled()
    releaseA()
    expect(await screen.findByText('A failed')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Mark "A" as doing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark "B" as done' })).toBeInTheDocument()
    releaseB()
    const b = await screen.findByRole('button', { name: 'Mark "B" as done' })
    await waitFor(() => expect(b).toBeEnabled())
  })

  test('delete asks first; cancelling keeps the task', async () => {
    const { api, path } = islandWith([{ title: 'Keep me' }, { title: 'Bin me' }])
    const confirm = vi.spyOn(window, 'confirm')
    const { user } = renderApp({ api, path, desktop: true })

    confirm.mockReturnValueOnce(false)
    await user.click(await screen.findByRole('button', { name: 'Delete "Keep me"' }))
    expect(confirm).toHaveBeenCalledWith('Delete "Keep me"?')
    expect(within(panel()).getByText('Keep me')).toBeInTheDocument()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete "Bin me"' }))
    await waitFor(() => expect(within(panel()).queryByText('Bin me')).toBeNull())
    confirm.mockRestore()
  })

  test('search filters the list by title', async () => {
    const { api, path } = islandWith([{ title: 'Write spec' }, { title: 'Ship build' }])
    const { user } = renderApp({ api, path, desktop: true })
    await user.type(await screen.findByLabelText('Search tasks'), 'SPEC')
    expect(within(panel()).getByText('Write spec')).toBeInTheDocument()
    expect(within(panel()).queryByText('Ship build')).toBeNull()
  })

  test('the archipelago panel has a friendly empty state', async () => {
    const { api } = islandWith([{ title: 'No due date' }])
    renderApp({ api, path: '/', desktop: true })
    expect(
      await within(await findPanel()).findByText('Nothing due today. Nice work.'),
    ).toBeInTheDocument()
  })

  test('due state follows the user timezone, not the machine clock', async () => {
    // 18:30 UTC on Oct 6 is already Oct 7 in Asia/Jakarta (UTC+7), so a task due Oct 7 is due today.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-06T18:30:00Z'))
    try {
      const { api, path } = islandWith([{ title: 'Jakarta day', dueDate: '2026-10-07' }])
      renderApp({ api, path, desktop: true })
      expect(
        await within(await findPanel()).findByText('Due soon · 2026-10-07'),
      ).toBeInTheDocument()
      expect(within(panel()).queryByText(/Overdue/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
