import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

export type IconSize = 16 | 20 | 24 | 32

/** Every Phosphor glyph goes through here: duotone at rest, filled when active (spec 25.1). */
export function Icon({
  icon: Glyph,
  size = 20,
  active = false,
  className,
}: {
  icon: PhosphorIcon
  size?: IconSize
  active?: boolean
  className?: string
}) {
  return (
    <Glyph
      aria-hidden="true"
      size={size}
      weight={active ? 'fill' : 'duotone'}
      className={className}
    />
  )
}
