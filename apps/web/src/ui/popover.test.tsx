import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const ui = (
  <Popover>
    <PopoverTrigger>Open</PopoverTrigger>
    <PopoverContent>Hint</PopoverContent>
  </Popover>
)

describe('Popover', () => {
  test('toggles on tap and reports aria-expanded', async () => {
    const user = userEvent.setup()
    render(ui)
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hint')).toBeVisible()
    await user.click(trigger)
    expect(screen.queryByText('Hint')).toBeNull()
  })

  test('an outside pointerdown or Escape closes it; Escape returns focus', async () => {
    const user = userEvent.setup()
    render(ui)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    fireEvent.pointerDown(screen.getByText('Hint'))
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  test('a tap on the trigger while open closes it once and does not reopen', async () => {
    const user = userEvent.setup()
    render(ui)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Hint')).toBeNull()
  })
})
