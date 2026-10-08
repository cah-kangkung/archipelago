import type { Hex, WorldDto } from '@archipelago/shared'
import { useNavigate } from '@tanstack/react-router'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { useRewardStore } from '../rewards/reward-context'
import { createIndicatorStore } from '../scene/indicator-store'
import { focusKey } from '../scene/model/camera'
import type { IslandUrgency } from '../scene/model/indicators'
import { buildSceneModel } from '../scene/model/scene-model'
import { createPerfStore } from '../scene/perf-store'
import { hasWebGL } from '../scene/webgl'
import type { Placement } from '../scene/world-contents'
import { CardWorld } from './card-world'
import { EdgeIndicatorLayer } from './edge-indicators'
import { createLazyWorldScene } from './load-world-scene'
import { perfEnabled } from './perf-flag'
import { PerfOverlay } from './perf-overlay'
import { SceneBoundary } from './scene-boundary'
import { type IslandSummary, type resolveFocus, urgencyOf } from './selectors'
import { Vignette } from './vignette'
import { WorldHud } from './world-hud'

type Resolved = ReturnType<typeof resolveFocus>

export function WorldView({
  world,
  resolved,
  summaries,
  today,
  selectedTaskId,
  selectedBuildingId,
  placement,
  coveredBottom,
  anchor,
  onSelect,
  onSelectBuilding,
  onPickPlot,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
  onOpenShop,
}: {
  world: WorldDto
  resolved: Resolved
  summaries: IslandSummary[]
  today: string
  selectedTaskId: string | null
  selectedBuildingId: string | null
  placement: Placement | null
  coveredBottom: number
  anchor: string | null
  onSelect: (taskId: string | null) => void
  onSelectBuilding: (buildingId: string) => void
  onPickPlot: (plot: Hex) => void
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
  onOpenShop?: () => void
}) {
  const navigate = useNavigate()
  const rewards = useRewardStore()
  const model = useMemo(() => buildSceneModel(world, today), [world, today])
  const [indicators] = useState(createIndicatorStore)
  const [hudHeight, setHudHeight] = useState(0)
  // Without `?perf` nothing is created, sampled or drawn.
  const [perf] = useState(() => (perfEnabled() ? createPerfStore() : null))
  // The Shop needs the scene to place anything: hide its chip until the chunk has loaded and the
  // canvas exists (spec 16.6).
  const [sceneReady, setSceneReady] = useState(false)
  const markReady = useCallback(() => setSceneReady(true), [])
  // Three.js lives in its own chunk. A failed load is cached by `lazy`, so a retry builds a new one.
  const [WorldScene, setWorldScene] = useState(createLazyWorldScene)
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
    <SceneBoundary
      fallback={cards}
      resetKey={focusKey(resolved.focus)}
      onRetry={() => {
        setSceneReady(false)
        setWorldScene(createLazyWorldScene)
      }}
    >
      <section
        aria-label={label}
        className="relative isolate min-h-0 flex-1 overflow-hidden bg-brand"
      >
        <div className="absolute inset-0">
          <Suspense fallback={<p className="p-4 text-text-on-brand">Loading the world…</p>}>
            <WorldScene
              rewards={rewards}
              model={model}
              focus={resolved.focus}
              selectedTaskId={selectedTaskId}
              selectedBuildingId={selectedBuildingId}
              placement={placement}
              coveredBottom={coveredBottom}
              hudInset={hudHeight}
              anchor={anchor}
              onSelect={onSelect}
              onSelectBuilding={onSelectBuilding}
              onPickPlot={onPickPlot}
              urgent={urgent}
              indicators={indicators}
              perf={perf}
              onReady={markReady}
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
        <Vignette />
        <EdgeIndicatorLayer store={indicators} onOpen={openIsland} />
        {perf && <PerfOverlay store={perf} />}
        <WorldHud
          resolved={resolved}
          empty={world.projects.length === 0}
          onOpenShop={sceneReady ? onOpenShop : undefined}
          onHeight={setHudHeight}
          {...actions}
        />
      </section>
    </SceneBoundary>
  )
}
