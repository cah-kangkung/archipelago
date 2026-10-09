import { Fire } from '@phosphor-icons/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Badge, Chip } from './chip'

describe('Chip', () => {
  test.each([
    ['neutral', 'bg-surface-secondary', 'text-text-secondary'],
    ['gold', 'bg-gold-tint', 'text-gold-text'],
    ['coral', 'bg-coral-tint', 'text-coral-text'],
    ['leaf', 'bg-leaf-tint', 'text-leaf-text'],
    ['lagoon', 'bg-lagoon-tint', 'text-lagoon-text'],
    ['brand', 'bg-brand-secondary/10', 'text-brand'],
  ] as const)('%s tone', (tone, bg, fg) => {
    render(<Chip tone={tone}>3d late</Chip>)
    expect(screen.getByText('3d late')).toHaveClass('rounded-full', bg, fg)
  })

  test('an icon is decorative', () => {
    const { container } = render(<Chip icon={Fire}>8</Chip>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Badge', () => {
  test('nothing for zero', () => {
    const { container } = render(<Badge count={0} label="0 overdue" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the count visually and the label to screen readers', () => {
    render(<Badge count={3} label="3 overdue" />)
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('3 overdue')).toHaveClass('sr-only')
  })

  test('caps at 99+', () => {
    render(<Badge count={250} label="250 overdue" />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
