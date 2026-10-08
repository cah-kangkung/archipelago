import {
  type DecorationType,
  type Hex,
  placeablePlots,
  refundFor,
  shopItem,
} from '@archipelago/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorFrame } from '../editors/editor-frame'
import { MilestoneForm } from '../editors/milestone-form'
import { ProjectForm } from '../editors/project-form'
import { TaskForm } from '../editors/task-form'
import { openingIsland } from '../scene/model/camera'
import type { Placement } from '../scene/world-contents'
import { BuildingBar } from '../shop/building-bar'
import { PlacementBar } from '../shop/placement-bar'
import { ShopPanel } from '../shop/shop-panel'
import { usePlaceBuilding, useRemoveBuilding } from '../shop/use-shop-actions'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { readLastIsland, writeLastIsland } from '../world/last-island'
import {
  islandOccupied,
  islandSummaries,
  parentPath,
  resolveFocus,
  todayIn,
} from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldView } from '../world/world-view'
import { PanelFrame, SHEET_MIDDLE } from './panel-frame'
import { useIsDesktop } from './use-is-desktop'
import { useShortcuts } from './use-shortcuts'

type Editor =
  | { kind: 'new-project' }
  | { kind: 'edit-project'; projectId: string }
  | { kind: 'new-milestone'; projectId: string }
  | { kind: 'edit-milestone'; milestoneId: string }
  | { kind: 'new-task'; projectId: string; milestoneId: string | null }
  | { kind: 'edit-task'; taskId: string }
  | { kind: 'shop' }

const editorTitle: Record<Editor['kind'], string> = {
  'new-project': 'New island',
  'edit-project': 'Edit island',
  'new-milestone': 'New milestone',
  'edit-milestone': 'Edit milestone',
  'new-task': 'New task',
  'edit-task': 'Edit task',
  shop: 'Shop',
}

const retryButton = 'inline-flex min-h-11 items-center rounded-md px-3 text-brand'

