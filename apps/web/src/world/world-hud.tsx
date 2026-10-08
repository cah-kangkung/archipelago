import { Link } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'
import type { resolveFocus } from './selectors'

type Resolved = ReturnType<typeof resolveFocus>

const chip =
  'pointer-events-auto inline-flex min-h-11 items-center rounded-md bg-surface-primary/95 px-3 text-sm shadow'

/** Floating controls over the canvas; the same actions the card view offers. */
export function WorldHud({
  resolved,
  empty,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
  onOpenShop,
  onHeight,
}: {
  resolved: Resolved
  empty: boolean
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
  onOpenShop?: () => void
  onHeight?: (px: number) => void
}) {
  const { focus, project, milestone } = resolved
  const root = useRef<HTMLDivElement>(null)
  const report = useRef(onHeight)
  report.current = onHeight
  // Edge markers keep below the chips (spec 16.6); the chips wrap, so follow their real height.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    report.current?.(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => report.current?.(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={root}
      data-testid="world-hud"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3"
    >
      {focus.kind === 'archipelago' && (
        <>
          {onNewProject && (
            <button type="button" onClick={onNewProject} className={`${chip} text-brand`}>
              New island
            </button>
          )}
          {empty && (
            <p className={`${chip} text-text-secondary`}>
              No islands yet. Create one to start building.
            </p>
          )}
        </>
      )}
      {focus.kind === 'island' && (
        <>
          <Link to="/" className={`${chip} text-brand`}>
            ← Archipelago
          </Link>
          {onEditProject && (
            <button type="button" onClick={onEditProject} className={`${chip} text-text-secondary`}>
              Edit island
            </button>
          )}
          {onNewMilestone && (
            <button type="button" onClick={onNewMilestone} className={`${chip} text-brand`}>
              New milestone
            </button>
          )}
          {onOpenShop && (
            <button type="button" onClick={onOpenShop} className={`${chip} text-brand`}>
              Shop
            </button>
          )}
        </>
      )}
      {focus.kind === 'district' && project && milestone && (
        <>
          <Link
            to="/p/$projectId"
            params={{ projectId: project.id }}
            className={`${chip} text-brand`}
          >
            ← {project.name}
          </Link>
          {onEditMilestone && (
            <button
              type="button"
              onClick={onEditMilestone}
              className={`${chip} text-text-secondary`}
            >
              Edit milestone
            </button>
          )}
          {onOpenShop && (
            <button type="button" onClick={onOpenShop} className={`${chip} text-brand`}>
              Shop
            </button>
          )}
        </>
      )}
    </div>
  )
}
