import type { HTMLAttributes } from 'react'
import { cx } from './cx'

const shadow = { 1: 'shadow-1', 2: 'shadow-2', 3: 'shadow-3' } as const

/** The glass surface primitive (spec 25.1); radius and padding are the caller's. */
export function GlassPanel({
  elevation = 2,
  strong = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { elevation?: 1 | 2 | 3; strong?: boolean }) {
  return (
    <div
      className={cx(strong ? 'glass-strong' : 'glass', shadow[elevation], className)}
      {...rest}
    />
  )
}
