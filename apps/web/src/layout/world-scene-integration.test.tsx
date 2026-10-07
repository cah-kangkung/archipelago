import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { WorldSceneProps } from '../scene/world-scene'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

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
  }: WorldSceneProps) => (
    <div
      data-testid="scene"
      data-focus={focus.kind}
      data-selected={selectedTaskId ?? ''}
      data-covered={coveredBottom}
    >
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
  ),
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

  test('an empty world says so over the sea', async () => {
    const { api } = createFakeApi()
    renderApp({ api, path: '/' })
    expect(
      await screen.findByText('No islands yet. Create one to start building.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New island' })).toBeInTheDocument()
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
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), {
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
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), { key: 'ArrowUp' })
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
    // jsdom: window.innerHeight is 768 and the switcher strip has no layout height.
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '384'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize task sheet' }), {
      key: 'ArrowDown',
    })
    await waitFor(() => expect(scene).toHaveAttribute('data-covered', '120'))
  })

  test('desktop: nothing covers the scene, and the switcher sits in the side panel', async () => {
    const { api, beta } = seeded()
    renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    expect(await screen.findByTestId('scene')).toHaveAttribute('data-covered', '0')
    const panel = screen.getByTestId('task-side-panel')
    expect(within(panel).getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
