import { describe, expect, test } from 'bun:test'
import { colors, radius, spacing, toCssVariables } from './index'

describe("A'raf tokens", () => {
  test('brand colours match the design system', () => {
    expect(colors.brand).toBe('#004990')
    expect(colors.brandSecondary).toBe('#0069d2')
    expect(colors.success).toBe('#16a34a')
    expect(colors.warning).toBe('#ba7517')
    expect(colors.error).toBe('#dc2626')
  })

  test('spacing scale never uses odd values', () => {
    for (const value of Object.values(spacing)) expect(value % 2).toBe(0)
  })

  test('toCssVariables emits kebab-case custom properties', () => {
    const css = toCssVariables()
    expect(css.startsWith(':root {\n')).toBe(true)
    expect(css).toContain('  --color-brand: #004990;\n')
    expect(css).toContain('  --color-brand-secondary: #0069d2;\n')
    expect(css).toContain('  --spacing-2xl: 32px;\n')
    expect(css).toContain(`  --radius-md: ${radius.md}px;\n`)
    expect(css.endsWith('}\n')).toBe(true)
  })
})
