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
})
