import * as T from '@radix-ui/react-tabs'
import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List {...props} className={cx('flex gap-1', className)} />
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      {...props}
      className={cx(
        'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-caption font-label text-text-secondary data-[state=active]:bg-brand-secondary/10 data-[state=active]:text-brand',
        className,
      )}
    />
  )
}
