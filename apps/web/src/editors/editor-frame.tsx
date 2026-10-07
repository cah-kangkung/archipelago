import { type ReactNode, useId } from 'react'
import { Drawer } from 'vaul'
import { useIsDesktop } from '../layout/use-is-desktop'

const closeButton = 'min-h-11 min-w-11 rounded-md text-text-secondary hover:bg-surface-secondary'

export function EditorFrame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const isDesktop = useIsDesktop()
  const titleId = useId()

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-text-primary/40 p-4">
        <dialog
          open
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative m-0 w-full max-w-lg rounded-lg bg-surface-primary p-6 shadow-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            <button type="button" onClick={onClose} className={closeButton}>
              Close
            </button>
          </div>
          {children}
        </dialog>
      </div>
    )
  }

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <Drawer.Content
          data-testid="editor-sheet"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92dvh] max-w-[640px] flex-col rounded-t-lg bg-surface-primary"
        >
          <div className="flex items-center justify-between border-b border-border-primary px-4 py-2">
            <Drawer.Title className="text-lg font-semibold text-text-primary">{title}</Drawer.Title>
            <button type="button" onClick={onClose} className={closeButton}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
