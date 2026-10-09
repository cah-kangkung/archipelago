import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})
