import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ShopPanel } from './shop-panel'

const item = (name: RegExp) => screen.getByRole('button', { name })

describe('ShopPanel', () => {
  test('lists every item with its price; affordable ones pick', async () => {
    const onPick = vi.fn()
    render(<ShopPanel balance={50} hasFreeLand onPick={onPick} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(item(/Pine tree.*30/)).toBeEnabled()
    expect(item(/Palm tree.*40/)).toBeEnabled()
    expect(item(/Flower garden.*60/)).toBeDisabled()
    expect(item(/Flower garden/)).toHaveAccessibleDescription('Need 10 more')
    await userEvent.click(item(/Palm tree/))
    expect(onPick).toHaveBeenCalledWith('palm')
  })

  test('a balance equal to the price is enough', () => {
    render(<ShopPanel balance={30} hasFreeLand onPick={() => {}} />)
    expect(item(/Pine tree/)).toBeEnabled()
    expect(item(/Palm tree/)).toHaveAccessibleDescription('Need 10 more')
  })

  test('a negative balance disables everything and says why', () => {
    render(<ShopPanel balance={-5} hasFreeLand onPick={() => {}} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription('Balance is negative')
    }
  })

  test('no free land disables everything with one message', () => {
    render(<ShopPanel balance={1000} hasFreeLand={false} onPick={() => {}} />)
    expect(screen.getByText('No free land. Islands grow as you add tasks.')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })

  test('the reason is read once, as the description, and sits outside the dimmed card', () => {
    render(<ShopPanel balance={50} hasFreeLand onPick={() => {}} />)
    const garden = item(/Flower garden/)
    expect(garden).not.toHaveAccessibleName(/Need/)
    expect(garden).toHaveAccessibleDescription('Need 10 more')
    expect(garden).not.toContainElement(screen.getByText('Need 10 more'))
  })
})
