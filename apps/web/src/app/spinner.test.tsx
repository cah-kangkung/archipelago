import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Spinner } from './spinner'

describe('Spinner', () => {
  test('is a decorative ring that spins only when motion is allowed', () => {
    const { container } = render(<Spinner />)
    const ring = container.firstElementChild
    expect(ring).toHaveAttribute('aria-hidden', 'true')
    expect(ring).toHaveClass('rounded-full', 'border-2', 'motion-safe:animate-spin')
    expect(ring).not.toHaveClass('animate-spin')
  })
})
