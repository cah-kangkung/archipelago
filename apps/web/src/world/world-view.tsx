import type { WorldDto } from '@archipelago/shared'
import { useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useMemo, useState } from 'react'
import { createIndicatorStore } from '../scene/indicator-store'
import { focusKey } from '../scene/model/camera'
import type { IslandUrgency } from '../scene/model/indicators'
import { buildSceneModel } from '../scene/model/scene-model'
import { hasWebGL } from '../scene/webgl'
import { CardWorld } from './card-world'
import { EdgeIndicatorLayer } from './edge-indicators'
import { SceneBoundary } from './scene-boundary'
import { type IslandSummary, type resolveFocus, urgencyOf } from './selectors'
import { WorldHud } from './world-hud'

// Three.js lives in its own chunk, so it never weighs on the login screen.
const WorldScene = lazy(() =>
  import('../scene/world-scene').then((m) => ({ default: m.WorldScene })),
)

type Resolved = ReturnType<typeof resolveFocus>

export function WorldView({
  world,
  resolved,
  summaries,
  today,
  selectedTaskId,
  coveredBottom,
  anchor,
  onSelect,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
}: {
  world: WorldDto
  resolved: Resolved
  summaries: IslandSummary[]
  today: string
  selectedTaskId: string | null
  coveredBottom: number
  anchor: string | null
  onSelect: (taskId: string | null) => void
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const navigate = useNavigate()
  const model = useMemo(() => buildSceneModel(world, today), [world, today])
  const [indicators] = useState(createIndicatorStore)
  const urgent = useMemo(
    () =>
      summaries.flatMap((s): IslandUrgency[] => {
        const urgency = urgencyOf(s)
        if (urgency === 'none') return []
        const count = urgency === 'overdue' ? s.overdue : s.dueSoon
        return [{ projectId: s.project.id, name: s.project.name, urgency, count }]
      }),
    [summaries],
  )
  const openIsland = (projectId: string) =>
    void navigate({ to: '/p/$projectId', params: { projectId } })
  const actions = { onNewProject, onNewMilestone, onEditProject, onEditMilestone }

  const cards = <CardWorld world={world} resolved={resolved} summaries={summaries} {...actions} />
  if (!hasWebGL()) return cards

  const label =
    resolved.milestone?.name ??
    (resolved.project ? `${resolved.project.name} island` : 'Archipelago')
  // If the scene fails, the cards replace the whole section, HUD included: they carry their own
  // controls.
  return (
    <SceneBoundary fallback={cards} resetKey={focusKey(resolved.focus)}>
      <section
        aria-label={label}
        className="relative isolate min-h-0 flex-1 overflow-hidden bg-brand"
      >
        <div className="absolute inset-0">
          <Suspense fallback={<p className="p-4 text-text-on-brand">Loading the world…</p>}>
            <WorldScene
              model={model}
              focus={resolved.focus}
              selectedTaskId={selectedTaskId}
              coveredBottom={coveredBottom}
              anchor={anchor}
              onSelect={onSelect}
              urgent={urgent}
              indicators={indicators}
              onOpenIsland={openIsland}
              onOpenDistrict={(projectId, milestoneId) =>
                void navigate({
                  to: '/p/$projectId/m/$milestoneId',
                  params: { projectId, milestoneId },
                })
              }
            />
          </Suspense>
        </div>
        <EdgeIndicatorLayer store={indicators} onOpen={openIsland} />
        <WorldHud resolved={resolved} empty={world.projects.length === 0} {...actions} />
      </section>
    </SceneBoundary>
  )
}
