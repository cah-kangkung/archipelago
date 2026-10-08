import { colors } from '@archipelago/ui-tokens'

const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)

/** Linear blend of two `#rrggbb` colours: t=0 gives `a`, t=1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Every colour the 3D scene uses, derived only from A'raf tokens. */
export const scenePalette = {
  sea: colors.brand,
  shallows: colors.brandSecondary,
  seaShallow: mix(colors.brand, colors.brandSecondary, 0.3),
  seaDeep: mix(colors.brand, colors.textPrimary, 0.35),
  foam: colors.surfacePrimary,
  buoy: colors.error,
  whale: mix(colors.textPrimary, colors.brand, 0.4),
  grass: colors.success,
  meadow: mix(colors.success, colors.surfacePrimary, 0.25),
  grassDry: mix(colors.success, colors.warning, 0.5),
  grassSprout: mix(colors.success, colors.warning, 0.375),
  grassGreen: mix(colors.success, colors.warning, 0.25),
  grassLush: mix(colors.success, colors.warning, 0.125),
  path: mix(colors.warning, colors.surfacePrimary, 0.7),
  foliage: mix(colors.success, colors.textPrimary, 0.3),
  foliageDry: mix(colors.success, colors.warning, 0.6),
  petal: mix(colors.error, colors.surfacePrimary, 0.5),
  driftwood: mix(colors.warning, colors.textTertiary, 0.55),
  shore: mix(colors.warning, colors.surfacePrimary, 0.55),
  rock: colors.textTertiary,
  plaza: colors.borderSecondary,
  stone: colors.textSecondary,
  wall: colors.surfaceSecondary,
  wood: colors.warning,
  woodDark: mix(colors.warning, colors.brand, 0.35),
  roof: colors.brandSecondary,
  roofDark: colors.brand,
  storm: mix(colors.error, colors.textPrimary, 0.25),
  glow: mix(colors.warning, colors.surfacePrimary, 0.4),
  selection: colors.brand,
  shadow: colors.brand,
} as const

export type SceneColor = keyof typeof scenePalette
