import { Link } from '@tanstack/react-router'
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
}: {
  resolved: Resolved
  empty: boolean
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const { focus, project, milestone } = resolved
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
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
        </>
      )}
    </div>
  )
}
