import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { WorldSceneProps } from '../scene/world-scene'
import { createFakeApi, fakeBuilding, fakeEntry, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

// jsdom lacks pointer capture; vaul's phone drawer captures the pointer on every press inside the
// Shop dialog.
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

const sceneControl = vi.hoisted(() => ({ holdReady: false }))

// Stands in for the canvas: exposes placement plots, decorations and structures as buttons.
vi.mock('../scene/world-scene', async () => {
  const { useEffect } = await import('react')
  return {
    WorldScene: ({
      model,
      placement,
      selectedBuildingId,
      coveredBottom,
      onPickPlot,
      onSelectBuilding,
      onSelect,
      onReady,
    }: WorldSceneProps) => {
      useEffect(() => {
        if (!sceneControl.holdReady) onReady?.()
      }, [onReady])
      return (
        <div
          data-testid="scene"
          data-covered={coveredBottom}
          data-plots={placement?.plots.length ?? 0}
          data-ghost={placement?.ghost ? `${placement.ghost.plot.q},${placement.ghost.plot.r}` : ''}
          data-building={selectedBuildingId ?? ''}
        >
          <button type="button" onClick={() => onReady?.()}>
            report ready
          </button>
          {placement?.plots.map((p) => (
            <button key={`${p.q},${p.r}`} type="button" onClick={() => onPickPlot(p)}>
              plot {p.q},{p.r}
            </button>
          ))}
          {model.islands.flatMap((island) => [
            ...island.decorations.map((d) => (
              <button
                key={d.buildingId}
                type="button"
                onClick={() => onSelectBuilding(d.buildingId)}
              >
                decoration {d.type}
              </button>
            )),
            ...island.structures.map((s) => (
              <button key={s.taskId} type="button" onClick={() => onSelect(s.taskId)}>
                structure {s.taskId}
              </button>
            )),
          ])}
        </div>
      )
    },
  }
})

function seeded(funds = 100) {
  const beta = fakeProject({ name: 'Beta' })
  const task = fakeTask({ projectId: beta.id, title: 'Ship', plotX: 1, plotY: 0 })
  const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: -1, plotY: 0 })
  const fake = createFakeApi({
    world: { projects: [beta], milestones: [], tasks: [task], buildings: [pine] },
    ledger: [fakeEntry({ kind: 'daily_bonus', amount: funds })],
  })
  return { beta, task, pine, ...fake }
}

const scene = () => screen.getByTestId('scene')

async function startPlacing(user: ReturnType<typeof renderApp>['user'], name = /Pine tree/) {
  await user.click(await screen.findByRole('button', { name: 'Shop' }))
  const dialog = await screen.findByRole('dialog', { name: 'Shop' })
  await user.click(within(dialog).getByRole('button', { name }))
}

