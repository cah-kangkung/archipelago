import * as T from '@radix-ui/react-tooltip'
import type { ReactElement } from 'react'

/** A hover and focus label; Radix keeps it shut on touch taps (spec 25.1). */
export function Tooltip({
  content,
  delay = 400,
  children,
}: {
  content: string
  delay?: number
  children: ReactElement
}) {
  return (
    <T.Provider delayDuration={delay}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 rounded-lg bg-text-primary px-2 py-1 text-meta font-label text-text-on-brand shadow-2"
          >
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}
