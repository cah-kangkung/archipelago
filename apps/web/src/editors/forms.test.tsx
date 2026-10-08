import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

function seeded() {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  const ship = fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'Ship' })
  const fake = createFakeApi({
    world: { projects: [beta], milestones: [mvp], tasks: [ship], buildings: [] },
  })
  return { ...fake, beta, mvp, ship }
}

const dialog = () => screen.getByRole('dialog')

describe('editors', () => {
  test('phone: opening a form does not focus its first field', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    await screen.findByTestId('editor-sheet')
    expect(screen.getByLabelText('Name')).not.toHaveFocus()
  })

  test('creates an island from the archipelago (desktop dialog)', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    expect(within(dialog()).getByRole('heading', { name: 'New island' })).toBeInTheDocument()
    await user.type(within(dialog()).getByLabelText('Name'), 'Gamma')
    await user.click(within(dialog()).getByRole('button', { name: 'Create island' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      within(screen.getByTestId('island-cards')).getByRole('link', { name: /Gamma/ }),
    ).toBeInTheDocument()
  })

  test('phone: editors open as a sheet', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    expect(await screen.findByTestId('editor-sheet')).toBeInTheDocument()
  })

  test('creates a milestone on an island', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New milestone' }))
    await user.type(within(dialog()).getByLabelText('Name'), 'Launch')
    await user.click(within(dialog()).getByRole('button', { name: 'Create milestone' }))
    expect(await screen.findByRole('link', { name: /Launch/ })).toBeInTheDocument()
  })

  test('N opens a new task preset to the current district; blank titles are caught locally', async () => {
    const { api, calls, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    expect(within(dialog()).getByLabelText('Milestone')).toHaveValue(mvp.id)

    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Enter a title')
    expect(calls).not.toContain('createTask')

    await user.type(within(dialog()).getByLabelText('Title'), 'Write docs')
    await user.type(within(dialog()).getByLabelText('Due date'), '2026-12-01')
    await user.selectOptions(within(dialog()).getByLabelText('Priority'), 'high')
    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      within(screen.getByTestId('task-side-panel')).getByText('Write docs'),
    ).toBeInTheDocument()
  })

  test('server field errors appear next to the field and keep the input', async () => {
    const { api, beta } = seeded()
    api.createTask = async () => {
      throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
        milestoneId: ['Milestone does not belong to this project'],
      })
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Keep my text')
    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Milestone does not belong to this project',
    )
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Keep my text')
  })

  test('conflicts toast and leave the editor open', async () => {
    const { api, beta } = seeded()
    api.updateTask = async () => {
      throw new ApiError(409, 'conflict', 'Task is done; reopen it before changing its status')
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    await user.clear(within(dialog()).getByLabelText('Title'))
    await user.type(within(dialog()).getByLabelText('Title'), 'Ship v2')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(
      await within(screen.getByRole('status')).findByText(
        'Task is done; reopen it before changing its status',
      ),
    ).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Ship v2')
  })

  test('editing a task saves the new title', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Ship')
    await user.clear(within(dialog()).getByLabelText('Title'))
    await user.type(within(dialog()).getByLabelText('Title'), 'Ship it')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(
      await within(screen.getByTestId('task-side-panel')).findByText('Ship it'),
    ).toBeInTheDocument()
  })

  test('Esc closes the editor, then steps out of the district; / focuses search', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    expect(dialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${beta.id}`))
    await user.keyboard('/')
    expect(screen.getByLabelText('Search tasks')).toHaveFocus()
  })

  test('archiving an island returns to the archipelago and hides it', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Archive island' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await waitFor(() => expect(screen.queryByRole('link', { name: /Beta/ })).toBeNull())
  })

  test('deleting an island asks first, then returns to the archipelago', async () => {
    const { api, calls, beta } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete island' }))
    expect(confirm).toHaveBeenCalledWith('Delete "Beta" and everything on it?')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(calls).toContain('deleteProject')
    confirm.mockRestore()
  })

  test('closes the editor when the edited task is deleted elsewhere', async () => {
    const { api, state, beta } = seeded()
    const { user, queryClient } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    expect(dialog()).toBeInTheDocument()
    state.world.tasks = state.world.tasks.filter((t) => t.title !== 'Ship')
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('desktop editor is a modal dialog and focuses the first field', async () => {
    const { api, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    expect(within(dialog()).getByLabelText('Title')).toHaveFocus()
    expect((dialog() as HTMLDialogElement).open).toBe(true)
    expect(dialog()).not.toHaveAttribute('open', 'false')
  })

  test('N and / are ignored while an editor is open', async () => {
    const { api, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    await user.type(within(dialog()).getByLabelText('Title'), 'nnn')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('nnn')
    // Focus on a non-typing control inside the dialog: shortcuts still must not fire.
    within(dialog()).getByRole('button', { name: 'Close' }).focus()
    await user.keyboard('n')
    await user.keyboard('/')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByLabelText('Search tasks')).not.toHaveFocus()
  })

  test('Ctrl+N does not open an editor', async () => {
    const { api, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('{Control>}n{/Control}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('N on the archipelago does nothing', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await screen.findByTestId('island-cards')
    await user.keyboard('n')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a conflict is also shown inside the editor as an alert', async () => {
    const { api, beta } = seeded()
    api.updateTask = async () => {
      throw new ApiError(409, 'conflict', 'Task is done; reopen it before changing its status')
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Task is done; reopen it before changing its status',
    )
  })

  test('a 422 on a field the form does not render becomes a form-level alert', async () => {
    const { api, beta } = seeded()
    api.createTask = async () => {
      throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
        projectId: ['Project not found'],
      })
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Anything')
    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Request body is invalid')
  })

  test('deleting an island never flashes the not-found screen', async () => {
    const { api, beta } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    let flashed = false
    const observer = new MutationObserver(() => {
      if (screen.queryByText("That island or district doesn't exist.")) flashed = true
    })
    observer.observe(document.body, { childList: true, subtree: true })
    await user.click(within(dialog()).getByRole('button', { name: 'Delete island' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await screen.findByTestId('island-cards')
    observer.disconnect()
    expect(flashed).toBe(false)
    expect(screen.queryByText("That island or district doesn't exist.")).toBeNull()
    confirm.mockRestore()
  })

  test('an open editor closes when the route changes', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    expect(dialog()).toBeInTheDocument()
    await act(() => router.navigate({ to: '/' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
