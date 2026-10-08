import { useNavigate } from '@tanstack/react-router'
import type { IslandSummary } from './selectors'

const TOP = ''
const NO_URGENCY = { overdue: 0, dueSoon: 0 }

const selectClass =
  'min-h-11 max-w-[70vw] truncate rounded-full border border-border-secondary bg-surface-primary/95 px-4 text-sm font-medium text-text-primary shadow'

/** "Name · N overdue", "Name · due soon", or just the name (spec 19.3, 20.5). */
export function urgencyLabel(name: string, u: { overdue: number; dueSoon: number }): string {
  if (u.overdue > 0) return `${name} · ${u.overdue} overdue`
  if (u.dueSoon > 0) return `${name} · due soon`
  return name
}

/** The current layer's contents: islands on the archipelago, milestones on an island (spec 20.5). */
export function LayerPicker({
  summaries,
  projectId,
  milestoneId,
}: {
  summaries: IslandSummary[]
  projectId: string | null
  milestoneId: string | null
}) {
  const navigate = useNavigate()
  const island = projectId ? summaries.find((s) => s.project.id === projectId) : undefined
  if (!island) {
    return (
      <label className="pointer-events-auto">
        <span className="sr-only">Island</span>
        <select
          value={TOP}
          onChange={(e) => {
            const id = e.target.value
            if (id !== TOP) void navigate({ to: '/p/$projectId', params: { projectId: id } })
          }}
          className={selectClass}
        >
          <option value={TOP}>All islands</option>
          {summaries.map((s) => (
            <option key={s.project.id} value={s.project.id}>
              {urgencyLabel(s.project.name, s)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  const { project } = island
  return (
    <label className="pointer-events-auto">
      <span className="sr-only">Milestone</span>
      <select
        value={milestoneId ?? TOP}
        onChange={(e) => {
          const id = e.target.value
          void (id === TOP
            ? navigate({ to: '/p/$projectId', params: { projectId: project.id } })
            : navigate({
                to: '/p/$projectId/m/$milestoneId',
                params: { projectId: project.id, milestoneId: id },
              }))
        }}
        className={selectClass}
      >
        <option value={TOP}>{`${project.name} (whole island)`}</option>
        {island.milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {urgencyLabel(m.name, island.milestoneUrgency[m.id] ?? NO_URGENCY)}
          </option>
        ))}
      </select>
    </label>
  )
}
