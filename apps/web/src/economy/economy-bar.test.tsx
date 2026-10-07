import { screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeEntry } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays } from '../world/selectors'

const TODAY = '2026-10-07'

describe('EconomyBar', () => {
  test('shows balance and streak; no claim button once claimed', async () => {
    const { api } = createFakeApi({
      today: TODAY,
      ledger: [
        fakeEntry({ day: addDays(TODAY, -1), amount: 25 }),
        fakeEntry({ day: TODAY, amount: 25 }),
        fakeEntry({ kind: 'daily_bonus', day: TODAY, amount: 15 }),
      ],
    })
    renderApp({ api, path: '/' })
    expect(await screen.findByLabelText('65 Supplies')).toBeInTheDocument()
    expect(screen.getByLabelText('2-day streak')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull()
  })

  test('claiming the daily bonus updates the balance and hides the button', async () => {
    const { api, calls } = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Claim +15' }))
    expect(await screen.findByLabelText('15 Supplies')).toBeInTheDocument()
    expect(screen.getByText('Daily bonus +15')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim +15' })).toBeNull()
    expect(calls.filter((c) => c === 'claimDaily')).toHaveLength(1)
  })

  test('an already-claimed conflict shows the server message and refreshes', async () => {
    const fake = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api: fake.api, path: '/' })
    const claim = await screen.findByRole('button', { name: 'Claim +15' })
    // Claimed elsewhere (another tab) after this page loaded.
    fake.state.ledger.push(fakeEntry({ kind: 'daily_bonus', day: TODAY, amount: 15 }))
    await user.click(claim)
    expect(await screen.findByText('Daily bonus already claimed today')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim +15' })).toBeNull())
    expect(screen.getByLabelText('15 Supplies')).toBeInTheDocument()
  })

  test('a negative balance is shown in the error colour', async () => {
    const { api } = createFakeApi({
      today: TODAY,
      ledger: [fakeEntry({ kind: 'purchase', amount: -40, day: TODAY })],
    })
    renderApp({ api, path: '/' })
    expect(await screen.findByLabelText('-40 Supplies')).toHaveClass('text-error')
  })

  test('the claim button is disabled while the claim is pending', async () => {
    const fake = createFakeApi({ today: TODAY })
    const original = fake.api.claimDaily
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fake.api.claimDaily = async () => {
      await gate
      return original()
    }
    const { user } = renderApp({ api: fake.api, path: '/' })
    const claim = await screen.findByRole('button', { name: 'Claim +15' })
    await user.click(claim)
    await waitFor(() => expect(claim).toBeDisabled())
    release()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim +15' })).toBeNull())
  })
})
