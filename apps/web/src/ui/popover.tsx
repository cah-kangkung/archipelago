import * as P from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger

export function PopoverContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={8}
        collisionPadding={12}
        {...props}
        className={cx(
          'glass-strong z-50 max-w-64 rounded-lg px-3 py-2 text-label text-text-primary shadow-2',
          className,
        )}
      />
    </P.Portal>
  )
}
