import {
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useIsDesktop } from './use-is-desktop'

function storeWidth(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // Storage can be unavailable (private mode); the width just isn't remembered.
  }
}

/**
 * Tracks one pointer drag. Move, up and cancel are listened for on the window so the drag survives
 * leaving the handle; any live drag is torn down on unmount.
 */
function useDrag() {
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  return (
    event: PointerEvent<HTMLElement>,
    onMove: (move: globalThis.PointerEvent) => void,
    onEnd: (end: globalThis.PointerEvent) => void,
  ) => {
    stop.current?.()
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Capture is a nicety; the window listeners below do the work.
    }
    const remove = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      stop.current = null
    }
    const up = (end: globalThis.PointerEvent) => {
      remove()
      onEnd(end)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    stop.current = remove
  }
}

const DEFAULT_WIDTH = 400
const MIN_WIDTH = 320
const MAX_WIDTH = 640
const KEY_STEP = 16
const STORAGE_KEY = 'archipelago.panelWidth'

const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))

function readStoredWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

/** Index of the 50dvh detent in `DETENTS`. */
export const SHEET_MIDDLE = 1

export function PanelFrame({
  title,
  detent,
  onDetentChange,
  children,
}: {
  title: string
  /** The phone sheet's detent index; ignored by the desktop side panel. */
  detent: number
  onDetentChange: Dispatch<SetStateAction<number>>
  children: ReactNode
}) {
  return useIsDesktop() ? (
    <DesktopPanel title={title}>{children}</DesktopPanel>
  ) : (
    <MobileSheet title={title} detent={detent} setDetent={onDetentChange}>
      {children}
    </MobileSheet>
  )
}

const DETENTS = [
  { label: '120px', px: () => 120 },
  { label: '50dvh', px: () => window.innerHeight * 0.5 },
  { label: '92dvh', px: () => window.innerHeight * 0.92 },
]
const TAP_SLOP = 4

function MobileSheet({
  title,
  detent,
  setDetent,
  children,
}: {
  title: string
  detent: number
  setDetent: Dispatch<SetStateAction<number>>
  children: ReactNode
}) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const dragged = useRef(false)
  const startDrag = useDrag()

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startY = event.clientY
    const measured = sectionRef.current?.getBoundingClientRect().height ?? 0
    const startHeight = measured > 0 ? measured : (DETENTS[detent]?.px() ?? 0)
    dragged.current = false
    const maxHeight = () => window.innerHeight * 0.92
    const heightAt = (clientY: number) =>
      Math.min(maxHeight(), Math.max(120, startHeight + (startY - clientY)))
    startDrag(
      event,
      (move) => {
        if (Math.abs(startY - move.clientY) >= TAP_SLOP) dragged.current = true
        if (dragged.current) setDragHeight(heightAt(move.clientY))
      },
      (end) => {
        // A real drag is followed by a click on the handle; a missed one must not eat the next activation.
        queueMicrotask(() => {
          dragged.current = false
        })
        setDragHeight(null)
        if (!dragged.current) return
        const height = heightAt(end.clientY)
        let nearest = 0
        DETENTS.forEach((d, i) => {
          const best = DETENTS[nearest]
          if (best && Math.abs(d.px() - height) < Math.abs(best.px() - height)) nearest = i
        })
        setDetent(nearest)
      },
    )
  }

  const onClick = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    setDetent((d) => (d + 1) % DETENTS.length)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setDetent((d) => Math.min(DETENTS.length - 1, d + 1))
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setDetent((d) => Math.max(0, d - 1))
    }
  }

  return (
    <section
      ref={sectionRef}
      aria-label={title}
      data-testid="task-sheet"
      data-detent={detent}
      style={{ height: dragHeight ?? DETENTS[detent]?.label }}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[640px] flex-col rounded-t-lg border-t border-border-primary bg-surface-primary shadow-2xl"
    >
      <button
        type="button"
        aria-label="Resize task sheet"
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full shrink-0 touch-none"
      >
        <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-border-secondary" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </section>
  )
}

function DesktopPanel({ title, children }: { title: string; children: ReactNode }) {
  const [width, setWidth] = useState(readStoredWidth)
  const startDrag = useDrag()

  // The panel sits on the right, so dragging the handle left widens it.
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX
    const startWidth = width
    const widthAt = (clientX: number) => clampWidth(startWidth + (startX - clientX))
    startDrag(
      event,
      (move) => setWidth(widthAt(move.clientX)),
      (end) => {
        const next = widthAt(end.clientX)
        setWidth(next)
        storeWidth(next)
      },
    )
  }

  const resizeBy = (delta: number) => {
    const next = clampWidth(width + delta)
    setWidth(next)
    storeWidth(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      resizeBy(KEY_STEP)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      resizeBy(-KEY_STEP)
    }
  }

  return (
    <aside
      aria-label={title}
      data-testid="task-side-panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-primary bg-surface-primary"
    >
      <button
        type="button"
        aria-label="Resize task panel"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize focus:bg-brand-secondary focus:outline-none"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  )
}
