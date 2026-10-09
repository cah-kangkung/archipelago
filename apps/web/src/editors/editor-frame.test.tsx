import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { setDesktop } from '../test/viewport'
import { EditorFrame } from './editor-frame'

const ui = (onClose = () => {}) => (
  <EditorFrame title="Edit island" onClose={onClose}>
    <label>
      Name
      <input />
    </label>
  </EditorFrame>
)

describe('EditorFrame', () => {
  test('crossing the breakpoint while open re-opens the editor in the new layout', () => {
    setDesktop(true)
    render(ui())
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    act(() => setDesktop(false))
    expect(screen.queryByTestId('editor-dialog')).toBeNull()
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    act(() => setDesktop(true))
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  test('on desktop, Escape and the Close button both close it', async () => {
    setDesktop(true)
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(ui(onClose))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('the dialog is titled by its heading', () => {
    setDesktop(true)
    render(ui())
    expect(screen.getByRole('dialog', { name: 'Edit island' })).toBeInTheDocument()
  })

  test('an outside press or click leaves the editor open', async () => {
    setDesktop(true)
    const onClose = vi.fn()
    render(ui(onClose))
    // Radix arms its outside-press listener on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 10))
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('mounted only after the press, it still returns focus to the tapped opener', async () => {
    setDesktop(true)
    const user = userEvent.setup()
    function Harness() {
      const [editing, setEditing] = useState(false)
      return (
        <>
          <button type="button">B</button>
          <button type="button" onClick={() => setEditing(true)}>
            A
          </button>
          {editing && ui(() => setEditing(false))}
        </>
      )
    }
    render(<Harness />)
    const a = screen.getByRole('button', { name: 'A' })
    screen.getByRole('button', { name: 'B' }).focus()
    fireEvent.pointerDown(a)
    fireEvent.click(a)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(a).toHaveFocus()
  })
})
