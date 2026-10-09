import * as P from '@radix-ui/react-popover'
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cx } from './cx'

type Layers = { trigger: HTMLElement | null; content: HTMLElement | null }
const LayersContext = createContext<React.RefObject<Layers> | null>(null)

const setRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

/**
 * Radix Popover defers an outside dismiss to a document `click`, which iOS does not reliably
 * send for taps on non-interactive elements (and a canvas pan sends none). This wrapper owns
 * `open` and also closes on a capture-phase outside `pointerdown`.
 */
export function Popover({
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = openProp ?? inner
  const layers = useRef<Layers>({ trigger: null, content: null })
  const change = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInner(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const { trigger, content } = layers.current
      if (content?.contains(target) || trigger?.contains(target)) return
      change(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, change])

  return (
    <LayersContext.Provider value={layers}>
      <P.Root open={open} onOpenChange={change}>
        {children}
      </P.Root>
    </LayersContext.Provider>
  )
}

export function PopoverTrigger({
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof P.Trigger> & { ref?: Ref<HTMLButtonElement> }) {
  const layers = useContext(LayersContext)
  return (
    <P.Trigger
      {...props}
      ref={(node) => {
        if (layers?.current) layers.current.trigger = node
        setRef(ref, node)
      }}
    />
  )
}

export function PopoverContent({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof P.Content> & { ref?: Ref<HTMLDivElement> }) {
  const layers = useContext(LayersContext)
  return (
    <P.Portal>
      <P.Content
        sideOffset={8}
        collisionPadding={12}
        {...props}
        ref={(node) => {
          if (layers?.current) layers.current.content = node
          setRef(ref, node)
        }}
        className={cx(
          'glass-strong z-50 max-w-64 rounded-lg px-3 py-2 text-label text-text-primary shadow-2',
          className,
        )}
      />
    </P.Portal>
  )
}
