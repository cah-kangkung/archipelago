import type { ReactNode } from 'react'
import { useIsDesktop } from '../layout/use-is-desktop'
import { Dialog } from '../ui/dialog'
import { Sheet } from '../ui/sheet'

/**
 * A centred dialog on desktop, a full-height sheet on a phone. Each layout mounts its own element,
 * so crossing the breakpoint while open re-opens the editor in the new layout (spec 16.6). Only the
 * desktop dialog moves focus to the first field; on a phone that would pop the keyboard.
 */
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
  if (isDesktop) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()} title={title} testId="editor-dialog">
        {children}
      </Dialog>
    )
  }
  return (
    <Sheet open onClose={onClose} title={title} testId="editor-sheet">
      {children}
    </Sheet>
  )
}
