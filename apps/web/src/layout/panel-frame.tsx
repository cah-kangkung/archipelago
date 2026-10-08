import {
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
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
  accessory,
  onCoverChange,
  children,
}: {
  title: string
  /** The phone sheet's detent index; ignored by the desktop side panel. */
  detent: number
  onDetentChange: Dispatch<SetStateAction<number>>
  /** Rides above the phone sheet; heads the desktop panel. */
  accessory?: ReactNode
  /** Phone only: canvas px the settled sheet and its accessory cover. */
  onCoverChange?: (px: number) => void
  children: ReactNode
}) {
  return useIsDesktop() ? (
    <DesktopPanel title={title} accessory={accessory}>
      {children}
    </DesktopPanel>
  ) : (
    <MobileSheet
      title={title}
      detent={detent}
      setDetent={onDetentChange}
      accessory={accessory}
      onCoverChange={onCoverChange}
    >
      {children}
    </MobileSheet>
  )
}

const DETENTS = [
  { label: '120px', px: (_vh: number) => 120 },
  { label: '50dvh', px: (vh: number) => vh * 0.5 },
  { label: '92dvh', px: (vh: number) => vh * 0.92 },
]
const TAP_SLOP = 4
const TOP = DETENTS.length - 1

/**
 * A detent's height in px. On a short phone the tallest one gives way so the strip riding on top
 * of the sheet stays inside the viewport.
 */
function detentPx(index: number, vh: number, strip: number): number {
  const px = DETENTS[index]?.px(vh) ?? 0
  return index === TOP ? Math.min(px, vh - strip) : px
}

function MobileSheet({
  title,
  detent,
  setDetent,
  accessory,
  onCoverChange,
  children,
}: {
  title: string
  detent: number
  setDetent: Dispatch<SetStateAction<number>>
  accessory?: ReactNode
  onCoverChange?: (px: number) => void
  children: ReactNode
}) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const dragged = useRef(false)
  const startDrag = useDrag()
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripHeight, setStripHeight] = useState(0)
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    setStripHeight(strip.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setStripHeight(strip.offsetHeight))
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])

  // The world frames around the settled sheet (spec §14.3); a drag in progress does not count.
  useEffect(() => {
    onCoverChange?.(Math.round(detentPx(detent, windowHeight, stripHeight) + stripHeight))
  }, [detent, stripHeight, windowHeight, onCoverChange])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startY = event.clientY
    const measured = sectionRef.current?.getBoundingClientRect().height ?? 0
    const startHeight = measured > 0 ? measured : detentPx(detent, window.innerHeight, stripHeight)
    dragged.current = false
    const maxHeight = () => detentPx(TOP, window.innerHeight, stripHeight)
    const heightAt = (clientY: number) =>
      Math.min(maxHeight(), Math.max(120, startHeight + (startY - clientY)))
    startDrag(
      event,
      (move) => {
        if (Math.abs(startY - move.clientY) >= TAP_SLOP) dragged.current = true
        if (dragged.current) setDragHeight(heightAt(move.clientY))
      },
      (end) => {
        setDragHeight(null)
        // A cancelled gesture leaves the sheet where it was. `dragged` stays set until the next
        // pointer-down, so the click that ends a mouse drag does not also step the detent.
        if (end.type === 'pointercancel' || !dragged.current) return
        const height = heightAt(end.clientY)
        let nearest = 0
        const vh = window.innerHeight
        DETENTS.forEach((_, i) => {
          const gap = Math.abs(detentPx(i, vh, stripHeight) - height)
          if (gap < Math.abs(detentPx(nearest, vh, stripHeight) - height)) nearest = i
        })
        setDetent(nearest)
      },
    )
  }

  const onClick = () => {
    if (dragged.current) return
    setDetent((d) => (d + 1) % DETENTS.length)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Keyboard activation is never the tail of a drag.
    if (event.key === 'Enter' || event.key === ' ') dragged.current = false
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setDetent((d) => Math.min(DETENTS.length - 1, d + 1))
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setDetent((d) => Math.max(0, d - 1))
    }
  }

  const topPx = detentPx(TOP, windowHeight, stripHeight)
  const resting =
    detent === TOP && topPx < (DETENTS[TOP]?.px(windowHeight) ?? 0)
      ? `${Math.round(topPx)}px`
      : DETENTS[detent]?.label

  return (
    <section
      ref={sectionRef}
      aria-label={title}
      data-testid="task-sheet"
      data-detent={detent}
      style={{ height: dragHeight ?? resting }}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[640px] flex-col rounded-t-lg border-t border-border-primary bg-surface-primary shadow-2xl"
    >
      {accessory && (
        <div
          ref={stripRef}
          data-testid="sheet-accessory"
          className="absolute inset-x-0 bottom-full"
        >
          {accessory}
        </div>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable splitter needs button behaviour (click, Enter, Space); the separator role carries the value */}
      <button
        type="button"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={TOP}
        aria-valuenow={detent}
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

function DesktopPanel({
  title,
  accessory,
  children,
}: {
  title: string
  accessory?: ReactNode
  children: ReactNode
}) {
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
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable splitter needs button behaviour (pointer and key handling); the separator role carries the value */}
      <button
        type="button"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        aria-label="Resize task panel"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize focus:bg-brand-secondary focus:outline-none"
      />
      {accessory}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  )
}
