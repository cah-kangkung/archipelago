import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { Dialog } from './dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit island
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Edit island" testId="editor-dialog">
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  test('titles itself, focuses the first field, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Edit island' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-testid', 'editor-dialog')
    expect(screen.getByRole('heading', { name: 'Edit island' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  test('the Close button closes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit island' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('returns focus to the tapped opener, not a stale focused button', async () => {
    const user = userEvent.setup()
    function Two() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button">B</button>
          <button type="button" onClick={() => setOpen(true)}>
            A
          </button>
          <Dialog open={open} onOpenChange={setOpen} title="T">
            <input />
          </Dialog>
        </>
      )
    }
    render(<Two />)
    const a = screen.getByRole('button', { name: 'A' })
    const b = screen.getByRole('button', { name: 'B' })
    b.focus()
    // A pointer tap that, like Safari, does not move focus to the tapped button.
    fireEvent.pointerDown(a)
    fireEvent.click(a)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(a).toHaveFocus()
  })

  test('an outside press or click does not dismiss it', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange} title="T">
        <input />
      </Dialog>,
    )
    // Radix arms its outside-press listener on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 10))
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  test('content without a field opens and Radix focuses inside the dialog', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="T">
        <p>Nothing to type</p>
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })
})
