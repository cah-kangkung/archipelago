import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon } from './icon'

export type Tone = 'neutral' | 'gold' | 'coral' | 'leaf' | 'lagoon' | 'brand'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-secondary text-text-secondary',
  gold: 'bg-gold-tint text-gold-text',
  coral: 'bg-coral-tint text-coral-text',
  leaf: 'bg-leaf-tint text-leaf-text',
  lagoon: 'bg-lagoon-tint text-lagoon-text',
  brand: 'bg-brand-secondary/10 text-brand',
}

export function Chip({
  tone = 'neutral',
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: PhosphorIcon }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-meta font-label whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </span>
  )
}

/** A coral count bubble; the number is visual, `label` is what a screen reader hears. */
export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-text px-1.5 text-caption font-heading text-text-on-brand">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
