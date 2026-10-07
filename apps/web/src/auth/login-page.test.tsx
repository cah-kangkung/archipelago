import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

describe('auth flow', () => {
  test('signed-out visitors to / land on the login form', async () => {
    const { api } = createFakeApi({ user: null })
    const { router } = renderApp({ api, path: '/' })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  test('a wrong password shows the server message and stays on /login', async () => {
    const { api } = createFakeApi({ user: null })
    const { user, router } = renderApp({ api, path: '/login' })
    await user.type(await screen.findByLabelText('Email'), 'boss@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(router.state.location.pathname).toBe('/login')
  })

  test('signing in goes to the archipelago', async () => {
    const { api } = createFakeApi({
      user: null,
      world: {
        projects: [fakeProject({ name: 'Beta' })],
        milestones: [],
        tasks: [],
        buildings: [],
      },
    })
    const { user, router } = renderApp({ api, path: '/login' })
    await user.type(await screen.findByLabelText('Email'), 'boss@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    // Beta appears on its island card and its switcher chip from Task 5 on.
    expect((await screen.findAllByText('Beta')).length).toBeGreaterThan(0)
    expect(router.state.location.pathname).toBe('/')
  })

  test('logging out returns to the login form', async () => {
    const { api, calls } = createFakeApi()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(calls).toContain('logout')
  })

  test('a session that expires mid-use sends the user to /login', async () => {
    const { api, state } = createFakeApi({
      world: {
        projects: [fakeProject({ name: 'Beta' })],
        milestones: [],
        tasks: [],
        buildings: [],
      },
    })
    const { router, queryClient } = renderApp({ api, path: '/' })
    // Beta appears on its island card and its switcher chip from Task 5 on.
    expect((await screen.findAllByText('Beta')).length).toBeGreaterThan(0)

    state.user = null // server-side expiry
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  test('a 401 from a mutation sends the user to /login', async () => {
    const project = fakeProject({ name: 'Beta' })
    const { api, state } = createFakeApi({
      world: {
        projects: [project],
        milestones: [],
        tasks: [fakeTask({ projectId: project.id, title: 'Ship' })],
        buildings: [],
      },
    })
    const { user, router } = renderApp({ api, path: `/p/${project.id}` })
    const button = await screen.findByRole('button', { name: 'Mark "Ship" as doing' })
    state.user = null
    await user.click(button)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  test('a failed logout keeps the session and says so', async () => {
    const { api } = createFakeApi()
    api.logout = async () => {
      throw new ApiError(500, 'internal', 'boom')
    }
    const { user, router } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByText("Couldn't log out. Try again.")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })
})