export function WorldScreen() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const world = useWorld()
  const me = useMe()
  const isDesktop = useIsDesktop()
  const searchRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheetDetent, setSheetDetent] = useState(SHEET_MIDDLE)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [cover, setCover] = useState(0)
  const [placing, setPlacing] = useState<{ type: DecorationType; plot: Hex | null } | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  // Set synchronously on confirm: the mutation's pending flag flips too late to stop a double tap.
  const [submitting, setSubmitting] = useState(false)
  const place = usePlaceBuilding()
  const remove = useRemoveBuilding()

  const resolved = world.data
    ? resolveFocus(world.data, { projectId: params.projectId, milestoneId: params.milestoneId })
    : null
  const focus = resolved?.focus ?? { kind: 'archipelago' as const }
  const resolvedProjectId = resolved?.project?.id

  const plots = useMemo(
    () =>
      world.data && resolvedProjectId
        ? placeablePlots(islandOccupied(world.data, resolvedProjectId))
        : [],
    [world.data, resolvedProjectId],
  )
  // A refetch that takes the chosen plot drops the ghost.
  const ghostPlot =
    placing?.plot && plots.some((p) => p.q === placing.plot?.q && p.r === placing.plot?.r)
      ? placing.plot
      : null
  const placingType = placing?.type
  const placement = useMemo<Placement | null>(
    () =>
      placingType && resolvedProjectId
        ? {
            projectId: resolvedProjectId,
            plots,
            ghost: ghostPlot ? { type: placingType, plot: ghostPlot } : null,
          }
        : null,
    [placingType, resolvedProjectId, plots, ghostPlot],
  )

  const openNewTask = () => {
    if (editor !== null) return
    if (focus.kind === 'island')
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: null })
    if (focus.kind === 'district') {
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: focus.milestoneId })
    }
  }

  const editedProject =
    editor?.kind === 'edit-project'
      ? world.data?.projects.find((p) => p.id === editor.projectId)
      : undefined
  const editedMilestone =
    editor?.kind === 'edit-milestone'
      ? world.data?.milestones.find((m) => m.id === editor.milestoneId)
      : undefined
  const editedTask =
    editor?.kind === 'edit-task' ? world.data?.tasks.find((t) => t.id === editor.taskId) : undefined
  const editedMissing =
    world.data !== undefined &&
    ((editor?.kind === 'edit-project' && !editedProject) ||
      (editor?.kind === 'edit-milestone' && !editedMilestone) ||
      (editor?.kind === 'edit-task' && !editedTask))

  useEffect(() => {
    if (editedMissing) setEditor(null)
  }, [editedMissing])

  // Editors and selections belong to the route they were made on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route params are the trigger
  useEffect(() => {
    setEditor(null)
    setSelectedTaskId(null)
    setSelectedBuildingId(null)
    setPlacing(null)
  }, [params.projectId, params.milestoneId])

  // The island of the latest island or district route: where the archipelago opens on step-out.
  const lastProject = useRef<string | null>(null)
  // An island just deleted or archived: the world cache still lists it until the refetch lands, so
  // the archipelago must not open on it.
  const removedProject = useRef<string | null>(null)
  const shownProjectId = resolved?.project?.id
  useEffect(() => {
    if (!shownProjectId) return
    lastProject.current = shownProjectId
    writeLastIsland(shownProjectId)
  }, [shownProjectId])

  useShortcuts({
    enabled: isDesktop,
    onNew: openNewTask,
    onSearch: () => {
      if (editor === null) searchRef.current?.focus()
    },
    onEscape: () => {
      if (placing) return setPlacing(null)
      if (editor) return setEditor(null)
      const up = parentPath(focus)
      if (up) void navigate({ to: up })
    },
  })

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if ((world.isError && !world.data) || !resolved) {
    return (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-error">
          Could not load your islands.
        </p>
        <button type="button" onClick={() => void world.refetch()} className={retryButton}>
          Try again
        </button>
      </div>
    )
  }
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
  const anchor =
    resolved.focus.kind === 'archipelago'
      ? openingIsland(
          summaries.filter((s) => s.project.id !== removedProject.current),
          lastProject.current,
          readLastIsland(),
        )
      : null
  const selectedTask = world.data.tasks.find((t) => t.id === selectedTaskId)
  const selectedBuilding = world.data.buildings.find((b) => b.id === selectedBuildingId)
  const selectedBuildingItem = selectedBuilding ? shopItem(selectedBuilding.type) : undefined
  const placingItem = placing ? shopItem(placing.type) : undefined
  const panelTitle = resolved.milestone?.name ?? resolved.project?.name ?? 'Due today & overdue'
  const { project, milestone } = resolved

  const closeEditor = () => setEditor(null)
  const confirmPlacement = () => {
    if (submitting || !placing || !ghostPlot || !project) return
    setSubmitting(true)
    place.mutate(
      { projectId: project.id, type: placing.type, plotX: ghostPlot.q, plotY: ghostPlot.r },
      {
        onSuccess: () => setPlacing(null),
        onError: () => setPlacing((p) => (p ? { ...p, plot: null } : p)),
        onSettled: () => setSubmitting(false),
      },
    )
  }
  const afterRemoval =
    (to: string, removedProjectId?: string) =>
    async ({ removed }: { removed: boolean }) => {
      setEditor(null)
      if (!removed) return
      if (removedProjectId) {
        removedProject.current = removedProjectId
        if (lastProject.current === removedProjectId) lastProject.current = null
      }
      await navigate({ to })
    }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        {world.isError && (
          <div className="flex items-center justify-between gap-2 bg-surface-primary px-4 text-sm text-text-secondary">
            <p role="status">Couldn't refresh. Showing your last update.</p>
            <button type="button" onClick={() => void world.refetch()} className={retryButton}>
              Try again
            </button>
          </div>
        )}
        <WorldView
          world={world.data}
          resolved={resolved}
          summaries={summaries}
          today={today}
          selectedTaskId={selectedTask ? selectedTaskId : null}
          selectedBuildingId={selectedBuilding ? selectedBuildingId : null}
          placement={placement}
          onSelectBuilding={(buildingId) => {
            setSelectedBuildingId(buildingId)
            setSelectedTaskId(null)
          }}
          onPickPlot={(plot) => setPlacing((p) => (p ? { ...p, plot } : p))}
          coveredBottom={isDesktop ? 0 : cover}
          anchor={anchor}
          onSelect={(taskId) => {
            setSelectedTaskId(taskId)
            setSelectedBuildingId(null)
            // Show the selected row: a collapsed sheet rises; a taller one stays where it is.
            if (taskId) setSheetDetent((d) => Math.max(d, SHEET_MIDDLE))
          }}
          onNewProject={() => setEditor({ kind: 'new-project' })}
          onNewMilestone={
            project ? () => setEditor({ kind: 'new-milestone', projectId: project.id }) : undefined
          }
          onEditProject={
            project ? () => setEditor({ kind: 'edit-project', projectId: project.id }) : undefined
          }
          onEditMilestone={
            milestone
              ? () => setEditor({ kind: 'edit-milestone', milestoneId: milestone.id })
              : undefined
          }
          onOpenShop={project ? () => setEditor({ kind: 'shop' }) : undefined}
        />
      </div>
      <PanelFrame
        title={panelTitle}
        detent={sheetDetent}
        onDetentChange={setSheetDetent}
        accessory={
          placingItem ? (
            <PlacementBar
              item={placingItem}
              hasGhost={ghostPlot !== null}
              pending={submitting}
              onConfirm={confirmPlacement}
              onCancel={() => setPlacing(null)}
            />
          ) : selectedBuildingItem && selectedBuilding ? (
            <BuildingBar
              name={selectedBuildingItem.name}
              refund={refundFor(selectedBuildingItem.price)}
              pending={remove.isPending}
              onRemove={() =>
                remove.mutate(selectedBuilding.id, { onSuccess: () => setSelectedBuildingId(null) })
              }
            />
          ) : (
            <IslandSwitcher
              summaries={summaries}
              currentProjectId={project?.id ?? null}
              variant={isDesktop ? 'panel' : 'floating'}
            />
          )
        }
        onCoverChange={setCover}
      >
        <TaskPanel
          world={world.data}
          focus={resolved.focus}
          title={panelTitle}
          today={today}
          searchRef={searchRef}
          selectedTaskId={selectedTask ? selectedTaskId : null}
          onNewTask={openNewTask}
          onEditTask={(task) => setEditor({ kind: 'edit-task', taskId: task.id })}
        />
      </PanelFrame>

      {editor && !editedMissing && (
        <EditorFrame title={editorTitle[editor.kind]} onClose={closeEditor}>
          {editor.kind === 'new-project' && <ProjectForm onDone={closeEditor} />}
          {editor.kind === 'edit-project' && editedProject && (
            <ProjectForm project={editedProject} onDone={afterRemoval('/', editedProject.id)} />
          )}
          {editor.kind === 'new-milestone' && (
            <MilestoneForm projectId={editor.projectId} onDone={closeEditor} />
          )}
          {editor.kind === 'edit-milestone' && editedMilestone && (
            <MilestoneForm
              projectId={editedMilestone.projectId}
              milestone={editedMilestone}
              onDone={afterRemoval(`/p/${editedMilestone.projectId}`)}
            />
          )}
          {editor.kind === 'new-task' && (
            <TaskForm
              world={world.data}
              projectId={editor.projectId}
              defaultMilestoneId={editor.milestoneId}
              onDone={closeEditor}
            />
          )}
          {editor.kind === 'shop' && (
            <ShopPanel
              balance={world.data.economy.balance}
              hasFreeLand={plots.length > 0}
              onPick={(type) => {
                setEditor(null)
                setSelectedTaskId(null)
                setSelectedBuildingId(null)
                setPlacing({ type, plot: null })
                setSheetDetent(0)
              }}
            />
          )}
          {editor.kind === 'edit-task' && editedTask && (
            <TaskForm
              world={world.data}
              projectId={editedTask.projectId}
              task={editedTask}
              onDone={closeEditor}
            />
          )}
        </EditorFrame>
      )}
    </div>
  )
}
