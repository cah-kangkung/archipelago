import { cx } from './cx'

/** A loading placeholder block; static under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block rounded-lg bg-border-primary motion-safe:animate-pulse', className)}
    />
  )
}
