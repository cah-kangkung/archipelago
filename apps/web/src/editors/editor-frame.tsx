import { type ReactNode, useEffect, useId, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Each layout mounts its own element: a new <dialog> needs showModal again (spec 16.6). Only the
  // desktop dialog moves focus to the first field; on a phone that would pop the keyboard.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!isDesktop || !dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('input, textarea, select')?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [isDesktop])

  if (isDesktop) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        className="m-auto w-full max-w-lg rounded-lg bg-surface-primary p-6 shadow-xl backdrop:bg-text-primary/40"
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
