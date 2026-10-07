import type { WorldDto } from '@archipelago/shared'
import { Link } from '@tanstack/react-router'
import type { IslandSummary, resolveFocus } from './selectors'

type Resolved = ReturnType<typeof resolveFocus>

const card =
  'flex min-h-28 w-64 shrink-0 flex-col justify-between rounded-lg border border-border-primary bg-surface-primary p-4 text-left shadow-sm'
const actionButton =
  'min-h-11 rounded-md border border-border-secondary px-3 text-sm text-text-secondary hover:border-brand'

/** The Phase 2 card view; the fallback when WebGL is unavailable (and the path jsdom takes). */
export function CardWorld({
  world,
  resolved,
  summaries,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
}: {
  world: WorldDto
  resolved: Resolved
  summaries: IslandSummary[]
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const { focus, project, milestone } = resolved

  if (focus.kind === 'archipelago') {
    return (
      <section
        aria-label="Archipelago"
        className="min-h-0 flex-1 overflow-y-auto py-4 pb-32 lg:pb-4"
      >
        <div data-testid="island-cards" className="flex gap-3 overflow-x-auto px-4 pb-2">
          {summaries.map((s) => (
            <Link
              key={s.project.id}
              to="/p/$projectId"
              params={{ projectId: s.project.id }}
              className={card}
            >
              <span className="font-semibold text-text-primary">{s.project.name}</span>
              <span className="text-sm text-text-secondary">
                {s.open} open · {s.done} done
              </span>
              <span className="text-xs">
                {s.overdue > 0 && <span className="text-error">{s.overdue} overdue </span>}
                {s.dueSoon > 0 && <span className="text-warning">{s.dueSoon} due soon</span>}
              </span>
            </Link>
          ))}
          {onNewProject && (
            <button
              type="button"
              onClick={onNewProject}
              className={`${card} items-center justify-center border-dashed text-brand`}
            >
              New island
            </button>
          )}
        </div>
        {summaries.length === 0 && (
          <p className="px-4 text-text-secondary">No islands yet. Create one to start building.</p>
        )}
      </section>
    )
  }

  if (focus.kind === 'island' && project) {
    const districts = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const loose = world.tasks.filter((t) => t.projectId === project.id && t.milestoneId === null)
    return (
      <section
        aria-label={`${project.name} island`}
        className="min-h-0 flex-1 overflow-y-auto py-4 pb-32 lg:pb-4"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <Link to="/" className="min-h-11 content-center text-sm text-brand">
            ← Archipelago
          </Link>
          {onEditProject && (
            <button type="button" onClick={onEditProject} className={actionButton}>
              Edit island
            </button>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2">
          {districts.map((m) => {
            const tasks = world.tasks.filter((t) => t.milestoneId === m.id)
            const done = tasks.filter((t) => t.status === 'done').length
            return (
              <Link
                key={m.id}
                to="/p/$projectId/m/$milestoneId"
                params={{ projectId: project.id, milestoneId: m.id }}
                className={card}
              >
                <span className="font-semibold text-text-primary">{m.name}</span>
                <span className="text-sm text-text-secondary">
                  {m.landmarkType.replace('_', ' ')} · {done}/{tasks.length} done
                </span>
              </Link>
            )
          })}
          <div className={card}>
            <span className="font-semibold text-text-primary">Commons</span>
            <span className="text-sm text-text-secondary">{loose.length} loose tasks</span>
          </div>
          {onNewMilestone && (
            <button
              type="button"
              onClick={onNewMilestone}
              className={`${card} items-center justify-center border-dashed text-brand`}
            >
              New milestone
            </button>
          )}
        </div>
      </section>
    )
  }

  if (focus.kind === 'district' && project && milestone) {
    const tasks = world.tasks.filter((t) => t.milestoneId === milestone.id)
    const done = tasks.filter((t) => t.status === 'done').length
    return (
      <section
        aria-label={`${milestone.name} district`}
        className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 lg:pb-4"
      >
        <div className="flex items-center justify-between gap-2 pb-3">
          <Link
            to="/p/$projectId"
            params={{ projectId: project.id }}
            className="min-h-11 content-center text-sm text-brand"
          >
            ← {project.name}
          </Link>
          {onEditMilestone && (
            <button type="button" onClick={onEditMilestone} className={actionButton}>
              Edit milestone
            </button>
          )}
        </div>
        <div className={`${card} w-full max-w-md`}>
          <span className="font-semibold text-text-primary">
            {milestone.landmarkType.replace('_', ' ')}
          </span>
          <span className="text-sm text-text-secondary">
            {done}/{tasks.length} done{milestone.completedAt ? ' · complete' : ''}
          </span>
        </div>
      </section>
    )
  }

  return null
}
