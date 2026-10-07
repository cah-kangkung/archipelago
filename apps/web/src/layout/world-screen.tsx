import { Link, useParams } from '@tanstack/react-router'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { islandSummaries, resolveFocus, todayIn } from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldArea } from '../world/world-area'
import { PanelFrame } from './panel-frame'

export function WorldScreen() {
  const params = useParams({ strict: false })
  const world = useWorld()
  const me = useMe()

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
    )
  }

  const resolved = resolveFocus(world.data, {
    projectId: params.projectId,
    milestoneId: params.milestoneId,
  })
  if (resolved.missing) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-text-primary">That island or district doesn't exist.</p>
        <Link to="/" className="inline-flex min-h-11 items-center text-brand">
          Back to the archipelago
        </Link>
      </div>
    )
  }

  const today = todayIn(me.data?.user.timezone ?? 'UTC')
  const summaries = islandSummaries(world.data, today)
  const panelTitle = resolved.milestone?.name ?? resolved.project?.name ?? 'Due today & overdue'

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <IslandSwitcher summaries={summaries} currentProjectId={resolved.project?.id ?? null} />
        <WorldArea world={world.data} resolved={resolved} summaries={summaries} />
      </div>
      <PanelFrame title={panelTitle}>
        <TaskPanel world={world.data} focus={resolved.focus} title={panelTitle} today={today} />
      </PanelFrame>
    </div>
  )
}
