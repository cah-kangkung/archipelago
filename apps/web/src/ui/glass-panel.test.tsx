import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { GlassPanel } from './glass-panel'
import { Skeleton } from './skeleton'

describe('GlassPanel', () => {
  test('plain glass at elevation 2 by default', () => {
    render(<GlassPanel>Hi</GlassPanel>)
    expect(screen.getByText('Hi')).toHaveClass('glass', 'shadow-2')
  })

  test('strong fill and elevation', () => {
    render(
      <GlassPanel strong elevation={3} className="rounded-2xl">
        Hi
      </GlassPanel>,
    )
    const el = screen.getByText('Hi')
    expect(el).toHaveClass('glass-strong', 'shadow-3', 'rounded-2xl')
    expect(el).not.toHaveClass('glass')
  })
})

describe('Skeleton', () => {
  test('decorative, pulsing only when motion is allowed', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveClass('motion-safe:animate-pulse', 'h-4', 'w-20')
    expect(el).not.toHaveClass('animate-pulse')
  })
})