describe('shop on the world screen', () => {
  test('the Shop chip shows on an island, not on the archipelago', async () => {
    const { api, beta } = seeded()
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    expect(screen.queryByRole('button', { name: 'Shop' })).not.toBeInTheDocument()
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    expect(await screen.findByRole('button', { name: 'Shop' })).toBeInTheDocument()
  })

  test('pick, place and pay', async () => {
    const { api, beta, state } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await screen.findByTestId('scene')
    const coveredBefore = Number(scene().dataset.covered)
    await startPlacing(user)
    expect(screen.queryByRole('dialog', { name: 'Shop' })).not.toBeInTheDocument()
    // The sheet drops to its lowest detent, so less of the world is covered.
    expect(Number(scene().dataset.covered)).toBeLessThan(coveredBefore)
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
    expect(Number(scene().dataset.plots)).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    expect(scene().dataset.ghost).toBe('0,1')
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    expect(await screen.findByText('Pine tree placed · −30')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Placing Pine tree' })).not.toBeInTheDocument()
    expect(state.world.buildings.map((b) => [b.plotX, b.plotY])).toContainEqual([0, 1])
  })

  test('a double tap on Place buys once', async () => {
    const { api, beta, calls } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    const place = screen.getByRole('button', { name: 'Place · 30' })
    fireEvent.click(place)
    fireEvent.click(place)
    await screen.findByText('Pine tree placed · −30')
    expect(calls.filter((c) => c === 'placeBuilding')).toHaveLength(1)
  })

  test('a taken plot keeps placement open and clears the ghost', async () => {
    const { api, beta, state } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    state.world.tasks.push(fakeTask({ projectId: beta.id, plotX: 0, plotY: 1 }))
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    expect(await screen.findByText('That plot is taken')).toBeInTheDocument()
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
    expect(scene().dataset.ghost).toBe('')
  })

  test('a refetch that takes the ghost’s plot clears the ghost', async () => {
    const { api, beta, state } = seeded()
    const { user, queryClient } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    state.world.tasks.push(fakeTask({ projectId: beta.id, plotX: 0, plotY: 1 }))
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    // The query notifies its observers on a later tick than the refetch resolves.
    await waitFor(() => expect(scene().dataset.ghost).toBe(''))
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
  })

  test('Cancel, Escape and a route change all end placement with nothing spent', async () => {
    const { api, beta, calls } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(scene().dataset.plots).toBe('0')

    await startPlacing(user)
    await user.keyboard('{Escape}')
    expect(scene().dataset.plots).toBe('0')
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)

    await startPlacing(user)
    await act(() => router.navigate({ to: '/' }))
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    expect(scene().dataset.plots).toBe('0')
    expect(calls).not.toContain('placeBuilding')
  })

  test('a slow purchase on one island leaves placement on the next alone', async () => {
    const { api, beta, state } = seeded()
    const gamma = fakeProject({ name: 'Gamma' })
    state.world.projects.push(gamma)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const placeBuilding = api.placeBuilding
    api.placeBuilding = async (input) => {
      await gate
      return placeBuilding(input)
    }
    const { user, router } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    expect(screen.getByRole('button', { name: 'Placing…' })).toBeDisabled()

    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: gamma.id } }))
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    expect(screen.getByRole('button', { name: 'Place · 30' })).toBeEnabled()

    await act(async () => release())
    expect(await screen.findByText('Pine tree placed · −30')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Placing Pine tree' })).toBeInTheDocument()
    expect(scene().dataset.ghost).toBe('0,1')
    expect(screen.getByRole('button', { name: 'Place · 30' })).toBeEnabled()
    expect(state.world.buildings.map((b) => [b.projectId, b.plotX, b.plotY])).toContainEqual([
      beta.id,
      0,
      1,
    ])
  })

  test('opening an editor ends placement', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    await user.click(screen.getByRole('button', { name: 'Edit island' }))
    expect(await screen.findByRole('dialog', { name: 'Edit island' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Placing Pine tree' })).not.toBeInTheDocument()
    expect(scene().dataset.plots).toBe('0')
  })

  test('select a decoration, remove it for half back', async () => {
    const { api, beta, task, pine, state } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const shipRow = () => screen.getByText('Ship').closest('li')
    await user.click(await screen.findByRole('button', { name: `structure ${task.id}` }))
    expect(shipRow()).toHaveAttribute('aria-current', 'true')
    await user.click(screen.getByRole('button', { name: 'decoration pine' }))
    expect(scene().dataset.building).toBe(pine.id)
    // Selecting a decoration clears the selected task.
    expect(shipRow()).not.toHaveAttribute('aria-current')
    await user.click(screen.getByRole('button', { name: 'Remove (+15)' }))
    expect(confirm).toHaveBeenCalledWith('Remove Pine tree for 15 Supplies back?')
    expect(await screen.findByText('+15 Supplies')).toBeInTheDocument()
    expect(state.world.buildings).toEqual([])
    confirm.mockRestore()
  })

  test('the Shop chip waits until the scene reports ready', async () => {
    sceneControl.holdReady = true
    try {
      const { api, beta } = seeded()
      const { user } = renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      expect(screen.queryByRole('button', { name: 'Shop' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'report ready' }))
      expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument()
    } finally {
      sceneControl.holdReady = false
    }
  })

  test('a purchase from A settling after A→B→A leaves the new placement on A open', async () => {
    const { api, beta, state } = seeded()
    const gamma = fakeProject({ name: 'Gamma' })
    state.world.projects.push(gamma)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const placeBuilding = api.placeBuilding
    api.placeBuilding = async (input) => {
      await gate
      return placeBuilding(input)
    }
    const { user, router } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    const placing = screen.getByRole('button', { name: 'Placing…' })
    expect(placing.querySelector('.motion-safe\\:animate-spin')).not.toBeNull()

    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: gamma.id } }))
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot -1,1' }))

    await act(async () => release())
    expect(await screen.findByText('Pine tree placed · −30')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Placing Pine tree' })).toBeInTheDocument()
    await waitFor(() => expect(scene().dataset.ghost).toBe('-1,1'))
  })

  test('a double tap on Remove sends one request', async () => {
    const { api, beta, calls } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await user.click(await screen.findByRole('button', { name: 'decoration pine' }))
    const remove = screen.getByRole('button', { name: 'Remove (+15)' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(await screen.findByText('+15 Supplies')).toBeInTheDocument()
    expect(calls.filter((c) => c === 'removeBuilding')).toHaveLength(1)
    confirm.mockRestore()
  })
})

describe('desktop task panel toggle', () => {
  const panel = () => screen.getByTestId('task-side-panel')
  const search = () => screen.getByRole('searchbox', { name: 'Search tasks', hidden: true })
  const collapse = (user: ReturnType<typeof renderApp>['user']) =>
    user.click(screen.getByRole('button', { name: 'Collapse task panel' }))

  test('collapses to a strip without the resize handle, expands back, and remembers', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByTestId('scene')
    await collapse(user)
    expect(panel()).toHaveAttribute('data-collapsed', 'true')
    expect(search()).not.toBeVisible()
    expect(screen.queryByRole('separator', { name: 'Resize task panel' })).not.toBeInTheDocument()
    const expand = screen.getByRole('button', { name: 'Expand task panel' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')

    cleanup()
    renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByTestId('scene')
    expect(panel()).toHaveAttribute('data-collapsed', 'true')
    await user.click(screen.getByRole('button', { name: 'Expand task panel' }))
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
    expect(search()).toBeVisible()
    expect(screen.getByRole('separator', { name: 'Resize task panel' })).toBeInTheDocument()
  })

  test('] toggles the panel, except while typing', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByTestId('scene')
    await user.click(search())
    await user.keyboard(']')
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
    expect(search()).toHaveValue(']')
    search().blur()
    await user.keyboard(']')
    expect(panel()).toHaveAttribute('data-collapsed', 'true')
    await user.keyboard(']')
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
  })

  test('/ opens a collapsed panel and focuses the search', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByTestId('scene')
    await collapse(user)
    await user.keyboard('/')
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
    expect(search()).toHaveFocus()
  })

  test('placing, or selecting a structure or decoration, opens a collapsed panel', async () => {
    const { api, beta, task } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await screen.findByTestId('scene')

    await collapse(user)
    await startPlacing(user)
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByRole('toolbar', { name: 'Placing Pine tree' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await collapse(user)
    await user.click(screen.getByRole('button', { name: `structure ${task.id}` }))
    expect(panel()).toHaveAttribute('data-collapsed', 'false')

    await collapse(user)
    await user.click(screen.getByRole('button', { name: 'decoration pine' }))
    expect(panel()).toHaveAttribute('data-collapsed', 'false')
  })
})
