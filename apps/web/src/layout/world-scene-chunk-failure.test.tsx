import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeApi, fakeProject } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { resetSceneRetries } from '../world/scene-boundary'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// `vi.mock` cannot make a dynamic import reject, so the loader module is the seam: its first call
// fails like a dropped chunk request, and later calls succeed.
const chunk = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../world/load-world-scene', async () => {
  const { lazy } = await import('react')
  const load = () => {
    chunk.calls += 1
    if (chunk.calls === 1)
      return Promise.reject(new Error('Failed to fetch dynamically imported module'))
    return Promise.resolve({ default: () => <div data-testid="scene" /> })
  }
  return { loadWorldScene: load, createLazyWorldScene: () => lazy(load) }
})

const beta = fakeProject({ name: 'Beta' })
const world = { projects: [beta], milestones: [], tasks: [], buildings: [] }

beforeEach(() => {
  chunk.calls = 0
  resetSceneRetries()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('World screen when the scene chunk fails to load', () => {
  test('the cards show first; the next navigation fetches the chunk again and shows the scene', async () => {
    const { api } = createFakeApi({ world })
    const { router } = renderApp({ api, path: '/' })
    expect(await screen.findByTestId('island-cards')).toBeInTheDocument()
    expect(screen.queryByTestId('scene')).toBeNull()
    await act(async () => {
      await router.navigate({ to: `/p/${beta.id}` })
    })
    expect(await screen.findByTestId('scene')).toBeInTheDocument()
    expect(chunk.calls).toBe(2)
  })
})
