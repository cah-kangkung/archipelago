import { Link } from '@tanstack/react-router'
import { type IslandSummary, urgencyOf } from './selectors'

const dot = { overdue: 'bg-error', 'due-soon': 'bg-warning', none: '' } as const
const label = { overdue: 'overdue', 'due-soon': 'due soon', none: '' } as const

export function IslandSwitcher({
  summaries,
  currentProjectId,
}: {
  summaries: IslandSummary[]
  currentProjectId: string | null
}) {
  if (summaries.length === 0) return null
  return (
    <nav
      aria-label="Islands"
      className="shrink-0 border-b border-border-primary bg-surface-primary"
    >
      <ul className="flex gap-2 overflow-x-auto px-4 py-2">
        {summaries.map((s) => {
          const urgency = urgencyOf(s)
          const current = s.project.id === currentProjectId
          return (
            <li key={s.project.id} className="shrink-0">
              <Link
                to="/p/$projectId"
                params={{ projectId: s.project.id }}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${
                  current
                    ? 'border-brand bg-brand text-text-on-brand'
                    : 'border-border-secondary bg-surface-primary text-text-primary'
                }`}
              >
                {s.project.name}
                {urgency !== 'none' && (
                  <>
                    <span aria-hidden className={`h-2 w-2 rounded-full ${dot[urgency]}`} />
                    <span className="sr-only">{label[urgency]}</span>
                  </>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
