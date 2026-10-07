import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppProviders } from '../app/providers'
import { createQueryClient } from '../app/query-client'
import { createFakeApi, fakeProject, fakeTask } from '../test/fake-api'
import { TaskPanel } from './task-panel'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const project = fakeProject({ name: 'Beta' })
  const tasks = [
    fakeTask({ projectId: project.id, title: 'Write docs', sortOrder: 0 }),
    fakeTask({ projectId: project.id, title: 'Ship build', sortOrder: 1 }),
  ]
  const world = { projects: [project], milestones: [], tasks, buildings: [] }
  const { api } = createFakeApi({ world })
  const worldDto = {
    ...world,
    economy: {
      balance: 0,
      streak: { days: 0, activeToday: false, next: null },
      daily: { amount: 15, claimedToday: false },
    },
  }
  const ui = (selectedTaskId: string | null) => (
    <AppProviders api={api} queryClient={createQueryClient(() => {}, false)}>
      <TaskPanel
        world={worldDto}
        focus={{ kind: 'island', projectId: project.id }}
        title="Beta"
        today="2026-10-07"
        selectedTaskId={selectedTaskId}
      />
    </AppProviders>
  )
  return { tasks, ui }
}

const row = (title: string) => screen.getByText(title).closest('li')

describe('task selection in the panel', () => {
  test('the selected row is marked current and scrolled into view', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    expect(row('Ship build')).not.toHaveAttribute('aria-current')
    rerender(ui(tasks[1]?.id ?? null))
    expect(row('Ship build')).toHaveAttribute('aria-current', 'true')
    expect(row('Write docs')).not.toHaveAttribute('aria-current')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(row('Ship build'))
  })

  test('selecting a row hidden by the search clears the search once; later typing stays', async () => {
    const user = userEvent.setup()
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    const search = screen.getByRole('searchbox', { name: 'Search tasks' })
    await user.type(search, 'docs')
    expect(screen.queryByText('Ship build')).toBeNull()

    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('')
    expect(row('Ship build')).toHaveAttribute('aria-current', 'true')

    await user.type(search, 'ship')
    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('ship')
  })

  test('a selection that is already visible leaves the search alone', async () => {
    const user = userEvent.setup()
    const { tasks, ui } = setup()
    const { rerender } = render(ui(null))
    const search = screen.getByRole('searchbox', { name: 'Search tasks' })
    await user.type(search, 'ship')
    rerender(ui(tasks[1]?.id ?? null))
    expect(search).toHaveValue('ship')
  })
})
