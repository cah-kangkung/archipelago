import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import * as M from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './icon'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({
  children,
  align = 'end',
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="glass-strong z-50 min-w-44 rounded-lg p-1 shadow-2"
      >
        {children}
      </M.Content>
    </M.Portal>
  )
}

export function MenuItem({
  onSelect,
  tone = 'neutral',
  icon,
  children,
}: {
  onSelect: () => void
  tone?: 'neutral' | 'danger'
  icon?: PhosphorIcon
  children: ReactNode
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-label font-label outline-none data-[highlighted]:bg-brand-secondary/10',
        tone === 'danger' ? 'text-coral-text' : 'text-text-primary',
      )}
    >
      {icon && <Icon icon={icon} />}
      {children}
    </M.Item>
  )
}
