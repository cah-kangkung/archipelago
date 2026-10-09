import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'
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
})
