import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from '../app/spinner'
import { cx } from './cx'
import { Icon } from './icon'
import { Tooltip } from './tooltip'

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-label transition-colors duration-(--duration-fast) ease-standard disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-secondary text-text-on-brand shadow-1 hover:bg-brand',
  accent: 'bg-gold text-gold-text shadow-1 hover:brightness-105',
  ghost: 'text-brand hover:bg-brand-secondary/10',
  danger: 'text-coral-text hover:bg-coral-tint',
}

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-body',
  sm: 'min-h-11 px-3 text-label lg:min-h-9',
}

/** The classes of a button, for a router `Link` that must look like one. */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cx(base, variants[variant], sizes[size])

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: PhosphorIcon
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon icon={icon} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  tooltip = true,
  variant = 'ghost',
  active = false,
  type = 'button',
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: PhosphorIcon
  label: string
  tooltip?: boolean
  variant?: ButtonVariant
  active?: boolean
}) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cx(base, variants[variant], 'min-h-11 min-w-11 shrink-0 shadow-none', className)}
      {...rest}
    >
      <Icon icon={icon} active={active} />
    </button>
  )
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
