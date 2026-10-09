import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Sheet } from './sheet'

describe('Sheet', () => {
  test('a titled drawer whose Close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="New task" testId="editor-sheet">
        <p>Body</p>
      </Sheet>,
    )
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    expect(screen.getByText('New task')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
