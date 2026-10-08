import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
  test('phone: island cards scroll horizontally and the panel is a bottom sheet', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(cards).toHaveClass('overflow-x-auto')
    expect(within(cards).getByRole('link', { name: /Beta/ })).toHaveTextContent('2 open')

    expect(screen.queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()

    expect(screen.getByTestId('task-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('task-side-panel')).not.toBeInTheDocument()
  })

  test('desktop: the panel is a resizable side panel', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/', desktop: true })
    const panel = await screen.findByTestId('task-side-panel')
    expect(within(panel).queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()
    expect(panel).toHaveStyle({ width: '400px' })
    const handle = screen.getByRole('separator', { name: 'Resize task panel' })
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
    const handle = screen.getByRole('separator', { name: 'Resize task sheet' })
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

  describe('sheet dragging', () => {
    const originalHeight = window.innerHeight
    const setHeight = (value: number) =>
      Object.defineProperty(window, 'innerHeight', { configurable: true, value })
    afterEach(() => setHeight(originalHeight))

    test('the handles are separators that state their value', async () => {
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const handle = await screen.findByRole('separator', { name: 'Resize task sheet' })
      expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
      expect(handle).toHaveAttribute('aria-valuemin', '0')
      expect(handle).toHaveAttribute('aria-valuemax', '2')
      expect(handle).toHaveAttribute('aria-valuenow', '1')
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
      expect(handle).toHaveAttribute('aria-valuenow', '2')
    })

    test('desktop: the panel handle states its width in px', async () => {
      const { api } = seeded()
      renderApp({ api, path: '/', desktop: true })
      const handle = await screen.findByRole('separator', { name: 'Resize task panel' })
      expect(handle).toHaveAttribute('aria-orientation', 'vertical')
      expect(handle).toHaveAttribute('aria-valuemin', '320')
      expect(handle).toHaveAttribute('aria-valuemax', '640')
      expect(handle).toHaveAttribute('aria-valuenow', '400')
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
      expect(handle).toHaveAttribute('aria-valuenow', '416')
    })

    test('on a short phone the tallest detent stays within the window with no strip above it', async () => {
      setHeight(700)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      expect(screen.queryByTestId('sheet-accessory')).not.toBeInTheDocument()
      fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize task sheet' }), {
        key: 'ArrowUp',
      })
      expect(sheet).toHaveAttribute('data-detent', '2')
      expect(sheet.style.height).toBe('92dvh')
    })

    test('dragging up and releasing snaps to the nearest detent', async () => {
      setHeight(800)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('separator', { name: 'Resize task sheet' })
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      expect(sheet).toHaveAttribute('data-detent', '2')
      expect(sheet.style.height).toBe('92dvh')
    })

    test('a cancelled drag restores the previous detent and keyboard resizing still works', async () => {
      setHeight(800)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('separator', { name: 'Resize task sheet' })
      expect(sheet).toHaveAttribute('data-detent', '1')
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 300, pointerId: 1 })
      expect(sheet.style.height).not.toMatch(/dvh|^120px$/)
      fireEvent.pointerCancel(window, { clientY: 0, pointerId: 1 })
      expect(sheet).toHaveAttribute('data-detent', '1')
      expect(sheet.style.height).toBe('50dvh')
      // Later moves must not resize: listeners are gone.
      fireEvent.pointerMove(window, { clientY: 0, pointerId: 1 })
      expect(sheet.style.height).toBe('50dvh')
      fireEvent.keyDown(handle, { key: 'ArrowDown' })
      expect(sheet).toHaveAttribute('data-detent', '0')
    })

    test('the click that ends a mouse drag does not also step the detent', async () => {
      setHeight(800)
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('separator', { name: 'Resize task sheet' })
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      await act(async () => {
        await Promise.resolve()
      })
      fireEvent.click(handle, { detail: 1 })
      expect(sheet).toHaveAttribute('data-detent', '2')
      // A fresh tap (pointer-down, then click) steps again.
      fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      fireEvent.click(handle, { detail: 1 })
      expect(sheet).toHaveAttribute('data-detent', '0')
    })

    test('a drag that ends without a click does not swallow the next keyboard activation', async () => {
      setHeight(800)
      const { api } = seeded()
      const { user } = renderApp({ api, path: '/' })
      const sheet = await screen.findByTestId('task-sheet')
      const handle = screen.getByRole('separator', { name: 'Resize task sheet' })
      fireEvent.pointerDown(handle, { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(window, { clientY: 100, pointerId: 1 })
      await act(async () => {
        await Promise.resolve()
      })
      handle.focus()
      await user.keyboard('{Enter}')
      expect(sheet).toHaveAttribute('data-detent', '0')
    })

    test('desktop: width persists on release, not on every move', async () => {
      const { api } = seeded()
      renderApp({ api, path: '/', desktop: true })
      const panel = await screen.findByTestId('task-side-panel')
      const handle = screen.getByRole('separator', { name: 'Resize task panel' })
      const spy = vi.spyOn(Storage.prototype, 'setItem')
      fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 })
      fireEvent.pointerMove(window, { clientX: 700, pointerId: 1 })
      expect(panel).toHaveStyle({ width: '500px' })
      expect(spy).not.toHaveBeenCalled()
      fireEvent.pointerUp(window, { clientX: 700, pointerId: 1 })
      expect(spy).toHaveBeenCalledWith('archipelago.panelWidth', '500')
      spy.mockRestore()
    })
  })

  describe('milestone filter', () => {
    const milestoneSelect = () => screen.getByRole('combobox', { name: 'Milestone' })

    test('is on island and district drawers only, with All tasks, No milestone, then milestones', async () => {
      const { api, beta } = seeded()
      const { router } = renderApp({ api, path: '/', desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Due today & overdue' })
      expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
      expect(
        within(milestoneSelect())
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['All tasks', 'No milestone', 'MVP'])
      expect(milestoneSelect()).toHaveDisplayValue('All tasks')
    })

    test('a milestone flies into its district; All tasks flies back out', async () => {
      const { api, beta, mvp } = seeded()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Beta' })
      await user.selectOptions(milestoneSelect(), 'MVP')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${mvp.id}`)
      expect(await screen.findByRole('heading', { level: 2, name: 'MVP' })).toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('MVP')
      await user.selectOptions(milestoneSelect(), 'All tasks')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    })

    test('No milestone filters the island list, and resets after leaving the island', async () => {
      const { api, beta, gamma } = seeded()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'Beta' })
      expect(screen.getByText('MVP task')).toBeInTheDocument()
      await user.selectOptions(milestoneSelect(), 'No milestone')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
      expect(screen.getByText('Late one')).toBeInTheDocument()
      expect(screen.queryByText('MVP task')).not.toBeInTheDocument()
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: gamma.id } }))
      await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
      expect(await screen.findByText('MVP task')).toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('All tasks')
    })

    test('No milestone from inside a district lands on the island with the filter on', async () => {
      const { api, beta, mvp } = seeded()
      const { user, router } = renderApp({
        api,
        path: `/p/${beta.id}/m/${mvp.id}`,
        desktop: true,
      })
      await screen.findByRole('heading', { level: 2, name: 'MVP' })
      await user.selectOptions(milestoneSelect(), 'No milestone')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
      expect(await screen.findByText('Late one')).toBeInTheDocument()
      expect(screen.queryByText('MVP task')).not.toBeInTheDocument()
      expect(milestoneSelect()).toHaveDisplayValue('No milestone')
    })

    test('New task takes its milestone from where you are', async () => {
      const { api, beta, mvp } = seeded()
      const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
      await screen.findByRole('heading', { level: 2, name: 'MVP' })
      await user.click(screen.getByRole('button', { name: 'New task' }))
      const dialog = await screen.findByRole('dialog', { name: 'New task' })
      expect(within(dialog).getByRole('combobox', { name: 'Milestone' })).toHaveDisplayValue('MVP')
    })
  })
})
