import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi } from '../test/fake-api'
import { renderApp } from '../test/render-app'

describe('empty world without WebGL', () => {
  test('the card view offers the first island under the same heading', async () => {
    const { api } = createFakeApi()
    const { user } = renderApp({ api, path: '/', desktop: true })
    expect(await screen.findByRole('heading', { name: 'Uncharted waters' })).toBeInTheDocument()
    expect(screen.queryByText('No islands yet. Create one to start building.')).toBeNull()
    expect(screen.queryByTestId('vignette')).toBeNull()
    expect(screen.queryByTestId('cloud-frame')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Create your first island' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'New island' }),
    ).toBeInTheDocument()
  })
})
