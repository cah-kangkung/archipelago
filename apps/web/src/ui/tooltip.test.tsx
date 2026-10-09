import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Tooltip } from './tooltip'

describe('Tooltip', () => {
  test('shows on hover and on keyboard focus, hides on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Shop" delay={0}>
        <button type="button">S</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.hover(screen.getByRole('button'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shop')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.unhover(screen.getByRole('button'))
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shop')
  })
})
