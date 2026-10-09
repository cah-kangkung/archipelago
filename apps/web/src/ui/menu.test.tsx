import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu'

describe('Menu', () => {
  test('opens, moves with arrows, selects, and closes on Escape', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <Menu>
        <MenuTrigger>More</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onEdit}>Edit</MenuItem>
          <MenuItem tone="danger" onSelect={onDelete}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>,
    )
    await user.click(screen.getByRole('button', { name: 'More' }))
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
