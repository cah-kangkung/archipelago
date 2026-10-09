import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

describe('Tabs', () => {
  test('arrow keys move between tabs and show their panel', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="tasks">
        <TabsList aria-label="Panels">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="shop">Shop</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">Task list</TabsContent>
        <TabsContent value="shop">Catalogue</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Panels' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Tasks' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Shop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Catalogue')
  })
})
