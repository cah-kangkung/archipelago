import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { WorldSceneProps } from '../scene/world-scene'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { resetPerfFlag } from '../world/perf-flag'
import { addDays, todayIn } from '../world/selectors'

const renderAppWithUnmount = (...args: Parameters<typeof renderApp>) => ({
  ...renderApp(...args),
  unmount: cleanup,
})

// Every anchor the stub scene was ever rendered with, in order.
const seenAnchors = vi.hoisted((): string[] => [])

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// Stands in for the WebGL canvas: exposes the scene's callbacks as plain buttons.
vi.mock('../scene/world-scene', () => ({
  WorldScene: ({
    model,
    focus,
    selectedTaskId,
    onSelect,
    onOpenIsland,
    onOpenDistrict,
    coveredBottom,
    indicators,
    anchor,
    hudInset,
    onNewProject,
    life,
  }: WorldSceneProps) => {
    seenAnchors.push(anchor ?? '')
    return (
      <div
        data-testid="scene"
        data-focus={focus.kind}
        data-selected={selectedTaskId ?? ''}
        data-covered={coveredBottom}
        data-anchor={anchor ?? ''}
        data-hud-inset={hudInset}
        data-stages={model.islands.map((i) => i.stage).join(',')}
        data-boats={life.boats.length}
        data-flocks={life.flocks.length}
      >
        <button
          type="button"
          onClick={() =>
            indicators.set([
              {
                projectId: model.islands[0]?.projectId ?? '',
                name: model.islands[0]?.name ?? '',
                urgency: 'overdue',
                count: 2,
                left: 10,
                top: 20,
                angle: 0,
              },
            ])
          }
        >
          report indicator
        </button>
        {model.islands.length === 0 && onNewProject && (
          <button type="button" onClick={onNewProject}>
            Create your first island
          </button>
        )}
        {model.islands.map((island) => (
          <div key={island.projectId}>
            <button type="button" onClick={() => onOpenIsland(island.projectId)}>
              open {island.name}
            </button>
            {island.districts.map((d) => (
              <button
                key={d.milestoneId}
                type="button"
                onClick={() => onOpenDistrict(island.projectId, d.milestoneId)}
              >
                open district {d.name}
              </button>
            ))}
            {island.structures.map((s) => (
              <button key={s.taskId} type="button" onClick={() => onSelect(s.taskId)}>
                select {s.taskId}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  },
}))

function seeded() {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  const loose = fakeTask({ projectId: beta.id, title: 'Loose task' })
  const inMvp = fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'MVP task', plotX: 6 })
  const fake = createFakeApi({
    world: { projects: [beta], milestones: [mvp], tasks: [loose, inMvp], buildings: [] },
  })
  return { ...fake, beta, mvp, loose, inMvp }
}

describe('World screen with the 3D scene', () => {
  test('archipelago: the scene renders with a New island HUD button; tapping an island flies in', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: '/' })
    const scene = await screen.findByTestId('scene')
    expect(scene).toHaveAttribute('data-focus', 'archipelago')
    expect(screen.queryByTestId('island-cards')).toBeNull()
    expect(screen.getByRole('button', { name: 'New island' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'open Beta' }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    expect(await screen.findByRole('link', { name: '← Archipelago' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit island' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New milestone' })).toBeInTheDocument()
  })

  test('a vignette softens the canvas edges without catching taps', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    const vignette = screen.getByTestId('vignette')
    expect(vignette).toHaveClass('pointer-events-none')
    expect(vignette).toHaveAttribute('aria-hidden', 'true')
  })

  test('recent progress reaches the scene as boats and gulls', async () => {
    const beta = fakeProject({ name: 'Beta' })
    const justNow = new Date().toISOString()
    const tasks = [1, 2, 3, 4].map((i) =>
      fakeTask({ projectId: beta.id, status: 'done', completedAt: justNow, plotX: i, plotY: 0 }),
    )
    const { api } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks, buildings: [] },
    })
    renderApp({ api, path: '/' })
    const scene = await screen.findByTestId('scene')
    expect(scene).toHaveAttribute('data-boats', '2')
    expect(scene).toHaveAttribute('data-flocks', '1')
  })

  test('an empty world offers its first island from the sea, not a HUD note', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Create your first island' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'New island' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('No islands yet. Create one to start building.')).toBeNull()
  })

  test('creating the first island replaces the empty prompt with the island', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Create your first island' }))
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Alpha')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create island' }),
    )
    expect(await screen.findByRole('button', { name: 'open Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create your first island' })).toBeNull()
  })

  test('HUD buttons open the matching editors', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Edit island' }),
    ).toBeInTheDocument()
  })

  test('district: back link names the island, and Edit milestone opens its editor', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit milestone' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Edit milestone' }),
    ).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('link', { name: '← Beta' }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
  })

  test('phone: selecting a structure highlights its row and raises a collapsed sheet', async () => {
    const { api, beta, loose } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const sheet = await screen.findByTestId('task-sheet')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize task sheet' }), {
      key: 'ArrowDown',
    })
    expect(sheet).toHaveAttribute('data-detent', '0')

    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    expect(sheet).toHaveAttribute('data-detent', '1')
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', loose.id)
    expect(screen.getByText('Loose task').closest('li')).toHaveAttribute('aria-current', 'true')
  })

  test('selection never lowers an open sheet and clears when the route changes', async () => {
    const { api, beta, loose } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const sheet = await screen.findByTestId('task-sheet')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize task sheet' }), {
      key: 'ArrowUp',
    })
    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    expect(sheet).toHaveAttribute('data-detent', '2')

    await user.click(screen.getByRole('button', { name: 'open district MVP' }))
    expect(await screen.findByRole('link', { name: '← Beta' })).toBeInTheDocument()
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', '')
  })

  test('deleting the selected task drops the selection without errors', async () => {
    const { api, beta, loose } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: `select ${loose.id}` }))
    await user.click(screen.getByRole('button', { name: 'Delete "Loose task"' }))
    await waitFor(() => expect(screen.queryByText('Loose task')).toBeNull())
    expect(screen.getByTestId('scene')).toHaveAttribute('data-selected', '')
    confirm.mockRestore()
  })

  test('the scene learns how much of it the phone sheet covers; none on desktop', async () => {
    const { api, beta } = seeded()
    renderApp({ api, path: `/p/${beta.id}` })
    const scene = await screen.findByTestId('scene')
    // jsdom: window.innerHeight is 768 and the HUD has no layout height.
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '384'))
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize task sheet' }), {
      key: 'ArrowDown',
    })
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '120'))
  })

  test('desktop: nothing covers the scene, and the side panel has no island chips', async () => {
    const { api, beta } = seeded()
    renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    expect(await screen.findByTestId('scene')).toHaveAttribute('data-covered', '0')
    const panel = screen.getByTestId('task-side-panel')
    expect(within(panel).queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()
  })

  test('an off-screen urgent island shows a labelled edge marker that opens it', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'report indicator' }))
    const marker = screen.getByRole('button', { name: 'Beta island, 2 overdue, off screen' })
    expect(marker).toHaveStyle({ left: '10px', top: '20px' })
    await user.click(marker)
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
  })

  describe('layer picker', () => {
    function urgentWorld() {
      const today = todayIn('Asia/Jakarta')
      const beta = fakeProject({ name: 'Beta' })
      const gamma = fakeProject({ name: 'Gamma' })
      const calm = fakeProject({ name: 'Calm' })
      const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP', sortOrder: 0 })
      const later = fakeMilestone({ projectId: beta.id, name: 'Later', sortOrder: 1 })
      const tasks = [
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -2), plotX: 1, plotY: 0 }),
        fakeTask({ projectId: beta.id, dueDate: addDays(today, -1), plotX: 2, plotY: 0 }),
        fakeTask({ projectId: beta.id, milestoneId: mvp.id, dueDate: today, plotX: 3, plotY: 0 }),
        fakeTask({ projectId: gamma.id, dueDate: today, plotX: 1, plotY: 0 }),
      ]
      const fake = createFakeApi({
        world: { projects: [beta, gamma, calm], milestones: [mvp, later], tasks, buildings: [] },
      })
      return { ...fake, beta, gamma, calm, mvp, later }
    }
    const islandPicker = () => screen.getByRole('combobox', { name: 'Island' })
    const milestonePicker = () => screen.getByRole('combobox', { name: 'Milestone' })
    const labels = (el: HTMLElement) =>
      within(el)
        .getAllByRole('option')
        .map((o) => o.textContent)

    test('on the archipelago it lists every island with its urgency, after "All islands"', async () => {
      const { api } = urgentWorld()
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      expect(labels(islandPicker())).toEqual([
        'All islands',
        'Beta · 2 overdue',
        'Gamma · due soon',
        'Calm',
      ])
      expect(screen.queryByRole('combobox', { name: 'Milestone' })).not.toBeInTheDocument()
    })

    test('on an island and in a district it lists that island’s milestones, on phone and desktop', async () => {
      for (const desktop of [false, true]) {
        const { api, beta, mvp } = urgentWorld()
        const { router, unmount } = renderAppWithUnmount({ api, path: `/p/${beta.id}`, desktop })
        await screen.findByTestId('scene')
        expect(screen.queryByRole('combobox', { name: 'Island' })).not.toBeInTheDocument()
        expect(labels(milestonePicker())).toEqual([
          'Beta (whole island)',
          'MVP · due soon',
          'Later',
        ])
        expect(milestonePicker()).toHaveDisplayValue('Beta (whole island)')
        await act(() =>
          router.navigate({
            to: '/p/$projectId/m/$milestoneId',
            params: { projectId: beta.id, milestoneId: mvp.id },
          }),
        )
        expect(milestonePicker()).toHaveDisplayValue('MVP · due soon')
        unmount()
      }
    })

    test('picking a milestone flies into it; the first option flies back to the island', async () => {
      const { api, beta, later } = urgentWorld()
      const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
      await screen.findByTestId('scene')
      await user.selectOptions(milestonePicker(), 'Later')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${later.id}`)
      await user.selectOptions(milestonePicker(), 'Beta (whole island)')
      expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    })

    test('picking an island flies there; "All islands" is the way back from the archipelago list', async () => {
      const { api, gamma } = urgentWorld()
      const { user, router } = renderApp({ api, path: '/', desktop: true })
      await screen.findByTestId('scene')
      await user.selectOptions(islandPicker(), 'Gamma · due soon')
      expect(router.state.location.pathname).toBe(`/p/${gamma.id}`)
    })

    test('an island with no milestones lists only itself', async () => {
      const { api, calm } = urgentWorld()
      renderApp({ api, path: `/p/${calm.id}` })
      await screen.findByTestId('scene')
      expect(labels(milestonePicker())).toEqual(['Calm (whole island)'])
    })

    test('a lone calm island is listed plainly on the archipelago', async () => {
      const calm = fakeProject({ name: 'Calm' })
      const { api } = createFakeApi({
        world: { projects: [calm], milestones: [], tasks: [], buildings: [] },
      })
      renderApp({ api, path: '/' })
      await screen.findByTestId('scene')
      expect(labels(islandPicker())).toEqual(['All islands', 'Calm'])
    })

    test('no island chips remain in the drawer or above the sheet', async () => {
      for (const desktop of [false, true]) {
        const { api, beta } = urgentWorld()
        const { unmount } = renderAppWithUnmount({ api, path: `/p/${beta.id}`, desktop })
        await screen.findByTestId('scene')
        expect(screen.queryByRole('navigation', { name: 'Islands' })).not.toBeInTheDocument()
        unmount()
      }
    })
  })

  describe('opening focus', () => {
    test.each([
      ['Delete island', true],
      ['Archive island', false],
    ])(
      '%s on the island you are on never opens the archipelago on it',
      async (button, confirms) => {
        const beta = fakeProject({ name: 'Beta', archipelagoX: 0 })
        const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1 })
        // Beta is overdue, so a stale cache would pick it by urgency as well as by stepping out.
        const late = fakeTask({ projectId: beta.id, title: 'Late', dueDate: '2000-01-01' })
        const { api } = createFakeApi({
          world: { projects: [beta, gamma], milestones: [], tasks: [late], buildings: [] },
        })
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirms)
        seenAnchors.length = 0
        const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
        await user.click(await screen.findByRole('button', { name: 'Edit island' }))
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: button }))
        await waitFor(() => expect(router.state.location.pathname).toBe('/'))
        // The refetch has landed once the deleted island leaves the scene.
        await waitFor(() => expect(screen.queryByRole('button', { name: 'open Beta' })).toBeNull())
        expect(screen.getByRole('button', { name: 'open Gamma' })).toBeInTheDocument()
        // Not even for one render: the rig would capture that origin as its flight target.
        expect(seenAnchors).not.toContain(beta.id)
        confirm.mockRestore()
      },
    )

    function twoIslands({ gammaOverdue }: { gammaOverdue: boolean }) {
      const beta = fakeProject({ name: 'Beta', archipelagoX: 0 })
      const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1 })
      const tasks = gammaOverdue
        ? [fakeTask({ projectId: gamma.id, title: 'Late', dueDate: '2000-01-01' })]
        : []
      const { api } = createFakeApi({
        world: { projects: [beta, gamma], milestones: [], tasks, buildings: [] },
      })
      return { api, beta, gamma }
    }

    test('a fresh load centres the most urgent island; stepping out centres the one left', async () => {
      const { api, beta, gamma } = twoIslands({ gammaOverdue: true })
      const { user } = renderApp({ api, path: '/' })
      expect(await screen.findByTestId('scene')).toHaveAttribute('data-anchor', gamma.id)
      await user.click(screen.getByRole('button', { name: 'open Beta' }))
      await user.click(await screen.findByRole('link', { name: '← Archipelago' }))
      await waitFor(() =>
        expect(screen.getByTestId('scene')).toHaveAttribute('data-anchor', beta.id),
      )
    })

    test('with nothing urgent, the last-viewed island from an earlier visit is centred', async () => {
      const { api, gamma } = twoIslands({ gammaOverdue: false })
      localStorage.setItem('archipelago.lastIsland', gamma.id)
      renderApp({ api, path: '/' })
      expect(await screen.findByTestId('scene')).toHaveAttribute('data-anchor', gamma.id)
    })

    test('showing an island remembers it; storage that throws breaks nothing', async () => {
      const { api, beta } = twoIslands({ gammaOverdue: false })
      renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      await waitFor(() => expect(localStorage.getItem('archipelago.lastIsland')).toBe(beta.id))
      cleanup()

      const deny = () => {
        throw new Error('storage denied')
      }
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(deny)
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(deny)
      const { router } = renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      await router.navigate({ to: '/' })
      await waitFor(() =>
        expect(screen.getByTestId('scene')).toHaveAttribute('data-anchor', beta.id),
      )
      get.mockRestore()
      set.mockRestore()
    })
  })

  test('?perf shows the performance overlay; without it there is none', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    expect(screen.queryByRole('complementary', { name: 'Performance' })).toBeNull()
    cleanup()
    window.history.replaceState(null, '', '/?perf')
    resetPerfFlag()
    try {
      renderApp({ api, path: '/' })
      const overlay = await screen.findByRole('complementary', { name: 'Performance' })
      // The stub scene renders no frames, so the overlay is still waiting.
      expect(overlay).toHaveTextContent('Waiting for frames')
    } finally {
      window.history.replaceState(null, '', '/')
      resetPerfFlag()
    }
  })

  test('the scene learns the HUD height, so edge markers can sit below it', async () => {
    const measured = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'world-hud' ? 68 : 0
      })
    try {
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const scene = await screen.findByTestId('scene')
      await waitFor(() => expect(scene).toHaveAttribute('data-hud-inset', '68'))
    } finally {
      measured.mockRestore()
    }
  })

  test('finishing the task that crosses a growth threshold reaches the scene as a new stage', async () => {
    const beta = fakeProject({ name: 'Beta' })
    const tasks = [
      fakeTask({ projectId: beta.id, status: 'done', plotX: 1, plotY: 0 }),
      fakeTask({ projectId: beta.id, status: 'done', plotX: 2, plotY: 0 }),
      fakeTask({ projectId: beta.id, title: 'Third', status: 'doing', plotX: 3, plotY: 0 }),
    ]
    const { api } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks, buildings: [] },
    })
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    expect(await screen.findByTestId('scene')).toHaveAttribute('data-stages', '0')
    await user.click(await screen.findByRole('button', { name: 'Mark "Third" as done' }))
    await waitFor(() => expect(screen.getByTestId('scene')).toHaveAttribute('data-stages', '1'))
  })
})
