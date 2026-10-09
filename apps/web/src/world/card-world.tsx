import type { WorldDto } from '@archipelago/shared'
import { ArrowLeft, Flag, PencilSimple, Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Chip } from '../ui/chip'
import { Icon } from '../ui/icon'
import type { IslandSummary, resolveFocus } from './selectors'
import { UnchartedCard } from './uncharted-card'

type Resolved = ReturnType<typeof resolveFocus>

const card =
  'flex min-h-28 w-64 shrink-0 flex-col justify-between rounded-2xl bg-surface-primary p-4 text-left shadow-1'
const newCard =
  'flex min-h-28 w-64 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-secondary p-4 text-label font-label text-brand hover:border-brand-secondary'
const backLink = 'inline-flex min-h-11 items-center gap-1.5 text-label font-label text-brand'

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
              <span className="text-title font-heading text-text-primary">{s.project.name}</span>
              <span className="text-sm text-text-secondary">
                {s.open} open · {s.done} done
              </span>
              <span className="flex gap-1">
                {s.overdue > 0 && <Chip tone="coral">{s.overdue} overdue</Chip>}
                {s.dueSoon > 0 && <Chip tone="gold">{s.dueSoon} due soon</Chip>}
              </span>
            </Link>
          ))}
          {onNewProject && (
            <button type="button" onClick={onNewProject} className={newCard}>
              <Icon icon={Plus} />
              New island
            </button>
          )}
        </div>
        {summaries.length === 0 && (
          <div className="px-4">
            <UnchartedCard onCreate={onNewProject} />
          </div>
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
          <Link to="/" aria-label="Back to Archipelago" className={backLink}>
            <Icon icon={ArrowLeft} />
            Archipelago
          </Link>
          {onEditProject && (
            <Button variant="ghost" size="sm" icon={PencilSimple} onClick={onEditProject}>
              Edit island
            </Button>
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
                <span className="text-title font-heading text-text-primary">{m.name}</span>
                <span className="text-sm text-text-secondary">
                  {m.landmarkType.replace('_', ' ')} · {done}/{tasks.length} done
                </span>
              </Link>
            )
          })}
          <div className={card}>
            <span className="text-title font-heading text-text-primary">Commons</span>
            <span className="text-sm text-text-secondary">{loose.length} loose tasks</span>
          </div>
          {onNewMilestone && (
            <button type="button" onClick={onNewMilestone} className={newCard}>
              <Icon icon={Flag} />
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
            aria-label={`Back to ${project.name}`}
            className={backLink}
          >
            <Icon icon={ArrowLeft} />
            {project.name}
          </Link>
          {onEditMilestone && (
            <Button variant="ghost" size="sm" icon={PencilSimple} onClick={onEditMilestone}>
              Edit milestone
            </Button>
          )}
        </div>
        <div className={`${card} w-full max-w-md`}>
          <span className="text-title font-heading text-text-primary">
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
