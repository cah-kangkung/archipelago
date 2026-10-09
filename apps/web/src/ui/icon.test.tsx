import { Crane } from '@phosphor-icons/react'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Icon } from './icon'
import { ChestIcon, SuppliesIcon } from './icons'

describe('Icon', () => {
  test('is decorative and sized', () => {
    const { container } = render(<Icon icon={Crane} size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  test('defaults to 20px and passes a class through', () => {
    const { container } = render(<Icon icon={Crane} className="text-brand" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveClass('text-brand')
  })

  test('active swaps the duotone weight for the filled one', () => {
    const a = render(<Icon icon={Crane} />).container.innerHTML
    const b = render(<Icon icon={Crane} active />).container.innerHTML
    expect(a).not.toBe(b)
  })
})

describe('custom icons', () => {
  test.each([
    ['SuppliesIcon', SuppliesIcon],
    ['ChestIcon', ChestIcon],
  ])('%s is decorative and sized', (_, Glyph) => {
    const { container } = render(<Glyph size={16} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '16')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
  })
})
