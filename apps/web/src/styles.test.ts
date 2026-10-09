import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toCssVariables } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')

describe('styles.css', () => {
  test('imports Tailwind', () => {
    expect(css).toContain('@import "tailwindcss";')
  })

  test('declares every token variable with its exact value', () => {
    const lines = toCssVariables()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('--'))
    expect(lines.length).toBeGreaterThan(60)
    for (const line of lines) expect(css).toContain(line)
  })

  test('drops Tailwind default colours so only the palette is available', () => {
    expect(css).toContain('--color-*: initial;')
  })

  test('glass falls back to a solid fill without backdrop-filter, and under .no-blur', () => {
    expect(css).toContain('@utility glass {')
    expect(css).toContain('@utility glass-strong {')
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or/)
    expect(css).toContain('.no-blur .glass')
    expect(css).toContain('background-color: var(--color-glass-fill-solid);')
  })

  test('a metric-matched fallback face stands in while Nunito loads', () => {
    expect(css).toContain("font-family: 'Nunito Fallback';")
    expect(css).toContain("src: local('Arial');")
    expect(css).toContain('ascent-override:')
  })
})
