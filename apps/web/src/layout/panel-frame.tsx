import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useIsDesktop } from './use-is-desktop'

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

export function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return useIsDesktop() ? (
    <DesktopPanel title={title}>{children}</DesktopPanel>
  ) : (
    <MobileSheet title={title}>{children}</MobileSheet>
  )
}

const DETENTS = [
  { label: '120px', px: () => 120 },
  { label: '50dvh', px: () => window.innerHeight * 0.5 },
  { label: '92dvh', px: () => window.innerHeight * 0.92 },
]
const TAP_SLOP = 4

function MobileSheet({ title, children }: { title: string; children: ReactNode }) {
  const [detent, setDetent] = useState(1)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const dragged = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startY = event.clientY
    const startHeight = sectionRef.current?.getBoundingClientRect().height ?? 0
    dragged.current = false
    const maxHeight = () => window.innerHeight * 0.92
    const heightAt = (clientY: number) =>
      Math.min(maxHeight(), Math.max(120, startHeight + (startY - clientY)))
    const onMove = (move: globalThis.PointerEvent) => {
      if (Math.abs(startY - move.clientY) >= TAP_SLOP) dragged.current = true
      if (dragged.current) setDragHeight(heightAt(move.clientY))
    }
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!dragged.current) return
      const height = heightAt(up.clientY)
      let nearest = 0
      DETENTS.forEach((d, i) => {
        const best = DETENTS[nearest]
        if (best && Math.abs(d.px() - height) < Math.abs(best.px() - height)) nearest = i
      })
      setDetent(nearest)
      setDragHeight(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onClick = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    setDetent((d) => (d + 1) % DETENTS.length)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') setDetent((d) => Math.min(DETENTS.length - 1, d + 1))
    if (event.key === 'ArrowDown') setDetent((d) => Math.max(0, d - 1))
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
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

function DesktopPanel({ title, children }: { title: string; children: ReactNode }) {
  const [width, setWidth] = useState(readStoredWidth)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      // Storage can be unavailable (private mode); the width just isn't remembered.
    }
  }, [width])

  // The panel sits on the right, so dragging the handle left widens it.
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX
    const startWidth = width
    const onMove = (move: globalThis.PointerEvent) =>
      setWidth(clampWidth(startWidth + (startX - move.clientX)))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') setWidth((w) => clampWidth(w + KEY_STEP))
    if (event.key === 'ArrowRight') setWidth((w) => clampWidth(w - KEY_STEP))
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
