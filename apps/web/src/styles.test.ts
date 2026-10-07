import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toCssVariables } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')

describe('styles.css', () => {
  test('imports Tailwind', () => {
    expect(css).toContain('@import "tailwindcss";')
  })

  test("defines every A'raf colour token in @theme, with the exact value", () => {
    const colourLines = toCssVariables()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('--color-'))
    expect(colourLines.length).toBeGreaterThan(10)
    for (const line of colourLines) expect(css).toContain(line)
  })

  test('drops Tailwind default colours so only the palette is available', () => {
    expect(css).toContain('--color-*: initial;')
  })
})
