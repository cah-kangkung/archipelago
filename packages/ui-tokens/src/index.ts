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

export const radius = { sm: 4, md: 6, default: 8 } as const

const kebab = (key: string): string => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)

export function toCssVariables(): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
    ...Object.entries(spacing).map(([k, v]) => `  --spacing-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
  ]
  return `:root {\n${lines.join('\n')}\n}\n`
}
