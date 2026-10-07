import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi } from '../test/fake-api'
import { renderApp } from '../test/render-app'

describe('router errors', () => {
  test('a failing session check shows an error with a working retry', async () => {
    const { api } = createFakeApi()
    const working = api.me
    let first = true
    api.me = async () => {
      if (first) {
        first = false
        throw new ApiError(500, 'internal', 'boom')
      }
      return working()
    }
    const { user } = renderApp({ api, path: '/' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong loading Archipelago.',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })
})
