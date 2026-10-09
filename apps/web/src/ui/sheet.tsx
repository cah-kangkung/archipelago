import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Icon } from './icon'

/** The phone's full-height editor drawer (spec 25.1); 92dvh as before. */
export function Sheet({
  open,
  onClose,
  title,
  testId,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  testId?: string
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <Drawer.Content
          data-testid={testId}
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92dvh] max-w-[640px] flex-col rounded-t-2xl bg-surface-primary shadow-3"
        >
          <span
            aria-hidden
            className="mx-auto mt-2 block h-1.5 w-12 rounded-full bg-border-secondary"
          />
          <div className="flex items-center justify-between gap-2 px-4 py-1">
            <Drawer.Title className="text-title font-heading text-text-primary">
              {title}
            </Drawer.Title>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-secondary"
            >
              <Icon icon={X} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
