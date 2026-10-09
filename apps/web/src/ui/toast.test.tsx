import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type ToastOptions, ToastProvider, useToast } from './toast'

function Trigger({ message, options }: { message: string; options?: ToastOptions }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(message, options)}>
      fire
    </button>
  )
}

const setup = (message: string, options?: ToastOptions) =>
  render(
    <ToastProvider>
      <Trigger message={message} options={options} />
    </ToastProvider>,
  )

describe('Toast', () => {
  afterEach(() => vi.useRealTimers())

  test('shows a message in the live region and dismisses after 5 s', () => {
    vi.useFakeTimers()
    setup('Saved')
    act(() => screen.getByRole('button', { name: 'fire' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved')
  })

  test('error tone marks the toast', () => {
    setup('Could not save', { tone: 'error' })
    act(() => screen.getByRole('button', { name: 'fire' }).click())
    expect(screen.getByText('Could not save').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'error',
    )
  })

  test('an action runs once, dismisses at once, and the timer later does nothing', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup('Task deleted', { action: { label: 'Undo', onAction } })
    await user.click(screen.getByRole('button', { name: 'fire' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Task deleted')).toBeNull()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('Task deleted')).toBeNull()
  })

  test('useToast outside the provider throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow('useToast must be used inside')
    spy.mockRestore()
  })
})
