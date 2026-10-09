import { X } from '@phosphor-icons/react'
import * as D from '@radix-ui/react-dialog'
import { type ReactNode, useEffect, useRef } from 'react'
import { Icon } from './icon'

/** A centred modal: focuses the first field, Escape and Close dismiss, focus returns (spec 25.1). */
export function Dialog({
  open,
  onOpenChange,
  title,
  testId,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  testId?: string
  children: ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const lastInteraction = useRef<HTMLElement | null>(null)
  const isOpen = useRef(open)
  isOpen.current = open

  // Safari does not focus tapped buttons, so activeElement can be stale. Record the element the
  // user actually pressed or typed on while the dialog is closed.
  useEffect(() => {
    const record = (event: Event) => {
      if (isOpen.current || !(event.target instanceof Element)) return
      lastInteraction.current = event.target.closest<HTMLElement>('button, a, [tabindex]')
    }
    document.addEventListener('pointerdown', record, true)
    document.addEventListener('keydown', record, true)
    return () => {
      document.removeEventListener('pointerdown', record, true)
      document.removeEventListener('keydown', record, true)
    }
  }, [])
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <D.Content
          ref={content}
          data-testid={testId}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // The dialog is controlled, with no Radix trigger, so remember the opener here.
            opener.current =
              lastInteraction.current ?? (document.activeElement as HTMLElement | null)
            const field = content.current?.querySelector<HTMLElement>('input, textarea, select')
            if (!field) return
            event.preventDefault()
            field.focus()
          }}
          onCloseAutoFocus={(event) => {
            const target = opener.current
            if (!target?.isConnected || target === document.body) return
            event.preventDefault()
            target.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface-primary p-6 shadow-3"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <D.Title className="text-heading font-heading text-text-primary">{title}</D.Title>
            <D.Close
              aria-label="Close"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-secondary"
            >
              <Icon icon={X} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
