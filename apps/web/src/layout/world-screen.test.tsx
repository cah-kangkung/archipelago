import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays, todayIn } from '../world/selectors'

function seeded() {
  const today = todayIn('Asia/Jakarta')
  const beta = fakeProject({ name: 'Beta' })
  const gamma = fakeProject({ name: 'Gamma' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP', landmarkType: 'lighthouse' })
  const world = {
    projects: [beta, gamma],
    milestones: [mvp],
    tasks: [
      fakeTask({ projectId: beta.id, title: 'Late one', dueDate: addDays(today, -2) }),
      fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'MVP task' }),
      fakeTask({ projectId: gamma.id, title: 'Soon one', dueDate: today }),
    ],
    buildings: [],
  }
  return { ...createFakeApi({ world }), beta, gamma, mvp }
}

describe('WorldScreen', () => {
  test('phone: island cards scroll horizontally, switcher shows urgency, panel is a bottom sheet', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(cards).toHaveClass('overflow-x-auto')
    expect(within(cards).getByRole('link', { name: /Beta/ })).toHaveTextContent('2 open')

    const switcher = screen.getByRole('navigation', { name: 'Islands' })
    expect(within(switcher).getByRole('link', { name: /Beta/ })).toHaveTextContent('overdue')
    expect(within(switcher).getByRole('link', { name: /Gamma/ })).toHaveTextContent('due soon')

    expect(screen.getByTestId('task-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('task-side-panel')).not.toBeInTheDocument()
  })

  test('desktop: the panel is a resizable side panel', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/', desktop: true })
    const panel = await screen.findByTestId('task-side-panel')
    expect(panel).toHaveStyle({ width: '400px' })
    const handle = screen.getByRole('button', { name: 'Resize task panel' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(panel).toHaveStyle({ width: '416px' })
    expect(screen.queryByTestId('task-sheet')).not.toBeInTheDocument()
  })

  test('navigates archipelago → island → district, and the panel follows', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: '/', desktop: true })
    const cards = await screen.findByTestId('island-cards')
    await user.click(within(cards).getByRole('link', { name: /Beta/ }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Beta' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /MVP/ }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${mvp.id}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'MVP' })).toBeInTheDocument()
    expect(screen.getByText('MVP task')).toBeInTheDocument()
    expect(screen.queryByText('Late one')).not.toBeInTheDocument()
  })

  test('a deep link to a missing island shows not-found with a way back', async () => {
    const { api } = seeded()
    const { user, router } = renderApp({ api, path: '/p/00000000-0000-4000-8000-999999999999' })
    expect(await screen.findByText("That island or district doesn't exist.")).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to the archipelago' }))
    expect(router.state.location.pathname).toBe('/')
  })

  test('phone: the sheet cycles detents and leaves the world interactive', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: '/' })
    const sheet = await screen.findByTestId('task-sheet')
    expect(sheet).toHaveAttribute('data-detent', '1')
    const handle = screen.getByRole('button', { name: 'Resize task sheet' })
    await user.click(handle)
    expect(sheet).toHaveAttribute('data-detent', '2')
    await user.click(handle)
    expect(sheet).toHaveAttribute('data-detent', '0')
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(sheet).toHaveAttribute('data-detent', '1')

    const cards = screen.getByTestId('island-cards')
    await user.click(within(cards).getByRole('link', { name: /Beta/ }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
  })

  test('a failed background refresh keeps the world on screen with a retry banner', async () => {
    const { api, beta } = seeded()
    const { user, queryClient } = renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(within(cards).getByRole('link', { name: /Beta/ })).toBeInTheDocument()

    const working = api.world
    api.world = async () => {
      throw new ApiError(500, 'internal', 'down')
    }
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    expect(await screen.findByText("Couldn't refresh. Showing your last update.")).toBeVisible()
    expect(
      within(screen.getByTestId('island-cards')).getByRole('link', { name: /Beta/ }),
    ).toBeInTheDocument()
    expect(beta.name).toBe('Beta')

    api.world = working
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(screen.queryByText("Couldn't refresh. Showing your last update.")).toBeNull(),
    )
  })

  test('an initial load failure shows an error with a working retry', async () => {
    const { api } = seeded()
    const working = api.world
    api.world = async () => {
      throw new ApiError(500, 'internal', 'down')
    }
    const { user } = renderApp({ api, path: '/' })
    expect(await screen.findByText('Could not load your islands.')).toBeInTheDocument()
    api.world = working
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('island-cards')).toBeInTheDocument()
  })
})
