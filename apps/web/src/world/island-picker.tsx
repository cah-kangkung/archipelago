import { useNavigate } from '@tanstack/react-router'
import type { IslandSummary } from './selectors'

const ALL = ''

/** "Name · N overdue", "Name · due soon", or just the name (spec 19.3). */
export function islandOptionLabel(s: IslandSummary): string {
  if (s.overdue > 0) return `${s.project.name} · ${s.overdue} overdue`
  if (s.dueSoon > 0) return `${s.project.name} · due soon`
  return s.project.name
}

/** Where you are, and a way to any island or back to them all (spec 19.3). */
export function IslandPicker({
  summaries,
  currentProjectId,
}: {
  summaries: IslandSummary[]
  currentProjectId: string | null
}) {
  const navigate = useNavigate()
  return (
    <label className="pointer-events-auto">
      <span className="sr-only">Island</span>
      <select
        value={currentProjectId ?? ALL}
        onChange={(e) => {
          const projectId = e.target.value
          void (projectId === ALL
            ? navigate({ to: '/' })
            : navigate({ to: '/p/$projectId', params: { projectId } }))
        }}
        className="min-h-11 max-w-[70vw] truncate rounded-full border border-border-secondary bg-surface-primary/95 px-4 text-sm font-medium text-text-primary shadow"
      >
        <option value={ALL}>All islands</option>
        {summaries.map((s) => (
          <option key={s.project.id} value={s.project.id}>
            {islandOptionLabel(s)}
          </option>
        ))}
      </select>
    </label>
  )
}
