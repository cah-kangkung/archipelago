import type { WorldDto } from '@archipelago/shared'
import { useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useMemo } from 'react'
import { buildSceneModel } from '../scene/model/scene-model'
import { hasWebGL } from '../scene/webgl'
import { CardWorld } from './card-world'
import type { IslandSummary, resolveFocus } from './selectors'
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
  onSelect: (taskId: string | null) => void
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const navigate = useNavigate()
  const model = useMemo(() => buildSceneModel(world, today), [world, today])
  const actions = { onNewProject, onNewMilestone, onEditProject, onEditMilestone }

  if (!hasWebGL()) {
    return <CardWorld world={world} resolved={resolved} summaries={summaries} {...actions} />
  }

  const label =
    resolved.milestone?.name ??
    (resolved.project ? `${resolved.project.name} island` : 'Archipelago')
  return (
    <section aria-label={label} className="relative min-h-0 flex-1 overflow-hidden bg-brand">
      <div className="absolute inset-0">
        <Suspense fallback={<p className="p-4 text-text-on-brand">Loading the world…</p>}>
          <WorldScene
            model={model}
            focus={resolved.focus}
            selectedTaskId={selectedTaskId}
            onSelect={onSelect}
            onOpenIsland={(projectId) =>
              void navigate({ to: '/p/$projectId', params: { projectId } })
            }
            onOpenDistrict={(projectId, milestoneId) =>
              void navigate({
                to: '/p/$projectId/m/$milestoneId',
                params: { projectId, milestoneId },
              })
            }
          />
        </Suspense>
      </div>
      <WorldHud resolved={resolved} empty={world.projects.length === 0} {...actions} />
    </section>
  )
}
