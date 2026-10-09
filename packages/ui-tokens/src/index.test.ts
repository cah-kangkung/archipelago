import { describe, expect, test } from 'bun:test'
import {
  colors,
  durations,
  fontFamily,
  fontSizes,
  fontWeights,
  glass,
  radius,
  spacing,
  springs,
  toCssVariables,
} from './index'

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

  test('tropical accents, text shades and tints are fixed values', () => {
    expect(colors.gold).toBe('#f5b82e')
    expect(colors.coral).toBe('#ff7a59')
    expect(colors.leaf).toBe('#2fb36f')
    expect(colors.lagoon).toBe('#1fb5c4')
    expect(colors.sand).toBe('#f3e3bf')
    expect(colors.goldText).toBe('#6b4500')
    expect(colors.coralText).toBe('#b03a0a')
    expect(colors.leafText).toBe('#136b41')
    expect(colors.lagoonText).toBe('#09656f')
    expect(colors.sandText).toBe('#7a5a1e')
    expect(colors.goldTint).toBe('#fdf0cf')
    expect(colors.coralTint).toBe('#ffe1d8')
    expect(colors.leafTint).toBe('#dcf5e6')
    expect(colors.lagoonTint).toBe('#d6f4f6')
    expect(colors.sandTint).toBe('#faf3e3')
  })

  test('glass, radii, type and motion scales', () => {
    expect(glass).toEqual({
      fill: 0.62,
      fillStrong: 0.8,
      fillSolid: 0.92,
      border: 0.7,
      blur: 14,
      saturate: 1.4,
    })
    expect(radius).toEqual({ sm: 4, md: 6, default: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 })
    expect(Object.values(fontSizes)).toEqual([12, 13, 14, 15, 17, 20, 24, 32])
    expect(fontWeights).toEqual({ body: 600, label: 700, heading: 800 })
    expect(durations).toEqual({ fast: 120, base: 200, slow: 320 })
    expect(springs.sheet).toEqual({ stiffness: 400, damping: 40 })
    expect(springs.pop).toEqual({ stiffness: 600, damping: 22 })
    expect(fontFamily.sans.startsWith("'Nunito Variable', 'Nunito Fallback'")).toBe(true)
  })

  test('toCssVariables emits every group', () => {
    const css = toCssVariables()
    expect(css).toContain('  --color-gold-text: #6b4500;\n')
    expect(css).toContain('  --color-glass-fill: rgb(255 255 255 / 0.62);\n')
    expect(css).toContain('  --color-glass-fill-strong: rgb(255 255 255 / 0.8);\n')
    expect(css).toContain('  --color-glass-fill-solid: rgb(255 255 255 / 0.92);\n')
    expect(css).toContain('  --color-glass-border: rgb(255 255 255 / 0.7);\n')
    expect(css).toContain('  --radius-2xl: 20px;\n')
    expect(css).toContain('  --shadow-2: 0 8px 24px rgb(0 40 90 / 0.18);\n')
    expect(css).toContain('  --text-body: 15px;\n')
    expect(css).toContain('  --font-weight-heading: 800;\n')
    expect(css).toContain('  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);\n')
    expect(css).toContain('  --duration-base: 200ms;\n')
    expect(css).toContain('  --glass-blur: 14px;\n')
    expect(css).toContain('  --glass-saturate: 1.4;\n')
  })
})
