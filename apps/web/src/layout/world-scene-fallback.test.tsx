import { screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { createFakeApi, fakeProject } from '../test/fake-api'
import { renderApp } from '../test/render-app'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// The probe passed, but the renderer could not get a context (or the chunk failed to load).
vi.mock('../scene/world-scene', () => ({
  WorldScene: () => {
    throw new Error('Error creating WebGL context.')
  },
}))

describe('World screen when the 3D scene fails', () => {
  test('falls back to the card view instead of the root error screen', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { api } = createFakeApi({
      world: {
        projects: [fakeProject({ name: 'Beta' })],
        milestones: [],
        tasks: [],
        buildings: [],
      },
    })
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(within(cards).getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong loading Archipelago.')).toBeNull()
    // The HUD hides: the card view carries its own New island button, so there is exactly one.
    expect(screen.getAllByRole('button', { name: 'New island' })).toHaveLength(1)
    quiet.mockRestore()
  })
})
