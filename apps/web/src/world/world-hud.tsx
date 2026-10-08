import { Link } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'
import { LayerPicker } from './layer-picker'
import type { IslandSummary, resolveFocus } from './selectors'

type Resolved = ReturnType<typeof resolveFocus>

const chip =
  'pointer-events-auto inline-flex min-h-11 items-center rounded-md bg-surface-primary/95 px-3 text-sm shadow'

/** Floating controls over the canvas; the same actions the card view offers. */
export function WorldHud({
  resolved,
  summaries,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
  onOpenShop,
  onHeight,
}: {
  resolved: Resolved
  summaries: IslandSummary[]
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
      className="@container pointer-events-none absolute inset-x-0 top-0 z-20 p-3"
    >
      <div className="flex flex-col gap-2 @3xl:grid @3xl:grid-cols-[1fr_auto_1fr] @3xl:items-start">
        {summaries.length > 0 && (
          <div className="flex justify-center @3xl:col-start-2 @3xl:row-start-1">
            <LayerPicker
              summaries={summaries}
              projectId={project?.id ?? null}
              milestoneId={milestone?.id ?? null}
            />
          </div>
        )}
        <div className="flex flex-wrap items-start gap-2 @3xl:col-start-1 @3xl:row-start-1">
          {focus.kind === 'archipelago' && onNewProject && (
            <button type="button" onClick={onNewProject} className={`${chip} text-brand`}>
              New island
            </button>
          )}
          {focus.kind === 'island' && (
            <>
              <Link to="/" className={`${chip} text-brand`}>
                ← Archipelago
              </Link>
              {onEditProject && (
                <button
                  type="button"
                  onClick={onEditProject}
                  className={`${chip} text-text-secondary`}
                >
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
      </div>
    </div>
  )
}
