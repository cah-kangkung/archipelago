import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { setDesktop } from '../test/viewport'
import { EditorFrame } from './editor-frame'

const ui = (
  <EditorFrame title="Edit island" onClose={() => {}}>
    <label>
      Name
      <input />
    </label>
  </EditorFrame>
)

describe('EditorFrame', () => {
  test('crossing the breakpoint while open re-opens the editor in the new layout', () => {
    setDesktop(true)
    const { baseElement } = render(ui)
    const dialog = () => baseElement.querySelector('dialog')
    expect(dialog()).toHaveAttribute('open')
    expect(dialog()).not.toHaveClass('relative')
    act(() => setDesktop(false))
    expect(dialog()).toBeNull()
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    act(() => setDesktop(true))
    expect(dialog()).toHaveAttribute('open')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})
