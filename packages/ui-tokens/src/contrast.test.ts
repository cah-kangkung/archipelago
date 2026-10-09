import { describe, expect, test } from 'bun:test'
import { contrastRatio, luminance, overWhiteGlass } from './contrast'
import { colors, glass } from './index'

const AA = 4.5
const backdrops = { white: '#ffffff', lagoon: colors.lagoon }

describe('contrast maths', () => {
  test('luminance of black and white', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  test('black on white is 21:1 either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  test('white glass over a colour blends toward white by alpha', () => {
    expect(overWhiteGlass(0.62, '#1fb5c4')).toBe('#aae3e9')
    expect(overWhiteGlass(1, '#000000')).toBe('#ffffff')
    expect(overWhiteGlass(0, '#123456')).toBe('#123456')
  })
})

describe('glass legibility (spec 25.1)', () => {
  const plain = [colors.textPrimary, colors.textSecondary, colors.brand]
  const accents = [
    colors.goldText,
    colors.coralText,
    colors.leafText,
    colors.lagoonText,
    colors.sandText,
  ]

  for (const [name, backdrop] of Object.entries(backdrops)) {
    test(`body text on the plain glass over ${name}`, () => {
      const surface = overWhiteGlass(glass.fill, backdrop)
      for (const text of plain) expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA)
    })

    test(`body and accent text on the strong glass over ${name}`, () => {
      const surface = overWhiteGlass(glass.fillStrong, backdrop)
      for (const text of [...plain, ...accents]) {
        expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA)
      }
    })
  }

  test('accent text on its own tint', () => {
    const pairs = [
      [colors.goldText, colors.goldTint],
      [colors.coralText, colors.coralTint],
      [colors.leafText, colors.leafTint],
      [colors.lagoonText, colors.lagoonTint],
      [colors.sandText, colors.sandTint],
    ] as const
    for (const [text, tint] of pairs) expect(contrastRatio(text, tint)).toBeGreaterThanOrEqual(AA)
  })

  test('button and badge labels', () => {
    expect(contrastRatio(colors.textOnBrand, colors.brandSecondary)).toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(colors.goldText, colors.gold)).toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(colors.textOnBrand, colors.coralText)).toBeGreaterThanOrEqual(AA)
  })
})
