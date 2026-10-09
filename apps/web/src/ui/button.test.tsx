import { PencilSimple } from '@phosphor-icons/react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Button, IconButton } from './button'

describe('Button', () => {
  test('defaults to a 44px primary button of type button', () => {
    render(<Button>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveClass('min-h-11', 'bg-brand-secondary', 'text-text-on-brand')
  })

  test.each([
    ['accent', 'bg-gold'],
    ['ghost', 'text-brand'],
    ['danger', 'text-coral-text'],
  ] as const)('%s variant', (variant, cls) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button')).toHaveClass(cls)
  })

  test('sm is 44px on touch widths and 36px from lg', () => {
    render(<Button size="sm">Go</Button>)
    expect(screen.getByRole('button')).toHaveClass('min-h-11', 'lg:min-h-9')
  })

  test('loading disables, marks busy and shows a spinner, keeping the label', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b.querySelector('.motion-safe\\:animate-spin')).not.toBeNull()
    await userEvent.setup().click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  test('submit type is kept when asked', () => {
    render(<Button type="submit">Create</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})

describe('IconButton', () => {
  test('its label is the accessible name and the target is 44px square', () => {
    render(<IconButton icon={PencilSimple} label="Edit island" />)
    const b = screen.getByRole('button', { name: 'Edit island' })
    expect(b).toHaveClass('min-h-11', 'min-w-11')
    expect(b.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  test('a touch tap fires once and leaves no tooltip open', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={PencilSimple} label="Edit island" onClick={onClick} />)
    const b = screen.getByRole('button', { name: 'Edit island' })
    fireEvent.pointerDown(b, { pointerType: 'touch' })
    fireEvent.pointerUp(b, { pointerType: 'touch' })
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('tooltip={false} renders the bare button', () => {
    render(<IconButton icon={PencilSimple} label="Edit" tooltip={false} />)
    expect(screen.getByRole('button', { name: 'Edit' })).not.toHaveAttribute('data-state')
  })
})
