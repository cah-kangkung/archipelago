import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeApi, fakeProject } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { resetSceneRetries } from '../world/scene-boundary'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// The probe passed, but the renderer could not get a context (or the chunk failed to load).
const scene = vi.hoisted(() => ({ broken: true, attempts: 0 }))
vi.mock('../scene/world-scene', () => ({
  WorldScene: () => {
    scene.attempts += 1
    if (scene.broken) throw new Error('Error creating WebGL context.')
    return <div data-testid="scene" />
  },
}))

const beta = fakeProject({ name: 'Beta' })
const world = { projects: [beta], milestones: [], tasks: [], buildings: [] }

let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  scene.broken = true
  scene.attempts = 0
  resetSceneRetries()
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => quiet.mockRestore())

async function go(router: ReturnType<typeof renderApp>['router'], to: string) {
  await act(async () => {
    await router.navigate({ to })
  })
}

describe('World screen when the 3D scene fails', () => {
  test('falls back to the card view instead of the root error screen', async () => {
    const { api } = createFakeApi({ world })
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(within(cards).getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong loading Archipelago.')).toBeNull()
    // The HUD hides: the card view carries its own New island button, so there is exactly one.
    expect(screen.getAllByRole('button', { name: 'New island' })).toHaveLength(1)
  })

  test('a route change gives a failed scene another try', async () => {
    const { api } = createFakeApi({ world })
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('island-cards')
    scene.broken = false
    await go(router, `/p/${beta.id}`)
    expect(await screen.findByTestId('scene')).toBeInTheDocument()
  })

  test('after two failed retries the cards stay for the rest of the page load', async () => {
    const { api } = createFakeApi({ world })
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('island-cards')
    const tries: number[] = []
    for (const to of [`/p/${beta.id}`, '/', `/p/${beta.id}`]) {
      const before = scene.attempts
      await go(router, to)
      tries.push(scene.attempts - before)
    }
    expect(tries[0]).toBeGreaterThan(0)
    expect(tries[1]).toBeGreaterThan(0)
    expect(tries[2]).toBe(0)
    // The last route is the island, whose card view has no island-cards strip: it lists loose tasks.
    expect(screen.queryByTestId('scene')).toBeNull()
    expect(screen.getByText(/loose tasks/)).toBeInTheDocument()
  })
})
