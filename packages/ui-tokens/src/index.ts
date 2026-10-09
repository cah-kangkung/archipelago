export const colors = {
  brand: '#004990',
  brandSecondary: '#0069d2',
  surfacePrimary: '#ffffff',
  surfaceSecondary: '#f9fafb',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textTertiary: '#9ca3af',
  textOnBrand: '#ffffff',
  borderPrimary: '#e5e7eb',
  borderSecondary: '#d1d5db',
  success: '#16a34a',
  warning: '#ba7517',
  error: '#dc2626',
  info: '#0069d2',
  // Tropical accents (spec 25.1): the game layer's colours beside A'raf blue.
  gold: '#f5b82e',
  coral: '#ff7a59',
  leaf: '#2fb36f',
  lagoon: '#1fb5c4',
  sand: '#f3e3bf',
  // Text in an accent: AA on white, on the strong glass and on its tint.
  goldText: '#6b4500',
  coralText: '#b03a0a',
  leafText: '#136b41',
  lagoonText: '#09656f',
  sandText: '#7a5a1e',
  // Chip backgrounds.
  goldTint: '#fdf0cf',
  coralTint: '#ffe1d8',
  leafTint: '#dcf5e6',
  lagoonTint: '#d6f4f6',
  sandTint: '#faf3e3',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  default: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const

export const radius = { sm: 4, md: 6, default: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 } as const

/** White glass: fill alphas, border alpha, blur (px) and saturation (spec 25.1). */
export const glass = {
  fill: 0.62,
  fillStrong: 0.8,
  fillSolid: 0.92,
  border: 0.7,
  blur: 14,
  saturate: 1.4,
} as const

export const shadows = {
  1: '0 2px 8px rgb(0 40 90 / 0.12)',
  2: '0 8px 24px rgb(0 40 90 / 0.18)',
  3: '0 16px 40px rgb(0 40 90 / 0.22)',
} as const

export const fontFamily = {
  sans: "'Nunito Variable', 'Nunito Fallback', system-ui, sans-serif",
} as const

export const fontSizes = {
  caption: 12,
  meta: 13,
  label: 14,
  body: 15,
  title: 17,
  heading: 20,
  display: 24,
  hero: 32,
} as const

export const fontWeights = { body: 600, label: 700, heading: 800 } as const

export const durations = { fast: 120, base: 200, slow: 320 } as const

export const easing = { standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)' } as const

/** For `motion` (5m); not CSS. */
export const springs = {
  sheet: { stiffness: 400, damping: 40 },
  pop: { stiffness: 600, damping: 22 },
} as const

const kebab = (key: string): string => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
const white = (alpha: number): string => `rgb(255 255 255 / ${alpha})`

export function toCssVariables(): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
    `  --color-glass-fill: ${white(glass.fill)};`,
    `  --color-glass-fill-strong: ${white(glass.fillStrong)};`,
    `  --color-glass-fill-solid: ${white(glass.fillSolid)};`,
    `  --color-glass-border: ${white(glass.border)};`,
    ...Object.entries(spacing).map(([k, v]) => `  --spacing-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
    ...Object.entries(shadows).map(([k, v]) => `  --shadow-${k}: ${v};`),
    `  --font-sans: ${fontFamily.sans};`,
    ...Object.entries(fontSizes).map(([k, v]) => `  --text-${k}: ${v}px;`),
    ...Object.entries(fontWeights).map(([k, v]) => `  --font-weight-${k}: ${v};`),
    `  --ease-standard: ${easing.standard};`,
    ...Object.entries(durations).map(([k, v]) => `  --duration-${k}: ${v}ms;`),
    `  --glass-blur: ${glass.blur}px;`,
    `  --glass-saturate: ${glass.saturate};`,
  ]
  return `:root {\n${lines.join('\n')}\n}\n`
}

export { contrastRatio, luminance, overWhiteGlass } from './contrast'
